-- Migration: 20260918_upgrade_rivalry_events.sql
-- Upgrades public.rivalry_events for Rivalry Arena 2.0 with authoritative resolution fields,
-- participant arrays, structured final standings, and performance indexes.

-- 1. Create table if it doesn't exist yet (fresh install safe)
CREATE TABLE IF NOT EXISTS public.rivalry_events (
  id TEXT PRIMARY KEY,
  resolution_id TEXT,
  rivalry_id TEXT,
  winner_id UUID,
  winner_name TEXT NOT NULL,
  loser_id UUID,
  loser_name TEXT NOT NULL,
  participant_ids UUID[],
  final_standings JSONB DEFAULT '[]'::JSONB,
  resolution_type TEXT DEFAULT 'WON',
  occurred_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Full replica identity for realtime subscription payloads
ALTER TABLE public.rivalry_events REPLICA IDENTITY FULL;

-- 2. Upgrade columns idempotently if migrating from legacy schema
DO $$
BEGIN
  -- Add resolution_id if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'rivalry_events' AND column_name = 'resolution_id'
  ) THEN
    ALTER TABLE public.rivalry_events ADD COLUMN resolution_id TEXT;
  END IF;

  -- Add rivalry_id if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'rivalry_events' AND column_name = 'rivalry_id'
  ) THEN
    ALTER TABLE public.rivalry_events ADD COLUMN rivalry_id TEXT;
  END IF;

  -- Add winner_id if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'rivalry_events' AND column_name = 'winner_id'
  ) THEN
    ALTER TABLE public.rivalry_events ADD COLUMN winner_id UUID;
  END IF;

  -- Add loser_id if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'rivalry_events' AND column_name = 'loser_id'
  ) THEN
    ALTER TABLE public.rivalry_events ADD COLUMN loser_id UUID;
  END IF;

  -- Add participant_ids if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'rivalry_events' AND column_name = 'participant_ids'
  ) THEN
    ALTER TABLE public.rivalry_events ADD COLUMN participant_ids UUID[];
  END IF;

  -- Add final_standings JSONB if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'rivalry_events' AND column_name = 'final_standings'
  ) THEN
    ALTER TABLE public.rivalry_events ADD COLUMN final_standings JSONB DEFAULT '[]'::JSONB;
  END IF;

  -- Add resolution_type if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'rivalry_events' AND column_name = 'resolution_type'
  ) THEN
    ALTER TABLE public.rivalry_events ADD COLUMN resolution_type TEXT DEFAULT 'WON';
  END IF;

  -- Add occurred_at if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'rivalry_events' AND column_name = 'occurred_at'
  ) THEN
    ALTER TABLE public.rivalry_events ADD COLUMN occurred_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

-- Populate resolution_id for legacy rows where resolution_id is null
UPDATE public.rivalry_events
SET resolution_id = id
WHERE resolution_id IS NULL;

-- Populate occurred_at for legacy rows where occurred_at is null
UPDATE public.rivalry_events
SET occurred_at = created_at
WHERE occurred_at IS NULL;

-- Performance and deduplication indexes
CREATE INDEX IF NOT EXISTS idx_rivalry_events_occurred_at ON public.rivalry_events(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_rivalry_events_created_at ON public.rivalry_events(created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rivalry_events_resolution_id_unique ON public.rivalry_events(resolution_id);

-- Hardened RLS: only authenticated room participants can record legitimate resolutions
ALTER TABLE public.rivalry_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public select rivalry_events" ON public.rivalry_events;
CREATE POLICY "Public select rivalry_events"
  ON public.rivalry_events FOR SELECT
  TO authenticated, anon
  USING (true);

DROP POLICY IF EXISTS "Public insert rivalry_events" ON public.rivalry_events;
DROP POLICY IF EXISTS "Authenticated insert rivalry_events" ON public.rivalry_events;
CREATE POLICY "Authenticated insert rivalry_events"
  ON public.rivalry_events FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL AND (
      auth.uid() = winner_id
      OR (participant_ids IS NOT NULL AND auth.uid() = ANY(participant_ids))
    )
  );

-- Ensure Realtime publication includes rivalry_events
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'rivalry_events' AND schemaname = 'public'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.rivalry_events;
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;
