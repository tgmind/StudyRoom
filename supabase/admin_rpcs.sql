-- ============================================================
-- STUDYROOM — ENHANCED ADMIN RPC FUNCTIONS & PERFORMANCE INDEXES
-- ============================================================
-- File: supabase/admin_rpcs.sql
-- Run this complete script in Supabase Dashboard -> SQL Editor -> New Query -> Paste & Run.
-- Safe and idempotent (can be executed multiple times without errors).

-- ------------------------------------------------------------
-- 1. SCHEMA MIGRATION: Add is_admin flag to public.users
-- ------------------------------------------------------------
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;

-- Mark the admin account as is_admin = true
UPDATE public.users
SET is_admin = TRUE
WHERE id IN (
  SELECT id FROM auth.users WHERE LOWER(email) = 'sa@admin.tg'
);

-- Prevent unauthorized users from modifying is_admin
CREATE OR REPLACE FUNCTION public.prevent_admin_flag_tampering()
RETURNS TRIGGER AS $$
BEGIN
  IF (OLD.is_admin IS DISTINCT FROM NEW.is_admin) AND (current_setting('role', true) <> 'service_role') THEN
    IF current_setting('studyroom.internal_admin_update', true) IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'is_admin cannot be updated directly';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_admin_tampering ON public.users;
CREATE TRIGGER trg_prevent_admin_tampering
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_admin_flag_tampering();

-- ------------------------------------------------------------
-- 2. HIGH-PERFORMANCE DATABASE INDEXES (Minimum Load & Fast Queries)
-- ------------------------------------------------------------

-- A. Partial index: Super-fast filtering of admin users out of leaderboards and room member lists
CREATE INDEX IF NOT EXISTS idx_users_is_admin ON public.users(is_admin) WHERE is_admin = TRUE;

-- B. Partial index: Instant O(1) lookup of active unended session blocks for pause/resume/finish/force_end
CREATE INDEX IF NOT EXISTS idx_session_blocks_open_active ON public.session_blocks(user_id, block_type) WHERE end_time IS NULL;

-- C. Composite index: Instant lookup of user's active 24h goal windows
CREATE INDEX IF NOT EXISTS idx_daily_goals_user_active_unexpired ON public.daily_goals(user_id, expires_at DESC);

-- D. Composite index: Fast date range queries for weekly study sessions
CREATE INDEX IF NOT EXISTS idx_study_sessions_weekly_range ON public.study_sessions(start_time DESC, user_id);

-- ------------------------------------------------------------
-- 3. INTERNAL SECURITY VERIFICATION HELPER
-- ------------------------------------------------------------
-- Verifies that auth.uid() is authentically sa@admin.tg OR flagged as is_admin
CREATE OR REPLACE FUNCTION public.check_is_admin()
RETURNS BOOLEAN AS $$
DECLARE
  v_email TEXT;
  v_is_admin BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT is_admin INTO v_is_admin FROM public.users WHERE id = auth.uid();
  IF v_is_admin IS TRUE THEN
    RETURN TRUE;
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
  IF v_email IS NOT NULL AND LOWER(v_email) = 'sa@admin.tg' THEN
    -- Auto-flag is_admin in public.users
    PERFORM set_config('studyroom.internal_admin_update', 'true', true);
    UPDATE public.users SET is_admin = TRUE WHERE id = auth.uid();
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------
-- 4. ADMIN RPC: Get All Users (High Performance with CTEs)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_admin_get_all_users(p_admin_email TEXT DEFAULT NULL)
RETURNS TABLE (
  user_id UUID,
  display_name TEXT,
  avatar_url TEXT,
  current_status TEXT,
  current_focus TEXT,
  session_start_time TIMESTAMPTZ,
  break_started_at TIMESTAMPTZ,
  active_study_seconds_snapshot INTEGER,
  has_achiever_badge BOOLEAN,
  created_at TIMESTAMPTZ,
  active_goal_count INTEGER,
  total_sessions_count INTEGER
) AS $$
BEGIN
  -- Strict caller verification
  IF NOT public.check_is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Caller is not an administrator';
  END IF;

  RETURN QUERY
  WITH active_goals AS (
    -- Pre-aggregate active unexpired goals
    SELECT dg.user_id, COUNT(*)::INTEGER AS goal_cnt
    FROM public.daily_goals dg
    WHERE dg.expires_at > NOW()
    GROUP BY dg.user_id
  ),
  session_counts AS (
    -- Pre-aggregate historical session totals
    SELECT ss.user_id, COUNT(*)::INTEGER AS sess_cnt
    FROM public.study_sessions ss
    GROUP BY ss.user_id
  )
  SELECT
    u.id AS user_id,
    u.display_name,
    u.avatar_url,
    u.current_status,
    u.current_focus,
    u.session_start_time,
    u.break_started_at,
    u.active_study_seconds_snapshot,
    u.has_achiever_badge,
    u.created_at,
    COALESCE(ag.goal_cnt, 0) AS active_goal_count,
    COALESCE(sc.sess_cnt, 0) AS total_sessions_count
  FROM public.users u
  LEFT JOIN active_goals ag ON u.id = ag.user_id
  LEFT JOIN session_counts sc ON u.id = sc.user_id
  WHERE u.id <> auth.uid() AND COALESCE(u.is_admin, FALSE) = FALSE  -- Always exclude admin account
  ORDER BY
    CASE u.current_status
      WHEN 'studying' THEN 1
      WHEN 'break' THEN 2
      ELSE 3
    END,
    u.display_name ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------
-- 5. ADMIN RPC: Rename User (Validation & Safety Guard)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_admin_rename_user(
  p_admin_email TEXT DEFAULT NULL,
  p_target_user_id UUID DEFAULT NULL,
  p_new_name TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_trimmed_name TEXT;
BEGIN
  IF NOT public.check_is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Caller is not an administrator';
  END IF;

  IF p_target_user_id IS NULL THEN
    RAISE EXCEPTION 'Target user ID is required';
  END IF;

  IF p_target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot modify admin account via this function';
  END IF;

  v_trimmed_name := TRIM(COALESCE(p_new_name, ''));
  IF LENGTH(v_trimmed_name) = 0 THEN
    RAISE EXCEPTION 'Display name cannot be empty';
  END IF;
  IF LENGTH(v_trimmed_name) > 32 THEN
    v_trimmed_name := SUBSTRING(v_trimmed_name FROM 1 FOR 32);
  END IF;

  UPDATE public.users
  SET display_name = v_trimmed_name
  WHERE id = p_target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', p_target_user_id,
    'new_name', v_trimmed_name
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------
-- 6. ADMIN RPC: Delete User (Cascades all dependent records)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_admin_delete_user(
  p_admin_email TEXT DEFAULT NULL,
  p_target_user_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_target_name TEXT;
BEGIN
  IF NOT public.check_is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Caller is not an administrator';
  END IF;

  IF p_target_user_id IS NULL THEN
    RAISE EXCEPTION 'Target user ID is required';
  END IF;

  IF p_target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot delete the administrator account';
  END IF;

  SELECT display_name INTO v_target_name
  FROM public.users
  WHERE id = p_target_user_id;

  IF v_target_name IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  -- Delete from auth.users (cascades to public.users, daily_goals, study_sessions, session_blocks)
  DELETE FROM auth.users WHERE id = p_target_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'deleted_user_id', p_target_user_id,
    'deleted_user_name', v_target_name
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------
-- 7. ADMIN RPC: Force-End / Suspend User Session
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_admin_force_end_session(
  p_admin_email TEXT DEFAULT NULL,
  p_target_user_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_status TEXT;
  v_session_start TIMESTAMPTZ;
  v_focus TEXT;
  v_now TIMESTAMPTZ := NOW();
  v_total_study_seconds NUMERIC := 0;
  v_duration_minutes INTEGER := 0;
  v_session_id UUID;
BEGIN
  IF NOT public.check_is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Caller is not an administrator';
  END IF;

  IF p_target_user_id IS NULL THEN
    RAISE EXCEPTION 'Target user ID is required';
  END IF;

  SELECT current_status, session_start_time, current_focus
  INTO v_status, v_session_start, v_focus
  FROM public.users
  WHERE id = p_target_user_id
  FOR UPDATE;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  IF v_status = 'offline' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'User has no active session'
    );
  END IF;

  -- Close any open session blocks
  UPDATE public.session_blocks
  SET end_time = v_now
  WHERE user_id = p_target_user_id AND end_time IS NULL;

  IF v_session_start IS NULL THEN
    v_session_start := v_now;
  END IF;

  -- Calculate active study seconds (excluding breaks)
  SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(end_time, v_now) - start_time))), 0)
  INTO v_total_study_seconds
  FROM public.session_blocks
  WHERE user_id = p_target_user_id
    AND block_type = 'study'
    AND session_id IS NULL;

  v_duration_minutes := LEAST(180, GREATEST(0, FLOOR(v_total_study_seconds / 60)::INTEGER));

  -- Insert finished session record
  INSERT INTO public.study_sessions (user_id, start_time, end_time, duration_minutes, completed_tasks)
  VALUES (p_target_user_id, v_session_start, v_now, v_duration_minutes, '[]'::JSONB)
  RETURNING id INTO v_session_id;

  UPDATE public.session_blocks
  SET session_id = v_session_id
  WHERE user_id = p_target_user_id AND session_id IS NULL;

  -- Reset user to offline
  UPDATE public.users
  SET current_status = 'offline',
      current_focus = NULL,
      session_start_time = NULL,
      last_resumed_at = NULL,
      break_started_at = NULL,
      active_study_seconds_snapshot = 0,
      three_hour_prompt_sent_at = NULL,
      break_warning_prompt_sent_at = NULL,
      last_break_expired_study_seconds = NULL,
      last_offline_at = v_now
  WHERE id = p_target_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'session_id', v_session_id,
    'duration_minutes', v_duration_minutes,
    'server_now', v_now,
    'message', 'Session suspended and saved by administrator'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------
-- 8. ADMIN RPC: Platform Stats (Fast Single-Pass Aggregation)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_admin_get_platform_stats(p_admin_email TEXT DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
  v_total_users INTEGER := 0;
  v_studying INTEGER := 0;
  v_on_break INTEGER := 0;
  v_offline INTEGER := 0;
  v_week_start TIMESTAMPTZ;
  v_weekly_sessions INTEGER := 0;
  v_weekly_hours NUMERIC := 0;
BEGIN
  IF NOT public.check_is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Caller is not an administrator';
  END IF;

  -- 1. Fast count across users table
  SELECT
    COUNT(*)::INTEGER,
    COUNT(*) FILTER (WHERE current_status = 'studying')::INTEGER,
    COUNT(*) FILTER (WHERE current_status = 'break')::INTEGER,
    COUNT(*) FILTER (WHERE current_status = 'offline')::INTEGER
  INTO v_total_users, v_studying, v_on_break, v_offline
  FROM public.users
  WHERE id <> auth.uid() AND COALESCE(is_admin, FALSE) = FALSE;

  -- 2. Weekly statistics
  v_week_start := (DATE_TRUNC('week', NOW() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata');

  SELECT
    COALESCE(COUNT(*)::INTEGER, 0),
    COALESCE(ROUND(SUM(duration_minutes)::NUMERIC / 60.0, 1), 0)
  INTO v_weekly_sessions, v_weekly_hours
  FROM public.study_sessions
  WHERE start_time >= v_week_start
    AND user_id IN (
      SELECT id FROM public.users WHERE id <> auth.uid() AND COALESCE(is_admin, FALSE) = FALSE
    );

  RETURN jsonb_build_object(
    'total_users', v_total_users,
    'studying', v_studying,
    'on_break', v_on_break,
    'offline', v_offline,
    'weekly_sessions', v_weekly_sessions,
    'weekly_hours', v_weekly_hours
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------
-- 9. LEADERBOARD: Guaranteed Exclusion of Admin Accounts
-- Implements Proposal 1: Dual-Pillar Goal Index (60% Volume Output + 40% Discipline Follow-Through)
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.rpc_get_leaderboard(TIMESTAMPTZ, TEXT);
DROP FUNCTION IF EXISTS public.rpc_get_leaderboard(TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.rpc_get_leaderboard();

CREATE OR REPLACE FUNCTION public.rpc_get_leaderboard(
  p_week_start TIMESTAMPTZ DEFAULT NULL,
  p_timezone TEXT DEFAULT 'Asia/Kolkata'
)
RETURNS TABLE (
  user_id UUID,
  display_name TEXT,
  avatar_url TEXT,
  has_achiever_badge BOOLEAN,
  current_status TEXT,
  total_study_minutes INTEGER,
  goal_completion_pct NUMERIC,
  streak_days INTEGER,
  score NUMERIC,
  completed_tasks INTEGER,
  total_tasks INTEGER
) AS $$
DECLARE
  v_tz TEXT := COALESCE(NULLIF(p_timezone, ''), 'Asia/Kolkata');
  v_week_start TIMESTAMPTZ;
  v_week_end TIMESTAMPTZ;
  v_max_study_minutes INTEGER := 1;
  v_target_completed_tasks INTEGER := 3;
BEGIN
  IF p_week_start IS NULL THEN
    v_week_start := (DATE_TRUNC('week', NOW() AT TIME ZONE v_tz) AT TIME ZONE v_tz);
  ELSE
    v_week_start := (DATE_TRUNC('week', p_week_start AT TIME ZONE v_tz) AT TIME ZONE v_tz);
  END IF;
  v_week_end := v_week_start + INTERVAL '7 days';

  DROP TABLE IF EXISTS temp_user_stats;
  CREATE TEMP TABLE temp_user_stats ON COMMIT DROP AS
  WITH weekly_study AS (
    SELECT s.user_id, COALESCE(SUM(s.duration_minutes), 0)::INTEGER AS study_mins
    FROM public.study_sessions s
    WHERE s.start_time >= v_week_start AND s.start_time < v_week_end
    GROUP BY s.user_id
  ),
  weekly_goals AS (
    SELECT g.user_id,
           COALESCE(
             SUM( (SELECT COUNT(*) FROM jsonb_array_elements(g.tasks) t WHERE (t->>'completed')::boolean = true) ),
             0
           )::INTEGER AS completed_tasks_count,
           COALESCE(
             SUM(jsonb_array_length(g.tasks)),
             0
           )::INTEGER AS total_tasks_count,
           COALESCE(
             ROUND(
               (SUM( (SELECT COUNT(*) FROM jsonb_array_elements(g.tasks) t WHERE (t->>'completed')::boolean = true) )::NUMERIC /
                NULLIF(SUM(jsonb_array_length(g.tasks)), 0)::NUMERIC) * 100, 1
             ), 0
           ) AS completion_pct
    FROM public.daily_goals g
    WHERE g.created_at >= v_week_start AND g.created_at < v_week_end
    GROUP BY g.user_id
  ),
  qualifying_days AS (
    SELECT
      s.user_id,
      DATE_TRUNC('day', s.start_time AT TIME ZONE v_tz) AS study_day
    FROM public.study_sessions s
    WHERE s.start_time >= (NOW() - INTERVAL '7 days')
    GROUP BY s.user_id, DATE_TRUNC('day', s.start_time AT TIME ZONE v_tz)
    HAVING SUM(s.duration_minutes) >= 30
  ),
  user_streaks AS (
    SELECT
      qd.user_id,
      COUNT(DISTINCT qd.study_day)::INTEGER AS streak
    FROM qualifying_days qd
    GROUP BY qd.user_id
  )
  SELECT
    u.id AS user_id,
    u.display_name,
    u.avatar_url,
    u.has_achiever_badge,
    u.current_status,
    COALESCE(ws.study_mins, 0) AS total_study_minutes,
    COALESCE(wg.completed_tasks_count, 0) AS completed_tasks,
    COALESCE(wg.total_tasks_count, 0) AS total_tasks,
    COALESCE(wg.completion_pct, 0) AS goal_completion_pct,
    COALESCE(st.streak, 0) AS streak_days
  FROM public.users u
  LEFT JOIN weekly_study ws ON u.id = ws.user_id
  LEFT JOIN weekly_goals wg ON u.id = wg.user_id
  LEFT JOIN user_streaks st ON u.id = st.user_id
  WHERE COALESCE(u.is_admin, FALSE) = FALSE;  -- Strictly exclude admin accounts

  SELECT GREATEST(1, MAX(temp_user_stats.total_study_minutes)) INTO v_max_study_minutes FROM temp_user_stats;
  SELECT GREATEST(3, LEAST(COALESCE(MAX(temp_user_stats.completed_tasks), 0), 15)) INTO v_target_completed_tasks FROM temp_user_stats;

  RETURN QUERY
  SELECT
    ts.user_id,
    ts.display_name,
    ts.avatar_url,
    ts.has_achiever_badge,
    ts.current_status,
    ts.total_study_minutes,
    ts.goal_completion_pct,
    ts.streak_days,
    ROUND(
      (0.50 * (ts.total_study_minutes::NUMERIC / v_max_study_minutes::NUMERIC * 100.0)) +
      (0.30 * (
        (0.60 * LEAST(100.0, (ts.completed_tasks::NUMERIC / v_target_completed_tasks::NUMERIC) * 100.0)) +
        (0.40 * CASE WHEN ts.total_tasks > 0 THEN LEAST(100.0, (ts.completed_tasks::NUMERIC / GREATEST(3, ts.total_tasks)::NUMERIC) * 100.0) ELSE 0.0 END)
      )) +
      (0.20 * LEAST((ts.streak_days::NUMERIC / 7.0) * 100.0, 100.0)),
      1
    ) AS score,
    ts.completed_tasks,
    ts.total_tasks
  FROM temp_user_stats ts
  ORDER BY score DESC, ts.total_study_minutes DESC, ts.display_name ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------
-- 10. WEEKLY ACHIEVER CALCULATION RPC
-- Evaluates previous week's performance and awards ⭐ Achiever Badge to top performer
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_calculate_weekly_achiever(p_timezone TEXT DEFAULT 'Asia/Kolkata')
RETURNS UUID AS $$
DECLARE
  v_tz TEXT := COALESCE(NULLIF(p_timezone, ''), 'Asia/Kolkata');
  v_prev_week_start TIMESTAMPTZ;
  v_winner_id UUID;
BEGIN
  v_prev_week_start := (DATE_TRUNC('week', (NOW() - INTERVAL '7 days') AT TIME ZONE v_tz) AT TIME ZONE v_tz);

  SELECT user_id INTO v_winner_id
  FROM public.rpc_get_leaderboard(v_prev_week_start, v_tz)
  WHERE total_study_minutes > 0
  ORDER BY score DESC, total_study_minutes DESC
  LIMIT 1;

  -- Allow update of protected badge column inside security definer function
  PERFORM set_config('studyroom.internal_badge_update', 'true', true);

  -- Clear previous achiever badges
  UPDATE public.users SET has_achiever_badge = FALSE WHERE has_achiever_badge = TRUE;

  -- Set new achiever badge
  IF v_winner_id IS NOT NULL THEN
    UPDATE public.users SET has_achiever_badge = TRUE WHERE id = v_winner_id;
  END IF;

  RETURN v_winner_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------
-- 11. REALTIME REPLICATION & REPLICA IDENTITY CONFIGURATION
-- ------------------------------------------------------------
ALTER TABLE public.users REPLICA IDENTITY FULL;
ALTER TABLE public.study_sessions REPLICA IDENTITY FULL;
ALTER TABLE public.daily_goals REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'users' AND schemaname = 'public'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.users;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'study_sessions' AND schemaname = 'public'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.study_sessions;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'daily_goals' AND schemaname = 'public'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.daily_goals;
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

