-- ============================================================
-- Migration: 20260917_fix_break_time_in_session.sql
-- Description:
--   1. Adds break_minutes column to public.study_sessions.
--   2. Updates rpc_finish_session to accurately record study session
--      end_time (closing at the end of active study rather than break
--      completion when ending on break) and store break_minutes.
--   3. Updates rpc_resume_session with optional p_resumed_at parameter.
--   4. Updates rpc_stop_user_session and rpc_admin_suspend_user.
--   5. Backfills break_minutes for existing sessions and cleans up 0m intervals.
-- ============================================================

-- 1. Add break_minutes column to public.study_sessions
ALTER TABLE public.study_sessions ADD COLUMN IF NOT EXISTS break_minutes INTEGER NOT NULL DEFAULT 0;

-- 2. Drop existing rpc_resume_session signatures to prevent PostgREST overload ambiguity
DROP FUNCTION IF EXISTS public.rpc_resume_session() CASCADE;
DROP FUNCTION IF EXISTS public.rpc_resume_session(TIMESTAMPTZ) CASCADE;

CREATE OR REPLACE FUNCTION public.rpc_resume_session(
  p_resumed_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_status TEXT;
  v_break_started_at TIMESTAMPTZ;
  v_now TIMESTAMPTZ := COALESCE(p_resumed_at, NOW());
  v_total_study_seconds INTEGER := 0;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT current_status, break_started_at INTO v_status, v_break_started_at
  FROM public.users
  WHERE id = v_user_id
  FOR UPDATE;

  IF v_status = 'studying' THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_resumed', true,
      'status', 'studying',
      'server_now', v_now
    );
  END IF;

  IF v_status <> 'break' THEN
    RAISE EXCEPTION 'User is not currently on break';
  END IF;

  -- 1-HOUR BREAK EXPIRY ENFORCEMENT:
  -- If break exceeded 1 hour (3600 seconds), end session and save only study time before break
  IF v_break_started_at IS NOT NULL AND EXTRACT(EPOCH FROM (v_now - v_break_started_at)) >= 3600 THEN
    -- Capture accrued study duration for cross-device notice
    SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(end_time, v_now) - start_time))), 0)::INTEGER
    INTO v_total_study_seconds
    FROM public.session_blocks
    WHERE user_id = v_user_id AND block_type = 'study' AND session_id IS NULL;

    PERFORM public.rpc_finish_session(ARRAY[]::TEXT[], 'break_expired');

    UPDATE public.users
    SET last_break_expired_study_seconds = v_total_study_seconds
    WHERE id = v_user_id;

    RETURN jsonb_build_object(
      'success', false,
      'error', 'break_expired',
      'message', 'You stayed on break for more than 1 hour. Session has been stopped. Start a new session.',
      'server_now', v_now
    );
  END IF;

  -- Close current active break block
  UPDATE public.session_blocks
  SET end_time = v_now
  WHERE user_id = v_user_id AND block_type = 'break' AND end_time IS NULL;

  -- Open new study block
  INSERT INTO public.session_blocks (user_id, block_type, start_time)
  VALUES (v_user_id, 'study', v_now);

  -- Update user status with new resume timestamp (clearing break timestamp)
  UPDATE public.users
  SET current_status = 'studying',
      last_resumed_at = v_now,
      break_started_at = NULL,
      last_break_expired_study_seconds = NULL
  WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'status', 'studying',
    'resumed_at', v_now,
    'server_now', v_now
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Drop existing rpc_finish_session signatures to avoid overload conflicts
DROP FUNCTION IF EXISTS public.rpc_finish_session() CASCADE;
DROP FUNCTION IF EXISTS public.rpc_finish_session(TEXT[]) CASCADE;
DROP FUNCTION IF EXISTS public.rpc_finish_session(TEXT[], TEXT) CASCADE;

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
  v_total_break_seconds NUMERIC := 0;
  v_duration_minutes INTEGER := 0;
  v_break_minutes INTEGER := 0;
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
  v_last_study_end TIMESTAMPTZ;
  v_session_actual_end TIMESTAMPTZ;
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

  -- Authoritative study session end time:
  -- If user ended session while on break, active study concluded when the last study block ended.
  SELECT COALESCE(MAX(end_time), v_session_start)
  INTO v_last_study_end
  FROM public.session_blocks
  WHERE user_id = v_user_id
    AND block_type = 'study'
    AND session_id IS NULL;

  IF v_status = 'break' THEN
    v_session_actual_end := v_last_study_end;
  ELSE
    v_session_actual_end := v_now;
  END IF;

  -- Calculate total break duration from unlinked break blocks
  SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(end_time, v_now) - start_time))), 0)
  INTO v_total_break_seconds
  FROM public.session_blocks
  WHERE user_id = v_user_id
    AND block_type = 'break'
    AND session_id IS NULL;
  v_break_minutes := GREATEST(0, FLOOR(v_total_break_seconds / 60)::INTEGER);

  -- Detect if session crossed midnight in application timezone (Asia/Kolkata)
  IF DATE(v_session_start AT TIME ZONE v_tz) <> DATE(v_session_actual_end AT TIME ZONE v_tz) THEN
    v_crossed_midnight := true;
    v_midnight := (DATE_TRUNC('day', v_session_actual_end AT TIME ZONE v_tz) AT TIME ZONE v_tz);

    -- Split any unlinked block that straddles v_midnight
    FOR v_block IN
      SELECT id, block_type, start_time, end_time
      FROM public.session_blocks
      WHERE user_id = v_user_id
        AND session_id IS NULL
        AND start_time < v_midnight
        AND end_time > v_midnight
    LOOP
      -- Insert block part after midnight
      INSERT INTO public.session_blocks (user_id, block_type, start_time, end_time, session_id)
      VALUES (v_user_id, v_block.block_type, v_midnight, v_block.end_time, NULL);

      -- Truncate block part before midnight
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
    -- Calculate study seconds before midnight
    SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (end_time - start_time))), 0)
    INTO v_total_study_seconds
    FROM public.session_blocks
    WHERE user_id = v_user_id
      AND block_type = 'study'
      AND session_id IS NULL
      AND end_time <= v_midnight;
    v_dur_1 := LEAST(180, GREATEST(0, FLOOR(v_total_study_seconds / 60)::INTEGER));

    -- Calculate study seconds after midnight
    SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (end_time - start_time))), 0)
    INTO v_total_study_seconds
    FROM public.session_blocks
    WHERE user_id = v_user_id
      AND block_type = 'study'
      AND session_id IS NULL
      AND start_time >= v_midnight;
    v_dur_2 := LEAST(180, GREATEST(0, FLOOR(v_total_study_seconds / 60)::INTEGER));

    -- Fallback: If blocks missing, use active_study_seconds_snapshot rather than blind wall-clock
    IF v_dur_1 = 0 AND v_dur_2 = 0 THEN
      SELECT COALESCE(active_study_seconds_snapshot, 0)
      INTO v_total_study_seconds
      FROM public.users WHERE id = v_user_id;

      IF v_total_study_seconds > 0 THEN
        v_dur_1 := LEAST(180, FLOOR(v_total_study_seconds / 60)::INTEGER);
      END IF;
    END IF;

    v_duration_minutes := v_dur_1 + v_dur_2;

    -- Insert Part 1 (Day 1)
    IF v_dur_1 > 0 OR v_dur_2 = 0 THEN
      INSERT INTO public.study_sessions (user_id, start_time, end_time, duration_minutes, break_minutes, completed_tasks)
      VALUES (v_user_id, v_session_start, v_midnight, v_dur_1, 0, CASE WHEN v_dur_2 = 0 THEN v_session_completed_tasks ELSE '[]'::JSONB END)
      RETURNING id INTO v_session_id_1;

      UPDATE public.session_blocks
      SET session_id = v_session_id_1
      WHERE user_id = v_user_id AND session_id IS NULL AND end_time <= v_midnight;
    END IF;

    -- Insert Part 2 (Day 2)
    IF v_dur_2 > 0 THEN
      INSERT INTO public.study_sessions (user_id, start_time, end_time, duration_minutes, break_minutes, completed_tasks)
      VALUES (v_user_id, v_midnight, v_session_actual_end, v_dur_2, v_break_minutes, v_session_completed_tasks)
      RETURNING id INTO v_session_id_2;

      UPDATE public.session_blocks
      SET session_id = v_session_id_2
      WHERE user_id = v_user_id AND session_id IS NULL AND start_time >= v_midnight;
    END IF;

    -- Link any remaining unlinked blocks
    UPDATE public.session_blocks
    SET session_id = COALESCE(v_session_id_2, v_session_id_1)
    WHERE user_id = v_user_id AND session_id IS NULL;

    v_session_id := COALESCE(v_session_id_2, v_session_id_1);
  ELSE
    -- Standard single-day session
    SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(end_time, v_now) - start_time))), 0)
    INTO v_total_study_seconds
    FROM public.session_blocks
    WHERE user_id = v_user_id
      AND block_type = 'study'
      AND session_id IS NULL;

    v_duration_minutes := LEAST(180, GREATEST(0, FLOOR(v_total_study_seconds / 60)::INTEGER));

    -- Insert study session record with actual study end time and break minutes
    INSERT INTO public.study_sessions (user_id, start_time, end_time, duration_minutes, break_minutes, completed_tasks)
    VALUES (v_user_id, v_session_start, v_session_actual_end, v_duration_minutes, v_break_minutes, v_session_completed_tasks)
    RETURNING id INTO v_session_id;

    -- Associate unlinked blocks with this session
    UPDATE public.session_blocks
    SET session_id = v_session_id
    WHERE user_id = v_user_id AND session_id IS NULL;
  END IF;

  -- Reset user to offline and set pending_goal state if tasks not already submitted
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
    'break_minutes', v_break_minutes,
    'duration_minutes_1', v_dur_1,
    'duration_minutes_2', v_dur_2,
    'start_time', v_session_start,
    'end_time', v_session_actual_end,
    'completed_tasks', v_session_completed_tasks,
    'pending_goal_session_id', CASE WHEN v_has_completed_tasks THEN NULL ELSE v_session_id END,
    'server_now', v_now
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Update rpc_stop_user_session for break expiry / peer timeouts
CREATE OR REPLACE FUNCTION public.rpc_stop_user_session(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_status TEXT;
  v_session_start TIMESTAMPTZ;
  v_focus TEXT;
  v_now TIMESTAMPTZ := NOW();
  v_total_study_seconds NUMERIC := 0;
  v_total_break_seconds NUMERIC := 0;
  v_duration_minutes INTEGER := 0;
  v_break_minutes INTEGER := 0;
  v_session_id UUID;
  v_last_study_end TIMESTAMPTZ;
  v_session_actual_end TIMESTAMPTZ;
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

  SELECT COALESCE(MAX(end_time), v_session_start)
  INTO v_last_study_end
  FROM public.session_blocks
  WHERE user_id = p_user_id
    AND block_type = 'study'
    AND session_id IS NULL;

  IF v_status = 'break' THEN
    v_session_actual_end := v_last_study_end;
  ELSE
    v_session_actual_end := v_now;
  END IF;

  SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(end_time, v_now) - start_time))), 0)
  INTO v_total_study_seconds
  FROM public.session_blocks
  WHERE user_id = p_user_id
    AND block_type = 'study'
    AND session_id IS NULL;

  v_duration_minutes := LEAST(180, GREATEST(0, FLOOR(v_total_study_seconds / 60)::INTEGER));

  SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(end_time, v_now) - start_time))), 0)
  INTO v_total_break_seconds
  FROM public.session_blocks
  WHERE user_id = p_user_id
    AND block_type = 'break'
    AND session_id IS NULL;

  v_break_minutes := GREATEST(0, FLOOR(v_total_break_seconds / 60)::INTEGER);

  INSERT INTO public.study_sessions (user_id, start_time, end_time, duration_minutes, break_minutes, completed_tasks)
  VALUES (p_user_id, v_session_start, v_session_actual_end, v_duration_minutes, v_break_minutes, '[]'::JSONB)
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
    'break_minutes', v_break_minutes,
    'server_now', v_now
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Update rpc_admin_suspend_user to set authoritative study end_time and break_minutes
CREATE OR REPLACE FUNCTION public.rpc_admin_suspend_user(p_target_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_session_id UUID;
  v_session_start TIMESTAMPTZ;
  v_status TEXT;
  v_now TIMESTAMPTZ := NOW();
  v_total_study_seconds NUMERIC := 0;
  v_total_break_seconds NUMERIC := 0;
  v_duration_minutes INTEGER := 0;
  v_break_minutes INTEGER := 0;
  v_last_study_end TIMESTAMPTZ;
  v_session_actual_end TIMESTAMPTZ;
BEGIN
  IF NOT public.check_is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Caller is not an administrator';
  END IF;

  SELECT current_status, session_start_time
  INTO v_status, v_session_start
  FROM public.users
  WHERE id = p_target_user_id
  FOR UPDATE;

  IF v_status IS NULL OR v_status = 'offline' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Target user is already offline');
  END IF;

  UPDATE public.session_blocks
  SET end_time = v_now
  WHERE user_id = p_target_user_id AND end_time IS NULL;

  IF v_session_start IS NULL THEN
    v_session_start := v_now;
  END IF;

  SELECT COALESCE(MAX(end_time), v_session_start)
  INTO v_last_study_end
  FROM public.session_blocks
  WHERE user_id = p_target_user_id
    AND block_type = 'study'
    AND session_id IS NULL;

  IF v_status = 'break' THEN
    v_session_actual_end := v_last_study_end;
  ELSE
    v_session_actual_end := v_now;
  END IF;

  SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(end_time, v_now) - start_time))), 0)
  INTO v_total_study_seconds
  FROM public.session_blocks
  WHERE user_id = p_target_user_id
    AND block_type = 'study'
    AND session_id IS NULL;

  v_duration_minutes := LEAST(180, GREATEST(0, FLOOR(v_total_study_seconds / 60)::INTEGER));

  SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(end_time, v_now) - start_time))), 0)
  INTO v_total_break_seconds
  FROM public.session_blocks
  WHERE user_id = p_target_user_id
    AND block_type = 'break'
    AND session_id IS NULL;

  v_break_minutes := GREATEST(0, FLOOR(v_total_break_seconds / 60)::INTEGER);

  INSERT INTO public.study_sessions (user_id, start_time, end_time, duration_minutes, break_minutes, completed_tasks)
  VALUES (p_target_user_id, v_session_start, v_session_actual_end, v_duration_minutes, v_break_minutes, '[]'::JSONB)
  RETURNING id INTO v_session_id;

  UPDATE public.session_blocks
  SET session_id = v_session_id
  WHERE user_id = p_target_user_id AND session_id IS NULL;

  UPDATE public.users
  SET current_status = 'offline',
      current_focus = NULL,
      session_start_time = NULL,
      last_resumed_at = NULL,
      break_started_at = NULL,
      active_study_seconds_snapshot = 0,
      last_break_expired_study_seconds = NULL,
      last_offline_at = v_now
  WHERE id = p_target_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'session_id', v_session_id,
    'duration_minutes', v_duration_minutes,
    'break_minutes', v_break_minutes,
    'server_now', v_now,
    'message', 'Session suspended and saved by administrator'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Update rpc_get_study_history to include break_minutes
DROP FUNCTION IF EXISTS public.rpc_get_study_history() CASCADE;
CREATE OR REPLACE FUNCTION public.rpc_get_study_history()
RETURNS TABLE (
  id UUID,
  user_id UUID,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  duration_minutes INTEGER,
  break_minutes INTEGER,
  completed_tasks JSONB
) AS $$
DECLARE
  v_uid UUID;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Automatically purge records older than 90 days (3 months)
  DELETE FROM public.study_sessions
  WHERE public.study_sessions.user_id = v_uid 
    AND public.study_sessions.start_time < (NOW() - INTERVAL '90 days');

  RETURN QUERY
  SELECT
    s.id,
    s.user_id,
    s.start_time,
    s.end_time,
    s.duration_minutes,
    COALESCE(s.break_minutes, 0) AS break_minutes,
    COALESCE(s.completed_tasks, '[]'::JSONB) AS completed_tasks
  FROM public.study_sessions s
  WHERE s.user_id = v_uid
  ORDER BY s.start_time DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Safe Historical Data Backfill:
-- A. Calculate break_minutes for existing sessions from linked break blocks
UPDATE public.study_sessions s
SET break_minutes = COALESCE((
  SELECT FLOOR(SUM(EXTRACT(EPOCH FROM (b.end_time - b.start_time))) / 60)::INTEGER
  FROM public.session_blocks b
  WHERE b.session_id = s.id AND b.block_type = 'break'
), 0)
WHERE s.break_minutes = 0;

-- B. Correct 0m sessions where end_time mistakenly captured long break durations
UPDATE public.study_sessions s
SET end_time = (
  SELECT COALESCE(MAX(b.end_time), s.start_time)
  FROM public.session_blocks b
  WHERE b.session_id = s.id AND b.block_type = 'study'
)
WHERE s.duration_minutes = 0
  AND s.end_time > s.start_time
  AND EXISTS (
    SELECT 1 FROM public.session_blocks b WHERE b.session_id = s.id
  );
