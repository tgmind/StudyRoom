-- ============================================================
-- Migration: 20260917_sync_leaderboard_and_room_study_time.sql
-- Description:
--   Unify weekly study time across the entire platform so that
--   Leaderboard and Room MemberCards match exactly to the minute.
--   Incorporates in-progress live active study minutes into
--   rpc_get_leaderboard so active sessions are credited in real time.
-- ============================================================

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
              -- Method B: Fallback to user status fields if blocks not present
              CASE 
                WHEN NOW() >= v_week_start AND NOW() < v_week_end THEN
                  CASE
                    WHEN u.current_status = 'studying' THEN
                      COALESCE(u.active_study_seconds_snapshot, 0) + 
                      EXTRACT(EPOCH FROM (NOW() - COALESCE(u.last_resumed_at, u.session_start_time, NOW())))
                    WHEN u.current_status = 'break' AND (NOW() - u.break_started_at) < INTERVAL '1 hour' THEN
                      COALESCE(u.active_study_seconds_snapshot, 0)
                    ELSE 0
                  END
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
    LEFT JOIN completed_study cs ON u.id = cs.user_id
    LEFT JOIN live_study ls ON u.id = ls.user_id
  ),
  weekly_goals AS (
    SELECT g.user_id,
           COALESCE(
             SUM( (SELECT COUNT(*) FROM jsonb_array_elements(g.tasks) t WHERE (t->>'completed')::boolean = true) ),
             0
           )::INTEGER AS completed_tasks_count,
           COALESCE(
             SUM(jsonb_array_length(g.tasks)),
             0
           )::INTEGER AS total_tasks_count,
           COALESCE(
             ROUND(
               (SUM( (SELECT COUNT(*) FROM jsonb_array_elements(g.tasks) t WHERE (t->>'completed')::boolean = true) )::NUMERIC /
                NULLIF(SUM(jsonb_array_length(g.tasks)), 0)::NUMERIC) * 100, 1
             ), 0
           ) AS completion_pct
    FROM public.daily_goals g
    WHERE (g.created_at >= v_week_start AND g.created_at < v_week_end)
       OR (g.expires_at > v_week_start AND g.created_at < v_week_start)
    GROUP BY g.user_id
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
    ) d
    GROUP BY u.id, d.study_day
    HAVING SUM(d.day_mins) >= 30
  ),
  user_streaks AS (
    -- Days with >= 30 mins active study in local calendar days within current week
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
