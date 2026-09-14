-- ============================================================
-- STUDYROOM — AUTHENTIC EMAILS SYNC & ALERT COUNTER RESET
-- File: supabase/migrations/20260914_real_auth_emails_and_reset.sql
-- ============================================================

-- ------------------------------------------------------------
-- 1. ADD EMAIL COLUMN TO public.users & BACKFILL FROM auth.users
-- ------------------------------------------------------------
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email TEXT;
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);

-- Backfill real signup emails directly from auth.users
UPDATE public.users u
SET email = au.email
FROM auth.users au
WHERE au.id = u.id
  AND au.email IS NOT NULL
  AND TRIM(au.email) <> ''
  AND (u.email IS NULL OR u.email <> au.email);

-- ------------------------------------------------------------
-- 2. AUTOMATE EMAIL SYNCHRONIZATION ON USER SIGNUP & UPDATE
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, display_name, avatar_url, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', SPLIT_PART(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url',
    NEW.email
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    display_name = COALESCE(public.users.display_name, EXCLUDED.display_name);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to sync email if user changes their email in Supabase Auth
CREATE OR REPLACE FUNCTION public.handle_user_email_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    UPDATE public.users SET email = NEW.email WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_updated_email ON auth.users;
CREATE TRIGGER on_auth_user_updated_email
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_user_email_change();

-- ------------------------------------------------------------
-- 3. CANDIDATE SCANNER RPC (Pulls Authentic Emails from auth.users)
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
  -- Strict administrator verification
  IF NOT public.check_is_admin() AND (p_admin_email IS NULL OR LOWER(TRIM(p_admin_email)) NOT IN ('studyaliveapp@gmail.com', 'sa@admin.tg')) THEN
    RAISE EXCEPTION 'Unauthorized: Caller is not an administrator';
  END IF;

  RETURN QUERY
  WITH user_activity AS (
    SELECT
      u.id AS uid,
      u.display_name,
      COALESCE(au.email, u.email)::TEXT AS email_addr,
      u.has_achiever_badge,
      u.current_status,
      COALESCE(
        (SELECT MAX(COALESCE(ss.end_time, ss.start_time)) FROM public.study_sessions ss WHERE ss.user_id = u.id),
        u.last_offline_at,
        u.created_at
      ) AS latest_active_time,
      COALESCE(
        (SELECT SUM(ss.duration_minutes) FROM public.study_sessions ss WHERE ss.user_id = u.id),
        0
      )::BIGINT AS total_minutes,
      COALESCE(
        (SELECT SUM(ss.duration_minutes) FROM public.study_sessions ss WHERE ss.user_id = u.id AND ss.start_time >= (NOW() - INTERVAL '7 days')),
        0
      )::BIGINT AS week_minutes
    FROM public.users u
    JOIN auth.users au ON au.id = u.id
    WHERE COALESCE(u.is_admin, FALSE) = FALSE
      AND COALESCE(au.email, u.email) IS NOT NULL
      AND TRIM(COALESCE(au.email, u.email)) <> ''
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
  -- 1. TYPE A: Achiever's Title 🏆 (Badge holders)
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
    AND uic.week_minutes < 120
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
-- 4. RPC: rpc_admin_get_platform_members (All Members with Auth Emails)
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.rpc_admin_get_platform_members(TEXT) CASCADE;
CREATE OR REPLACE FUNCTION public.rpc_admin_get_platform_members(p_admin_email TEXT DEFAULT NULL)
RETURNS TABLE (
  id UUID,
  display_name TEXT,
  email TEXT,
  avatar_url TEXT,
  current_status TEXT,
  has_achiever_badge BOOLEAN,
  last_offline_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  total_study_minutes BIGINT,
  past_week_study_minutes BIGINT,
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
  IF NOT public.check_is_admin() AND (p_admin_email IS NULL OR LOWER(TRIM(p_admin_email)) NOT IN ('studyaliveapp@gmail.com', 'sa@admin.tg')) THEN
    RAISE EXCEPTION 'Unauthorized: Caller is not an administrator';
  END IF;

  RETURN QUERY
  WITH study_calc AS (
    SELECT
      ss.user_id,
      COALESCE(SUM(ss.duration_minutes), 0)::BIGINT AS total_mins,
      COALESCE(SUM(CASE WHEN ss.start_time >= (NOW() - INTERVAL '7 days') THEN ss.duration_minutes ELSE 0 END), 0)::BIGINT AS week_mins
    FROM public.study_sessions ss
    GROUP BY ss.user_id
  )
  SELECT
    u.id,
    u.display_name,
    COALESCE(au.email, u.email)::TEXT AS email,
    u.avatar_url,
    u.current_status,
    u.has_achiever_badge,
    u.last_offline_at,
    u.created_at,
    COALESCE(sc.total_mins, 0) AS total_study_minutes,
    COALESCE(sc.week_mins, 0) AS past_week_study_minutes,
    COALESCE(u.total_alerts_sent, 0) AS total_alerts_sent,
    COALESCE(u.alert_counts, '{"A":0,"W":0,"I":0,"D":0}'::jsonb) AS alert_counts,
    u.last_alert_sent_at,
    u.last_alert_type
  FROM public.users u
  LEFT JOIN auth.users au ON au.id = u.id
  LEFT JOIN study_calc sc ON sc.user_id = u.id
  WHERE COALESCE(u.is_admin, FALSE) = FALSE
  ORDER BY u.display_name ASC;
END;
$$;

-- ------------------------------------------------------------
-- 5. RPC: rpc_admin_reset_alert_counts (Reset Alert History & Counters)
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.rpc_admin_reset_alert_counts(TEXT) CASCADE;
CREATE OR REPLACE FUNCTION public.rpc_admin_reset_alert_counts(p_admin_email TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF NOT public.check_is_admin() AND (p_admin_email IS NULL OR LOWER(TRIM(p_admin_email)) NOT IN ('studyaliveapp@gmail.com', 'sa@admin.tg')) THEN
    RAISE EXCEPTION 'Unauthorized: Caller is not an administrator';
  END IF;

  -- 1. Truncate/delete all user alert history
  DELETE FROM public.user_alerts;

  -- 2. Reset all per-user tracking counters on public.users
  UPDATE public.users
  SET total_alerts_sent = 0,
      alert_counts = '{"A":0,"W":0,"I":0,"D":0}'::jsonb,
      last_alert_sent_at = NULL,
      last_alert_type = NULL;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Alert counts and history have been successfully reset to 0.'
  );
END;
$$;

-- ------------------------------------------------------------
-- 6. ONE-TIME EXECUTION: RESET ALL ALERT COUNTS NOW
-- ------------------------------------------------------------
DELETE FROM public.user_alerts;

UPDATE public.users
SET total_alerts_sent = 0,
    alert_counts = '{"A":0,"W":0,"I":0,"D":0}'::jsonb,
    last_alert_sent_at = NULL,
    last_alert_type = NULL;

-- ------------------------------------------------------------
-- 7. RPC: rpc_admin_sync_auth_emails (Backfill/Sync from auth.users)
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.rpc_admin_sync_auth_emails(TEXT) CASCADE;
CREATE OR REPLACE FUNCTION public.rpc_admin_sync_auth_emails(p_admin_email TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_updated_count INTEGER := 0;
BEGIN
  IF NOT public.check_is_admin() AND (p_admin_email IS NULL OR LOWER(TRIM(p_admin_email)) NOT IN ('studyaliveapp@gmail.com', 'sa@admin.tg')) THEN
    RAISE EXCEPTION 'Unauthorized: Caller is not an administrator';
  END IF;

  WITH updated AS (
    UPDATE public.users u
    SET email = au.email
    FROM auth.users au
    WHERE au.id = u.id
      AND au.email IS NOT NULL
      AND TRIM(au.email) <> ''
      AND (u.email IS NULL OR u.email <> au.email)
    RETURNING u.id
  )
  SELECT COUNT(*) INTO v_updated_count FROM updated;

  RETURN jsonb_build_object(
    'success', true,
    'synced_count', v_updated_count,
    'message', format('Successfully synced %s user emails from auth.users.', v_updated_count)
  );
END;
$$;

-- ------------------------------------------------------------
-- 8. RPC: rpc_admin_update_user_email (Direct Email Update for Student)
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.rpc_admin_update_user_email(UUID, TEXT, TEXT) CASCADE;
CREATE OR REPLACE FUNCTION public.rpc_admin_update_user_email(
  p_user_id UUID,
  p_email TEXT,
  p_admin_email TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_clean_email TEXT;
BEGIN
  IF NOT public.check_is_admin() AND (p_admin_email IS NULL OR LOWER(TRIM(p_admin_email)) NOT IN ('studyaliveapp@gmail.com', 'sa@admin.tg')) THEN
    RAISE EXCEPTION 'Unauthorized: Caller is not an administrator';
  END IF;

  v_clean_email := LOWER(TRIM(p_email));
  IF v_clean_email IS NULL OR v_clean_email = '' OR POSITION('@' IN v_clean_email) = 0 THEN
    RAISE EXCEPTION 'Invalid email address provided';
  END IF;

  UPDATE public.users
  SET email = v_clean_email
  WHERE id = p_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', p_user_id,
    'email', v_clean_email,
    'message', 'User email updated successfully.'
  );
END;
$$;

