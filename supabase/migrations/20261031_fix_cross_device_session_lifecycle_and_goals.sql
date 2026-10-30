-- ============================================================
-- Migration: 20261031_fix_cross_device_session_lifecycle_and_goals.sql
-- Description:
--   1. Monotonic state_version across rpc_start_session, rpc_finish_session, rpc_pause_session, rpc_resume_session
--      Guarantees that other authenticated devices and AuthProvider accept started/finalized/paused/resumed
--      states without dropping them due to client optimistic version bumps.
--   2. Strict Server Timestamp Authority:
--      Removes client control over transition boundaries in rpc_pause_session and rpc_resume_session.
--      Database transaction clock v_server_now dictates start, pause, resume, and finish intervals.
--   3. Enhances rpc_synchronize_session to:
--      - Preserve valid unlinked study blocks across arbitrary multi-hour durations (removes unsafe 3h15m filter).
--      - Return pending_goal_session_id, pending_goal_seconds, and pending_goal_reason on break expiry,
--        session limit completion, or already_offline states.
--   4. Hardens rpc_acknowledge_break_expiry to clear only last_break_expired_study_seconds,
--      preventing premature destruction of pending_goal_session_id before goal updates are persisted.
--   5. Provides authoritative caller RPC rpc_get_pending_goal_session() for robust cross-device recovery.
-- ============================================================

-- 0. UPGRADE RPC: rpc_start_session (Monotonic Version Increment & Search Path Hardening)
CREATE OR REPLACE FUNCTION public.rpc_start_session(p_focus TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_status TEXT;
  v_trimmed_focus TEXT;
  v_now TIMESTAMPTZ := NOW();
  v_block_id UUID;
  v_version BIGINT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Strict row-level lock
  SELECT current_status, state_version INTO v_status, v_version
  FROM public.users
  WHERE id = v_user_id
  FOR UPDATE;

  -- Idempotent check: if already studying, return current state without error
  IF v_status = 'studying' THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_active', true,
      'status', 'studying',
      'state_version', v_version,
      'server_now', v_now
    );
  END IF;

  v_trimmed_focus := NULLIF(TRIM(p_focus), '');
  IF v_trimmed_focus IS NOT NULL AND LENGTH(v_trimmed_focus) > 60 THEN
    v_trimmed_focus := SUBSTRING(v_trimmed_focus FROM 1 FOR 60);
  END IF;

  -- Close any orphaned session blocks for this user
  UPDATE public.session_blocks
  SET end_time = v_now
  WHERE user_id = v_user_id AND end_time IS NULL;

  -- Update user status with active resume timestamp and monotonic version increment
  UPDATE public.users
  SET current_status = 'studying',
      current_focus = v_trimmed_focus,
      session_start_time = v_now,
      last_resumed_at = v_now,
      break_started_at = NULL,
      active_study_seconds_snapshot = 0,
      last_break_expired_study_seconds = NULL,
      state_version = COALESCE(state_version, 1) + 1
  WHERE id = v_user_id
  RETURNING state_version INTO v_version;

  -- Create active study block
  INSERT INTO public.session_blocks (user_id, block_type, start_time)
  VALUES (v_user_id, 'study', v_now)
  RETURNING id INTO v_block_id;

  RETURN jsonb_build_object(
    'success', true,
    'status', 'studying',
    'focus', v_trimmed_focus,
    'session_start_time', v_now,
    'last_resumed_at', v_now,
    'active_study_seconds_snapshot', 0,
    'block_id', v_block_id,
    'state_version', v_version,
    'server_now', v_now
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rpc_start_session(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rpc_start_session(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_start_session(TEXT) TO authenticated, service_role;

-- 1. UPGRADE RPC: rpc_finish_session (Monotonic Version Increment)
CREATE OR REPLACE FUNCTION public.rpc_finish_session(
  p_completed_task_ids TEXT[] DEFAULT ARRAY[]::TEXT[],
  p_reason TEXT DEFAULT 'manual_stop'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_status TEXT;
  v_session_start TIMESTAMPTZ;
  v_focus TEXT;
  v_version BIGINT;
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
  SELECT current_status, session_start_time, current_focus, state_version 
  INTO v_status, v_session_start, v_focus, v_version
  FROM public.users
  WHERE id = v_user_id
  FOR UPDATE;

  -- Idempotency check: already finished
  IF v_status = 'offline' THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_finished', true,
      'state_version', v_version,
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

  -- Enforce 3-hour limit on end time if app was closed longer than 3 hours
  IF v_session_actual_end > (v_session_start + INTERVAL '3 hours') THEN
    v_session_actual_end := v_session_start + INTERVAL '3 hours';
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
      INSERT INTO public.session_blocks (user_id, block_type, start_time, end_time, session_id)
      VALUES (v_user_id, v_block.block_type, v_midnight, v_block.end_time, NULL);

      UPDATE public.session_blocks
      SET end_time = v_midnight
      WHERE id = v_block.id;
    END LOOP;
  END IF;

  -- Process completed goal tasks if provided
  IF p_completed_task_ids IS NOT NULL AND array_length(p_completed_task_ids, 1) > 0 THEN
    v_has_completed_tasks := true;

    SELECT id, tasks INTO v_active_goal_id, v_tasks
    FROM public.daily_goals
    WHERE user_id = v_user_id
      AND (
        expires_at > v_now
        OR expires_at >= (v_now - INTERVAL '20 hours')
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

  IF v_crossed_midnight THEN
    -- Part 1: before midnight
    SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(end_time, v_midnight) - start_time))), 0)
    INTO v_total_study_seconds
    FROM public.session_blocks
    WHERE user_id = v_user_id
      AND block_type = 'study'
      AND session_id IS NULL
      AND end_time <= v_midnight;

    v_dur_1 := GREATEST(0, FLOOR(v_total_study_seconds / 60)::INTEGER);

    -- Part 2: after midnight
    SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(end_time, v_now) - start_time))), 0)
    INTO v_total_study_seconds
    FROM public.session_blocks
    WHERE user_id = v_user_id
      AND block_type = 'study'
      AND session_id IS NULL
      AND start_time >= v_midnight;

    v_dur_2 := GREATEST(0, FLOOR(v_total_study_seconds / 60)::INTEGER);

    v_duration_minutes := LEAST(180, v_dur_1 + v_dur_2);

    IF v_dur_1 > 0 OR v_dur_2 = 0 THEN
      INSERT INTO public.study_sessions (user_id, start_time, end_time, duration_minutes, break_minutes, completed_tasks, split_part)
      VALUES (v_user_id, v_session_start, v_midnight, v_dur_1, v_break_minutes, v_session_completed_tasks, 1)
      RETURNING id INTO v_session_id_1;

      UPDATE public.session_blocks
      SET session_id = v_session_id_1
      WHERE user_id = v_user_id AND session_id IS NULL AND end_time <= v_midnight;
    END IF;

    IF v_dur_2 > 0 THEN
      INSERT INTO public.study_sessions (user_id, start_time, end_time, duration_minutes, break_minutes, completed_tasks, split_part, sibling_session_id)
      VALUES (v_user_id, v_midnight, v_session_actual_end, v_dur_2, 0, v_session_completed_tasks, 2, v_session_id_1)
      RETURNING id INTO v_session_id_2;

      IF v_session_id_1 IS NOT NULL THEN
        UPDATE public.study_sessions
        SET sibling_session_id = v_session_id_2
        WHERE id = v_session_id_1;
      END IF;

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

    INSERT INTO public.study_sessions (user_id, start_time, end_time, duration_minutes, break_minutes, completed_tasks)
    VALUES (v_user_id, v_session_start, v_session_actual_end, v_duration_minutes, v_break_minutes, v_session_completed_tasks)
    RETURNING id INTO v_session_id;

    UPDATE public.session_blocks
    SET session_id = v_session_id
    WHERE user_id = v_user_id AND session_id IS NULL;
  END IF;

  -- Reset user to offline and set pending_goal state if tasks not already submitted
  -- MONOTONIC VERSION: state_version is safely incremented to propagate immediately across all devices
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
      last_offline_at = v_now,
      state_version = COALESCE(state_version, 1) + 1
  WHERE id = v_user_id
  RETURNING state_version INTO v_version;

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
    'pending_goal_seconds', CASE WHEN v_has_completed_tasks THEN NULL ELSE (v_duration_minutes * 60) END,
    'pending_goal_reason', CASE WHEN v_has_completed_tasks THEN NULL ELSE COALESCE(p_reason, 'manual_stop') END,
    'state_version', v_version,
    'server_now', v_now
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rpc_finish_session(TEXT[], TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rpc_finish_session(TEXT[], TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_finish_session(TEXT[], TEXT) TO authenticated, service_role;

-- 2. UPGRADE RPC: rpc_pause_session (Monotonic Version Increment & Server Clock Authority)
CREATE OR REPLACE FUNCTION public.rpc_pause_session(
  p_paused_at TIMESTAMPTZ DEFAULT NULL,
  p_elapsed_study_seconds INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_status TEXT;
  v_break_started_at TIMESTAMPTZ;
  v_server_now TIMESTAMPTZ := NOW();
  -- Strictly Server-Authoritative: The database transaction clock dictates the transition boundary.
  -- p_paused_at and p_elapsed_study_seconds are retained in the signature purely for RPC caller
  -- backward compatibility and are strictly ignored in authoritative timeline accounting.
  v_now TIMESTAMPTZ := v_server_now;
  v_last_study_start TIMESTAMPTZ;
  v_total_study_seconds INTEGER := 0;
  v_version BIGINT;
  v_snapshot INTEGER;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT current_status, break_started_at, active_study_seconds_snapshot, state_version
  INTO v_status, v_break_started_at, v_snapshot, v_version
  FROM public.users
  WHERE id = v_user_id
  FOR UPDATE;

  -- Idempotency check: if already paused on break, return safe success
  IF v_status = 'break' THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_paused', true,
      'status', 'break',
      'break_started_at', v_break_started_at,
      'active_study_seconds_snapshot', v_snapshot,
      'state_version', v_version,
      'server_now', v_server_now
    );
  END IF;

  IF v_status <> 'studying' THEN
    RAISE EXCEPTION 'User is not currently studying';
  END IF;

  -- Ensure v_now is not prior to the start time of the active unlinked study block
  SELECT MAX(start_time) INTO v_last_study_start
  FROM public.session_blocks
  WHERE user_id = v_user_id AND block_type = 'study' AND session_id IS NULL AND end_time IS NULL;

  IF v_last_study_start IS NOT NULL AND v_now < v_last_study_start THEN
    v_now := v_last_study_start;
  END IF;

  -- Close current active study block
  UPDATE public.session_blocks
  SET end_time = v_now
  WHERE user_id = v_user_id AND block_type = 'study' AND end_time IS NULL;

  -- Open break block
  INSERT INTO public.session_blocks (user_id, block_type, start_time)
  VALUES (v_user_id, 'break', v_now);

  -- Calculate total active study seconds strictly from study blocks so far (excluding breaks)
  SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(end_time, v_now) - start_time))), 0)::INTEGER
  INTO v_total_study_seconds
  FROM public.session_blocks
  WHERE user_id = v_user_id
    AND block_type = 'study'
    AND session_id IS NULL;

  v_total_study_seconds := LEAST(10800, GREATEST(0, v_total_study_seconds));

  -- Update user status with frozen active study seconds snapshot and break start timestamp
  UPDATE public.users
  SET current_status = 'break',
      last_resumed_at = NULL,
      break_started_at = v_now,
      active_study_seconds_snapshot = v_total_study_seconds,
      state_version = COALESCE(state_version, 1) + 1
  WHERE id = v_user_id
  RETURNING state_version INTO v_version;

  RETURN jsonb_build_object(
    'success', true,
    'status', 'break',
    'paused_at', v_now,
    'break_started_at', v_now,
    'active_study_seconds_snapshot', v_total_study_seconds,
    'state_version', v_version,
    'server_now', v_server_now
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rpc_pause_session(TIMESTAMPTZ, INTEGER) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rpc_pause_session(TIMESTAMPTZ, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_pause_session(TIMESTAMPTZ, INTEGER) TO authenticated, service_role;

-- 3. UPGRADE RPC: rpc_resume_session (Monotonic Version Increment & Server Clock Authority)
CREATE OR REPLACE FUNCTION public.rpc_resume_session(
  p_resumed_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_status TEXT;
  v_break_started_at TIMESTAMPTZ;
  v_server_now TIMESTAMPTZ := NOW();
  -- Strictly Server-Authoritative: The database transaction clock dictates the resume boundary.
  -- p_resumed_at is retained in the signature purely for RPC caller backward compatibility
  -- and is strictly ignored in authoritative timeline accounting.
  v_now TIMESTAMPTZ := v_server_now;
  v_total_study_seconds INTEGER := 0;
  v_version BIGINT;
  v_finish_res JSONB;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT current_status, break_started_at, state_version
  INTO v_status, v_break_started_at, v_version
  FROM public.users
  WHERE id = v_user_id
  FOR UPDATE;

  -- Idempotency check: if already resumed (studying), return safe success
  IF v_status = 'studying' THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_resumed', true,
      'status', 'studying',
      'state_version', v_version,
      'server_now', v_server_now
    );
  END IF;

  IF v_status <> 'break' THEN
    RAISE EXCEPTION 'User is not currently on break';
  END IF;

  -- Ensure v_now is not prior to break_started_at
  IF v_break_started_at IS NOT NULL AND v_now < v_break_started_at THEN
    v_now := v_break_started_at;
  END IF;

  -- 1-HOUR BREAK EXPIRY ENFORCEMENT:
  -- If break exceeded 1 hour (3600 seconds), end session and save only study time before break
  IF v_break_started_at IS NOT NULL AND EXTRACT(EPOCH FROM (v_now - v_break_started_at)) >= 3600 THEN
    SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(end_time, v_now) - start_time))), 0)::INTEGER
    INTO v_total_study_seconds
    FROM public.session_blocks
    WHERE user_id = v_user_id AND block_type = 'study' AND session_id IS NULL;

    SELECT * INTO v_finish_res FROM public.rpc_finish_session(ARRAY[]::TEXT[], 'break_expired');

    UPDATE public.users
    SET last_break_expired_study_seconds = v_total_study_seconds,
        state_version = COALESCE(state_version, 1) + 1
    WHERE id = v_user_id
    RETURNING state_version INTO v_version;

    RETURN jsonb_build_object(
      'success', false,
      'error', 'break_expired',
      'message', 'You stayed on break for more than 1 hour. Session has been stopped. Start a new session.',
      'session_id', v_finish_res->>'session_id',
      'pending_goal_session_id', v_finish_res->>'pending_goal_session_id',
      'pending_goal_seconds', COALESCE((v_finish_res->>'pending_goal_seconds')::INTEGER, v_total_study_seconds),
      'pending_goal_reason', 'break_expired',
      'state_version', v_version,
      'server_now', v_server_now
    );
  END IF;

  -- Close current active break block
  UPDATE public.session_blocks
  SET end_time = v_now
  WHERE user_id = v_user_id AND block_type = 'break' AND end_time IS NULL;

  -- Open new study block
  INSERT INTO public.session_blocks (user_id, block_type, start_time)
  VALUES (v_user_id, 'study', v_now);

  -- Update user status with new resume timestamp
  UPDATE public.users
  SET current_status = 'studying',
      last_resumed_at = v_now,
      break_started_at = NULL,
      last_break_expired_study_seconds = NULL,
      state_version = COALESCE(state_version, 1) + 1
  WHERE id = v_user_id
  RETURNING state_version INTO v_version;

  RETURN jsonb_build_object(
    'success', true,
    'status', 'studying',
    'resumed_at', v_now,
    'state_version', v_version,
    'server_now', v_server_now
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rpc_resume_session(TIMESTAMPTZ) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rpc_resume_session(TIMESTAMPTZ) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_resume_session(TIMESTAMPTZ) TO authenticated, service_role;

-- 4. UPGRADE RPC: rpc_synchronize_session (Pending Goal Preservation & Expiration Safety)
CREATE OR REPLACE FUNCTION public.rpc_synchronize_session()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_status TEXT;
  v_session_start TIMESTAMPTZ;
  v_last_resumed TIMESTAMPTZ;
  v_break_start TIMESTAMPTZ;
  v_snapshot INTEGER;
  v_version BIGINT;
  v_now TIMESTAMPTZ := NOW();

  v_true_start TIMESTAMPTZ;
  v_true_resume TIMESTAMPTZ;
  v_accrued_study_seconds INTEGER := 0;
  v_open_study_block_start TIMESTAMPTZ;
  v_study_block_count INTEGER := 0;
  v_total_study_seconds INTEGER := 0;

  v_pending_sid UUID;
  v_pending_sec INTEGER;
  v_pending_reason TEXT;
  v_finish_res JSONB;
BEGIN
  -- 1. Authentication Check
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 2. Lock user profile row to guarantee ACID atomicity
  SELECT
    current_status,
    session_start_time,
    last_resumed_at,
    break_started_at,
    COALESCE(active_study_seconds_snapshot, 0),
    COALESCE(state_version, 1),
    pending_goal_session_id,
    pending_goal_seconds,
    pending_goal_reason
  INTO
    v_status,
    v_session_start,
    v_last_resumed,
    v_break_start,
    v_snapshot,
    v_version,
    v_pending_sid,
    v_pending_sec,
    v_pending_reason
  FROM public.users
  WHERE id = v_user_id
  FOR UPDATE;

  -- If user is offline, ensure any orphaned unlinked blocks are closed and surface pending goals
  IF v_status IS NULL OR v_status = 'offline' THEN
    UPDATE public.session_blocks
    SET end_time = v_now
    WHERE user_id = v_user_id AND session_id IS NULL AND end_time IS NULL;

    RETURN jsonb_build_object(
      'success', true,
      'status', 'offline',
      'repaired', false,
      'reason', 'already_offline',
      'session_start_time', NULL,
      'last_resumed_at', NULL,
      'break_started_at', NULL,
      'active_study_seconds_snapshot', 0,
      'elapsed_seconds', 0,
      'pending_goal_session_id', v_pending_sid,
      'pending_goal_seconds', v_pending_sec,
      'pending_goal_reason', v_pending_reason,
      'state_version', v_version,
      'server_now', v_now
    );
  END IF;

  -- 3. Handling User on Break
  IF v_status = 'break' THEN
    -- Derive break_started_at if missing
    IF v_break_start IS NULL THEN
      SELECT start_time INTO v_break_start
      FROM public.session_blocks
      WHERE user_id = v_user_id AND session_id IS NULL AND block_type = 'break' AND end_time IS NULL
      ORDER BY start_time DESC
      LIMIT 1;

      IF v_break_start IS NOT NULL THEN
        UPDATE public.users
        SET break_started_at = v_break_start,
            state_version = COALESCE(state_version, 1) + 1
        WHERE id = v_user_id
        RETURNING state_version INTO v_version;
      ELSE
        v_break_start := v_now;
      END IF;
    END IF;

    -- Check 1-Hour Break Expiry Limit
    IF v_now - v_break_start >= INTERVAL '1 hour' THEN
      SELECT * INTO v_finish_res FROM public.rpc_finish_session(ARRAY[]::TEXT[], 'break_expired');

      RETURN jsonb_build_object(
        'success', true,
        'status', 'offline',
        'repaired', true,
        'reason', 'break_expired',
        'session_id', v_finish_res->>'session_id',
        'pending_goal_session_id', v_finish_res->>'pending_goal_session_id',
        'pending_goal_seconds', COALESCE((v_finish_res->>'pending_goal_seconds')::INTEGER, v_snapshot),
        'pending_goal_reason', 'break_expired',
        'session_start_time', NULL,
        'last_resumed_at', NULL,
        'break_started_at', NULL,
        'active_study_seconds_snapshot', v_snapshot,
        'elapsed_seconds', v_snapshot,
        'state_version', COALESCE((v_finish_res->>'state_version')::BIGINT, v_version + 1),
        'server_now', v_now
      );
    END IF;

    -- Valid Break State
    RETURN jsonb_build_object(
      'success', true,
      'status', 'break',
      'repaired', false,
      'reason', 'already_synchronized',
      'session_start_time', v_session_start,
      'last_resumed_at', NULL,
      'break_started_at', v_break_start,
      'active_study_seconds_snapshot', v_snapshot,
      'elapsed_seconds', v_snapshot,
      'state_version', v_version,
      'server_now', v_now
    );
  END IF;

  -- 4. Handling User Studying
  IF v_status = 'studying' THEN
    -- Query unlinked session blocks on the server across entire active session
    SELECT
      MIN(start_time) FILTER (WHERE block_type = 'study'),
      MAX(start_time) FILTER (WHERE block_type = 'study' AND end_time IS NULL),
      COALESCE(SUM(EXTRACT(EPOCH FROM (end_time - start_time))) FILTER (WHERE block_type = 'study' AND end_time IS NOT NULL), 0)::INTEGER,
      COUNT(*) FILTER (WHERE block_type = 'study')
    INTO
      v_true_start,
      v_open_study_block_start,
      v_accrued_study_seconds,
      v_study_block_count
    FROM public.session_blocks
    WHERE user_id = v_user_id
      AND session_id IS NULL;

    -- CASE 4A: Valid study blocks exist on the server
    IF v_study_block_count > 0 AND v_true_start IS NOT NULL THEN
      -- If there is no open study block, open one now
      IF v_open_study_block_start IS NULL THEN
        INSERT INTO public.session_blocks (user_id, block_type, start_time)
        VALUES (v_user_id, 'study', v_now);
        v_true_resume := v_now;
      ELSE
        v_true_resume := v_open_study_block_start;
      END IF;

      -- Calculate total study seconds so far
      v_total_study_seconds := v_accrued_study_seconds + GREATEST(0, EXTRACT(EPOCH FROM (v_now - v_true_resume))::INTEGER);

      -- Enforce 3-hour maximum study session limit
      IF v_total_study_seconds >= 10800 THEN
        SELECT * INTO v_finish_res FROM public.rpc_finish_session(ARRAY[]::TEXT[], 'session_limit');

        RETURN jsonb_build_object(
          'success', true,
          'status', 'offline',
          'repaired', true,
          'reason', 'session_limit_exceeded',
          'session_id', v_finish_res->>'session_id',
          'pending_goal_session_id', v_finish_res->>'pending_goal_session_id',
          'pending_goal_seconds', COALESCE((v_finish_res->>'pending_goal_seconds')::INTEGER, 10800),
          'pending_goal_reason', 'session_limit',
          'session_start_time', NULL,
          'last_resumed_at', NULL,
          'break_started_at', NULL,
          'active_study_seconds_snapshot', 0,
          'elapsed_seconds', 10800,
          'state_version', COALESCE((v_finish_res->>'state_version')::BIGINT, v_version + 1),
          'server_now', v_now
        );
      END IF;

      -- Check if users row is missing start_time or resume_time or snapshot
      IF v_session_start IS NULL OR v_last_resumed IS NULL OR v_snapshot <> v_accrued_study_seconds THEN
        UPDATE public.users
        SET session_start_time = COALESCE(v_session_start, v_true_start),
            last_resumed_at = COALESCE(v_last_resumed, v_true_resume),
            active_study_seconds_snapshot = v_accrued_study_seconds,
            break_started_at = NULL,
            updated_at = v_now,
            state_version = COALESCE(state_version, 1) + 1
        WHERE id = v_user_id
        RETURNING state_version INTO v_version;

        RETURN jsonb_build_object(
          'success', true,
          'status', 'studying',
          'repaired', true,
          'reason', 'repaired_from_server_blocks',
          'session_start_time', COALESCE(v_session_start, v_true_start),
          'last_resumed_at', COALESCE(v_last_resumed, v_true_resume),
          'break_started_at', NULL,
          'active_study_seconds_snapshot', v_accrued_study_seconds,
          'elapsed_seconds', v_total_study_seconds,
          'state_version', v_version,
          'server_now', v_now
        );
      END IF;

      -- Already fully synchronized
      RETURN jsonb_build_object(
        'success', true,
        'status', 'studying',
        'repaired', false,
        'reason', 'already_synchronized',
        'session_start_time', v_session_start,
        'last_resumed_at', v_last_resumed,
        'break_started_at', NULL,
        'active_study_seconds_snapshot', v_snapshot,
        'elapsed_seconds', v_total_study_seconds,
        'state_version', v_version,
        'server_now', v_now
      );
    END IF;

    -- CASE 4B: Zero unlinked study blocks exist (Ghost Studying Status)
    -- Database marked 'studying' without any session blocks
    UPDATE public.users
    SET current_status = 'offline',
        session_start_time = NULL,
        last_resumed_at = NULL,
        break_started_at = NULL,
        active_study_seconds_snapshot = 0,
        current_focus = NULL,
        last_offline_at = v_now,
        updated_at = v_now,
        state_version = COALESCE(state_version, 1) + 1
    WHERE id = v_user_id
    RETURNING state_version INTO v_version;

    RETURN jsonb_build_object(
      'success', true,
      'status', 'offline',
      'repaired', true,
      'reason', 'ghost_session_cleaned',
      'session_start_time', NULL,
      'last_resumed_at', NULL,
      'break_started_at', NULL,
      'active_study_seconds_snapshot', 0,
      'elapsed_seconds', 0,
      'state_version', v_version,
      'server_now', v_now
    );
  END IF;

  -- Default fallback
  RETURN jsonb_build_object(
    'success', true,
    'status', v_status,
    'repaired', false,
    'reason', 'unhandled_status',
    'state_version', v_version,
    'server_now', v_now
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rpc_synchronize_session() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rpc_synchronize_session() FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_synchronize_session() TO authenticated, service_role;

-- 5. UPGRADE RPC: rpc_acknowledge_break_expiry (Preserve pending_goal_session_id)
CREATE OR REPLACE FUNCTION public.rpc_acknowledge_break_expiry()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_version BIGINT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.users
  SET last_break_expired_study_seconds = NULL,
      state_version = COALESCE(state_version, 1) + 1
  WHERE id = v_user_id
  RETURNING state_version INTO v_version;

  RETURN jsonb_build_object('success', true, 'state_version', v_version);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rpc_acknowledge_break_expiry() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rpc_acknowledge_break_expiry() FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_acknowledge_break_expiry() TO authenticated, service_role;

-- 6. NEW RPC: rpc_get_pending_goal_session (Authoritative Cross-Device Recovery Query)
CREATE OR REPLACE FUNCTION public.rpc_get_pending_goal_session()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_pending_sid UUID;
  v_pending_sec INTEGER;
  v_pending_reason TEXT;
  v_session RECORD;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT pending_goal_session_id, pending_goal_seconds, pending_goal_reason
  INTO v_pending_sid, v_pending_sec, v_pending_reason
  FROM public.users
  WHERE id = v_user_id;

  IF v_pending_sid IS NULL THEN
    RETURN jsonb_build_object('has_pending', false);
  END IF;

  SELECT id, start_time, end_time, duration_minutes, break_minutes, completed_tasks
  INTO v_session
  FROM public.study_sessions
  WHERE id = v_pending_sid AND user_id = v_user_id;

  IF v_session.id IS NULL THEN
    -- Dangling reference, clean it up
    UPDATE public.users
    SET pending_goal_session_id = NULL,
        pending_goal_seconds = NULL,
        pending_goal_reason = NULL,
        state_version = COALESCE(state_version, 1) + 1
    WHERE id = v_user_id;
    RETURN jsonb_build_object('has_pending', false);
  END IF;

  RETURN jsonb_build_object(
    'has_pending', true,
    'session_id', v_session.id,
    'start_time', v_session.start_time,
    'end_time', v_session.end_time,
    'duration_minutes', v_session.duration_minutes,
    'break_minutes', v_session.break_minutes,
    'pending_goal_seconds', COALESCE(v_pending_sec, v_session.duration_minutes * 60),
    'pending_goal_reason', COALESCE(v_pending_reason, 'manual_stop'),
    'completed_tasks', v_session.completed_tasks
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rpc_get_pending_goal_session() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rpc_get_pending_goal_session() FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_get_pending_goal_session() TO authenticated, service_role;

-- 7. UPGRADE RPC: rpc_complete_session_goals (Monotonic Version Increment on Goal Completion)
CREATE OR REPLACE FUNCTION public.rpc_complete_session_goals(
  p_session_id UUID DEFAULT NULL,
  p_completed_task_ids TEXT[] DEFAULT ARRAY[]::TEXT[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
  v_version BIGINT;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Strictly serialize concurrent requests for the same user via transaction advisory lock
  PERFORM pg_advisory_xact_lock(hashtext(v_user_id::text));

  -- 1. If tasks were completed, update daily_goals and build completed array
  IF p_completed_task_ids IS NOT NULL AND array_length(p_completed_task_ids, 1) > 0 THEN
    SELECT id, tasks INTO v_active_goal_id, v_tasks
    FROM public.daily_goals
    WHERE user_id = v_user_id
      AND (
        expires_at > v_now
        OR expires_at >= (v_now - INTERVAL '20 hours')
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

    -- 2. Link completed tasks to the target study_session and its split sibling (idempotent deduplication, BUG-06)
    IF p_session_id IS NOT NULL AND jsonb_array_length(v_session_completed_tasks) > 0 THEN
      UPDATE public.study_sessions
      SET completed_tasks = (
        SELECT COALESCE(jsonb_agg(elem), '[]'::JSONB)
        FROM (
          SELECT DISTINCT ON (t->>'id') t AS elem
          FROM (
            SELECT jsonb_array_elements(COALESCE(completed_tasks, '[]'::JSONB)) AS t
            UNION ALL
            SELECT jsonb_array_elements(v_session_completed_tasks) AS t
          ) combined
          WHERE t->>'id' IS NOT NULL
        ) deduplicated
      )
      WHERE user_id = v_user_id
        AND (
          id = p_session_id
          OR id = (
            SELECT sibling_session_id
            FROM public.study_sessions
            WHERE id = p_session_id AND user_id = v_user_id
          )
          OR sibling_session_id = p_session_id
        );
    END IF;
  END IF;

  -- 3. Atomically clear pending goal state on user profile and monotonically increment state_version
  UPDATE public.users
  SET pending_goal_session_id = NULL,
      pending_goal_seconds = NULL,
      pending_goal_reason = NULL,
      last_break_expired_study_seconds = NULL,
      state_version = COALESCE(state_version, 1) + 1
  WHERE id = v_user_id
  RETURNING state_version INTO v_version;

  RETURN jsonb_build_object(
    'success', true,
    'session_id', p_session_id,
    'completed_tasks', v_session_completed_tasks,
    'state_version', v_version,
    'server_now', v_now
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rpc_complete_session_goals(UUID, TEXT[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rpc_complete_session_goals(UUID, TEXT[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_complete_session_goals(UUID, TEXT[]) TO authenticated, service_role;
