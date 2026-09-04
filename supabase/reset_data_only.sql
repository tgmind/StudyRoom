-- ============================================================
-- STUDYROOM — RESET DATA ONLY SCRIPT (FRESH START LAUNCH)
-- ============================================================
-- File: supabase/reset_data_only.sql
-- Description:
--   Resets all study history, active sessions, blocks, goals, and badges
--   to launch the platform with a 100% clean slate, while PRESERVING
--   all signed-up user accounts, passwords, display names, profile
--   pictures (avatars), and administrator privileges.
--
-- What is PRESERVED:
--   ✓ auth.users (user accounts, emails, passwords, OAuth tokens)
--   ✓ public.users identities (id, display_name, avatar_url, is_admin, created_at)
--   ✓ storage.objects (all uploaded avatar images in 'avatars' bucket)
--
-- What is RESET:
--   ✗ public.session_blocks (all historical & active session blocks erased)
--   ✗ public.study_sessions (all historical study sessions erased)
--   ✗ public.daily_goals (all active and archived goals erased)
--   ✗ public.push_subscriptions (stale push endpoints cleared)
--   ✗ public.users live state (status -> 'offline', timers -> NULL, snapshots -> 0, badges -> false)
--
-- Usage: Run this entire script in Supabase Dashboard → SQL Editor.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. DELETE ALL ACTIVE & HISTORICAL SESSION DATA
-- ------------------------------------------------------------
DELETE FROM public.session_blocks;
DELETE FROM public.study_sessions;

-- ------------------------------------------------------------
-- 2. DELETE ALL DAILY GOALS
-- ------------------------------------------------------------
DELETE FROM public.daily_goals;

-- ------------------------------------------------------------
-- 3. RESET PUSH NOTIFICATION SUBSCRIPTIONS (IF TABLE EXISTS)
-- ------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.push_subscriptions') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.push_subscriptions';
  END IF;
END $$;

-- ------------------------------------------------------------
-- 4. RESET ALL MEMBER PROFILES TO CLEAN BASELINE OFFLINE STATE
-- ------------------------------------------------------------
-- Ensure optional tracking columns exist before resetting
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_offline_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_break_expired_study_seconds BIGINT DEFAULT NULL;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS break_warning_prompt_sent_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS three_hour_prompt_sent_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_offline_reminder_sent_at TIMESTAMPTZ DEFAULT NULL;

-- Enable internal badge update flag for this transaction so trigger
-- trg_prevent_badge_tampering allows resetting has_achiever_badge to false.
DO $$
BEGIN
  PERFORM set_config('studyroom.internal_badge_update', 'true', true);

  UPDATE public.users
  SET 
    current_status = 'offline',
    current_focus = NULL,
    session_start_time = NULL,
    last_resumed_at = NULL,
    break_started_at = NULL,
    active_study_seconds_snapshot = 0,
    has_achiever_badge = FALSE,
    three_hour_prompt_sent_at = NULL,
    last_offline_reminder_sent_at = NULL,
    break_warning_prompt_sent_at = NULL,
    last_break_expired_study_seconds = NULL,
    last_offline_at = NOW();
END $$;

-- ------------------------------------------------------------
-- 5. ENSURE REALTIME REPLICATION FOR USERS TABLE
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'users' AND schemaname = 'public'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.users;
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

COMMIT;

-- ============================================================
-- VERIFICATION REPORT
-- ============================================================
-- The counts below verify that user accounts & profiles remain intact,
-- all members are reset to offline, and all historical data is 0.
SELECT 
  (SELECT COUNT(*) FROM auth.users) AS preserved_auth_accounts,
  (SELECT COUNT(*) FROM public.users) AS preserved_member_profiles,
  (SELECT COUNT(*) FROM public.users WHERE avatar_url IS NOT NULL AND avatar_url <> '') AS preserved_avatars,
  (SELECT COUNT(*) FROM public.users WHERE current_status = 'offline') AS members_reset_offline,
  (SELECT COUNT(*) FROM public.users WHERE current_status <> 'offline') AS active_members_should_be_zero,
  (SELECT COUNT(*) FROM public.daily_goals) AS goals_count_should_be_zero,
  (SELECT COUNT(*) FROM public.study_sessions) AS sessions_count_should_be_zero,
  (SELECT COUNT(*) FROM public.session_blocks) AS blocks_count_should_be_zero,
  (CASE WHEN to_regclass('public.push_subscriptions') IS NOT NULL 
        THEN (SELECT COUNT(*) FROM public.push_subscriptions) 
        ELSE 0 END) AS subscriptions_should_be_zero;
