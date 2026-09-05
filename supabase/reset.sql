-- ============================================================
-- STUDYROOM — FULL FACTORY RESET SCRIPT (100% ERASE)
-- ============================================================
-- File: supabase/reset.sql
-- Description:
--   Completely deletes ALL data, user accounts, profiles,
--   daily goals, study sessions, and session blocks,
--   and prepares the storage bucket for avatar file purging.
--   Resets the entire database to a 100% clean factory slate.
-- Usage: Run this script directly in the Supabase SQL Editor.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. DELETE ALL APPLICATION DATA (SESSIONS, BLOCKS, GOALS)
-- ------------------------------------------------------------
DROP TABLE IF EXISTS public.push_subscriptions CASCADE;
DELETE FROM public.session_blocks;
DELETE FROM public.study_sessions;
DELETE FROM public.daily_goals;

-- ------------------------------------------------------------
-- 2. DELETE ALL PUBLIC USER PROFILES
-- ------------------------------------------------------------
DELETE FROM public.users;

-- ------------------------------------------------------------
-- 3. DELETE ALL AUTHENTICATED USERS (AUTH ACCOUNTS)
-- ------------------------------------------------------------
DELETE FROM auth.users;

-- ------------------------------------------------------------
-- 4. PURGE AVATAR FILES NOTICE
-- ------------------------------------------------------------
-- Supabase blocks direct SQL deletes on storage.objects.
-- After running this script, go to Supabase Dashboard → Storage → avatars bucket
-- and click "Empty bucket" to remove orphaned avatar files.

-- ------------------------------------------------------------
-- 5. ENSURE AVATARS STORAGE BUCKET & RLS POLICIES ARE READY
-- ------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  2097152, -- 2 MB limit in bytes
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Storage RLS Policies
DROP POLICY IF EXISTS "Public Avatar Read Access" ON storage.objects;
CREATE POLICY "Public Avatar Read Access"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "User Avatar Insert Access" ON storage.objects;
CREATE POLICY "User Avatar Insert Access"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "User Avatar Update Access" ON storage.objects;
CREATE POLICY "User Avatar Update Access"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars' AND
    (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'avatars' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "User Avatar Delete Access" ON storage.objects;
CREATE POLICY "User Avatar Delete Access"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- ------------------------------------------------------------
-- 6. ENSURE REALTIME REPLICATION FOR USERS, SESSIONS, AND GOALS
-- ------------------------------------------------------------
ALTER TABLE public.users REPLICA IDENTITY FULL;
ALTER TABLE public.study_sessions REPLICA IDENTITY FULL;
ALTER TABLE public.daily_goals REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'users' AND schemaname = 'public'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.users;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'study_sessions' AND schemaname = 'public'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.study_sessions;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'daily_goals' AND schemaname = 'public'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.daily_goals;
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

COMMIT;

-- ============================================================
-- VERIFICATION CHECK (ALL COUNTS SHOULD BE 0)
-- ============================================================
SELECT 
  (SELECT COUNT(*) FROM auth.users) AS auth_users_count,
  (SELECT COUNT(*) FROM public.users) AS public_profiles_count,
  (SELECT COUNT(*) FROM public.daily_goals) AS goals_count,
  (SELECT COUNT(*) FROM public.study_sessions) AS sessions_count,
  (SELECT COUNT(*) FROM public.session_blocks) AS blocks_count;
