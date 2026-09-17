-- ============================================================
-- Migration: 20260917_session_blocks_realtime.sql
-- Description:
--   1. Ensures session_blocks is part of supabase_realtime publication.
--   2. Updates rpc_pause_session with overload protection (DROP CASCADE first)
--      and accepts optional client timestamps and elapsed seconds.
--   3. Updates rpc_resume_session to call rpc_finish_session with 'break_expired'
--      reason so multi-device popup informs user accurately.
-- ============================================================

-- 1. Ensure public.session_blocks is added to supabase_realtime publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'session_blocks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.session_blocks;
  END IF;
END $$;

-- 2. Drop existing rpc_pause_session signatures to prevent PostgREST ambiguous overload errors
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
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT current_status, break_started_at INTO v_status, v_break_started_at
  FROM public.users
  WHERE id = v_user_id
  FOR UPDATE;

  IF v_status = 'break' THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_paused', true,
      'status', 'break',
      'break_started_at', v_break_started_at,
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
  WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'status', 'break',
    'paused_at', v_now,
    'break_started_at', v_now,
    'active_study_seconds_snapshot', v_total_study_seconds,
    'server_now', v_now
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Update rpc_resume_session to pass 'break_expired' to rpc_finish_session
CREATE OR REPLACE FUNCTION public.rpc_resume_session()
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_status TEXT;
  v_break_started_at TIMESTAMPTZ;
  v_now TIMESTAMPTZ := NOW();
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
