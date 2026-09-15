-- ============================================================
-- Migration: 20260915_realtime_and_prune_deleted_users.sql
-- Description:
--   1. Prunes any orphaned users in public.users whose auth account was deleted.
--   2. Adds public.users and public.user_alerts to supabase_realtime publication.
--   3. Upgrades rpc_admin_delete_user to cascade deletion through all tables.
--   4. Upgrades rpc_admin_get_platform_members to strictly INNER JOIN auth.users.
--   5. Upgrades rpc_admin_scan_alert_candidates to strictly INNER JOIN auth.users.
--   6. Upgrades rpc_admin_sync_auth_emails to prune deleted user orphans on each sync.
-- ============================================================

-- 1. Prune existing orphaned records (users deleted from auth.users)
DELETE FROM public.study_sessions WHERE user_id NOT IN (SELECT id FROM auth.users);
DELETE FROM public.session_blocks WHERE user_id NOT IN (SELECT id FROM auth.users);
DELETE FROM public.daily_goals WHERE user_id NOT IN (SELECT id FROM auth.users);
DELETE FROM public.user_alerts WHERE user_id NOT IN (SELECT id FROM auth.users);
DELETE FROM public.users WHERE id NOT IN (SELECT id FROM auth.users);

-- 2. Ensure Realtime Publication includes public.users and public.user_alerts
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'users'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.users;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'user_alerts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_alerts;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;

-- 3. Upgrade rpc_admin_delete_user
DROP FUNCTION IF EXISTS public.rpc_admin_delete_user(TEXT, UUID) CASCADE;
DROP FUNCTION IF EXISTS public.rpc_admin_delete_user(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.rpc_admin_delete_user(TEXT) CASCADE;

CREATE OR REPLACE FUNCTION public.rpc_admin_delete_user(
  p_admin_email TEXT DEFAULT NULL,
  p_target_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_target_name TEXT;
BEGIN
  IF NOT public.check_is_admin() AND (p_admin_email IS NULL OR LOWER(TRIM(p_admin_email)) NOT IN ('studyaliveapp@gmail.com', 'sa@admin.tg')) THEN
    RAISE EXCEPTION 'Unauthorized: Caller is not an administrator';
  END IF;

  IF p_target_user_id IS NULL THEN
    RAISE EXCEPTION 'Target user ID is required';
  END IF;

  IF p_target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot delete the administrator account';
  END IF;

  SELECT display_name INTO v_target_name
  FROM public.users
  WHERE id = p_target_user_id;

  -- Explicitly clean up all dependent records across public schema
  DELETE FROM public.study_sessions WHERE user_id = p_target_user_id;
  DELETE FROM public.session_blocks WHERE user_id = p_target_user_id;
  DELETE FROM public.daily_goals WHERE user_id = p_target_user_id;
  DELETE FROM public.user_alerts WHERE user_id = p_target_user_id;
  DELETE FROM public.users WHERE id = p_target_user_id;

  -- Delete from auth.users
  DELETE FROM auth.users WHERE id = p_target_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'deleted_user_id', p_target_user_id,
    'deleted_user_name', COALESCE(v_target_name, 'Unknown')
  );
END;
$$;

-- 4. Upgrade rpc_admin_get_platform_members (Strictly existing auth users)
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
  INNER JOIN auth.users au ON au.id = u.id  -- Only authentic users that exist in auth.users
  LEFT JOIN study_calc sc ON sc.user_id = u.id
  WHERE COALESCE(u.is_admin, FALSE) = FALSE
  ORDER BY u.display_name ASC;
END;
$$;

-- 5. Upgrade rpc_admin_scan_alert_candidates (Strictly existing auth users)
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
  past_week_study_minutes BIGINT,
  total_alerts_sent INTEGER,
  alert_counts JSONB,
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
  WITH latest_session AS (
    SELECT
      ss.user_id,
      MAX(COALESCE(ss.end_time, ss.start_time)) AS max_session_time,
      COALESCE(SUM(ss.duration_minutes), 0)::BIGINT AS total_mins,
      COALESCE(SUM(CASE WHEN ss.start_time >= (NOW() - INTERVAL '7 days') THEN ss.duration_minutes ELSE 0 END), 0)::BIGINT AS week_mins
    FROM public.study_sessions ss
    GROUP BY ss.user_id
  ),
  user_activity AS (
    SELECT
      u.id AS uid,
      u.display_name,
      COALESCE(au.email, u.email)::TEXT AS authentic_email,
      u.has_achiever_badge,
      u.current_status,
      u.created_at,
      u.last_offline_at,
      u.total_alerts_sent,
      u.alert_counts,
      u.last_alert_sent_at,
      u.last_alert_type,
      ls.total_mins,
      ls.week_mins,
      GREATEST(
        ls.max_session_time,
        u.last_offline_at,
        u.created_at
      ) AS effective_last_active
    FROM public.users u
    INNER JOIN auth.users au ON au.id = u.id  -- Only authentic users that exist in auth.users
    LEFT JOIN latest_session ls ON ls.user_id = u.id
    WHERE COALESCE(u.is_admin, FALSE) = FALSE
  ),
  user_inactivity AS (
    SELECT
      ua.*,
      CASE
        WHEN ua.current_status IN ('studying', 'break') THEN 0
        ELSE GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - ua.effective_last_active)) / 86400)::INTEGER)
      END AS inactive_days
    FROM user_activity ua
  ),
  recent_alerts AS (
    SELECT
      ua_log.user_id,
      ua_log.alert_type,
      MAX(ua_log.sent_at) AS last_sent
    FROM public.user_alerts ua_log
    WHERE ua_log.status = 'sent'
    GROUP BY ua_log.user_id, ua_log.alert_type
  )
  -- 1. Achiever (Type A)
  SELECT
    ('A-' || ui.uid::TEXT) AS candidate_id,
    ui.uid AS user_id,
    ui.display_name AS user_name,
    ui.authentic_email AS user_email,
    'A'::TEXT AS alert_type,
    ui.inactive_days AS consecutive_inactive_days,
    'Active Achiever Title holder'::TEXT AS reason,
    ui.effective_last_active AS last_active_at,
    ra.last_sent AS last_alert_sent_at,
    ui.has_achiever_badge,
    COALESCE(ui.total_mins, 0) AS total_study_minutes,
    COALESCE(ui.week_mins, 0) AS past_week_study_minutes,
    COALESCE(ui.total_alerts_sent, 0) AS total_alerts_sent,
    COALESCE(ui.alert_counts, '{"A":0,"W":0,"I":0,"D":0}'::jsonb) AS alert_counts,
    ui.last_alert_type
  FROM user_inactivity ui
  LEFT JOIN recent_alerts ra ON ra.user_id = ui.uid AND ra.alert_type = 'A'
  WHERE ui.has_achiever_badge = TRUE
    AND ui.inactive_days < 3
    AND (ra.last_sent IS NULL OR ra.last_sent < NOW() - INTERVAL '7 days')

  UNION ALL

  -- 2. Deletion Warning / Desk Retention (Type D) (>= 5 days inactive)
  SELECT
    ('D-' || ui.uid::TEXT) AS candidate_id,
    ui.uid AS user_id,
    ui.display_name AS user_name,
    ui.authentic_email AS user_email,
    'D'::TEXT AS alert_type,
    ui.inactive_days AS consecutive_inactive_days,
    ('Inactive for ' || ui.inactive_days || ' consecutive days (Threshold: 5 days)')::TEXT AS reason,
    ui.effective_last_active AS last_active_at,
    ra.last_sent AS last_alert_sent_at,
    ui.has_achiever_badge,
    COALESCE(ui.total_mins, 0) AS total_study_minutes,
    COALESCE(ui.week_mins, 0) AS past_week_study_minutes,
    COALESCE(ui.total_alerts_sent, 0) AS total_alerts_sent,
    COALESCE(ui.alert_counts, '{"A":0,"W":0,"I":0,"D":0}'::jsonb) AS alert_counts,
    ui.last_alert_type
  FROM user_inactivity ui
  LEFT JOIN recent_alerts ra ON ra.user_id = ui.uid AND ra.alert_type = 'D'
  WHERE ui.current_status = 'offline'
    AND ui.inactive_days >= 5
    AND (ra.last_sent IS NULL OR ra.last_sent < NOW() - INTERVAL '3 days')

  UNION ALL

  -- 3. Inactive Warning (Type I) (3 or 4 days inactive)
  SELECT
    ('I-' || ui.uid::TEXT) AS candidate_id,
    ui.uid AS user_id,
    ui.display_name AS user_name,
    ui.authentic_email AS user_email,
    'I'::TEXT AS alert_type,
    ui.inactive_days AS consecutive_inactive_days,
    ('Inactive for ' || ui.inactive_days || ' consecutive days (Threshold: 3 days)')::TEXT AS reason,
    ui.effective_last_active AS last_active_at,
    ra.last_sent AS last_alert_sent_at,
    ui.has_achiever_badge,
    COALESCE(ui.total_mins, 0) AS total_study_minutes,
    COALESCE(ui.week_mins, 0) AS past_week_study_minutes,
    COALESCE(ui.total_alerts_sent, 0) AS total_alerts_sent,
    COALESCE(ui.alert_counts, '{"A":0,"W":0,"I":0,"D":0}'::jsonb) AS alert_counts,
    ui.last_alert_type
  FROM user_inactivity ui
  LEFT JOIN recent_alerts ra ON ra.user_id = ui.uid AND ra.alert_type = 'I'
  WHERE ui.current_status = 'offline'
    AND ui.inactive_days IN (3, 4)
    AND (ra.last_sent IS NULL OR ra.last_sent < NOW() - INTERVAL '3 days')

  ORDER BY alert_type ASC, consecutive_inactive_days DESC;
END;
$$;

-- 6. Upgrade rpc_admin_sync_auth_emails to also prune deleted users
DROP FUNCTION IF EXISTS public.rpc_admin_sync_auth_emails(TEXT) CASCADE;

CREATE OR REPLACE FUNCTION public.rpc_admin_sync_auth_emails(p_admin_email TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_updated_count INTEGER := 0;
  v_pruned_count INTEGER := 0;
BEGIN
  IF NOT public.check_is_admin() AND (p_admin_email IS NULL OR LOWER(TRIM(p_admin_email)) NOT IN ('studyaliveapp@gmail.com', 'sa@admin.tg')) THEN
    RAISE EXCEPTION 'Unauthorized: Caller is not an administrator';
  END IF;

  -- 1. Clean up orphaned records whose auth account was deleted
  WITH deleted_orphans AS (
    DELETE FROM public.users
    WHERE id NOT IN (SELECT id FROM auth.users)
    RETURNING id
  )
  SELECT COUNT(*) INTO v_pruned_count FROM deleted_orphans;

  -- Clean up child records for orphaned users
  DELETE FROM public.study_sessions WHERE user_id NOT IN (SELECT id FROM auth.users);
  DELETE FROM public.session_blocks WHERE user_id NOT IN (SELECT id FROM auth.users);
  DELETE FROM public.daily_goals WHERE user_id NOT IN (SELECT id FROM auth.users);
  DELETE FROM public.user_alerts WHERE user_id NOT IN (SELECT id FROM auth.users);

  -- 2. Sync real emails from auth.users into public.users
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
    'pruned_count', v_pruned_count,
    'message', format('Successfully synced %s emails and pruned %s deleted user records.', v_updated_count, v_pruned_count)
  );
END;
$$;
