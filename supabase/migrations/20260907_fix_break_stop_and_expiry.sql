-- ============================================================
-- Migration: Fix rpc_finish_session break stop vs break expiry
-- Description: Ensures voluntary session finish while on break sets
-- last_break_expired_study_seconds = NULL, preventing false break-expiry
-- notices from opening.
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_finish_session(p_completed_task_ids TEXT[] DEFAULT ARRAY[]::TEXT[])
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_status TEXT;
  v_session_start TIMESTAMPTZ;
  v_focus TEXT;
  v_now TIMESTAMPTZ := NOW();
  v_total_study_seconds NUMERIC := 0;
  v_duration_minutes INTEGER := 0;
  v_session_id UUID;
  v_active_goal_id UUID;
  v_tasks JSONB;
  v_updated_tasks JSONB;
  v_session_completed_tasks JSONB := '[]'::JSONB;
  v_elem JSONB;
  v_task_id TEXT;
  v_is_completed BOOLEAN;
  v_task_text TEXT;
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
      'success', false,
      'error', 'No active session found'
    );
  END IF;

  -- Close any open block at v_now
  UPDATE public.session_blocks
  SET end_time = v_now
  WHERE user_id = v_user_id AND end_time IS NULL;

  IF v_session_start IS NULL THEN
    v_session_start := v_now;
  END IF;

  -- Calculate total active study seconds from study blocks (EXCLUDING BREAKS, capped at 3 hours / 180 minutes)
  SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(end_time, v_now) - start_time))), 0)
  INTO v_total_study_seconds
  FROM public.session_blocks
  WHERE user_id = v_user_id
    AND block_type = 'study'
    AND session_id IS NULL;

  v_duration_minutes := LEAST(180, GREATEST(0, FLOOR(v_total_study_seconds / 60)::INTEGER));

  -- Update Goal Task completions if active unexpired goal window exists
  -- OR if goal was active when this session started / within session grace window
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

      -- Check if task ID is in p_completed_task_ids
      IF p_completed_task_ids IS NOT NULL AND v_task_id = ANY(p_completed_task_ids) THEN
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

  -- Insert study session record with completed tasks
  INSERT INTO public.study_sessions (user_id, start_time, end_time, duration_minutes, completed_tasks)
  VALUES (v_user_id, v_session_start, v_now, v_duration_minutes, v_session_completed_tasks)
  RETURNING id INTO v_session_id;

  -- Associate unlinked blocks with this session
  UPDATE public.session_blocks
  SET session_id = v_session_id
  WHERE user_id = v_user_id AND session_id IS NULL;

  -- Reset user to offline and clear active snapshots
  -- Explicitly set last_break_expired_study_seconds to NULL because this is a voluntary session stop
  UPDATE public.users
  SET current_status = 'offline',
      current_focus = NULL,
      session_start_time = NULL,
      last_resumed_at = NULL,
      break_started_at = NULL,
      active_study_seconds_snapshot = 0,
      last_break_expired_study_seconds = NULL,
      last_offline_at = v_now
  WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'session_id', v_session_id,
    'duration_minutes', v_duration_minutes,
    'start_time', v_session_start,
    'end_time', v_now,
    'completed_tasks', v_session_completed_tasks,
    'server_now', v_now
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
