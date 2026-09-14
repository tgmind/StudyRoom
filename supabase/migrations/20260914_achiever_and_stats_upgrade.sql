-- ============================================================
-- STUDYROOM — MONDAY ACHIEVER AUTOMATION & ALERT STATS UPGRADE
-- File: supabase/migrations/20260914_achiever_and_stats_upgrade.sql
-- ============================================================

-- ------------------------------------------------------------
-- 1. PER-USER ALERT TRACKING COLUMNS ON public.users
-- ------------------------------------------------------------
ALTER TABLE public.users 
  ADD COLUMN IF NOT EXISTS total_alerts_sent INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS alert_counts JSONB NOT NULL DEFAULT '{"A":0,"W":0,"I":0,"D":0}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_alert_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_alert_type TEXT;

CREATE INDEX IF NOT EXISTS idx_users_total_alerts_sent ON public.users(total_alerts_sent);
CREATE INDEX IF NOT EXISTS idx_users_last_alert_sent_at ON public.users(last_alert_sent_at DESC);

-- ------------------------------------------------------------
-- 2. BACKFILL EXISTING SENT ALERTS INTO public.users
-- ------------------------------------------------------------
UPDATE public.users u
SET
  total_alerts_sent = COALESCE(sub.cnt, 0),
  alert_counts = COALESCE(sub.counts, '{"A":0,"W":0,"I":0,"D":0}'::jsonb),
  last_alert_sent_at = sub.max_sent,
  last_alert_type = sub.latest_type
FROM (
  SELECT
    ua.user_id,
    COUNT(*) FILTER (WHERE ua.status = 'sent')::INTEGER AS cnt,
    jsonb_build_object(
      'A', COUNT(*) FILTER (WHERE ua.status = 'sent' AND ua.alert_type = 'A'),
      'W', COUNT(*) FILTER (WHERE ua.status = 'sent' AND ua.alert_type = 'W'),
      'I', COUNT(*) FILTER (WHERE ua.status = 'sent' AND ua.alert_type = 'I'),
      'D', COUNT(*) FILTER (WHERE ua.status = 'sent' AND ua.alert_type = 'D')
    ) AS counts,
    MAX(ua.sent_at) AS max_sent,
    (ARRAY_AGG(ua.alert_type ORDER BY ua.sent_at DESC NULLS LAST))[1] AS latest_type
  FROM public.user_alerts ua
  WHERE ua.status = 'sent'
  GROUP BY ua.user_id
) sub
WHERE u.id = sub.user_id;

-- ------------------------------------------------------------
-- 3. UPGRADE rpc_admin_log_alert_result WITH AUTO-INCREMENT
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
  v_current_counts JSONB;
  v_type_count INTEGER;
BEGIN
  -- Insert into audit log
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

  -- If successfully sent, update user's aggregated alert counters
  IF p_status = 'sent' THEN
    PERFORM set_config('studyroom.internal_badge_update', 'true', true);

    SELECT COALESCE(alert_counts, '{"A":0,"W":0,"I":0,"D":0}'::jsonb)
    INTO v_current_counts
    FROM public.users
    WHERE id = p_user_id;

    IF v_current_counts IS NULL THEN
      v_current_counts := '{"A":0,"W":0,"I":0,"D":0}'::jsonb;
    END IF;

    v_type_count := COALESCE((v_current_counts->>p_alert_type)::INTEGER, 0) + 1;
    v_current_counts := jsonb_set(v_current_counts, ARRAY[p_alert_type], to_jsonb(v_type_count));

    UPDATE public.users
    SET
      total_alerts_sent = COALESCE(total_alerts_sent, 0) + 1,
      alert_counts = v_current_counts,
      last_alert_sent_at = NOW(),
      last_alert_type = p_alert_type
    WHERE id = p_user_id;
  END IF;

  RETURN v_new_id;
END;
$$;

-- ------------------------------------------------------------
-- 4. WEEKLY ACHIEVER STATUS RPC: rpc_get_current_weekly_achiever
-- Returns previous week's winner and whether Monday email was sent
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.rpc_get_current_weekly_achiever(TEXT) CASCADE;
CREATE OR REPLACE FUNCTION public.rpc_get_current_weekly_achiever(p_timezone TEXT DEFAULT 'Asia/Kolkata')
RETURNS TABLE (
  user_id UUID,
  display_name TEXT,
  email TEXT,
  has_achiever_badge BOOLEAN,
  week_start_iso TIMESTAMPTZ,
  already_sent_this_week BOOLEAN,
  last_sent_at TIMESTAMPTZ,
  total_alerts_sent INTEGER,
  alert_counts JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_tz TEXT := COALESCE(NULLIF(p_timezone, ''), 'Asia/Kolkata');
  v_current_monday TIMESTAMPTZ;
  v_achiever_id UUID;
  v_sent_count INTEGER := 0;
  v_last_sent TIMESTAMPTZ;
BEGIN
  -- Monday 00:00:00 of current week in app timezone
  v_current_monday := (DATE_TRUNC('week', NOW() AT TIME ZONE v_tz) AT TIME ZONE v_tz);

  -- 1. Check if an achiever is currently badged
  SELECT u.id INTO v_achiever_id
  FROM public.users u
  WHERE u.has_achiever_badge = TRUE
  LIMIT 1;

  -- 2. If no user has the badge, calculate it from previous week
  IF v_achiever_id IS NULL THEN
    v_achiever_id := public.rpc_calculate_weekly_achiever(v_tz);
  END IF;

  -- 3. Check if Type A congratulations email has already been sent since this Monday
  SELECT COUNT(*), MAX(ua.sent_at)
  INTO v_sent_count, v_last_sent
  FROM public.user_alerts ua
  WHERE ua.alert_type = 'A'
    AND ua.status = 'sent'
    AND ua.sent_at >= v_current_monday;

  -- 4. Return row with user details
  RETURN QUERY
  SELECT
    u.id AS user_id,
    u.display_name,
    au.email::TEXT AS email,
    u.has_achiever_badge,
    v_current_monday AS week_start_iso,
    (v_sent_count > 0) AS already_sent_this_week,
    v_last_sent AS last_sent_at,
    COALESCE(u.total_alerts_sent, 0) AS total_alerts_sent,
    COALESCE(u.alert_counts, '{"A":0,"W":0,"I":0,"D":0}'::jsonb) AS alert_counts
  FROM public.users u
  JOIN auth.users au ON au.id = u.id
  WHERE u.id = v_achiever_id;
END;
$$;

-- ------------------------------------------------------------
-- 5. RPC TO FETCH PER-USER ALERT TRACKING STATS
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.rpc_admin_get_user_alert_stats() CASCADE;
CREATE OR REPLACE FUNCTION public.rpc_admin_get_user_alert_stats()
RETURNS TABLE (
  user_id UUID,
  display_name TEXT,
  email TEXT,
  has_achiever_badge BOOLEAN,
  total_alerts_sent INTEGER,
  alert_counts JSONB,
  last_alert_sent_at TIMESTAMPTZ,
  last_alert_type TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT
    u.id AS user_id,
    u.display_name,
    au.email::TEXT AS email,
    u.has_achiever_badge,
    COALESCE(u.total_alerts_sent, 0) AS total_alerts_sent,
    COALESCE(u.alert_counts, '{"A":0,"W":0,"I":0,"D":0}'::jsonb) AS alert_counts,
    u.last_alert_sent_at,
    u.last_alert_type
  FROM public.users u
  JOIN auth.users au ON au.id = u.id
  WHERE COALESCE(u.is_admin, FALSE) = FALSE
  ORDER BY u.total_alerts_sent DESC, u.display_name ASC;
END;
$$;
