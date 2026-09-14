-- ============================================================
-- STUDYROOM — ALERTS & RETENTION SYSTEM MIGRATION (UPGRADED)
-- File: supabase/migrations/20260914_alerts_system.sql
-- ============================================================

-- ------------------------------------------------------------
-- 1. USER ALERTS AUDIT & QUEUE TABLE
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  user_name TEXT NOT NULL,
  user_email TEXT NOT NULL,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('A', 'I', 'D', 'W')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'dismissed')),
  consecutive_inactive_days INTEGER DEFAULT 0,
  reason TEXT NOT NULL,
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Update check constraint if table already exists from earlier run
ALTER TABLE public.user_alerts DROP CONSTRAINT IF EXISTS user_alerts_alert_type_check;
ALTER TABLE public.user_alerts ADD CONSTRAINT user_alerts_alert_type_check CHECK (alert_type IN ('A', 'I', 'D', 'W'));

-- Indexes for Alert Queries & Deduplication
CREATE INDEX IF NOT EXISTS idx_user_alerts_user_id ON public.user_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_user_alerts_alert_type ON public.user_alerts(alert_type);
CREATE INDEX IF NOT EXISTS idx_user_alerts_status ON public.user_alerts(status);
CREATE INDEX IF NOT EXISTS idx_user_alerts_created_at ON public.user_alerts(created_at DESC);

-- Enable RLS
ALTER TABLE public.user_alerts ENABLE ROW LEVEL SECURITY;

-- Admins only policy
DROP POLICY IF EXISTS "Admins can view and manage user_alerts" ON public.user_alerts;
CREATE POLICY "Admins can view and manage user_alerts"
  ON public.user_alerts
  FOR ALL
  TO authenticated
  USING (public.check_is_admin())
  WITH CHECK (public.check_is_admin());


-- ------------------------------------------------------------
-- 2. CANDIDATE SCANNER RPC: rpc_admin_scan_alert_candidates
-- Scans all members, calculates inactive consecutive days & weekly hours,
-- and classifies candidates into:
--   • Type A: Achiever's Title 🏆 (badge holders, active or offline)
--   • Type W: Weekly Performance 📊 (low past-week output / slump)
--   • Type I: Account Activity Notice ⚠️ (inactive >= 3 days and < 5 days)
--   • Type D: Account Deletion Alert 🚨 (inactive >= 5 days)
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.rpc_admin_scan_alert_candidates(TEXT) CASCADE;
CREATE OR REPLACE FUNCTION public.rpc_admin_scan_alert_candidates(p_admin_email TEXT DEFAULT NULL)
RETURNS TABLE (
  candidate_id TEXT,
  user_id UUID,
  user_name TEXT,
  user_email TEXT,
  alert_type TEXT,
  consecutive_inactive_days INTEGER,
  reason TEXT,
  last_active_at TIMESTAMPTZ,
  last_alert_sent_at TIMESTAMPTZ,
  has_achiever_badge BOOLEAN,
  total_study_minutes BIGINT,
  past_week_study_minutes BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  -- Resilient administrator check: verifies auth.uid() OR verified p_admin_email
  IF NOT public.check_is_admin() AND (p_admin_email IS NULL OR LOWER(TRIM(p_admin_email)) <> 'sa@admin.tg') THEN
    RAISE EXCEPTION 'Unauthorized: Caller is not an administrator';
  END IF;

  RETURN QUERY
  WITH user_activity AS (
    SELECT
      u.id AS uid,
      u.display_name,
      au.email::TEXT AS email_addr,
      u.has_achiever_badge,
      u.current_status,
      -- Find latest activity timestamp safely
      COALESCE(
        (SELECT MAX(COALESCE(ss.end_time, ss.start_time)) FROM public.study_sessions ss WHERE ss.user_id = u.id),
        u.last_offline_at,
        u.created_at
      ) AS latest_active_time,
      -- Total study minutes all-time
      COALESCE(
        (SELECT SUM(ss.duration_minutes) FROM public.study_sessions ss WHERE ss.user_id = u.id),
        0
      )::BIGINT AS total_minutes,
      -- Past 7 days study minutes
      COALESCE(
        (SELECT SUM(ss.duration_minutes) FROM public.study_sessions ss WHERE ss.user_id = u.id AND ss.start_time >= (NOW() - INTERVAL '7 days')),
        0
      )::BIGINT AS week_minutes
    FROM public.users u
    JOIN auth.users au ON au.id = u.id
    WHERE COALESCE(u.is_admin, FALSE) = FALSE
      AND au.email IS NOT NULL
      AND TRIM(au.email) <> ''
  ),
  user_inactive_calc AS (
    SELECT
      ua.uid,
      ua.display_name,
      ua.email_addr,
      ua.has_achiever_badge,
      ua.current_status,
      ua.latest_active_time,
      ua.total_minutes,
      ua.week_minutes,
      -- If user is currently studying or on break, inactive days is strictly 0
      CASE
        WHEN ua.current_status IN ('studying', 'break') THEN 0
        ELSE GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - ua.latest_active_time)) / 86400)::INTEGER)
      END AS inactive_days
    FROM user_activity ua
  ),
  latest_alerts AS (
    SELECT
      ua_log.user_id,
      ua_log.alert_type,
      MAX(ua_log.sent_at) AS last_sent
    FROM public.user_alerts ua_log
    WHERE ua_log.status = 'sent'
    GROUP BY ua_log.user_id, ua_log.alert_type
  )
  -- 1. TYPE A: Achiever's Title 🏆 (Badge holders - studying, on break, or active offline)
  SELECT
    ('A-' || uic.uid::TEXT) AS candidate_id,
    uic.uid AS user_id,
    uic.display_name AS user_name,
    uic.email_addr AS user_email,
    'A'::TEXT AS alert_type,
    uic.inactive_days AS consecutive_inactive_days,
    'Earned Achiever Title for high performance & dedication' AS reason,
    uic.latest_active_time AS last_active_at,
    la.last_sent AS last_alert_sent_at,
    uic.has_achiever_badge,
    uic.total_minutes AS total_study_minutes,
    uic.week_minutes AS past_week_study_minutes
  FROM user_inactive_calc uic
  LEFT JOIN latest_alerts la ON la.user_id = uic.uid AND la.alert_type = 'A'
  WHERE uic.has_achiever_badge = TRUE
    AND uic.inactive_days < 3
    AND (la.last_sent IS NULL OR la.last_sent < (NOW() - INTERVAL '7 days'))

  UNION ALL

  -- 2. TYPE D: Account Deletion Alert 🚨 (>= 5 consecutive days inactive)
  SELECT
    ('D-' || uic.uid::TEXT) AS candidate_id,
    uic.uid AS user_id,
    uic.display_name AS user_name,
    uic.email_addr AS user_email,
    'D'::TEXT AS alert_type,
    uic.inactive_days AS consecutive_inactive_days,
    ('Inactive for ' || uic.inactive_days || ' consecutive days (Threshold: 5 days)') AS reason,
    uic.latest_active_time AS last_active_at,
    la.last_sent AS last_alert_sent_at,
    uic.has_achiever_badge,
    uic.total_minutes AS total_study_minutes,
    uic.week_minutes AS past_week_study_minutes
  FROM user_inactive_calc uic
  LEFT JOIN latest_alerts la ON la.user_id = uic.uid AND la.alert_type = 'D'
  WHERE uic.current_status = 'offline'
    AND uic.inactive_days >= 5
    AND (la.last_sent IS NULL OR la.last_sent < (NOW() - INTERVAL '3 days'))

  UNION ALL

  -- 3. TYPE I: Account Activity Notice ⚠️ (>= 3 days and < 5 days inactive)
  SELECT
    ('I-' || uic.uid::TEXT) AS candidate_id,
    uic.uid AS user_id,
    uic.display_name AS user_name,
    uic.email_addr AS user_email,
    'I'::TEXT AS alert_type,
    uic.inactive_days AS consecutive_inactive_days,
    ('Inactive for ' || uic.inactive_days || ' consecutive days (Threshold: 3 days)') AS reason,
    uic.latest_active_time AS last_active_at,
    la.last_sent AS last_alert_sent_at,
    uic.has_achiever_badge,
    uic.total_minutes AS total_study_minutes,
    uic.week_minutes AS past_week_study_minutes
  FROM user_inactive_calc uic
  LEFT JOIN latest_alerts la ON la.user_id = uic.uid AND la.alert_type = 'I'
  WHERE uic.current_status = 'offline'
    AND uic.inactive_days >= 3 AND uic.inactive_days < 5
    AND (la.last_sent IS NULL OR la.last_sent < (NOW() - INTERVAL '3 days'))

  UNION ALL

  -- 4. TYPE W: Weekly Performance / Slump Alert 📊 (Active within 3 days, low past-week study output)
  SELECT
    ('W-' || uic.uid::TEXT) AS candidate_id,
    uic.uid AS user_id,
    uic.display_name AS user_name,
    uic.email_addr AS user_email,
    'W'::TEXT AS alert_type,
    uic.inactive_days AS consecutive_inactive_days,
    ('Low study output in past 7 days (' || ROUND(uic.week_minutes::NUMERIC / 60.0, 1) || 'h logged)') AS reason,
    uic.latest_active_time AS last_active_at,
    la.last_sent AS last_alert_sent_at,
    uic.has_achiever_badge,
    uic.total_minutes AS total_study_minutes,
    uic.week_minutes AS past_week_study_minutes
  FROM user_inactive_calc uic
  LEFT JOIN latest_alerts la ON la.user_id = uic.uid AND la.alert_type = 'W'
  WHERE uic.inactive_days < 3
    AND NOT uic.has_achiever_badge
    AND uic.week_minutes < 120 -- Less than 2 hours logged in past week
    AND (la.last_sent IS NULL OR la.last_sent < (NOW() - INTERVAL '4 days'))

  ORDER BY
    CASE alert_type
      WHEN 'A' THEN 1
      WHEN 'D' THEN 2
      WHEN 'I' THEN 3
      WHEN 'W' THEN 4
      ELSE 5
    END,
    consecutive_inactive_days DESC;
END;
$$;


-- ------------------------------------------------------------
-- 3. LOG ALERT RESULT RPC: rpc_admin_log_alert_result
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.rpc_admin_log_alert_result(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT) CASCADE;
CREATE OR REPLACE FUNCTION public.rpc_admin_log_alert_result(
  p_user_id UUID,
  p_user_name TEXT,
  p_user_email TEXT,
  p_alert_type TEXT,
  p_status TEXT,
  p_consecutive_days INTEGER DEFAULT 0,
  p_reason TEXT DEFAULT '',
  p_error_message TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_new_id UUID;
BEGIN
  INSERT INTO public.user_alerts (
    user_id,
    user_name,
    user_email,
    alert_type,
    status,
    consecutive_inactive_days,
    reason,
    error_message,
    sent_at
  )
  VALUES (
    p_user_id,
    p_user_name,
    p_user_email,
    p_alert_type,
    p_status,
    p_consecutive_days,
    p_reason,
    p_error_message,
    CASE WHEN p_status = 'sent' THEN NOW() ELSE NULL END
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;


-- ------------------------------------------------------------
-- 4. GET ALERT HISTORY RPC: rpc_admin_get_alert_history
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.rpc_admin_get_alert_history(INTEGER) CASCADE;
CREATE OR REPLACE FUNCTION public.rpc_admin_get_alert_history(p_limit INTEGER DEFAULT 50)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  user_name TEXT,
  user_email TEXT,
  alert_type TEXT,
  status TEXT,
  consecutive_inactive_days INTEGER,
  reason TEXT,
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ua.id,
    ua.user_id,
    ua.user_name,
    ua.user_email,
    ua.alert_type,
    ua.status,
    ua.consecutive_inactive_days,
    ua.reason,
    ua.error_message,
    ua.sent_at,
    ua.created_at
  FROM public.user_alerts ua
  ORDER BY ua.created_at DESC
  LIMIT p_limit;
END;
$$;
