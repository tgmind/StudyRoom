-- ==============================================================================
-- Migration: Fix 24-Hour Goal Deduplication & Concurrent Submission Safety
-- Description:
--   1. Adds transaction advisory locking to rpc_create_daily_goal to serialize
--      any rapid concurrent goal creations for the same user.
--   2. Returns the active unexpired goal idempotently if already created,
--      preventing duplicate goal sets and queue worker sync retries.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.rpc_create_daily_goal(p_tasks JSONB)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_existing_id UUID;
  v_existing_tasks JSONB;
  v_existing_expires TIMESTAMPTZ;
  v_now TIMESTAMPTZ := NOW();
  v_expires TIMESTAMPTZ := v_now + INTERVAL '24 hours';
  v_new_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Strictly serialize concurrent requests for the same user via transaction advisory lock
  PERFORM pg_advisory_xact_lock(hashtext(v_user_id::text));

  -- Check for unexpired goal set
  SELECT id, tasks, expires_at INTO v_existing_id, v_existing_tasks, v_existing_expires
  FROM public.daily_goals
  WHERE user_id = v_user_id AND expires_at > v_now
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_exists', true,
      'goal_id', v_existing_id,
      'expires_at', v_existing_expires,
      'message', 'Active 24-hour goal set already exists for this user'
    );
  END IF;

  IF jsonb_array_length(p_tasks) = 0 THEN
    RAISE EXCEPTION 'Tasks array cannot be empty';
  END IF;

  INSERT INTO public.daily_goals (user_id, tasks, created_at, expires_at, is_locked)
  VALUES (v_user_id, p_tasks, v_now, v_expires, true)
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object(
    'success', true,
    'already_exists', false,
    'goal_id', v_new_id,
    'created_at', v_now,
    'expires_at', v_expires
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
