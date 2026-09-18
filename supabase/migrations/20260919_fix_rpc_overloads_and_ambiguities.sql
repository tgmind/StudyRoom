-- ==============================================================================
-- HOTFIX MIGRATION: Fix RPC Overloads, Parameter Ordering & Column Ambiguities
-- Description:
--   1. Drops conflicting overloaded rpc_finish_session functions that caused
--      PGRST203 ('Could not choose the best candidate function').
--   2. Restores canonical rpc_finish_session(p_completed_task_ids, p_reason).
--   3. Makes p_session_id DEFAULT NULL in rpc_complete_session_goals so goal updates
--      never fail on non-UUID or null session references.
--   4. Qualifies user_id references in rpc_get_leaderboard and rpc_calculate_weekly_achiever
--      to eliminate PostgreSQL error 42702 ('column reference user_id is ambiguous').
--   5. Safely unblocks stuck active study session for user Subodh.
-- ==============================================================================

-- 1. DROP ALL OVERLOADED VARIANTS OF rpc_finish_session
DROP FUNCTION IF EXISTS public.rpc_finish_session() CASCADE;
DROP FUNCTION IF EXISTS public.rpc_finish_session(TEXT[]) CASCADE;
DROP FUNCTION IF EXISTS public.rpc_finish_session(TEXT[], TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.rpc_finish_session(TEXT, TEXT[]) CASCADE;

-- 2. RE-CREATE CANONICAL rpc_finish_session
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

  -- Strictly serialize session operations for the user
  PERFORM pg_advisory_xact_lock(hashtext(v_user_id::text));

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

    -- Insert Part 1 (Day 1) with completed_tasks and split_part = 1 (BUG-04)
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

    -- Insert Part 2 (Day 2) with split_part = 2, completed_tasks, and sibling_session_id linked to Part 1 (BUG-04, BUG-06)
    IF v_dur_2 > 0 THEN
      INSERT INTO public.study_sessions (
        user_id, start_time, end_time, duration_minutes, break_minutes, completed_tasks, split_part, sibling_session_id
      )
      VALUES (
        v_user_id, v_midnight, v_session_actual_end, v_dur_2, v_break_minutes, v_session_completed_tasks, 2, v_session_id_1
      )
      RETURNING id INTO v_session_id_2;

      -- Back-link Part 1 to Part 2
      IF v_session_id_1 IS NOT NULL THEN
        UPDATE public.study_sessions
        SET sibling_session_id = v_session_id_2
        WHERE id = v_session_id_1;
      END IF;

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
    'duration_minutes', v_duration_minutes,
    'server_now', v_now
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. RE-CREATE rpc_complete_session_goals WITH NULLABLE p_session_id
DROP FUNCTION IF EXISTS public.rpc_complete_session_goals(UUID, TEXT[]) CASCADE;

CREATE OR REPLACE FUNCTION public.rpc_complete_session_goals(
  p_session_id UUID DEFAULT NULL,
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

-- 4. RE-CREATE rpc_get_leaderboard WITH QUALIFIED user_id REFERENCES
DROP FUNCTION IF EXISTS public.rpc_get_leaderboard(TIMESTAMPTZ, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.rpc_get_leaderboard(TIMESTAMPTZ) CASCADE;
DROP FUNCTION IF EXISTS public.rpc_get_leaderboard() CASCADE;

CREATE OR REPLACE FUNCTION public.rpc_get_leaderboard(
  p_week_start TIMESTAMPTZ DEFAULT NULL,
  p_timezone TEXT DEFAULT 'Asia/Kolkata'
)
RETURNS TABLE (
  user_id UUID,
  display_name TEXT,
  avatar_url TEXT,
  has_achiever_badge BOOLEAN,
  current_status TEXT,
  total_study_minutes INTEGER,
  goal_completion_pct NUMERIC,
  streak_days INTEGER,
  score NUMERIC,
  completed_tasks INTEGER,
  total_tasks INTEGER
) AS $$
DECLARE
  v_tz TEXT := COALESCE(NULLIF(p_timezone, ''), 'Asia/Kolkata');
  v_week_start TIMESTAMPTZ;
  v_week_end TIMESTAMPTZ;
  v_max_study_minutes INTEGER := 1;
  v_target_completed_tasks INTEGER := 3;
BEGIN
  IF p_week_start IS NULL THEN
    v_week_start := (DATE_TRUNC('week', NOW() AT TIME ZONE v_tz) AT TIME ZONE v_tz);
  ELSE
    v_week_start := (DATE_TRUNC('week', p_week_start AT TIME ZONE v_tz) AT TIME ZONE v_tz);
  END IF;
  v_week_end := v_week_start + INTERVAL '7 days';

  DROP TABLE IF EXISTS temp_user_stats;
  CREATE TEMP TABLE temp_user_stats ON COMMIT DROP AS
  WITH completed_study AS (
    SELECT s.user_id, COALESCE(SUM(s.duration_minutes), 0)::INTEGER AS study_mins
    FROM public.study_sessions s
    WHERE s.start_time >= v_week_start AND s.start_time < v_week_end
    GROUP BY s.user_id
    UNION ALL
    SELECT b.user_id, COALESCE(SUM(EXTRACT(EPOCH FROM (LEAST(COALESCE(b.end_time, NOW()), v_week_end) - b.start_time))), 0)::INTEGER / 60 AS study_mins
    FROM public.session_blocks b
    WHERE b.session_id IS NULL
      AND b.block_type = 'study'
      AND b.start_time >= v_week_start
      AND b.start_time < v_week_end
      AND NOW() >= v_week_end
    GROUP BY b.user_id
  ),
  live_study AS (
    SELECT
      u.id AS user_id,
      FLOOR(
        GREATEST(
          0,
          LEAST(
            180 * 60,
            COALESCE(
              (
                SELECT SUM(
                  EXTRACT(EPOCH FROM (
                    LEAST(COALESCE(b.end_time, NOW()), v_week_end) - 
                    GREATEST(b.start_time, v_week_start)
                  ))
                )
                FROM public.session_blocks b
                WHERE b.user_id = u.id 
                  AND b.session_id IS NULL 
                  AND b.block_type = 'study'
                  AND b.start_time < v_week_end
                  AND COALESCE(b.end_time, NOW()) > v_week_start
              ),
              CASE 
                WHEN NOW() >= v_week_start AND NOW() < v_week_end THEN
                  LEAST(
                    GREATEST(
                      0,
                      CASE
                        WHEN u.current_status = 'studying' THEN
                          CASE
                            WHEN COALESCE(u.last_resumed_at, u.session_start_time, NOW()) >= v_week_start THEN
                              COALESCE(u.active_study_seconds_snapshot, 0) + 
                              EXTRACT(EPOCH FROM (NOW() - COALESCE(u.last_resumed_at, u.session_start_time, NOW())))
                            ELSE
                              EXTRACT(EPOCH FROM (NOW() - v_week_start))
                          END
                        WHEN u.current_status = 'break' AND (NOW() - u.break_started_at) < INTERVAL '1 hour' THEN
                          CASE
                            WHEN u.break_started_at >= v_week_start THEN
                              COALESCE(u.active_study_seconds_snapshot, 0)
                            ELSE 0
                          END
                        ELSE 0
                      END
                    ),
                    EXTRACT(EPOCH FROM (NOW() - v_week_start))
                  )
                ELSE 0
              END
            )
          )
        ) / 60
      )::INTEGER AS live_mins
    FROM public.users u
    WHERE NOW() >= v_week_start AND NOW() < v_week_end
      AND u.current_status IN ('studying', 'break')
      AND (
        (u.current_status = 'studying' AND (u.session_start_time IS NULL OR NOW() - u.session_start_time < INTERVAL '4 hours'))
        OR (u.current_status = 'break' AND u.break_started_at IS NOT NULL AND (NOW() - u.break_started_at) < INTERVAL '1 hour')
      )
  ),
  weekly_study AS (
    SELECT
      u.id AS user_id,
      (COALESCE(cs.study_mins, 0) + COALESCE(ls.live_mins, 0))::INTEGER AS study_mins
    FROM public.users u
    LEFT JOIN (
      SELECT cs.user_id, SUM(cs.study_mins)::INTEGER AS study_mins
      FROM completed_study cs
      GROUP BY cs.user_id
    ) cs ON u.id = cs.user_id
    LEFT JOIN live_study ls ON u.id = ls.user_id
  ),
  completed_tasks_per_user AS (
    SELECT combined_tasks.user_id, COUNT(DISTINCT combined_tasks.task_id)::INTEGER AS completed_tasks_count
    FROM (
      SELECT g.user_id, t->>'id' AS task_id
      FROM public.daily_goals g,
           jsonb_array_elements(COALESCE(g.tasks, '[]'::JSONB)) t
      WHERE g.created_at >= v_week_start AND g.created_at < v_week_end
        AND (t->>'completed')::boolean = true
        AND t->>'id' IS NOT NULL
      UNION
      SELECT s.user_id, t->>'id' AS task_id
      FROM public.study_sessions s,
           jsonb_array_elements(COALESCE(s.completed_tasks, '[]'::JSONB)) t
      WHERE s.start_time >= v_week_start AND s.start_time < v_week_end
        AND (s.split_part IS NULL OR s.split_part != 2 OR s.start_time > v_week_start)
        AND t->>'id' IS NOT NULL
    ) combined_tasks
    GROUP BY combined_tasks.user_id
  ),
  total_tasks_per_user AS (
    SELECT g.user_id, COALESCE(SUM(jsonb_array_length(g.tasks)), 0)::INTEGER AS total_tasks_count
    FROM public.daily_goals g
    WHERE g.created_at >= v_week_start AND g.created_at < v_week_end
    GROUP BY g.user_id
  ),
  weekly_goals AS (
    SELECT
      u.id AS user_id,
      COALESCE(ct.completed_tasks_count, 0) AS completed_tasks_count,
      GREATEST(COALESCE(ct.completed_tasks_count, 0), COALESCE(tt.total_tasks_count, 0)) AS total_tasks_count,
      COALESCE(
        ROUND(
          (COALESCE(ct.completed_tasks_count, 0)::NUMERIC /
           NULLIF(GREATEST(COALESCE(ct.completed_tasks_count, 0), COALESCE(tt.total_tasks_count, 0)), 0)::NUMERIC) * 100, 1
        ), 0
      ) AS completion_pct
    FROM public.users u
    LEFT JOIN completed_tasks_per_user ct ON u.id = ct.user_id
    LEFT JOIN total_tasks_per_user tt ON u.id = tt.user_id
  ),
  qualifying_days AS (
    SELECT
      u.id AS user_id,
      d.study_day
    FROM public.users u
    CROSS JOIN LATERAL (
      SELECT
        DATE_TRUNC('day', s.start_time AT TIME ZONE v_tz) AS study_day,
        SUM(s.duration_minutes) AS day_mins
      FROM public.study_sessions s
      WHERE s.user_id = u.id 
        AND s.start_time >= v_week_start 
        AND s.start_time < v_week_end
      GROUP BY DATE_TRUNC('day', s.start_time AT TIME ZONE v_tz)
      UNION ALL
      SELECT
        DATE_TRUNC('day', NOW() AT TIME ZONE v_tz) AS study_day,
        COALESCE(ls.live_mins, 0) AS day_mins
      FROM live_study ls
      WHERE ls.user_id = u.id AND ls.live_mins > 0
        AND NOW() >= v_week_start AND NOW() < v_week_end
    ) d
    GROUP BY u.id, d.study_day
    HAVING SUM(d.day_mins) >= 30
  ),
  user_streaks AS (
    SELECT qd.user_id, COUNT(DISTINCT qd.study_day)::INTEGER AS streak
    FROM qualifying_days qd
    GROUP BY qd.user_id
  )
  SELECT
    u.id AS user_id,
    u.display_name,
    u.avatar_url,
    u.has_achiever_badge,
    u.current_status,
    COALESCE(ws.study_mins, 0) AS total_study_minutes,
    COALESCE(wg.completed_tasks_count, 0) AS completed_tasks,
    COALESCE(wg.total_tasks_count, 0) AS total_tasks,
    COALESCE(wg.completion_pct, 0) AS goal_completion_pct,
    COALESCE(st.streak, 0) AS streak_days
  FROM public.users u
  LEFT JOIN weekly_study ws ON u.id = ws.user_id
  LEFT JOIN weekly_goals wg ON u.id = wg.user_id
  LEFT JOIN user_streaks st ON u.id = st.user_id
  WHERE COALESCE(u.is_admin, FALSE) = FALSE;

  SELECT GREATEST(1, MAX(temp_user_stats.total_study_minutes)) INTO v_max_study_minutes FROM temp_user_stats;
  SELECT GREATEST(3, LEAST(COALESCE(MAX(temp_user_stats.completed_tasks), 0), 15)) INTO v_target_completed_tasks FROM temp_user_stats;

  RETURN QUERY
  SELECT
    ts.user_id,
    ts.display_name,
    ts.avatar_url,
    ts.has_achiever_badge,
    ts.current_status,
    ts.total_study_minutes,
    ts.goal_completion_pct,
    ts.streak_days,
    ROUND(
      (0.50 * (ts.total_study_minutes::NUMERIC / v_max_study_minutes::NUMERIC * 100.0)) +
      (0.30 * (
        (0.60 * LEAST(100.0, (ts.completed_tasks::NUMERIC / v_target_completed_tasks::NUMERIC) * 100.0)) +
        (0.40 * CASE WHEN ts.total_tasks > 0 THEN LEAST(100.0, (ts.completed_tasks::NUMERIC / GREATEST(3, ts.total_tasks)::NUMERIC) * 100.0) ELSE 0.0 END)
      )) +
      (0.20 * LEAST((ts.streak_days::NUMERIC / 7.0) * 100.0, 100.0)),
      1
    ) AS score,
    ts.completed_tasks,
    ts.total_tasks
  FROM temp_user_stats ts
  ORDER BY score DESC, ts.total_study_minutes DESC, ts.display_name ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. RE-CREATE rpc_calculate_weekly_achiever WITH QUALIFIED lb.user_id
CREATE OR REPLACE FUNCTION public.rpc_calculate_weekly_achiever(p_timezone TEXT DEFAULT 'Asia/Kolkata')
RETURNS UUID AS $$
DECLARE
  v_tz TEXT := COALESCE(NULLIF(p_timezone, ''), 'Asia/Kolkata');
  v_prev_week_start TIMESTAMPTZ;
  v_winner_id UUID;
BEGIN
  v_prev_week_start := (DATE_TRUNC('week', (NOW() - INTERVAL '7 days') AT TIME ZONE v_tz) AT TIME ZONE v_tz);

  SELECT lb.user_id INTO v_winner_id
  FROM public.rpc_get_leaderboard(v_prev_week_start, v_tz) lb
  WHERE lb.total_study_minutes > 0
  ORDER BY lb.score DESC, lb.total_study_minutes DESC
  LIMIT 1;

  PERFORM set_config('studyroom.internal_badge_update', 'true', true);

  UPDATE public.users SET has_achiever_badge = FALSE WHERE has_achiever_badge = TRUE;

  IF v_winner_id IS NOT NULL THEN
    UPDATE public.users SET has_achiever_badge = TRUE WHERE id = v_winner_id;
  END IF;

  RETURN v_winner_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. SAFELY CLEAN UP ANY CURRENTLY STUCK SESSIONS FOR USER SUBODH
UPDATE public.session_blocks
SET end_time = NOW()
WHERE user_id = 'ee438ced-3c88-4708-864e-3eb12404b1c2' AND end_time IS NULL;

UPDATE public.users
SET current_status = 'offline',
    current_focus = NULL,
    session_start_time = NULL,
    last_resumed_at = NULL,
    break_started_at = NULL,
    active_study_seconds_snapshot = 0,
    last_break_expired_study_seconds = NULL,
    pending_goal_session_id = NULL,
    pending_goal_seconds = NULL,
    pending_goal_reason = NULL,
    last_offline_at = NOW()
WHERE id = 'ee438ced-3c88-4708-864e-3eb12404b1c2';
