-- Migration: 20261001_unify_leaderboard_scoring_50_30_20.sql
-- Description:
--   Unifies public.rpc_get_leaderboard with the authoritative 50/30/20 Dual-Pillar Goal Index model:
--     • 50% Study Hours Component (normalized to group peak)
--     • 30% Dual-Pillar Goal Index Component (60% Volume Output + 40% Discipline Follow-Through, target clamped 3-15)
--     • 20% Consistency Streak Component (qualifying days >= 30m in current week, capped at 7 days)
--   Strictly production-safe: Zero drops, NO CASCADE, identical argument and return signature, pure read-only CTE.

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
BEGIN
  -- Determine canonical week start in local timezone (Monday 00:00:00)
  IF p_week_start IS NULL THEN
    v_week_start := (DATE_TRUNC('week', NOW() AT TIME ZONE v_tz) AT TIME ZONE v_tz);
  ELSE
    v_week_start := (DATE_TRUNC('week', p_week_start AT TIME ZONE v_tz) AT TIME ZONE v_tz);
  END IF;
  v_week_end := v_week_start + INTERVAL '7 days';

  RETURN QUERY
  WITH weekly_study AS (
    SELECT
      u.id AS user_id,
      COALESCE(SUM(s.duration_minutes), 0)::INTEGER +
      CASE
        WHEN u.current_status = 'studying' AND u.session_start_time IS NOT NULL THEN
          LEAST(
            180,
            GREATEST(
              0,
              FLOOR(
                (
                  COALESCE(u.active_study_seconds_snapshot, 0) +
                  EXTRACT(EPOCH FROM (NOW() - GREATEST(v_week_start, COALESCE(u.last_resumed_at, u.session_start_time))))
                ) / 60
              )::INTEGER
            )
          )
        WHEN u.current_status = 'break' AND u.active_study_seconds_snapshot IS NOT NULL THEN
          LEAST(180, GREATEST(0, FLOOR(u.active_study_seconds_snapshot / 60)::INTEGER))
        ELSE 0
      END AS study_mins
    FROM public.users u
    LEFT JOIN public.study_sessions s ON u.id = s.user_id
      AND s.start_time >= v_week_start
      AND s.start_time < v_week_end
      AND s.duration_minutes > 0
    GROUP BY u.id, u.current_status, u.session_start_time, u.last_resumed_at, u.active_study_seconds_snapshot
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
  daily_study AS (
    SELECT
      s.user_id,
      DATE(s.start_time AT TIME ZONE v_tz) AS study_date,
      SUM(s.duration_minutes) AS day_mins
    FROM public.study_sessions s
    WHERE s.start_time >= v_week_start AND s.start_time < v_week_end
      AND s.duration_minutes > 0
    GROUP BY s.user_id, DATE(s.start_time AT TIME ZONE v_tz)
    UNION ALL
    SELECT
      u.id AS user_id,
      DATE(NOW() AT TIME ZONE v_tz) AS study_date,
      CASE
        WHEN u.current_status = 'studying' AND u.session_start_time IS NOT NULL THEN
          LEAST(
            180,
            GREATEST(
              0,
              FLOOR(
                (
                  COALESCE(u.active_study_seconds_snapshot, 0) +
                  EXTRACT(EPOCH FROM (NOW() - GREATEST(v_week_start, COALESCE(u.last_resumed_at, u.session_start_time))))
                ) / 60
              )::INTEGER
            )
          )
        WHEN u.current_status = 'break' AND u.active_study_seconds_snapshot IS NOT NULL THEN
          LEAST(180, GREATEST(0, FLOOR(u.active_study_seconds_snapshot / 60)::INTEGER))
        ELSE 0
      END AS day_mins
    FROM public.users u
    WHERE u.current_status IN ('studying', 'break')
      AND NOW() >= v_week_start AND NOW() < v_week_end
  ),
  qualifying_days AS (
    SELECT
      ds.user_id,
      ds.study_date
    FROM daily_study ds
    GROUP BY ds.user_id, ds.study_date
    HAVING SUM(ds.day_mins) >= 30
  ),
  weekly_streaks AS (
    SELECT
      qd.user_id,
      COUNT(DISTINCT qd.study_date)::INTEGER AS streak_days
    FROM qualifying_days qd
    GROUP BY qd.user_id
  ),
  user_stats AS (
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
      COALESCE(ct.completed_tasks_count, 0)::INTEGER AS completed_tasks,
      COALESCE(tt.total_tasks_count, 0)::INTEGER AS total_tasks
    FROM public.users u
    LEFT JOIN weekly_study ws ON u.id = ws.user_id
    LEFT JOIN completed_tasks_per_user ct ON u.id = ct.user_id
    LEFT JOIN total_tasks_per_user tt ON u.id = tt.user_id
    LEFT JOIN weekly_streaks wstr ON u.id = wstr.user_id
    WHERE COALESCE(u.is_admin, FALSE) = FALSE
  ),
  normalizers AS (
    SELECT
      GREATEST(1, COALESCE(MAX(us.total_study_minutes), 1))::NUMERIC AS max_study_minutes,
      GREATEST(3, LEAST(15, COALESCE(MAX(us.completed_tasks), 3)))::NUMERIC AS target_completed_tasks
    FROM user_stats us
  ),
  scored_users AS (
    SELECT
      us.user_id,
      us.display_name,
      us.avatar_url,
      us.has_achiever_badge,
      us.current_status,
      us.total_study_minutes,
      us.goal_completion_pct,
      us.streak_days,
      ROUND(
        (
          -- 1. 50% Study Hours Component (0 to 100 scale, weight 0.50)
          (0.50 * LEAST(100.0, (us.total_study_minutes::NUMERIC / norm.max_study_minutes) * 100.0)) +
          -- 2. 30% Dual-Pillar Goal Index Component (0 to 100 scale, weight 0.30)
          (0.30 * (
            -- Volume Pillar (60% weight): completed / target (capped at 100%)
            (0.60 * LEAST(100.0, (us.completed_tasks::NUMERIC / norm.target_completed_tasks) * 100.0)) +
            -- Discipline Pillar (40% weight): completed / max(3, total_tasks) (0 if total_tasks = 0)
            (0.40 * CASE
              WHEN us.total_tasks > 0 THEN
                LEAST(100.0, (us.completed_tasks::NUMERIC / GREATEST(3, us.total_tasks)::NUMERIC) * 100.0)
              ELSE 0.0
            END)
          )) +
          -- 3. 20% Consistency Streak Component (0 to 100 scale, weight 0.20, capped at 7 days)
          (0.20 * LEAST(100.0, (us.streak_days::NUMERIC / 7.0) * 100.0))
        ), 1
      )::NUMERIC AS calculated_score,
      us.completed_tasks,
      us.total_tasks
    FROM user_stats us
    CROSS JOIN normalizers norm
  )
  SELECT
    su.user_id,
    su.display_name,
    su.avatar_url,
    su.has_achiever_badge,
    su.current_status,
    su.total_study_minutes,
    su.goal_completion_pct,
    su.streak_days,
    su.calculated_score AS score,
    su.completed_tasks,
    su.total_tasks
  FROM scored_users su
  ORDER BY su.calculated_score DESC, su.total_study_minutes DESC, su.display_name ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.rpc_get_leaderboard(TIMESTAMPTZ, TEXT) TO authenticated, anon, service_role;
