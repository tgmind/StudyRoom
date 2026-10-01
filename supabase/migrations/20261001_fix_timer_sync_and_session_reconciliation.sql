-- ============================================================
-- Migration: 20261001_fix_timer_sync_and_session_reconciliation.sql
-- Description:
--   1. Authoritative caller-scoped rpc_synchronize_session()
--      - Operates exclusively on auth.uid() under ACID row lock
--      - Repairs missing session_start_time / last_resumed_at from server session_blocks
--      - Safely cleanses orphaned ghost states if zero server blocks exist
--      - Enforces 1-hour break and 3-hour study session limits
--      - Fully idempotent and safe under concurrent invocations
-- ============================================================

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
    COALESCE(state_version, 1)
  INTO
    v_status,
    v_session_start,
    v_last_resumed,
    v_break_start,
    v_snapshot,
    v_version
  FROM public.users
  WHERE id = v_user_id
  FOR UPDATE;

  IF v_status IS NULL OR v_status = 'offline' THEN
    -- Ensure any orphaned unlinked blocks are closed
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
        SET break_started_at = v_break_start
        WHERE id = v_user_id
        RETURNING state_version INTO v_version;
      ELSE
        v_break_start := v_now;
      END IF;
    END IF;

    -- Check 1-Hour Break Expiry Limit
    IF v_now - v_break_start >= INTERVAL '1 hour' THEN
      PERFORM public.rpc_finish_session(ARRAY[]::TEXT[], 'break_expired');

      RETURN jsonb_build_object(
        'success', true,
        'status', 'offline',
        'repaired', true,
        'reason', 'break_expired',
        'session_start_time', NULL,
        'last_resumed_at', NULL,
        'break_started_at', NULL,
        'active_study_seconds_snapshot', v_snapshot,
        'elapsed_seconds', v_snapshot,
        'state_version', v_version + 1,
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
    -- Query unlinked session blocks on the server within recent window
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
      AND session_id IS NULL
      AND start_time >= (v_now - INTERVAL '3 hours 15 minutes');

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
        PERFORM public.rpc_finish_session(ARRAY[]::TEXT[], 'session_limit');

        RETURN jsonb_build_object(
          'success', true,
          'status', 'offline',
          'repaired', true,
          'reason', 'session_limit_exceeded',
          'session_start_time', NULL,
          'last_resumed_at', NULL,
          'break_started_at', NULL,
          'active_study_seconds_snapshot', 0,
          'elapsed_seconds', 10800,
          'state_version', v_version + 1,
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
            updated_at = v_now
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
        updated_at = v_now
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

-- 5. Safe Permission Hardening
REVOKE EXECUTE ON FUNCTION public.rpc_synchronize_session() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rpc_synchronize_session() FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_synchronize_session() TO authenticated, service_role;
