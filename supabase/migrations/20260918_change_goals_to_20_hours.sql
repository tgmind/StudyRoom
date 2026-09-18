-- Migration: Migrate Rolling Goals from 24 Hours to 20 Hours
-- Description:
--   1. Alters default expires_at on public.daily_goals to (NOW() + INTERVAL '20 hours').
--   2. Updates rpc_create_daily_goal to use INTERVAL '20 hours' and return 'Active 20-hour goal set already exists for this user'.
--   3. Updates rpc_add_goal_tasks exception message to 'No active 20-hour goal set found to add tasks to'.
--   4. Updates rpc_complete_session_goals to match goals expiring within the last 20 hours.
--   5. Updates rpc_record_break_expiry_goals to match goals expiring within the last 20 hours.

-- 1. Alter public.daily_goals column default
ALTER TABLE public.daily_goals
  ALTER COLUMN expires_at SET DEFAULT (NOW() + INTERVAL '20 hours');

-- 2. Update rpc_create_daily_goal
CREATE OR REPLACE FUNCTION public.rpc_create_daily_goal(p_tasks JSONB)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_existing_id UUID;
  v_existing_tasks JSONB;
  v_existing_expires TIMESTAMPTZ;
  v_now TIMESTAMPTZ := NOW();
  v_expires TIMESTAMPTZ := v_now + INTERVAL '20 hours';
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
      'message', 'Active 20-hour goal set already exists for this user'
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

-- 3. Update rpc_add_goal_tasks
CREATE OR REPLACE FUNCTION public.rpc_add_goal_tasks(p_new_tasks JSONB)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_active_goal_id UUID;
  v_current_tasks JSONB;
  v_updated_tasks JSONB;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_new_tasks IS NULL OR jsonb_array_length(p_new_tasks) = 0 THEN
    RAISE EXCEPTION 'New tasks array cannot be empty';
  END IF;

  -- Strictly serialize concurrent requests for the same user via transaction advisory lock
  PERFORM pg_advisory_xact_lock(hashtext(v_user_id::text));

  -- Find active unexpired goal window
  SELECT id, tasks INTO v_active_goal_id, v_current_tasks
  FROM public.daily_goals
  WHERE user_id = v_user_id AND expires_at > v_now
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_active_goal_id IS NULL THEN
    RAISE EXCEPTION 'No active 20-hour goal set found to add tasks to';
  END IF;

  v_current_tasks := COALESCE(v_current_tasks, '[]'::JSONB);

  -- Append only new tasks whose 'id' does not already exist in v_current_tasks
  -- and deduplicate within p_new_tasks itself
  SELECT v_current_tasks || COALESCE(
    (
      SELECT jsonb_agg(new_elem)
      FROM (
        SELECT DISTINCT ON (elem->>'id') elem AS new_elem
        FROM jsonb_array_elements(p_new_tasks) AS elem
      ) deduplicated_new
      WHERE NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(v_current_tasks) AS curr_elem
        WHERE curr_elem->>'id' = new_elem->>'id'
      )
    ),
    '[]'::JSONB
  ) INTO v_updated_tasks;

  UPDATE public.daily_goals
  SET tasks = v_updated_tasks
  WHERE id = v_active_goal_id;

  RETURN jsonb_build_object(
    'success', true,
    'goal_id', v_active_goal_id,
    'tasks', v_updated_tasks
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Update rpc_complete_session_goals
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

-- 5. Update rpc_record_break_expiry_goals
CREATE OR REPLACE FUNCTION public.rpc_record_break_expiry_goals(p_completed_task_ids TEXT[] DEFAULT ARRAY[]::TEXT[])
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_session_id UUID;
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

  -- Update daily goals if tasks were selected
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

    -- Attach completed tasks to the latest study session
    SELECT id INTO v_session_id
    FROM public.study_sessions
    WHERE user_id = v_user_id
    ORDER BY end_time DESC
    LIMIT 1;

    IF v_session_id IS NOT NULL AND jsonb_array_length(v_session_completed_tasks) > 0 THEN
      UPDATE public.study_sessions
      SET completed_tasks = COALESCE(completed_tasks, '[]'::JSONB) || v_session_completed_tasks
      WHERE id = v_session_id;
    END IF;
  END IF;

  -- Clear break expiry snapshot on user profile
  UPDATE public.users
  SET last_break_expired_study_seconds = NULL
  WHERE id = v_user_id;

  RETURN jsonb_build_object('success', true, 'server_now', v_now);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
