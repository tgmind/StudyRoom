-- ==============================================================================
-- Migration: Clean Duplicate Goal Tasks in daily_goals & study_sessions
-- Description:
--   1. Cleans up existing duplicate task objects inside public.daily_goals.tasks JSONB
--      by task ID while preserving original insertion order and merging completed status.
--   2. Cleans up duplicate tasks inside public.study_sessions.completed_tasks JSONB.
--   3. Updates rpc_add_goal_tasks with defensive deduplication on write.
-- ==============================================================================

-- 1. Deduplicate daily_goals.tasks JSONB for any rows with duplicate task IDs
UPDATE public.daily_goals g
SET tasks = (
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', t.task_id,
        'task', t.task_name,
        'completed', t.is_completed
      )
      ORDER BY t.min_ord
    ),
    '[]'::jsonb
  )
  FROM (
    SELECT
      elem->>'id' AS task_id,
      (array_agg(elem->>'task' ORDER BY ord))[1] AS task_name,
      bool_or(COALESCE((elem->>'completed')::boolean, false)) AS is_completed,
      min(ord) AS min_ord
    FROM jsonb_array_elements(g.tasks) WITH ORDINALITY AS arr(elem, ord)
    WHERE elem->>'id' IS NOT NULL
    GROUP BY elem->>'id'
  ) t
)
WHERE jsonb_typeof(g.tasks) = 'array'
  AND (
    SELECT count(DISTINCT elem->>'id')
    FROM jsonb_array_elements(g.tasks) AS elem
    WHERE elem->>'id' IS NOT NULL
  ) < (
    SELECT count(*)
    FROM jsonb_array_elements(g.tasks) AS elem
    WHERE elem->>'id' IS NOT NULL
  );

-- 2. Deduplicate study_sessions.completed_tasks JSONB for any rows with duplicate task IDs
UPDATE public.study_sessions s
SET completed_tasks = (
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', t.task_id,
        'task', t.task_name
      )
      ORDER BY t.min_ord
    ),
    '[]'::jsonb
  )
  FROM (
    SELECT
      elem->>'id' AS task_id,
      (array_agg(elem->>'task' ORDER BY ord))[1] AS task_name,
      min(ord) AS min_ord
    FROM jsonb_array_elements(s.completed_tasks) WITH ORDINALITY AS arr(elem, ord)
    WHERE elem->>'id' IS NOT NULL
    GROUP BY elem->>'id'
  ) t
)
WHERE jsonb_typeof(s.completed_tasks) = 'array'
  AND (
    SELECT count(DISTINCT elem->>'id')
    FROM jsonb_array_elements(s.completed_tasks) AS elem
    WHERE elem->>'id' IS NOT NULL
  ) < (
    SELECT count(*)
    FROM jsonb_array_elements(s.completed_tasks) AS elem
    WHERE elem->>'id' IS NOT NULL
  );

-- 3. Harden rpc_add_goal_tasks with deduplication
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
    RAISE EXCEPTION 'No active 24-hour goal set found to add tasks to';
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
