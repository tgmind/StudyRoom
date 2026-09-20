-- ============================================================
-- Supabase-Native pg_cron Scheduled Session Reconciliation
-- Migration: 20260920_supabase_native_pg_cron_reconciliation.sql
-- ============================================================
-- Enables automated, zero-client server-side reconciliation of expired
-- study sessions (>= 3 hours) and breaks (>= 1 hour) every 10 minutes.
--
-- Safety Guarantees:
-- 1. Self-contained: Defines the function before granting/revoking permissions.
-- 2. Idempotent: Can be executed repeatedly without duplicate jobs.
-- 3. Least-Privilege: Revokes EXECUTE from PUBLIC, anon, and authenticated.
-- 4. Isolated: Affects ONLY the 'reconcile-expired-sessions' cron job.
-- 5. Non-Destructive: Modifies zero application data tables.
-- ============================================================

-- 1. Ensure pg_cron extension is enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. Define the Authoritative Reconciliation RPC (Self-Contained)
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

-- 3. Enforce strict least-privilege on maintenance RPC
REVOKE EXECUTE ON FUNCTION public.rpc_reconcile_expired_sessions() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rpc_reconcile_expired_sessions() FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_reconcile_expired_sessions() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_reconcile_expired_sessions() TO postgres;
GRANT EXECUTE ON FUNCTION public.rpc_reconcile_expired_sessions() TO service_role;

-- 4. Register idempotent 10-minute cron job
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Remove previous schedule instance if already present to guarantee zero duplicates
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'reconcile-expired-sessions') THEN
      PERFORM cron.unschedule('reconcile-expired-sessions');
    END IF;

    -- Schedule reconciliation to run every 10 minutes (*/10 * * * *)
    PERFORM cron.schedule(
      'reconcile-expired-sessions',
      '*/10 * * * *',
      $cmd$SELECT public.rpc_reconcile_expired_sessions()$cmd$
    );

    RAISE NOTICE 'Successfully registered pg_cron job "reconcile-expired-sessions" (schedule: */10 * * * *).';
  ELSE
    RAISE WARNING 'Extension "pg_cron" is not enabled in this database. Enable it via Supabase Dashboard -> Database -> Extensions.';
  END IF;
END $$;
