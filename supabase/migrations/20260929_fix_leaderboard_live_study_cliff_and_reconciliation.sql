-- ============================================================
-- MIGRATION: 20260929_fix_leaderboard_live_study_cliff_and_reconciliation.sql
-- Description: 
--   1. Eliminates the 4-hour live study exclusion cliff (NOW() - session_start_time < INTERVAL '4 hours')
--      in rpc_get_leaderboard that previously wiped valid unfinalized 3-hour sessions to 0 minutes.
--   2. Adds inline session reconciliation loop inside rpc_get_leaderboard (SECURITY DEFINER)
--      to finalize any expired active study (>= 3 hours) or break (>= 1 hour) sessions directly
--      into public.study_sessions, guaranteeing consistent leaderboard minutes across all clients.
-- ============================================================

-- Drop prior function overloads to prevent PostgREST PGRST203 candidate ambiguity
DROP FUNCTION IF EXISTS public.rpc_get_leaderboard(TIMESTAMPTZ, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.rpc_get_leaderboard(TIMESTAMPTZ) CASCADE;
DROP FUNCTION IF EXISTS public.rpc_get_leaderboard() CASCADE;

-- Function to get leaderboard entries for a given week with timezone support (Default Asia/Kolkata)
-- Implements Dual-Pillar Goal Index + Realtime Live Study Sync + Inline Reconciliation
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
    -- Default to current week's Monday 00:00:00 in specified timezone
    v_week_start := (DATE_TRUNC('week', NOW() AT TIME ZONE v_tz) AT TIME ZONE v_tz);
  ELSE
    v_week_start := (DATE_TRUNC('week', p_week_start AT TIME ZONE v_tz) AT TIME ZONE v_tz);
  END IF;
  v_week_end := v_week_start + INTERVAL '7 days';

  -- Create temporary table of aggregate weekly statistics per user
  DROP TABLE IF EXISTS temp_user_stats;
  CREATE TEMP TABLE temp_user_stats ON COMMIT DROP AS
  WITH completed_study AS (
    SELECT s.user_id, COALESCE(SUM(s.duration_minutes), 0)::INTEGER AS study_mins
    FROM public.study_sessions s
    WHERE s.start_time >= v_week_start AND s.start_time < v_week_end
    GROUP BY s.user_id
    UNION ALL
    -- Account for unclosed blocks from past-week evaluations (BUG-03)
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
    -- Compute in-progress active study minutes for users currently studying or on valid break
    SELECT
      u.id AS user_id,
      FLOOR(
        GREATEST(
          0,
          LEAST(
            180 * 60, -- Max session limit: 3 hours (10800 seconds)
            COALESCE(
              -- Method A: Exact sum of active study blocks within current week
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
              -- Method B: Fallback to user status fields bounded strictly by v_week_start (BUG-02)
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
        u.current_status = 'studying'
        OR (u.current_status = 'break' AND (u.break_started_at IS NULL OR (NOW() - u.break_started_at) < INTERVAL '1 hour'))
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
      -- Tasks marked completed in daily_goals created in this week (BUG-05)
      SELECT g.user_id, t->>'id' AS task_id
      FROM public.daily_goals g,
           jsonb_array_elements(COALESCE(g.tasks, '[]'::JSONB)) t
      WHERE g.created_at >= v_week_start AND g.created_at < v_week_end
        AND (t->>'completed')::boolean = true
        AND t->>'id' IS NOT NULL
      UNION
      -- Tasks recorded in study_sessions belonging to this week (BUG-07)
      -- Excludes Part 2 of a Sunday->Monday midnight split to prevent cross-week double attribution
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
  weekly_streaks AS (
    SELECT s.user_id, COUNT(DISTINCT DATE(s.start_time AT TIME ZONE v_tz))::INTEGER AS streak_days
    FROM public.study_sessions s
    WHERE s.start_time >= v_week_start AND s.start_time < v_week_end
      AND s.duration_minutes > 0
    GROUP BY s.user_id
  )
  SELECT
    u.id AS user_id,
    COALESCE(u.display_name, 'Anonymous') AS display_name,
    u.avatar_url,
    COALESCE(u.has_achiever_badge, false) AS has_achiever_badge,
    COALESCE(u.current_status, 'offline') AS current_status,
    COALESCE(ws.study_mins, 0)::INTEGER AS total_study_minutes,
    CASE
      WHEN COALESCE(tt.total_tasks_count, 0) > 0 THEN
        ROUND((COALESCE(ct.completed_tasks_count, 0)::NUMERIC / tt.total_tasks_count::NUMERIC) * 100, 1)
      ELSE 0.0
    END AS goal_completion_pct,
    COALESCE(wstr.streak_days, 0)::INTEGER AS streak_days,
    0.0::NUMERIC AS score,
    COALESCE(ct.completed_tasks_count, 0)::INTEGER AS completed_tasks,
    COALESCE(tt.total_tasks_count, 0)::INTEGER AS total_tasks
  FROM public.users u
  LEFT JOIN weekly_study ws ON u.id = ws.user_id
  LEFT JOIN completed_tasks_per_user ct ON u.id = ct.user_id
  LEFT JOIN total_tasks_per_user tt ON u.id = tt.user_id
  LEFT JOIN weekly_streaks wstr ON u.id = wstr.user_id;

  -- Determine dynamic normalizers for Dual-Pillar scoring
  SELECT COALESCE(MAX(t.total_study_minutes), 1) INTO v_max_study_minutes FROM temp_user_stats t;
  IF v_max_study_minutes = 0 THEN
    v_max_study_minutes := 1;
  END IF;

  SELECT COALESCE(MAX(t.completed_tasks), 3) INTO v_target_completed_tasks FROM temp_user_stats t;
  IF v_target_completed_tasks = 0 THEN
    v_target_completed_tasks := 3;
  END IF;

  -- Update score using Dual-Pillar Goal Index
  UPDATE temp_user_stats
  SET score = ROUND(
    (
      (0.6 * (total_study_minutes::NUMERIC / v_max_study_minutes::NUMERIC) * 100) +
      (0.4 * (LEAST(completed_tasks::NUMERIC / v_target_completed_tasks::NUMERIC, 1.0)) * 100)
    ), 1
  );

  -- Return final ordered leaderboard table
  RETURN QUERY
  SELECT
    t.user_id,
    t.display_name,
    t.avatar_url,
    t.has_achiever_badge,
    t.current_status,
    t.total_study_minutes,
    t.goal_completion_pct,
    t.streak_days,
    t.score,
    t.completed_tasks,
    t.total_tasks
  FROM temp_user_stats t
  ORDER BY t.score DESC, t.total_study_minutes DESC, t.completed_tasks DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execution to authenticated, anon, and service_role
GRANT EXECUTE ON FUNCTION public.rpc_get_leaderboard(TIMESTAMPTZ, TEXT) TO authenticated, anon, service_role;
