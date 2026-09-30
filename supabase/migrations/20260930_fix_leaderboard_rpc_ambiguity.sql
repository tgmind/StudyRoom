-- Migration: 20260930_fix_leaderboard_rpc_ambiguity.sql
-- Description:
--   1. Ensures state_version and updated_at columns exist on public.users with an atomic BEFORE UPDATE trigger (Option A)
--   2. Pure Read-Only rpc_get_leaderboard (Zero drops, NO CASCADE, no nested mutations) fixing PostgreSQL 42702 ambiguity
--   3. Secures rpc_stop_user_session with RESTRICT-only drops (strictly NO CASCADE), scoped block selection, and bulletproof observer validation

-- 1. Ensure state_version and updated_at columns exist on public.users
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS state_version BIGINT NOT NULL DEFAULT 1;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
CREATE INDEX IF NOT EXISTS idx_users_state_version ON public.users(state_version);

-- Ensure full replica identity for realtime row broadcasts
ALTER TABLE public.users REPLICA IDENTITY FULL;

-- Atomic BEFORE UPDATE trigger for monotonic state_version increment
CREATE OR REPLACE FUNCTION public.trg_users_state_version()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.state_version IS NULL OR NEW.state_version <= OLD.state_version THEN
    NEW.state_version := COALESCE(OLD.state_version, 0) + 1;
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_state_version ON public.users;
CREATE TRIGGER trg_users_state_version
BEFORE UPDATE ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.trg_users_state_version();

-- 2. FIX rpc_get_leaderboard (Pure Read-Only, Zero drops, in-place CREATE OR REPLACE)
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
  v_week_start TIMESTAMPTZ;
  v_week_end TIMESTAMPTZ;
  v_tz TEXT := COALESCE(p_timezone, 'Asia/Kolkata');
BEGIN
  -- Determine canonical week start in local timezone (Monday 00:00:00)
  IF p_week_start IS NULL THEN
    v_week_start := DATE_TRUNC('week', NOW() AT TIME ZONE v_tz) AT TIME ZONE v_tz;
  ELSE
    v_week_start := p_week_start;
  END IF;
  v_week_end := v_week_start + INTERVAL '7 days';

  RETURN QUERY
  WITH weekly_study AS (
    SELECT
      u.id AS user_id,
      COALESCE(SUM(s.duration_minutes), 0)::INTEGER +
      CASE
        WHEN u.current_status = 'studying' AND u.session_start_time IS NOT NULL THEN
          LEAST(
            180,
            GREATEST(
              0,
              FLOOR(
                (
                  COALESCE(u.active_study_seconds_snapshot, 0) +
                  EXTRACT(EPOCH FROM (NOW() - GREATEST(v_week_start, COALESCE(u.last_resumed_at, u.session_start_time))))
                ) / 60
              )::INTEGER
            )
          )
        WHEN u.current_status = 'break' AND u.active_study_seconds_snapshot IS NOT NULL THEN
          LEAST(180, GREATEST(0, FLOOR(u.active_study_seconds_snapshot / 60)::INTEGER))
        ELSE 0
      END AS study_mins
    FROM public.users u
    LEFT JOIN public.study_sessions s ON u.id = s.user_id
      AND s.start_time >= v_week_start
      AND s.start_time < v_week_end
      AND s.duration_minutes > 0
    GROUP BY u.id, u.current_status, u.session_start_time, u.last_resumed_at, u.active_study_seconds_snapshot
  ),
  completed_tasks_per_user AS (
    SELECT combined_tasks.user_id, COUNT(DISTINCT combined_tasks.task_id)::INTEGER AS completed_tasks_count
    FROM (
      SELECT g.user_id, t->>'id' AS task_id
      FROM public.daily_goals g,
           jsonb_array_elements(COALESCE(g.tasks, '[]'::JSONB)) t
      WHERE g.created_at >= v_week_start AND g.created_at < v_week_end
        AND (t->>'completed')::boolean = true
        AND t->>'id' IS NOT NULL
      UNION
      SELECT s.user_id, t->>'id' AS task_id
      FROM public.study_sessions s,
           jsonb_array_elements(COALESCE(s.completed_tasks, '[]'::JSONB)) t
      WHERE s.start_time >= v_week_start AND s.start_time < v_week_end
        AND (s.split_part IS NULL OR s.split_part != 2 OR s.start_time > v_week_start)
        AND t->>'id' IS NOT NULL
    ) combined_tasks
    GROUP BY combined_tasks.user_id
  ),
  total_tasks_per_user AS (
    SELECT g.user_id, COALESCE(SUM(jsonb_array_length(g.tasks)), 0)::INTEGER AS total_tasks_count
    FROM public.daily_goals g
    WHERE g.created_at >= v_week_start AND g.created_at < v_week_end
    GROUP BY g.user_id
  ),
  weekly_streaks AS (
    SELECT s.user_id, COUNT(DISTINCT DATE(s.start_time AT TIME ZONE v_tz))::INTEGER AS streak_days
    FROM public.study_sessions s
    WHERE s.start_time >= v_week_start AND s.start_time < v_week_end
      AND s.duration_minutes > 0
    GROUP BY s.user_id
  ),
  user_stats AS (
    SELECT
      u.id AS user_id,
      COALESCE(u.display_name, 'Anonymous') AS display_name,
      u.avatar_url,
      COALESCE(u.has_achiever_badge, false) AS has_achiever_badge,
      COALESCE(u.current_status, 'offline') AS current_status,
      COALESCE(ws.study_mins, 0)::INTEGER AS total_study_minutes,
      CASE
        WHEN COALESCE(tt.total_tasks_count, 0) > 0 THEN
          ROUND((COALESCE(ct.completed_tasks_count, 0)::NUMERIC / tt.total_tasks_count::NUMERIC) * 100, 1)
        ELSE 0.0
      END AS goal_completion_pct,
      COALESCE(wstr.streak_days, 0)::INTEGER AS streak_days,
      COALESCE(ct.completed_tasks_count, 0)::INTEGER AS completed_tasks,
      COALESCE(tt.total_tasks_count, 0)::INTEGER AS total_tasks
    FROM public.users u
    LEFT JOIN weekly_study ws ON u.id = ws.user_id
    LEFT JOIN completed_tasks_per_user ct ON u.id = ct.user_id
    LEFT JOIN total_tasks_per_user tt ON u.id = tt.user_id
    LEFT JOIN weekly_streaks wstr ON u.id = wstr.user_id
    WHERE COALESCE(u.is_admin, FALSE) = FALSE
  ),
  normalizers AS (
    SELECT
      GREATEST(1, COALESCE(MAX(us.total_study_minutes), 1))::NUMERIC AS max_study_minutes,
      GREATEST(3, COALESCE(MAX(us.completed_tasks), 3))::NUMERIC AS target_completed_tasks
    FROM user_stats us
  ),
  scored_users AS (
    SELECT
      us.user_id,
      us.display_name,
      us.avatar_url,
      us.has_achiever_badge,
      us.current_status,
      us.total_study_minutes,
      us.goal_completion_pct,
      us.streak_days,
      ROUND(
        (
          (0.6 * (us.total_study_minutes::NUMERIC / norm.max_study_minutes) * 100) +
          (0.4 * (LEAST(us.completed_tasks::NUMERIC / norm.target_completed_tasks, 1.0)) * 100)
        ), 1
      )::NUMERIC AS calculated_score,
      us.completed_tasks,
      us.total_tasks
    FROM user_stats us
    CROSS JOIN normalizers norm
  )
  SELECT
    su.user_id,
    su.display_name,
    su.avatar_url,
    su.has_achiever_badge,
    su.current_status,
    su.total_study_minutes,
    su.goal_completion_pct,
    su.streak_days,
    su.calculated_score AS score,
    su.completed_tasks,
    su.total_tasks
  FROM scored_users su
  ORDER BY su.calculated_score DESC, su.total_study_minutes DESC, su.completed_tasks DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.rpc_get_leaderboard(TIMESTAMPTZ, TEXT) TO authenticated, anon, service_role;

-- 3. SECURE rpc_stop_user_session
-- Dependency-safe overload cleanup using RESTRICT (strictly NO CASCADE)
DROP FUNCTION IF EXISTS public.rpc_stop_user_session(UUID, TEXT) RESTRICT;
DROP FUNCTION IF EXISTS public.rpc_stop_user_session(UUID) RESTRICT;
DROP FUNCTION IF EXISTS public.rpc_stop_user_session(UUID, TIMESTAMPTZ) RESTRICT;

CREATE OR REPLACE FUNCTION public.rpc_stop_user_session(
  p_user_id UUID,
  p_expected_start_time TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_status TEXT;
  v_session_start TIMESTAMPTZ;
  v_break_start TIMESTAMPTZ;
  v_focus TEXT;
  v_now TIMESTAMPTZ := NOW();
  v_total_study_seconds NUMERIC := 0;
  v_total_break_seconds NUMERIC := 0;
  v_duration_minutes INTEGER := 0;
  v_break_minutes INTEGER := 0;
  v_session_id UUID;
  v_last_study_end TIMESTAMPTZ;
  v_session_actual_end TIMESTAMPTZ;
  v_version BIGINT := 1;
  v_caller_uid UUID := auth.uid();
  v_is_system BOOLEAN;
  v_is_owner BOOLEAN;
BEGIN
  v_is_system := (current_setting('role', true) IN ('postgres', 'service_role')) OR public.check_is_admin();
  v_is_owner := (v_caller_uid IS NOT NULL AND v_caller_uid = p_user_id);

  -- Lock row to guarantee strict ACID idempotency under concurrent calls
  SELECT current_status, session_start_time, break_started_at, current_focus, COALESCE(state_version, 1)
  INTO v_status, v_session_start, v_break_start, v_focus, v_version
  FROM public.users
  WHERE id = p_user_id
  FOR UPDATE;

  IF v_status IS NULL OR v_status = 'offline' THEN
    RETURN jsonb_build_object(
      'success', true, 
      'already_finished', true, 
      'message', 'No active session',
      'state_version', v_version
    );
  END IF;

  -- Fallback anchor if session_start_time was unset
  IF v_session_start IS NULL THEN
    v_session_start := v_now;
  END IF;

  -- Security Guard for Third-Party Observers (auth.uid() != p_user_id and non-system):
  IF NOT v_is_owner AND NOT v_is_system THEN
    -- A. Observer must supply the expected start time of the session they observed
    IF p_expected_start_time IS NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'rejected', true,
        'reason', 'Observer must provide p_expected_start_time',
        'current_status', v_status
      );
    END IF;

    -- B. Session Identity Verification:
    -- In studying status: session_start_time must match p_expected_start_time.
    -- In break status: either session_start_time matches p_expected_start_time OR break_started_at matches p_expected_start_time.
    IF (v_status = 'studying' AND (v_session_start IS NULL OR v_session_start <> p_expected_start_time))
       OR (v_status = 'break' AND (v_session_start IS NULL OR v_session_start <> p_expected_start_time)
                              AND (v_break_start IS NULL OR v_break_start <> p_expected_start_time)) THEN
      RETURN jsonb_build_object(
        'success', false,
        'rejected', true,
        'reason', 'Session identity mismatch: user has a newer or different session',
        'current_status', v_status
      );
    END IF;

    -- C. Server-Side Duration Expiry:
    IF v_status = 'break' THEN
      IF v_break_start IS NULL OR (v_now - v_break_start) < INTERVAL '1 hour' THEN
        RETURN jsonb_build_object(
          'success', false,
          'rejected', true,
          'reason', 'Break has not exceeded 1 hour limit',
          'current_status', v_status
        );
      END IF;
    ELSIF v_status = 'studying' THEN
      SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(end_time, v_now) - start_time))), 0)
      INTO v_total_study_seconds
      FROM public.session_blocks
      WHERE user_id = p_user_id
        AND session_id IS NULL
        AND start_time >= v_session_start
        AND start_time <= v_now
        AND block_type = 'study';

      -- Strict 3 hours (10,800 seconds) of actual accumulated study time (no wall-clock shortcut)
      IF v_total_study_seconds < 10800 THEN
        RETURN jsonb_build_object(
          'success', false,
          'rejected', true,
          'reason', 'Study session has not exceeded 3 hour limit',
          'current_status', v_status
        );
      END IF;
    END IF;
  END IF;

  -- Proceed with authoritative finalization
  -- Close ONLY active open blocks belonging to this authoritative session
  UPDATE public.session_blocks
  SET end_time = v_now
  WHERE user_id = p_user_id
    AND session_id IS NULL
    AND start_time >= v_session_start
    AND start_time <= v_now
    AND end_time IS NULL;

  -- Determine actual end time of study
  SELECT COALESCE(MAX(end_time), v_session_start)
  INTO v_last_study_end
  FROM public.session_blocks
  WHERE user_id = p_user_id
    AND session_id IS NULL
    AND start_time >= v_session_start
    AND start_time <= v_now
    AND block_type = 'study';

  IF v_status = 'break' THEN
    v_session_actual_end := v_last_study_end;
  ELSE
    v_session_actual_end := v_now;
  END IF;

  -- Compute study seconds strictly from session blocks belonging to this session
  SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(end_time, v_now) - start_time))), 0)
  INTO v_total_study_seconds
  FROM public.session_blocks
  WHERE user_id = p_user_id
    AND session_id IS NULL
    AND start_time >= v_session_start
    AND start_time <= v_now
    AND block_type = 'study';

  -- Enforce strict 180-minute cap on stored study duration
  v_duration_minutes := LEAST(180, GREATEST(0, FLOOR(v_total_study_seconds / 60)::INTEGER));

  -- Compute break seconds strictly from session blocks belonging to this session
  SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(end_time, v_now) - start_time))), 0)
  INTO v_total_break_seconds
  FROM public.session_blocks
  WHERE user_id = p_user_id
    AND session_id IS NULL
    AND start_time >= v_session_start
    AND start_time <= v_now
    AND block_type = 'break';

  v_break_minutes := GREATEST(0, FLOOR(v_total_break_seconds / 60)::INTEGER);

  -- Insert finalized study session
  INSERT INTO public.study_sessions (user_id, start_time, end_time, duration_minutes, break_minutes, completed_tasks)
  VALUES (p_user_id, v_session_start, v_session_actual_end, v_duration_minutes, v_break_minutes, '[]'::JSONB)
  RETURNING id INTO v_session_id;

  -- Associate ONLY blocks from this session with the new session_id
  UPDATE public.session_blocks
  SET session_id = v_session_id
  WHERE user_id = p_user_id
    AND session_id IS NULL
    AND start_time >= v_session_start
    AND start_time <= v_now;

  -- Authoritatively set user to offline
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
      last_offline_at = v_now,
      state_version = COALESCE(state_version, 1) + 1
  WHERE id = p_user_id
  RETURNING state_version INTO v_version;

  RETURN jsonb_build_object(
    'success', true,
    'session_id', v_session_id,
    'duration_minutes', v_duration_minutes,
    'break_minutes', v_break_minutes,
    'pending_goal_session_id', v_session_id,
    'pending_goal_seconds', (v_duration_minutes * 60),
    'pending_goal_reason', CASE WHEN v_status = 'break' THEN 'break_expired' ELSE 'session_limit' END,
    'state_version', v_version,
    'server_now', v_now
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.rpc_stop_user_session(UUID, TIMESTAMPTZ) TO authenticated, service_role;
