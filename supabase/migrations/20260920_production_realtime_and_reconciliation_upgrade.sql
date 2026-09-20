-- ============================================================
-- MIGRATION: 20260920_production_realtime_and_reconciliation_upgrade.sql
-- Description: Production-grade upgrade for StudyRoom realtime event ordering,
--              concurrency row-level locking, idempotent session RPCs, and
--              reconciliation.
-- ============================================================

-- 1. ADD MONOTONIC VERSIONING & TIMESTAMP AUDIT TO USERS TABLE
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS state_version BIGINT NOT NULL DEFAULT 1;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_users_state_version ON public.users(state_version);
CREATE INDEX IF NOT EXISTS idx_users_updated_at ON public.users(updated_at);

-- 2. BEFORE UPDATE TRIGGER TO MONOTONICALLY INCREMENT state_version
CREATE OR REPLACE FUNCTION public.trg_users_state_version()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  NEW.state_version = COALESCE(OLD.state_version, 0) + 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_state_version ON public.users;
CREATE TRIGGER trg_users_state_version
BEFORE UPDATE ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.trg_users_state_version();

-- 3. ENSURE REPLICA IDENTITY FULL & PUBLICATION FOR REALTIME BROADCAST
ALTER TABLE public.users REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'users'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.users;
  END IF;
END;
$$;

-- 4. PARTIAL INDEX FOR ACTIVE UNLINKED SESSION BLOCKS
CREATE INDEX IF NOT EXISTS idx_session_blocks_active_user 
ON public.session_blocks(user_id) 
WHERE session_id IS NULL;

-- 5. UPGRADE RPC: rpc_start_session (Row Lock, Monotonic Version, Idempotency)
CREATE OR REPLACE FUNCTION public.rpc_start_session(p_focus TEXT DEFAULT NULL)
RETURNS JSONB AS $$
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

  -- Update user status with active resume timestamp
  UPDATE public.users
  SET current_status = 'studying',
      current_focus = v_trimmed_focus,
      session_start_time = v_now,
      last_resumed_at = v_now,
      break_started_at = NULL,
      active_study_seconds_snapshot = 0,
      last_break_expired_study_seconds = NULL
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. UPGRADE RPC: rpc_pause_session (Row Lock, Monotonic Version, Idempotency)
DROP FUNCTION IF EXISTS public.rpc_pause_session() CASCADE;
DROP FUNCTION IF EXISTS public.rpc_pause_session(TIMESTAMPTZ, INTEGER) CASCADE;

CREATE OR REPLACE FUNCTION public.rpc_pause_session(
  p_paused_at TIMESTAMPTZ DEFAULT NULL,
  p_elapsed_study_seconds INTEGER DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_status TEXT;
  v_break_started_at TIMESTAMPTZ;
  v_now TIMESTAMPTZ := COALESCE(p_paused_at, NOW());
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
      'server_now', v_now
    );
  END IF;

  IF v_status <> 'studying' THEN
    RAISE EXCEPTION 'User is not currently studying';
  END IF;

  -- Close current active study block
  UPDATE public.session_blocks
  SET end_time = v_now
  WHERE user_id = v_user_id AND block_type = 'study' AND end_time IS NULL;

  -- Open break block
  INSERT INTO public.session_blocks (user_id, block_type, start_time)
  VALUES (v_user_id, 'break', v_now);

  -- Calculate total active study seconds from study blocks so far (excluding breaks)
  SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(end_time, v_now) - start_time))), 0)::INTEGER
  INTO v_total_study_seconds
  FROM public.session_blocks
  WHERE user_id = v_user_id
    AND block_type = 'study'
    AND session_id IS NULL;

  IF p_elapsed_study_seconds IS NOT NULL AND p_elapsed_study_seconds > v_total_study_seconds THEN
    v_total_study_seconds := p_elapsed_study_seconds;
  END IF;

  -- Update user status with frozen active study seconds snapshot and break start timestamp
  UPDATE public.users
  SET current_status = 'break',
      last_resumed_at = NULL,
      break_started_at = v_now,
      active_study_seconds_snapshot = v_total_study_seconds
  WHERE id = v_user_id
  RETURNING state_version INTO v_version;

  RETURN jsonb_build_object(
    'success', true,
    'status', 'break',
    'paused_at', v_now,
    'break_started_at', v_now,
    'active_study_seconds_snapshot', v_total_study_seconds,
    'state_version', v_version,
    'server_now', v_now
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. UPGRADE RPC: rpc_resume_session (1-Hour Break Limit Enforcement, Idempotency)
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
  v_version BIGINT;
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
      'server_now', v_now
    );
  END IF;

  IF v_status <> 'break' THEN
    RAISE EXCEPTION 'User is not currently on break';
  END IF;

  -- 1-HOUR BREAK EXPIRY ENFORCEMENT:
  -- If break exceeded 1 hour (3600 seconds), end session and save only study time before break
  IF v_break_started_at IS NOT NULL AND EXTRACT(EPOCH FROM (v_now - v_break_started_at)) >= 3600 THEN
    SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(end_time, v_now) - start_time))), 0)::INTEGER
    INTO v_total_study_seconds
    FROM public.session_blocks
    WHERE user_id = v_user_id AND block_type = 'study' AND session_id IS NULL;

    PERFORM public.rpc_finish_session(ARRAY[]::TEXT[], 'break_expired');

    UPDATE public.users
    SET last_break_expired_study_seconds = v_total_study_seconds
    WHERE id = v_user_id
    RETURNING state_version INTO v_version;

    RETURN jsonb_build_object(
      'success', false,
      'error', 'break_expired',
      'message', 'You stayed on break for more than 1 hour. Session has been stopped. Start a new session.',
      'state_version', v_version,
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

  -- Update user status with new resume timestamp
  UPDATE public.users
  SET current_status = 'studying',
      last_resumed_at = v_now,
      break_started_at = NULL,
      last_break_expired_study_seconds = NULL
  WHERE id = v_user_id
  RETURNING state_version INTO v_version;

  RETURN jsonb_build_object(
    'success', true,
    'status', 'studying',
    'resumed_at', v_now,
    'state_version', v_version,
    'server_now', v_now
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. UPGRADE RPC: rpc_finish_session (Row Lock, 3hr Cap, Midnight Split, Monotonic Version)
DROP FUNCTION IF EXISTS public.rpc_finish_session() CASCADE;
DROP FUNCTION IF EXISTS public.rpc_finish_session(TEXT[]) CASCADE;
DROP FUNCTION IF EXISTS public.rpc_finish_session(TEXT[], TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.rpc_finish_session(TEXT, TEXT[]) CASCADE;

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
      SELECT COALESCE(active_study_seconds_snapshot, 0)
      INTO v_total_study_seconds
      FROM public.users WHERE id = v_user_id;

      IF v_total_study_seconds > 0 THEN
        v_dur_1 := LEAST(180, FLOOR(v_total_study_seconds / 60)::INTEGER);
      END IF;
    END IF;

    v_duration_minutes := v_dur_1 + v_dur_2;

    IF v_dur_1 > 0 OR v_dur_2 = 0 THEN
      INSERT INTO public.study_sessions (
        user_id, start_time, end_time, duration_minutes, break_minutes, completed_tasks, split_part
      )
      VALUES (
        v_user_id, v_session_start, v_midnight, v_dur_1, 0, v_session_completed_tasks, 1
      )
      RETURNING id INTO v_session_id_1;

      UPDATE public.session_blocks
      SET session_id = v_session_id_1
      WHERE user_id = v_user_id AND session_id IS NULL AND end_time <= v_midnight;
    END IF;

    IF v_dur_2 > 0 THEN
      INSERT INTO public.study_sessions (
        user_id, start_time, end_time, duration_minutes, break_minutes, completed_tasks, split_part, sibling_session_id
      )
      VALUES (
        v_user_id, v_midnight, v_session_actual_end, v_dur_2, v_break_minutes, v_session_completed_tasks, 2, v_session_id_1
      )
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. UPGRADE RPC: rpc_stop_user_session (Row Lock, Monotonic Version, Idempotency)
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
  v_version BIGINT;
BEGIN
  SELECT current_status, session_start_time, current_focus, state_version
  INTO v_status, v_session_start, v_focus, v_version
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

  -- 3-Hour cap
  IF v_session_actual_end > (v_session_start + INTERVAL '3 hours') THEN
    v_session_actual_end := v_session_start + INTERVAL '3 hours';
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

-- 10. UPGRADE RPC: rpc_acknowledge_break_expiry (Clears Pending Goals Cleanly)
CREATE OR REPLACE FUNCTION public.rpc_acknowledge_break_expiry()
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_version BIGINT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.users
  SET last_break_expired_study_seconds = NULL,
      pending_goal_session_id = NULL,
      pending_goal_seconds = NULL,
      pending_goal_reason = NULL
  WHERE id = v_user_id
  RETURNING state_version INTO v_version;

  RETURN jsonb_build_object('success', true, 'state_version', v_version);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 11. UPGRADE RPC: rpc_reconcile_expired_sessions (Server-Side Zero-Client Session Expiration)
CREATE OR REPLACE FUNCTION public.rpc_reconcile_expired_sessions()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_role TEXT;
  v_user RECORD;
  v_count INTEGER := 0;
  v_study_count INTEGER := 0;
  v_break_count INTEGER := 0;
  v_start_time TIMESTAMPTZ := clock_timestamp();
  v_duration_ms NUMERIC;
BEGIN
  -- Privilege Check: Allow only postgres (pg_cron), service_role (server cron), or authorized admins
  v_caller_role := current_setting('role', true);
  IF v_caller_role NOT IN ('postgres', 'service_role') AND NOT public.check_is_admin() THEN
    RAISE EXCEPTION 'Access denied: rpc_reconcile_expired_sessions requires service_role or admin privileges';
  END IF;

  -- Reconcile users who have been studying continuously >= 3 hours (10,800 seconds)
  FOR v_user IN
    SELECT id FROM public.users
    WHERE current_status = 'studying'
      AND (
        (session_start_time IS NOT NULL AND NOW() - session_start_time >= INTERVAL '3 hours') OR
        (last_resumed_at IS NOT NULL AND NOW() - last_resumed_at >= INTERVAL '3 hours')
      )
  LOOP
    BEGIN
      PERFORM public.rpc_stop_user_session(v_user.id);
      v_count := v_count + 1;
      v_study_count := v_study_count + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Failed to reconcile expired study session for user %: %', v_user.id, SQLERRM;
    END;
  END LOOP;

  -- Reconcile users whose break has exceeded 1 hour (3,600 seconds)
  FOR v_user IN
    SELECT id FROM public.users
    WHERE current_status = 'break'
      AND break_started_at IS NOT NULL
      AND NOW() - break_started_at >= INTERVAL '1 hour'
  LOOP
    BEGIN
      PERFORM public.rpc_stop_user_session(v_user.id);
      v_count := v_count + 1;
      v_break_count := v_break_count + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Failed to reconcile expired break for user %: %', v_user.id, SQLERRM;
    END;
  END LOOP;

  v_duration_ms := ROUND(EXTRACT(EPOCH FROM (clock_timestamp() - v_start_time)) * 1000, 2);

  RETURN jsonb_build_object(
    'success', true,
    'reconciled_count', v_count,
    'expired_study_count', v_study_count,
    'expired_break_count', v_break_count,
    'duration_ms', v_duration_ms,
    'server_now', NOW()
  );
END;
$$;

-- Function Authorization Grants
REVOKE EXECUTE ON FUNCTION public.rpc_reconcile_expired_sessions() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rpc_reconcile_expired_sessions() FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_reconcile_expired_sessions() TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_reconcile_expired_sessions() TO postgres;
GRANT EXECUTE ON FUNCTION public.rpc_reconcile_expired_sessions() TO authenticated;
