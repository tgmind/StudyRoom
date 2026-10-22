-- =============================================================================
-- Migration: 20261021_ensure_data_api_grants_and_default_privileges.sql
-- Purpose:
--   1. Future-proof all existing and new public tables against the October 30 
--      Supabase breaking change (Discontinuation of auto Data API grants).
--   2. Explicitly grant required table privileges to `anon`, `authenticated`,
--      and `service_role` on all 18 existing tables in the `public` schema.
--   3. Re-assert default privileges (`ALTER DEFAULT PRIVILEGES`) for role postgres
--      and schema public so any future table created automatically inherits
--      Data API access for authenticated and service_role.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. PUBLIC-READABLE & COLLABORATIVE CORE TABLES
--    (Protected by Row-Level Security; accessible to anon and authenticated)
-- -----------------------------------------------------------------------------

-- public.users: Read profiles publicly, insert/update own profile
GRANT SELECT ON TABLE public.users TO anon, authenticated, service_role;
GRANT INSERT, UPDATE ON TABLE public.users TO authenticated, service_role;
GRANT DELETE ON TABLE public.users TO service_role;

-- public.study_sessions: Read for live leaderboard, insert/update own session
GRANT SELECT ON TABLE public.study_sessions TO anon, authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON TABLE public.study_sessions TO authenticated, service_role;

-- public.rivalry_events: Read public rivalry notifications, insert own events
GRANT SELECT ON TABLE public.rivalry_events TO anon, authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON TABLE public.rivalry_events TO authenticated, service_role;

-- public.social_community_links: Read active links publicly, admin RPC/server updates
GRANT SELECT ON TABLE public.social_community_links TO anon, authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON TABLE public.social_community_links TO authenticated, service_role;

-- public.public_website_content: Read public landing page copy, admin edits
GRANT SELECT ON TABLE public.public_website_content TO anon, authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON TABLE public.public_website_content TO authenticated, service_role;


-- -----------------------------------------------------------------------------
-- 2. AUTHENTICATED USER TABLES (RLS ENFORCED)
--    (Strictly authenticated members + backend service_role)
-- -----------------------------------------------------------------------------

-- public.daily_goals: User daily study targets and task checklist
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.daily_goals TO authenticated, service_role;

-- public.session_blocks: Fine-grained intervals of study/breaks within a session
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.session_blocks TO authenticated, service_role;

-- public.exam_plans: User exam roadmap, milestones, and syllabus schedule
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.exam_plans TO authenticated, service_role;

-- public.preparation_slots: Individual study slots assigned to exam plans
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.preparation_slots TO authenticated, service_role;

-- public.user_alerts: In-app nudges, break expiries, and admin warnings
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_alerts TO authenticated, service_role;

-- Weekly analytics & snapshot records
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.weekly_achiever_snapshots TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.weekly_global_analytics_snapshots TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.weekly_user_analytics_records TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_analytics_acknowledgements TO authenticated, service_role;


-- -----------------------------------------------------------------------------
-- 3. SECURITY-CRITICAL ENROLLMENT GATE TABLES
--    (Direct client access revoked; accessed solely via SECURITY DEFINER RPCs & service_role)
-- -----------------------------------------------------------------------------

REVOKE ALL ON TABLE public.enrollment_grants FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.enrollment_grants TO service_role;

REVOKE ALL ON TABLE public.public_payment_submissions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.public_payment_submissions TO service_role;

REVOKE ALL ON TABLE public.public_coupons FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.public_coupons TO service_role;

REVOKE ALL ON TABLE public.public_referral_enrollments FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.public_referral_enrollments TO service_role;


-- -----------------------------------------------------------------------------
-- 4. SEQUENCES
-- -----------------------------------------------------------------------------

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;


-- -----------------------------------------------------------------------------
-- 5. DEFAULT PRIVILEGES FOR ALL FUTURE TABLES & SEQUENCES
--    (Guarantees that tables created in future migrations automatically
--     receive authenticated and service_role grants without manual effort)
-- -----------------------------------------------------------------------------

-- Future tables created in schema public
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated, service_role;

-- Future sequences created in schema public
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO authenticated, service_role;

COMMIT;
