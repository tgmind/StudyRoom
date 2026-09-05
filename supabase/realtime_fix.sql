-- ============================================================
-- StudyRoom: Realtime Global Presence & Live Sync Fix
-- Run this in Supabase SQL Editor to ensure zero dropped events
-- ============================================================

-- 1. Enable REPLICA IDENTITY FULL so PostgreSQL sends full updated row on UPDATE events
ALTER TABLE public.users REPLICA IDENTITY FULL;
ALTER TABLE public.study_sessions REPLICA IDENTITY FULL;
ALTER TABLE public.daily_goals REPLICA IDENTITY FULL;

-- 2. Ensure public.users, public.study_sessions, and public.daily_goals are part of supabase_realtime publication
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

-- 3. Update SELECT policy to allow both authenticated and anon roles for public profiles
-- This ensures Supabase Realtime never drops postgres_changes when a socket is initializing or refreshing tokens
DROP POLICY IF EXISTS "Users can view all member profiles" ON public.users;
CREATE POLICY "Users can view all member profiles"
  ON public.users FOR SELECT
  TO authenticated, anon
  USING (true);

-- Ensure public.study_sessions allows SELECT for authenticated and anon (used for live leaderboard & rivalry stats)
DROP POLICY IF EXISTS "Users can view all study sessions for leaderboard" ON public.study_sessions;
CREATE POLICY "Users can view all study sessions for leaderboard"
  ON public.study_sessions FOR SELECT
  TO authenticated, anon
  USING (true);

-- 4. Verify publication status
SELECT pubname, tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
