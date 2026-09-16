-- ============================================================
-- Migration: 20260916_cross_device_sync_and_goals_fix.sql
-- Description:
--   1. Adds pending_goal columns to public.users for cross-device goal updates synchronization.
--   2. Updates rpc_finish_session with p_reason and sets pending_goal state.
--   3. Updates rpc_stop_user_session to set pending_goal state on auto-stop.
--   4. Creates rpc_complete_session_goals to atomically save completed tasks to study_sessions and daily_goals, and clear pending state.
--   5. Fixes rpc_get_leaderboard to include 24-hour goals spanning Sunday into Monday.
-- ============================================================

-- 1. Add pending_goal columns to public.users
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS pending_goal_session_id UUID REFERENCES public.study_sessions(id) ON DELETE SET NULL;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS pending_goal_seconds INTEGER DEFAULT NULL;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS pending_goal_reason TEXT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_users_pending_goal ON public.users(pending_goal_session_id) WHERE pending_goal_session_id IS NOT NULL;

-- 2. Drop existing rpc_finish_session signatures to avoid return type / overload conflicts
DROP FUNCTION IF EXISTS public.rpc_finish_session(TEXT[]) CASCADE;
DROP FUNCTION IF EXISTS public.rpc_finish_session(TEXT[], TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.rpc_finish_session() CASCADE;

CREATE OR REPLACE FUNCTION public.rpc_finish_session(
  p_completed_task_ids TEXT[] DEFAULT ARRAY[]::TEXT[],
  p_reason TEXT DEFAULT 'manual_stop'
)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_status TEXT;
  v_session_start TIMESTAMPTZ;
  v_focus TEXT;
  v_now TIMESTAMPTZ := NOW();
  v_tz TEXT := 'Asia/Kolkata';
  v_midnight TIMESTAMPTZ;
  v_crossed_midnight BOOLEAN := false;
  v_total_study_seconds NUMERIC := 0;
  v_duration_minutes INTEGER := 0;
  v_dur_1 INTEGER := 0;
  v_dur_2 INTEGER := 0;
  v_session_id UUID;
  v_session_id_1 UUID := NULL;
  v_session_id_2 UUID := NULL;
  v_active_goal_id UUID;
  v_tasks JSONB;
  v_updated_tasks JSONB;
  v_session_completed_tasks JSONB := '[]'::JSONB;
  v_elem JSONB;
  v_task_id TEXT;
  v_is_completed BOOLEAN;
  v_task_text TEXT;
  v_block RECORD;
  v_has_completed_tasks BOOLEAN := false;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Lock user profile row
  SELECT current_status, session_start_time, current_focus INTO v_status, v_session_start, v_focus
  FROM public.users
  WHERE id = v_user_id
  FOR UPDATE;

  IF v_status = 'offline' THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_finished', true,
      'message', 'No active session found'
    );
  END IF;

  -- Close any open block at v_now
  UPDATE public.session_blocks
  SET end_time = v_now
  WHERE user_id = v_user_id AND end_time IS NULL;

  IF v_session_start IS NULL THEN
    v_session_start := v_now;
  END IF;

  -- Detect if session crossed midnight in application timezone (Asia/Kolkata)
  IF DATE(v_session_start AT TIME ZONE v_tz) <> DATE(v_now AT TIME ZONE v_tz) THEN
    v_crossed_midnight := true;
    v_midnight := (DATE_TRUNC('day', v_now AT TIME ZONE v_tz) AT TIME ZONE v_tz);

    -- Split any unlinked block that straddles v_midnight
    FOR v_block IN
      SELECT id, block_type, start_time, end_time
      FROM public.session_blocks
      WHERE user_id = v_user_id
        AND session_id IS NULL
        AND start_time < v_midnight
        AND end_time > v_midnight
    LOOP
      INSERT INTO public.session_blocks (user_id, block_type, start_time, end_time, session_id)
      VALUES (v_user_id, v_block.block_type, v_midnight, v_block.end_time, NULL);

      UPDATE public.session_blocks
      SET end_time = v_midnight
      WHERE id = v_block.id;
    END LOOP;
  END IF;

  -- Check if tasks were passed directly
  IF p_completed_task_ids IS NOT NULL AND array_length(p_completed_task_ids, 1) > 0 THEN
    v_has_completed_tasks := true;
    SELECT id, tasks INTO v_active_goal_id, v_tasks
    FROM public.daily_goals
    WHERE user_id = v_user_id
      AND (
        expires_at > v_now
        OR (v_session_start IS NOT NULL AND expires_at >= v_session_start)
        OR expires_at >= (v_now - INTERVAL '4 hours')
      )
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF v_active_goal_id IS NOT NULL AND v_tasks IS NOT NULL THEN
      v_updated_tasks := '[]'::JSONB;
      FOR v_elem IN SELECT * FROM jsonb_array_elements(v_tasks)
      LOOP
        v_task_id := v_elem->>'id';
        v_is_completed := COALESCE((v_elem->>'completed')::BOOLEAN, false);
        v_task_text := v_elem->>'task';

        IF v_task_id = ANY(p_completed_task_ids) THEN
          v_is_completed := true;
          v_session_completed_tasks := v_session_completed_tasks || jsonb_build_object(
            'id', v_task_id,
            'task', v_task_text
          );
        END IF;

        v_updated_tasks := v_updated_tasks || jsonb_build_object(
          'id', v_task_id,
          'task', v_task_text,
          'completed', v_is_completed
        );
      END LOOP;

      UPDATE public.daily_goals
      SET tasks = v_updated_tasks
      WHERE id = v_active_goal_id;
    END IF;
  END IF;

  -- Handle Session and Block insertion
  IF v_crossed_midnight THEN
    SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (end_time - start_time))), 0)
    INTO v_total_study_seconds
    FROM public.session_blocks
    WHERE user_id = v_user_id
      AND block_type = 'study'
      AND session_id IS NULL
      AND end_time <= v_midnight;
    v_dur_1 := LEAST(180, GREATEST(0, FLOOR(v_total_study_seconds / 60)::INTEGER));

    SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (end_time - start_time))), 0)
    INTO v_total_study_seconds
    FROM public.session_blocks
    WHERE user_id = v_user_id
      AND block_type = 'study'
      AND session_id IS NULL
      AND start_time >= v_midnight;
    v_dur_2 := LEAST(180, GREATEST(0, FLOOR(v_total_study_seconds / 60)::INTEGER));

    IF v_dur_1 = 0 AND v_dur_2 = 0 THEN
      v_dur_1 := LEAST(180, GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (v_midnight - v_session_start)) / 60)::INTEGER));
      v_dur_2 := LEAST(180, GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (v_now - v_midnight)) / 60)::INTEGER));
    END IF;

    v_duration_minutes := v_dur_1 + v_dur_2;

    -- Insert Part 1 (Day 1)
    IF v_dur_1 > 0 OR v_dur_2 = 0 THEN
      INSERT INTO public.study_sessions (user_id, start_time, end_time, duration_minutes, completed_tasks)
      VALUES (v_user_id, v_session_start, v_midnight, v_dur_1, CASE WHEN v_dur_2 = 0 THEN v_session_completed_tasks ELSE '[]'::JSONB END)
      RETURNING id INTO v_session_id_1;

      UPDATE public.session_blocks
      SET session_id = v_session_id_1
      WHERE user_id = v_user_id AND session_id IS NULL AND end_time <= v_midnight;
    END IF;

    -- Insert Part 2 (Day 2)
    IF v_dur_2 > 0 THEN
      INSERT INTO public.study_sessions (user_id, start_time, end_time, duration_minutes, completed_tasks)
      VALUES (v_user_id, v_midnight, v_now, v_dur_2, v_session_completed_tasks)
      RETURNING id INTO v_session_id_2;

      UPDATE public.session_blocks
      SET session_id = v_session_id_2
      WHERE user_id = v_user_id AND session_id IS NULL AND start_time >= v_midnight;
    END IF;

    UPDATE public.session_blocks
    SET session_id = COALESCE(v_session_id_2, v_session_id_1)
    WHERE user_id = v_user_id AND session_id IS NULL;

    v_session_id := COALESCE(v_session_id_2, v_session_id_1);
  ELSE
    SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(end_time, v_now) - start_time))), 0)
    INTO v_total_study_seconds
    FROM public.session_blocks
    WHERE user_id = v_user_id
      AND block_type = 'study'
      AND session_id IS NULL;

    v_duration_minutes := LEAST(180, GREATEST(0, FLOOR(v_total_study_seconds / 60)::INTEGER));

    INSERT INTO public.study_sessions (user_id, start_time, end_time, duration_minutes, completed_tasks)
    VALUES (v_user_id, v_session_start, v_now, v_duration_minutes, v_session_completed_tasks)
    RETURNING id INTO v_session_id;

    UPDATE public.session_blocks
    SET session_id = v_session_id
    WHERE user_id = v_user_id AND session_id IS NULL;
  END IF;

  -- Update user profile: set to offline, and set pending_goal state if tasks not already submitted
  UPDATE public.users
  SET current_status = 'offline',
      current_focus = NULL,
      session_start_time = NULL,
      last_resumed_at = NULL,
      break_started_at = NULL,
      active_study_seconds_snapshot = 0,
      last_break_expired_study_seconds = NULL,
      pending_goal_session_id = CASE WHEN v_has_completed_tasks THEN NULL ELSE v_session_id END,
      pending_goal_seconds = CASE WHEN v_has_completed_tasks THEN NULL ELSE (v_duration_minutes * 60) END,
      pending_goal_reason = CASE WHEN v_has_completed_tasks THEN NULL ELSE COALESCE(p_reason, 'manual_stop') END,
      last_offline_at = v_now
  WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'session_id', v_session_id,
    'session_id_1', v_session_id_1,
    'session_id_2', v_session_id_2,
    'duration_minutes', v_duration_minutes,
    'start_time', v_session_start,
    'end_time', v_now,
    'completed_tasks', v_session_completed_tasks,
    'pending_goal_session_id', CASE WHEN v_has_completed_tasks THEN NULL ELSE v_session_id END,
    'pending_goal_seconds', CASE WHEN v_has_completed_tasks THEN NULL ELSE (v_duration_minutes * 60) END,
    'pending_goal_reason', CASE WHEN v_has_completed_tasks THEN NULL ELSE COALESCE(p_reason, 'manual_stop') END,
    'server_now', v_now
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Update rpc_stop_user_session
CREATE OR REPLACE FUNCTION public.rpc_stop_user_session(p_user_id UUID)
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
  SELECT current_status, session_start_time, current_focus
  INTO v_status, v_session_start, v_focus
  FROM public.users
  WHERE id = p_user_id
  FOR UPDATE;

  IF v_status IS NULL OR v_status = 'offline' THEN
    RETURN jsonb_build_object('success', false, 'error', 'No active session');
  END IF;

  UPDATE public.session_blocks
  SET end_time = v_now
  WHERE user_id = p_user_id AND end_time IS NULL;

  IF v_session_start IS NULL THEN
    v_session_start := v_now;
  END IF;

  SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(end_time, v_now) - start_time))), 0)
  INTO v_total_study_seconds
  FROM public.session_blocks
  WHERE user_id = p_user_id
    AND block_type = 'study'
    AND session_id IS NULL;

  v_duration_minutes := LEAST(180, GREATEST(0, FLOOR(v_total_study_seconds / 60)::INTEGER));

  INSERT INTO public.study_sessions (user_id, start_time, end_time, duration_minutes, completed_tasks)
  VALUES (p_user_id, v_session_start, v_now, v_duration_minutes, '[]'::JSONB)
  RETURNING id INTO v_session_id;

  UPDATE public.session_blocks
  SET session_id = v_session_id
  WHERE user_id = p_user_id AND session_id IS NULL;

  UPDATE public.users
  SET current_status = 'offline',
      current_focus = NULL,
      session_start_time = NULL,
      last_resumed_at = NULL,
      break_started_at = NULL,
      active_study_seconds_snapshot = 0,
      last_break_expired_study_seconds = CASE WHEN v_status = 'break' THEN v_total_study_seconds::INTEGER ELSE NULL END,
      pending_goal_session_id = v_session_id,
      pending_goal_seconds = (v_duration_minutes * 60),
      pending_goal_reason = CASE WHEN v_status = 'break' THEN 'break_expired' ELSE 'session_limit' END,
      last_offline_at = v_now
  WHERE id = p_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'session_id', v_session_id,
    'duration_minutes', v_duration_minutes,
    'pending_goal_session_id', v_session_id,
    'pending_goal_seconds', (v_duration_minutes * 60),
    'pending_goal_reason', CASE WHEN v_status = 'break' THEN 'break_expired' ELSE 'session_limit' END,
    'server_now', v_now
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Create rpc_complete_session_goals (Authoritative Cross-Device Goal Completion RPC)
DROP FUNCTION IF EXISTS public.rpc_complete_session_goals(UUID, TEXT[]) CASCADE;

CREATE OR REPLACE FUNCTION public.rpc_complete_session_goals(
  p_session_id UUID,
  p_completed_task_ids TEXT[] DEFAULT ARRAY[]::TEXT[]
)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_active_goal_id UUID;
  v_tasks JSONB;
  v_updated_tasks JSONB;
  v_elem JSONB;
  v_task_id TEXT;
  v_is_completed BOOLEAN;
  v_task_text TEXT;
  v_session_completed_tasks JSONB := '[]'::JSONB;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 1. If tasks were completed, update daily_goals and build completed array
  IF p_completed_task_ids IS NOT NULL AND array_length(p_completed_task_ids, 1) > 0 THEN
    SELECT id, tasks INTO v_active_goal_id, v_tasks
    FROM public.daily_goals
    WHERE user_id = v_user_id
      AND (
        expires_at > v_now
        OR expires_at >= (v_now - INTERVAL '24 hours')
      )
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF v_active_goal_id IS NOT NULL AND v_tasks IS NOT NULL THEN
      v_updated_tasks := '[]'::JSONB;
      FOR v_elem IN SELECT * FROM jsonb_array_elements(v_tasks)
      LOOP
        v_task_id := v_elem->>'id';
        v_is_completed := COALESCE((v_elem->>'completed')::BOOLEAN, false);
        v_task_text := v_elem->>'task';

        IF v_task_id = ANY(p_completed_task_ids) THEN
          v_is_completed := true;
          v_session_completed_tasks := v_session_completed_tasks || jsonb_build_object(
            'id', v_task_id,
            'task', v_task_text
          );
        END IF;

        v_updated_tasks := v_updated_tasks || jsonb_build_object(
          'id', v_task_id,
          'task', v_task_text,
          'completed', v_is_completed
        );
      END LOOP;

      UPDATE public.daily_goals
      SET tasks = v_updated_tasks
      WHERE id = v_active_goal_id;
    END IF;

    -- 2. Link completed tasks to the target study_session
    IF p_session_id IS NOT NULL AND jsonb_array_length(v_session_completed_tasks) > 0 THEN
      UPDATE public.study_sessions
      SET completed_tasks = COALESCE(completed_tasks, '[]'::JSONB) || v_session_completed_tasks
      WHERE id = p_session_id AND user_id = v_user_id;
    END IF;
  END IF;

  -- 3. Atomically clear pending goal state on user profile
  UPDATE public.users
  SET pending_goal_session_id = NULL,
      pending_goal_seconds = NULL,
      pending_goal_reason = NULL,
      last_break_expired_study_seconds = NULL
  WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'session_id', p_session_id,
    'completed_tasks', v_session_completed_tasks,
    'server_now', v_now
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Update rpc_get_leaderboard to support goals spanning across week boundaries
DROP FUNCTION IF EXISTS public.rpc_get_leaderboard(TIMESTAMPTZ, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.rpc_get_leaderboard(TIMESTAMPTZ) CASCADE;
DROP FUNCTION IF EXISTS public.rpc_get_leaderboard() CASCADE;

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
    WHERE (g.created_at >= v_week_start AND g.created_at < v_week_end)
       OR (g.expires_at > v_week_start AND g.created_at < v_week_start)
    GROUP BY g.user_id
  ),
  qualifying_days AS (
    SELECT
      s.user_id,
      DATE_TRUNC('day', s.start_time AT TIME ZONE v_tz) AS study_day
    FROM public.study_sessions s
    WHERE s.start_time >= v_week_start AND s.start_time < v_week_end
    GROUP BY s.user_id, DATE_TRUNC('day', s.start_time AT TIME ZONE v_tz)
    HAVING SUM(s.duration_minutes) >= 30
  ),
  user_streaks AS (
    SELECT qd.user_id, COUNT(DISTINCT qd.study_day)::INTEGER AS streak
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
  WHERE COALESCE(u.is_admin, FALSE) = FALSE;

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
