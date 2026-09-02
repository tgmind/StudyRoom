-- ============================================================
-- StudyRoom: Realtime Global Presence & Live Sync Fix
-- Run this in Supabase SQL Editor to ensure zero dropped events
-- ============================================================

-- 1. Enable REPLICA IDENTITY FULL so PostgreSQL sends full updated row on UPDATE events
ALTER TABLE public.users REPLICA IDENTITY FULL;

-- 2. Ensure public.users is part of supabase_realtime publication
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

-- 3. Update SELECT policy to allow both authenticated and anon roles
-- This ensures Supabase Realtime never drops postgres_changes when a socket is initializing or refreshing tokens
DROP POLICY IF EXISTS "Users can view all member profiles" ON public.users;
CREATE POLICY "Users can view all member profiles"
  ON public.users FOR SELECT
  TO authenticated, anon
  USING (true);

-- 4. Verify publication status
SELECT pubname, tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
