-- ==============================================================================
-- Migration: 20261006_remove_legacy_low_performers.sql
-- Purpose: Remove legacy 'low_performers' key from newly finalized Global Analytics snapshots.
--          Write solely 'consistency_rhythm_matrix' for Top Consistent Students.
--          Leave all existing historical snapshots and rankings untouched.
-- ==============================================================================

-- 6. AUTHORITATIVE RPC: rpc_finalize_weekly_global_analytics
CREATE OR REPLACE FUNCTION public.rpc_finalize_weekly_global_analytics(
  p_timezone TEXT DEFAULT 'Asia/Kolkata',
  p_target_week_start TIMESTAMPTZ DEFAULT NULL,
  p_force BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_tz TEXT := COALESCE(NULLIF(p_timezone, ''), 'Asia/Kolkata');
  v_source_week_start TIMESTAMPTZ;
  v_source_week_end TIMESTAMPTZ;
  v_celebration_week_start TIMESTAMPTZ;
  v_source_period_id TEXT;
  v_celebration_period_id TEXT;
  v_existing_id UUID;
  v_winner_id UUID;
  v_achiever_rec RECORD;
  v_total_eligible INTEGER := 0;
  v_global_avg_study_mins NUMERIC(7, 1) := 0.0;
  v_global_avg_goal_pct NUMERIC(5, 1) := 0.0;
  v_total_community_hours NUMERIC(9, 1) := 0.0;
  v_total_completed_goals INTEGER := 0;
  v_most_studying JSONB := '[]'::jsonb;
  v_consistency_entries JSONB := '[]'::jsonb;
  v_achiever_winners JSONB := '[]'::jsonb;
  v_goal_chasers JSONB := '[]'::jsonb;
  v_community_stats JSONB := '{}'::jsonb;
  v_now TIMESTAMPTZ := NOW();
  v_default_admin_id UUID := '8076296e-134a-4036-b8ed-1a9c6ff26ec1'::uuid;
BEGIN
  -- 0. Caller authorization: only service_role, postgres, or platform admins can invoke finalization
  IF (COALESCE(auth.jwt() ->> 'role', '') != 'service_role')
     AND (current_user NOT IN ('postgres', 'supabase_admin'))
     AND (auth.uid() IS NULL OR NOT EXISTS (
       SELECT 1 FROM public.users WHERE id = auth.uid() AND (COALESCE(is_admin, FALSE) = TRUE OR id = v_default_admin_id)
     )) THEN
    RAISE EXCEPTION 'Unauthorized: Global Analytics finalization requires service_role or admin privileges.';
  END IF;

  -- 1. Determine canonical source and celebration week boundaries
  IF p_target_week_start IS NULL THEN
    v_source_week_start := (DATE_TRUNC('week', (v_now - INTERVAL '7 days') AT TIME ZONE v_tz) AT TIME ZONE v_tz);
  ELSE
    v_source_week_start := (DATE_TRUNC('week', p_target_week_start AT TIME ZONE v_tz) AT TIME ZONE v_tz);
  END IF;
  v_source_week_end := v_source_week_start + INTERVAL '7 days';
  v_celebration_week_start := v_source_week_end;

  v_source_period_id := TO_CHAR(v_source_week_start AT TIME ZONE v_tz, 'YYYY-MM-DD');
  v_celebration_period_id := TO_CHAR(v_celebration_week_start AT TIME ZONE v_tz, 'YYYY-MM-DD');

  -- 2. Strictly serialize finalization under advisory transaction lock
  PERFORM pg_advisory_xact_lock(hashtext('global_analytics_finalization_' || v_source_period_id));

  -- 3. Idempotency Check: If already finalized, exit immediately unless force recalculation is requested
  SELECT id INTO v_existing_id
  FROM public.weekly_global_analytics_snapshots
  WHERE period_id = v_source_period_id AND is_finalized = TRUE;

  IF v_existing_id IS NOT NULL AND NOT COALESCE(p_force, FALSE) THEN
    RETURN jsonb_build_object(
      'success', true,
      'action', 'already_finalized',
      'already_finalized', true,
      'period_id', v_source_period_id,
      'celebration_period_id', v_celebration_period_id
    );
  END IF;

  -- 4. Authoritatively reconcile any pending expired sessions prior to computing previous week's metrics
  BEGIN
    PERFORM public.rpc_reconcile_expired_sessions();
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Session reconciliation notice during finalization: %', SQLERRM;
  END;

  -- 5. Create temporary working table from canonical rpc_get_leaderboard for evaluated week
  DROP TABLE IF EXISTS temp_finalized_leaderboard;
  CREATE TEMP TABLE temp_finalized_leaderboard ON COMMIT DROP AS
  SELECT
    ROW_NUMBER() OVER (ORDER BY lb.score DESC, lb.total_study_minutes DESC, lb.display_name ASC)::INTEGER AS rank,
    lb.user_id,
    lb.display_name,
    lb.avatar_url,
    lb.total_study_minutes,
    ROUND((lb.total_study_minutes::NUMERIC / 7.0), 1) AS daily_average_minutes,
    lb.completed_tasks,
    lb.total_tasks,
    lb.goal_completion_pct,
    COALESCE(
      lb.streak_days,
      act_days.days_count,
      0
    )::INTEGER AS active_study_days,
    lb.score
  FROM public.rpc_get_leaderboard(v_source_week_start, v_tz) lb
  LEFT JOIN (
    SELECT
      day_study.user_id,
      COUNT(DISTINCT day_study.study_date)::INTEGER AS days_count
    FROM (
      SELECT
        ss.user_id,
        DATE(ss.start_time AT TIME ZONE v_tz) AS study_date,
        SUM(ss.duration_minutes) AS day_mins
      FROM public.study_sessions ss
      WHERE ss.start_time >= v_source_week_start
        AND ss.start_time < v_source_week_end
        AND ss.duration_minutes > 0
      GROUP BY ss.user_id, DATE(ss.start_time AT TIME ZONE v_tz)
      HAVING SUM(ss.duration_minutes) >= 30
    ) day_study
    GROUP BY day_study.user_id
  ) act_days ON lb.user_id = act_days.user_id
  JOIN public.users u ON lb.user_id = u.id
  WHERE COALESCE(u.is_admin, FALSE) = FALSE
    AND lb.user_id != v_default_admin_id
    AND u.created_at < v_source_week_end;

  SELECT COUNT(*)::INTEGER INTO v_total_eligible FROM temp_finalized_leaderboard;

  -- Compute community summary aggregates
  IF v_total_eligible > 0 THEN
    SELECT
      ROUND(AVG(total_study_minutes)::NUMERIC, 1),
      ROUND((SUM(total_study_minutes)::NUMERIC / 60.0), 1),
      ROUND(AVG(goal_completion_pct)::NUMERIC, 1),
      COALESCE(SUM(completed_tasks), 0)::INTEGER
    INTO
      v_global_avg_study_mins,
      v_total_community_hours,
      v_global_avg_goal_pct,
      v_total_completed_goals
    FROM temp_finalized_leaderboard;
  END IF;

  v_community_stats := jsonb_build_object(
    'total_eligible_students', v_total_eligible,
    'global_avg_study_minutes', v_global_avg_study_mins,
    'global_avg_daily_minutes', ROUND((v_global_avg_study_mins / 7.0), 1),
    'global_avg_goal_pct', v_global_avg_goal_pct,
    'total_community_hours', v_total_community_hours,
    'total_completed_goals', v_total_completed_goals
  );

  -- 6. Populate per-user historical records (weekly_user_analytics_records)
  DELETE FROM public.weekly_user_analytics_records WHERE period_id = v_source_period_id;

  IF v_total_eligible > 0 THEN
    INSERT INTO public.weekly_user_analytics_records (
      period_id,
      user_id,
      rank,
      percentile,
      total_study_minutes,
      daily_average_minutes,
      active_study_days,
      completed_tasks,
      total_tasks,
      goal_completion_pct,
      score,
      created_at
    )
    SELECT
      v_source_period_id,
      tf.user_id,
      tf.rank,
      CASE
        WHEN v_total_eligible <= 1 THEN 1.0
        ELSE GREATEST(1.0, LEAST(100.0, CEIL((tf.rank::NUMERIC / v_total_eligible::NUMERIC) * 100.0)))
      END AS percentile,
      tf.total_study_minutes,
      tf.daily_average_minutes,
      tf.active_study_days,
      tf.completed_tasks,
      tf.total_tasks,
      tf.goal_completion_pct,
      tf.score,
      v_now
    FROM temp_finalized_leaderboard tf;
  END IF;

  -- 7. Persist weekly_achiever_snapshots (Prior to Hall of Fame calculation to include current title)
  IF v_total_eligible > 0 THEN
    SELECT * INTO v_achiever_rec
    FROM temp_finalized_leaderboard
    WHERE rank = 1;
    v_winner_id := v_achiever_rec.user_id;

    -- If finalizing the immediately completed week, sync live badge in public.users
    IF (v_source_week_start = (DATE_TRUNC('week', (v_now - INTERVAL '7 days') AT TIME ZONE v_tz) AT TIME ZONE v_tz)) THEN
      PERFORM set_config('studyroom.internal_badge_update', 'true', true);
      UPDATE public.users SET has_achiever_badge = FALSE WHERE has_achiever_badge = TRUE;
      IF v_winner_id IS NOT NULL THEN
        UPDATE public.users SET has_achiever_badge = TRUE WHERE id = v_winner_id;
      END IF;
    END IF;
  END IF;

  IF v_achiever_rec IS NOT NULL THEN
    INSERT INTO public.weekly_achiever_snapshots (
      celebration_period_id,
      source_period_id,
      achiever_user_id,
      display_name,
      avatar_url,
      week_start,
      week_end,
      total_study_minutes,
      average_study_minutes_per_day,
      study_sessions_count,
      active_study_days,
      goal_completion_pct,
      completed_goals_count,
      total_goals_count,
      leaderboard_score,
      global_rank,
      is_finalized,
      finalized_at
    )
    VALUES (
      v_celebration_period_id,
      v_source_period_id,
      v_achiever_rec.user_id,
      v_achiever_rec.display_name,
      v_achiever_rec.avatar_url,
      v_source_week_start,
      v_source_week_end,
      v_achiever_rec.total_study_minutes,
      v_achiever_rec.daily_average_minutes,
      (SELECT COUNT(*)::INTEGER FROM public.study_sessions ss WHERE ss.user_id = v_achiever_rec.user_id AND ss.start_time >= v_source_week_start AND ss.start_time < v_source_week_end),
      v_achiever_rec.active_study_days,
      v_achiever_rec.goal_completion_pct,
      v_achiever_rec.completed_tasks,
      v_achiever_rec.total_tasks,
      v_achiever_rec.score,
      v_achiever_rec.rank,
      TRUE,
      v_now
    )
    ON CONFLICT (celebration_period_id) DO UPDATE SET
      display_name = EXCLUDED.display_name,
      avatar_url = EXCLUDED.avatar_url,
      total_study_minutes = EXCLUDED.total_study_minutes,
      average_study_minutes_per_day = EXCLUDED.average_study_minutes_per_day,
      goal_completion_pct = EXCLUDED.goal_completion_pct,
      leaderboard_score = EXCLUDED.leaderboard_score,
      is_finalized = TRUE,
      finalized_at = v_now
    WHERE weekly_achiever_snapshots.is_finalized = FALSE OR COALESCE(p_force, FALSE) = TRUE;
  END IF;

  -- 8. Build Four Core Global Analytics Rankings
  -- Category A: Top 5 Most Studying Students (Daily average DESC)
  SELECT COALESCE(jsonb_agg(row_data), '[]'::jsonb)
  INTO v_most_studying
  FROM (
    SELECT jsonb_build_object(
      'rank', ROW_NUMBER() OVER (ORDER BY daily_average_minutes DESC, total_study_minutes DESC, display_name ASC),
      'user_id', user_id,
      'display_name', display_name,
      'avatar_url', avatar_url,
      'total_study_minutes', total_study_minutes,
      'daily_average_minutes', daily_average_minutes,
      'active_study_days', active_study_days,
      'score', score
    ) AS row_data
    FROM temp_finalized_leaderboard
    ORDER BY daily_average_minutes DESC, total_study_minutes DESC, display_name ASC
    LIMIT 5
  ) sub_most;

  -- Category B: Top 5 Consistent Students (Active study days DESC, Total study minutes DESC)
  -- Written exclusively to 'consistency_rhythm_matrix'
  SELECT COALESCE(jsonb_agg(row_data), '[]'::jsonb)
  INTO v_consistency_entries
  FROM (
    SELECT jsonb_build_object(
      'rank', ROW_NUMBER() OVER (ORDER BY active_study_days DESC, total_study_minutes DESC, score DESC, display_name ASC, user_id ASC),
      'user_id', user_id,
      'display_name', display_name,
      'avatar_url', avatar_url,
      'total_study_minutes', total_study_minutes,
      'daily_average_minutes', daily_average_minutes,
      'active_study_days', active_study_days,
      'score', score
    ) AS row_data
    FROM temp_finalized_leaderboard
    ORDER BY active_study_days DESC, total_study_minutes DESC, score DESC, display_name ASC, user_id ASC
    LIMIT 5
  ) sub_low;

  -- Category C: Achiever Badge Winners (Historical badge count DESC, including current week)
  SELECT COALESCE(jsonb_agg(row_data), '[]'::jsonb)
  INTO v_achiever_winners
  FROM (
    SELECT jsonb_build_object(
      'rank', ROW_NUMBER() OVER (ORDER BY badge_counts.achiever_count DESC, tf.total_study_minutes DESC, tf.display_name ASC),
      'user_id', tf.user_id,
      'display_name', tf.display_name,
      'avatar_url', tf.avatar_url,
      'achiever_count', badge_counts.achiever_count,
      'total_study_minutes', tf.total_study_minutes
    ) AS row_data
    FROM temp_finalized_leaderboard tf
    JOIN (
      SELECT
        u.id AS user_id,
        GREATEST(
          COALESCE((SELECT COUNT(*)::INTEGER FROM public.weekly_achiever_snapshots was WHERE was.achiever_user_id = u.id AND was.week_start <= v_source_week_start AND was.is_finalized = TRUE), 0) +
          COALESCE((
            SELECT COUNT(DISTINCT DATE_TRUNC('week', (ua.sent_at - INTERVAL '1 day') AT TIME ZONE v_tz))::INTEGER 
            FROM public.user_alerts ua 
            WHERE ua.user_id = u.id 
              AND ua.alert_type = 'A' 
              AND ua.status = 'sent' 
              AND ua.sent_at < v_source_week_end
              AND DATE_TRUNC('week', (ua.sent_at - INTERVAL '1 day') AT TIME ZONE v_tz) NOT IN (
                SELECT DATE_TRUNC('week', was.week_start AT TIME ZONE v_tz)
                FROM public.weekly_achiever_snapshots was
                WHERE was.achiever_user_id IS NOT NULL
                  AND was.week_start <= v_source_week_start
              )
          ), 0),
          CASE WHEN u.has_achiever_badge AND (v_source_week_start >= (DATE_TRUNC('week', (v_now - INTERVAL '7 days') AT TIME ZONE v_tz) AT TIME ZONE v_tz)) THEN 1 ELSE 0 END
        ) AS achiever_count
      FROM public.users u
      WHERE COALESCE(u.is_admin, FALSE) = FALSE AND u.id != v_default_admin_id
        AND u.created_at < v_source_week_end
    ) badge_counts ON tf.user_id = badge_counts.user_id
    WHERE badge_counts.achiever_count > 0
    ORDER BY badge_counts.achiever_count DESC, tf.total_study_minutes DESC, tf.display_name ASC
    LIMIT 10
  ) sub_achievers;

  -- Category D: Top 5 Goal Chasers (Completion % DESC for users with total_tasks > 0)
  SELECT COALESCE(jsonb_agg(row_data), '[]'::jsonb)
  INTO v_goal_chasers
  FROM (
    SELECT jsonb_build_object(
      'rank', ROW_NUMBER() OVER (ORDER BY goal_completion_pct DESC, completed_tasks DESC, total_tasks DESC, total_study_minutes DESC, display_name ASC),
      'user_id', user_id,
      'display_name', display_name,
      'avatar_url', avatar_url,
      'completed_tasks', completed_tasks,
      'total_tasks', total_tasks,
      'goal_completion_pct', goal_completion_pct,
      'total_study_minutes', total_study_minutes
    ) AS row_data
    FROM temp_finalized_leaderboard
    WHERE total_tasks > 0
    ORDER BY goal_completion_pct DESC, completed_tasks DESC, total_tasks DESC, total_study_minutes DESC, display_name ASC
    LIMIT 5
  ) sub_goals;

  -- 9. Persist weekly_global_analytics_snapshots (Writing solely consistency_rhythm_matrix)
  INSERT INTO public.weekly_global_analytics_snapshots (
    period_id,
    celebration_period_id,
    week_start,
    week_end,
    rankings,
    community_stats,
    is_finalized,
    finalized_at
  )
  VALUES (
    v_source_period_id,
    v_celebration_period_id,
    v_source_week_start,
    v_source_week_end,
    jsonb_build_object(
      'most_studying', v_most_studying,
      'consistency_rhythm_matrix', v_consistency_entries,
      'achiever_winners', v_achiever_winners,
      'goal_chasers', v_goal_chasers
    ),
    v_community_stats,
    TRUE,
    v_now
  )
  ON CONFLICT (period_id) DO UPDATE SET
    celebration_period_id = EXCLUDED.celebration_period_id,
    rankings = EXCLUDED.rankings,
    community_stats = EXCLUDED.community_stats,
    is_finalized = TRUE,
    finalized_at = v_now
  WHERE weekly_global_analytics_snapshots.is_finalized = FALSE OR COALESCE(p_force, FALSE) = TRUE;

  RETURN jsonb_build_object(
    'success', true,
    'action', 'finalized',
    'period_id', v_source_period_id,
    'celebration_period_id', v_celebration_period_id,
    'achiever_id', v_winner_id,
    'total_eligible', v_total_eligible,
    'finalized_at', v_now
  );
END;
$$;

-- Access Control: preserve grants
REVOKE EXECUTE ON FUNCTION public.rpc_finalize_weekly_global_analytics(TEXT, TIMESTAMPTZ, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_finalize_weekly_global_analytics(TEXT, TIMESTAMPTZ, BOOLEAN) TO authenticated, service_role;
