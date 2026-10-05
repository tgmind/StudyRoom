-- ============================================================
-- Migration: 20261005_global_analytics_and_achiever_snapshots.sql
-- Description:
--   Additive, non-destructive schema for StudyRoom Global Analytics:
--     1. public.weekly_achiever_snapshots (Immutable Achiever celebration data)
--     2. public.weekly_global_analytics_snapshots (Top 5 rankings & community stats)
--     3. public.weekly_user_analytics_records (Indexed per-user historical records for O(1) user position lookup)
--     4. public.user_analytics_acknowledgements (Per-user, per-period alert dismissal tracking)
--     5. Authoritative RPCs for atomic finalization, compact retrieval, and alert status.
-- ============================================================

-- ------------------------------------------------------------
-- 1. WEEKLY ACHIEVER CELEBRATION SNAPSHOTS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.weekly_achiever_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  celebration_period_id TEXT NOT NULL UNIQUE, -- e.g. '2026-10-05' (active week)
  source_period_id TEXT NOT NULL,            -- e.g. '2026-09-28' (evaluated week)
  achiever_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  week_start TIMESTAMPTZ NOT NULL,
  week_end TIMESTAMPTZ NOT NULL,
  total_study_minutes INTEGER NOT NULL DEFAULT 0,
  average_study_minutes_per_day NUMERIC(5, 1) NOT NULL DEFAULT 0.0,
  study_sessions_count INTEGER NOT NULL DEFAULT 0,
  active_study_days INTEGER NOT NULL DEFAULT 0,
  goal_completion_pct NUMERIC(5, 1) NOT NULL DEFAULT 0.0,
  completed_goals_count INTEGER NOT NULL DEFAULT 0,
  total_goals_count INTEGER NOT NULL DEFAULT 0,
  leaderboard_score NUMERIC(5, 1) NOT NULL DEFAULT 0.0,
  global_rank INTEGER NOT NULL DEFAULT 1,
  is_finalized BOOLEAN NOT NULL DEFAULT FALSE,
  finalized_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_weekly_achiever_celebration_period 
  ON public.weekly_achiever_snapshots(celebration_period_id);
CREATE INDEX IF NOT EXISTS idx_weekly_achiever_user_id 
  ON public.weekly_achiever_snapshots(achiever_user_id);

-- ------------------------------------------------------------
-- 2. WEEKLY GLOBAL ANALYTICS SNAPSHOTS (Top 5 & Community Aggregates)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.weekly_global_analytics_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id TEXT NOT NULL UNIQUE,             -- source evaluated period e.g. '2026-09-28'
  celebration_period_id TEXT NOT NULL UNIQUE, -- active celebration period e.g. '2026-10-05'
  week_start TIMESTAMPTZ NOT NULL,
  week_end TIMESTAMPTZ NOT NULL,
  rankings JSONB NOT NULL DEFAULT '{}'::jsonb,
  community_stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_finalized BOOLEAN NOT NULL DEFAULT FALSE,
  finalized_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_global_analytics_period_id 
  ON public.weekly_global_analytics_snapshots(period_id);
CREATE INDEX IF NOT EXISTS idx_global_analytics_celebration_period 
  ON public.weekly_global_analytics_snapshots(celebration_period_id);

-- ------------------------------------------------------------
-- 3. WEEKLY USER ANALYTICS RECORDS (O(1) Indexed User Position)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.weekly_user_analytics_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id TEXT NOT NULL,                    -- source period e.g. '2026-09-28'
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  rank INTEGER NOT NULL,
  percentile NUMERIC(5, 1) NOT NULL DEFAULT 0.0,
  total_study_minutes INTEGER NOT NULL DEFAULT 0,
  daily_average_minutes NUMERIC(5, 1) NOT NULL DEFAULT 0.0,
  active_study_days INTEGER NOT NULL DEFAULT 0,
  completed_tasks INTEGER NOT NULL DEFAULT 0,
  total_tasks INTEGER NOT NULL DEFAULT 0,
  goal_completion_pct NUMERIC(5, 1) NOT NULL DEFAULT 0.0,
  score NUMERIC(5, 1) NOT NULL DEFAULT 0.0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_weekly_user_records UNIQUE (period_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_weekly_user_records_lookup 
  ON public.weekly_user_analytics_records(period_id, user_id);
CREATE INDEX IF NOT EXISTS idx_weekly_user_records_rank 
  ON public.weekly_user_analytics_records(period_id, rank);

-- ------------------------------------------------------------
-- 4. PER-USER PERIOD ACKNOWLEDGEMENTS (Room Alert Suppression)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_analytics_acknowledgements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  period_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('dismissed', 'viewed')),
  acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_user_period_ack UNIQUE (user_id, period_id)
);

CREATE INDEX IF NOT EXISTS idx_user_analytics_ack_lookup 
  ON public.user_analytics_acknowledgements(user_id, period_id);

-- ------------------------------------------------------------
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
-- ------------------------------------------------------------
ALTER TABLE public.weekly_achiever_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_global_analytics_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_user_analytics_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_analytics_acknowledgements ENABLE ROW LEVEL SECURITY;

-- Snapshots: Readable by authenticated members only (anon access removed for privacy)
DROP POLICY IF EXISTS p_read_weekly_achiever_snapshots ON public.weekly_achiever_snapshots;
CREATE POLICY p_read_weekly_achiever_snapshots 
  ON public.weekly_achiever_snapshots FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS p_read_weekly_global_analytics_snapshots ON public.weekly_global_analytics_snapshots;
CREATE POLICY p_read_weekly_global_analytics_snapshots 
  ON public.weekly_global_analytics_snapshots FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS p_read_weekly_user_analytics_records ON public.weekly_user_analytics_records;
CREATE POLICY p_read_weekly_user_analytics_records 
  ON public.weekly_user_analytics_records FOR SELECT TO authenticated 
  USING (auth.uid() = user_id);

-- Acknowledgements: Users can only read, insert, and update their own records
DROP POLICY IF EXISTS p_read_user_analytics_acknowledgements ON public.user_analytics_acknowledgements;
CREATE POLICY p_read_user_analytics_acknowledgements 
  ON public.user_analytics_acknowledgements FOR SELECT TO authenticated 
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS p_insert_user_analytics_acknowledgements ON public.user_analytics_acknowledgements;
CREATE POLICY p_insert_user_analytics_acknowledgements 
  ON public.user_analytics_acknowledgements FOR INSERT TO authenticated 
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS p_update_user_analytics_acknowledgements ON public.user_analytics_acknowledgements;
CREATE POLICY p_update_user_analytics_acknowledgements 
  ON public.user_analytics_acknowledgements FOR UPDATE TO authenticated 
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ------------------------------------------------------------
-- 6. AUTHORITATIVE RPC: rpc_finalize_weekly_global_analytics
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_finalize_weekly_global_analytics(
  p_timezone TEXT DEFAULT 'Asia/Kolkata',
  p_target_week_start TIMESTAMPTZ DEFAULT NULL
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
  v_low_performers JSONB := '[]'::jsonb;
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

  -- 3. Idempotency Check: If already finalized, exit immediately and return
  SELECT id INTO v_existing_id
  FROM public.weekly_global_analytics_snapshots
  WHERE period_id = v_source_period_id AND is_finalized = TRUE;

  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'action', 'already_finalized',
      'already_finalized', true,
      'period_id', v_source_period_id,
      'celebration_period_id', v_celebration_period_id
    );
  END IF;

  -- 4. Authoritatively reconcile any pending expired sessions prior to computing previous week's metrics (Fail-Closed)
  BEGIN
    PERFORM public.rpc_reconcile_expired_sessions();
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Authoritative finalization aborted: session reconciliation failed with error: %', SQLERRM;
  END;

  -- 5. Invoke canonical existing Achiever awarding function
  v_winner_id := public.rpc_calculate_weekly_achiever(v_tz);

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
    lb.streak_days AS active_study_days,
    lb.score
  FROM public.rpc_get_leaderboard(v_source_week_start, v_tz) lb
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
  IF v_winner_id IS NOT NULL THEN
    SELECT * INTO v_achiever_rec
    FROM temp_finalized_leaderboard
    WHERE user_id = v_winner_id;
  END IF;

  IF v_achiever_rec IS NULL AND v_total_eligible > 0 THEN
    SELECT * INTO v_achiever_rec
    FROM temp_finalized_leaderboard
    WHERE rank = 1;
    v_winner_id := v_achiever_rec.user_id;
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
    WHERE weekly_achiever_snapshots.is_finalized = FALSE;
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
  SELECT COALESCE(jsonb_agg(row_data), '[]'::jsonb)
  INTO v_low_performers
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
          COALESCE((SELECT COUNT(*)::INTEGER FROM public.weekly_achiever_snapshots was WHERE was.achiever_user_id = u.id), 0) +
          COALESCE((
            SELECT COUNT(DISTINCT DATE_TRUNC('week', (ua.sent_at - INTERVAL '1 day') AT TIME ZONE v_tz))::INTEGER 
            FROM public.user_alerts ua 
            WHERE ua.user_id = u.id 
              AND ua.alert_type = 'A' 
              AND ua.status = 'sent' 
              AND DATE_TRUNC('week', (ua.sent_at - INTERVAL '1 day') AT TIME ZONE v_tz) NOT IN (
                SELECT DATE_TRUNC('week', was.week_start AT TIME ZONE v_tz)
                FROM public.weekly_achiever_snapshots was
                WHERE was.achiever_user_id IS NOT NULL
              )
          ), 0),
          CASE WHEN u.has_achiever_badge THEN 1 ELSE 0 END
        ) AS achiever_count
      FROM public.users u
      WHERE COALESCE(u.is_admin, FALSE) = FALSE AND u.id != v_default_admin_id
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

  -- 9. Persist weekly_global_analytics_snapshots
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
      'low_performers', v_low_performers,
      'consistency_rhythm_matrix', v_low_performers,
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
  WHERE weekly_global_analytics_snapshots.is_finalized = FALSE;

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

-- ------------------------------------------------------------
-- 7. AUTHORITATIVE RPC: rpc_get_global_analytics
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_get_global_analytics(
  p_timezone TEXT DEFAULT 'Asia/Kolkata',
  p_week_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_tz TEXT := COALESCE(NULLIF(p_timezone, ''), 'Asia/Kolkata');
  v_user_id UUID := auth.uid();
  v_source_week_start TIMESTAMPTZ;
  v_source_period_id TEXT;
  v_celebration_period_id TEXT;
  v_snapshot RECORD;
  v_achiever RECORD;
  v_user_record RECORD;
  v_user_position JSONB := NULL;
  v_top5_cutoff_mins INTEGER := 0;
  v_mins_to_top5 INTEGER := 0;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  -- 1. Determine period to inspect
  IF p_week_id IS NOT NULL AND p_week_id <> '' THEN
    v_source_period_id := p_week_id;
  ELSE
    SELECT period_id INTO v_source_period_id
    FROM public.weekly_global_analytics_snapshots
    WHERE is_finalized = TRUE
    ORDER BY week_start DESC
    LIMIT 1;

    IF v_source_period_id IS NULL THEN
      v_source_week_start := (DATE_TRUNC('week', (v_now - INTERVAL '7 days') AT TIME ZONE v_tz) AT TIME ZONE v_tz);
      v_source_period_id := TO_CHAR(v_source_week_start AT TIME ZONE v_tz, 'YYYY-MM-DD');
    END IF;
  END IF;

  -- 2. Fetch finalized snapshot (Pure read-only query; no side-effect mutations from GET)
  SELECT * INTO v_snapshot
  FROM public.weekly_global_analytics_snapshots
  WHERE period_id = v_source_period_id AND is_finalized = TRUE;

  IF v_snapshot IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'is_finalized', false,
      'period_id', v_source_period_id,
      'message', 'Analytics for this period have not yet been finalized.'
    );
  END IF;

  v_celebration_period_id := v_snapshot.celebration_period_id;

  -- 3. Fetch Achiever Celebration Snapshot
  SELECT * INTO v_achiever
  FROM public.weekly_achiever_snapshots
  WHERE celebration_period_id = v_celebration_period_id AND is_finalized = TRUE;

  -- 4. O(1) B-tree lookup for calling user's individual position
  IF v_user_id IS NOT NULL THEN
    SELECT * INTO v_user_record
    FROM public.weekly_user_analytics_records
    WHERE period_id = v_source_period_id AND user_id = v_user_id;

    IF v_user_record IS NOT NULL THEN
      -- Extract 5th place cutoff from rankings to compute distance to Top 5
      v_top5_cutoff_mins := COALESCE(
        (v_snapshot.rankings->'most_studying'->4->>'total_study_minutes')::INTEGER,
        (v_snapshot.rankings->'most_studying'->0->>'total_study_minutes')::INTEGER,
        0
      );

      IF (v_user_record.rank <= 5) OR (COALESCE((v_snapshot.community_stats->>'total_eligible_students')::INTEGER, 1) <= 5) THEN
        v_mins_to_top5 := 0;
      ELSE
        v_mins_to_top5 := GREATEST(0, v_top5_cutoff_mins - v_user_record.total_study_minutes + 1);
      END IF;

      v_user_position := jsonb_build_object(
        'user_id', v_user_id,
        'rank', v_user_record.rank,
        'total_eligible_students', COALESCE((v_snapshot.community_stats->>'total_eligible_students')::INTEGER, 1),
        'percentile', v_user_record.percentile,
        'total_study_minutes', v_user_record.total_study_minutes,
        'daily_average_minutes', v_user_record.daily_average_minutes,
        'active_study_days', v_user_record.active_study_days,
        'completed_tasks', v_user_record.completed_tasks,
        'total_tasks', v_user_record.total_tasks,
        'goal_completion_pct', v_user_record.goal_completion_pct,
        'score', v_user_record.score,
        'is_in_top5', ((v_user_record.rank <= 5) OR (COALESCE((v_snapshot.community_stats->>'total_eligible_students')::INTEGER, 1) <= 5)),
        'minutes_to_top5', v_mins_to_top5,
        'delta_vs_community_study_mins', ROUND(v_user_record.total_study_minutes - COALESCE((v_snapshot.community_stats->>'global_avg_study_minutes')::NUMERIC, 0), 1),
        'delta_vs_community_goal_pct', ROUND(v_user_record.goal_completion_pct - COALESCE((v_snapshot.community_stats->>'global_avg_goal_pct')::NUMERIC, 0), 1)
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'is_finalized', true,
    'period_id', v_source_period_id,
    'celebration_period_id', v_celebration_period_id,
    'week_start', v_snapshot.week_start,
    'week_end', v_snapshot.week_end,
    'finalized_at', v_snapshot.finalized_at,
    'achiever', CASE WHEN v_achiever IS NOT NULL THEN
      jsonb_build_object(
        'id', v_achiever.id,
        'celebration_period_id', v_celebration_period_id,
        'source_period_id', v_source_period_id,
        'achiever_user_id', v_achiever.achiever_user_id,
        'display_name', v_achiever.display_name,
        'avatar_url', v_achiever.avatar_url,
        'week_start', v_achiever.week_start,
        'week_end', v_achiever.week_end,
        'total_study_minutes', v_achiever.total_study_minutes,
        'average_study_minutes_per_day', v_achiever.average_study_minutes_per_day,
        'study_sessions_count', v_achiever.study_sessions_count,
        'active_study_days', v_achiever.active_study_days,
        'goal_completion_pct', v_achiever.goal_completion_pct,
        'completed_goals_count', v_achiever.completed_goals_count,
        'total_goals_count', v_achiever.total_goals_count,
        'leaderboard_score', v_achiever.leaderboard_score,
        'score', v_achiever.leaderboard_score,
        'global_rank', v_achiever.global_rank,
        'is_finalized', v_achiever.is_finalized,
        'finalized_at', v_achiever.finalized_at
      )
    ELSE NULL END,
    'rankings', v_snapshot.rankings,
    'community_stats', v_snapshot.community_stats,
    'user_position', v_user_position
  );
END;
$$;

-- ------------------------------------------------------------
-- 8. AUTHORITATIVE RPC: rpc_get_user_analytics_alert_status
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_get_user_analytics_alert_status(
  p_timezone TEXT DEFAULT 'Asia/Kolkata'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_tz TEXT := COALESCE(NULLIF(p_timezone, ''), 'Asia/Kolkata');
  v_user_id UUID := auth.uid();
  v_current_monday TIMESTAMPTZ;
  v_celebration_period_id TEXT;
  v_achiever_name TEXT;
  v_has_finalized_analytics BOOLEAN := false;
  v_already_acknowledged BOOLEAN := false;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('show_alert', false);
  END IF;

  -- 1. Identify the latest finalized analytics period
  SELECT celebration_period_id INTO v_celebration_period_id
  FROM public.weekly_global_analytics_snapshots
  WHERE is_finalized = TRUE
  ORDER BY week_start DESC
  LIMIT 1;

  IF v_celebration_period_id IS NULL THEN
    -- Fallback: check weekly_achiever_snapshots if global analytics table is empty
    SELECT celebration_period_id INTO v_celebration_period_id
    FROM public.weekly_achiever_snapshots
    WHERE is_finalized = TRUE
    ORDER BY week_start DESC
    LIMIT 1;
  END IF;

  IF v_celebration_period_id IS NULL THEN
    RETURN jsonb_build_object('show_alert', false);
  END IF;

  -- 2. Fetch the Achiever display name for this finalized period
  SELECT display_name INTO v_achiever_name
  FROM public.weekly_achiever_snapshots
  WHERE celebration_period_id = v_celebration_period_id AND is_finalized = TRUE;

  -- 3. Check if user already acknowledged (dismissed OR viewed) for this specific period
  SELECT EXISTS (
    SELECT 1 FROM public.user_analytics_acknowledgements
    WHERE user_id = v_user_id AND period_id = v_celebration_period_id
  ) INTO v_already_acknowledged;

  IF v_already_acknowledged THEN
    RETURN jsonb_build_object('show_alert', false);
  END IF;

  RETURN jsonb_build_object(
    'show_alert', true,
    'celebration_period_id', v_celebration_period_id,
    'achiever_name', COALESCE(v_achiever_name, 'the community leader')
  );
END;
$$;

-- ------------------------------------------------------------
-- 9. AUTHORITATIVE RPC: rpc_acknowledge_analytics_alert
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_acknowledge_analytics_alert(
  p_period_id TEXT,
  p_action TEXT DEFAULT 'dismissed'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_action TEXT := COALESCE(NULLIF(p_action, ''), 'dismissed');
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF v_action NOT IN ('dismissed', 'viewed') THEN
    v_action := 'dismissed';
  END IF;

  INSERT INTO public.user_analytics_acknowledgements (
    user_id,
    period_id,
    action,
    acknowledged_at
  )
  VALUES (
    v_user_id,
    p_period_id,
    v_action,
    NOW()
  )
  ON CONFLICT (user_id, period_id) DO UPDATE SET
    action = EXCLUDED.action,
    acknowledged_at = NOW();

  RETURN jsonb_build_object(
    'success', true,
    'user_id', v_user_id,
    'period_id', p_period_id,
    'action', v_action
  );
END;
$$;

-- ------------------------------------------------------------
-- 10. GRANTS & ACCESS CONTROL HARDENING
-- ------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.rpc_finalize_weekly_global_analytics(TEXT, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_finalize_weekly_global_analytics(TEXT, TIMESTAMPTZ) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.rpc_get_global_analytics(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_get_global_analytics(TEXT, TEXT) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.rpc_get_user_analytics_alert_status(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_get_user_analytics_alert_status(TEXT) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.rpc_acknowledge_analytics_alert(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_acknowledge_analytics_alert(TEXT, TEXT) TO authenticated, service_role;

-- ------------------------------------------------------------
-- 11. ATOMIC EMAIL DEDUPLICATION CLAIM & COMPLETION RPCS
-- ------------------------------------------------------------

-- Unique partial index preventing concurrent pending/sent claims for the same Achiever week
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_alerts_achiever_week_active
  ON public.user_alerts(reason)
  WHERE alert_type = 'A' AND status IN ('pending', 'sent');

-- Atomic claim function: acquires lock, checks active claims, allows stale (>5 min) or failed retry
CREATE OR REPLACE FUNCTION public.rpc_claim_weekly_achiever_alert(
  p_user_id UUID,
  p_user_name TEXT,
  p_user_email TEXT,
  p_week_key TEXT,
  p_force BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_reason TEXT := 'Weekly Achiever Title: Week of ' || p_week_key;
  v_alert_id UUID;
  v_status TEXT;
  v_created_at TIMESTAMPTZ;
  v_sent_at TIMESTAMPTZ;
BEGIN
  IF p_user_id IS NULL OR p_user_name IS NULL OR p_user_email IS NULL OR p_week_key IS NULL THEN
    RETURN jsonb_build_object('claimed', false, 'status', 'invalid_params', 'reason', 'Missing required claim parameters');
  END IF;

  -- 1. Check existing records for this week with row-level lock
  SELECT id, status, created_at, sent_at
  INTO v_alert_id, v_status, v_created_at, v_sent_at
  FROM public.user_alerts
  WHERE alert_type = 'A' AND reason = v_reason
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    IF NOT COALESCE(p_force, FALSE) THEN
      IF v_status = 'sent' THEN
        RETURN jsonb_build_object(
          'claimed', false,
          'status', 'already_sent',
          'alert_id', v_alert_id,
          'reason', 'Achiever email already dispatched for week ' || p_week_key
        );
      ELSIF v_status = 'pending' THEN
        -- Check if active claim is still fresh (< 5 minutes)
        IF (NOW() - v_created_at) < INTERVAL '5 minutes' THEN
          RETURN jsonb_build_object(
            'claimed', false,
            'status', 'in_progress',
            'alert_id', v_alert_id,
            'reason', 'Achiever email claim is currently in progress by another worker'
          );
        ELSE
          -- Stale claim timed out (> 5 minutes); reclaim row
          UPDATE public.user_alerts
          SET user_id = p_user_id,
              user_name = p_user_name,
              user_email = p_user_email,
              status = 'pending',
              created_at = NOW(),
              error_message = 'Reclaimed after 5m timeout'
          WHERE id = v_alert_id;

          RETURN jsonb_build_object(
            'claimed', true,
            'status', 'reclaimed',
            'alert_id', v_alert_id
          );
        END IF;
      ELSIF v_status IN ('failed', 'dismissed') THEN
        -- Prior attempt failed, allow retry
        UPDATE public.user_alerts
        SET user_id = p_user_id,
            user_name = p_user_name,
            user_email = p_user_email,
            status = 'pending',
            created_at = NOW(),
            error_message = NULL
        WHERE id = v_alert_id;

        RETURN jsonb_build_object(
          'claimed', true,
          'status', 'reclaimed',
          'alert_id', v_alert_id
        );
      END IF;
    ELSE
      -- Forced claim: reset existing row to pending
      UPDATE public.user_alerts
      SET user_id = p_user_id,
          user_name = p_user_name,
          user_email = p_user_email,
          status = 'pending',
          created_at = NOW(),
          error_message = NULL
      WHERE id = v_alert_id;

      RETURN jsonb_build_object(
        'claimed', true,
        'status', 'forced',
        'alert_id', v_alert_id
      );
    END IF;
  END IF;

  -- 2. No record exists yet: attempt atomic insert
  BEGIN
    INSERT INTO public.user_alerts (
      user_id,
      user_name,
      user_email,
      alert_type,
      status,
      consecutive_inactive_days,
      reason,
      created_at
    ) VALUES (
      p_user_id,
      p_user_name,
      p_user_email,
      'A',
      'pending',
      0,
      v_reason,
      NOW()
    ) RETURNING id INTO v_alert_id;

    RETURN jsonb_build_object(
      'claimed', true,
      'status', 'claimed',
      'alert_id', v_alert_id
    );
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object(
        'claimed', false,
        'status', 'concurrent_conflict',
        'reason', 'Another process claimed the weekly achiever alert simultaneously'
      );
  END;
END;
$$;

-- Completion function: transition pending claim to sent or failed
CREATE OR REPLACE FUNCTION public.rpc_complete_weekly_achiever_alert(
  p_alert_id UUID,
  p_status TEXT,
  p_error_message TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_alert_type TEXT;
  v_final_status TEXT;
  v_current_counts JSONB;
  v_type_count INTEGER;
BEGIN
  IF p_alert_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Missing alert_id');
  END IF;

  IF p_status NOT IN ('sent', 'failed') THEN
    v_final_status := 'failed';
  ELSE
    v_final_status := p_status;
  END IF;

  UPDATE public.user_alerts
  SET
    status = v_final_status,
    error_message = p_error_message,
    sent_at = CASE WHEN v_final_status = 'sent' THEN NOW() ELSE sent_at END
  WHERE id = p_alert_id
  RETURNING user_id, alert_type INTO v_user_id, v_alert_type;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Alert claim record not found');
  END IF;

  -- If status transitioned to sent, update user aggregate counters (same as rpc_admin_log_alert_result)
  IF v_final_status = 'sent' AND v_user_id IS NOT NULL THEN
    PERFORM set_config('studyroom.internal_badge_update', 'true', true);

    SELECT COALESCE(alert_counts, '{"A":0,"W":0,"I":0,"D":0}'::jsonb)
    INTO v_current_counts
    FROM public.users
    WHERE id = v_user_id;

    IF v_current_counts IS NULL THEN
      v_current_counts := '{"A":0,"W":0,"I":0,"D":0}'::jsonb;
    END IF;

    v_type_count := COALESCE((v_current_counts->>'A')::INTEGER, 0) + 1;
    v_current_counts := jsonb_set(v_current_counts, ARRAY['A'], to_jsonb(v_type_count));

    UPDATE public.users
    SET
      total_alerts_sent = COALESCE(total_alerts_sent, 0) + 1,
      alert_counts = v_current_counts,
      last_alert_sent_at = NOW(),
      last_alert_type = 'A'
    WHERE id = v_user_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'alert_id', p_alert_id,
    'status', v_final_status
  );
END;
$$;

-- Security Grants
REVOKE EXECUTE ON FUNCTION public.rpc_claim_weekly_achiever_alert(UUID, TEXT, TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_claim_weekly_achiever_alert(UUID, TEXT, TEXT, TEXT, BOOLEAN) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.rpc_complete_weekly_achiever_alert(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_complete_weekly_achiever_alert(UUID, TEXT, TEXT) TO authenticated, service_role;

