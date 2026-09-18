-- Migration: 20260919_add_rivalry_mode_to_rivalry_events.sql
-- Adds rivalry_mode to public.rivalry_events to distinguish STUDY_TIME vs RANK_CLASH resolutions

ALTER TABLE public.rivalry_events ADD COLUMN IF NOT EXISTS rivalry_mode TEXT DEFAULT 'STUDY_TIME';

-- Ensure constraint is added safely
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_rivalry_events_mode'
  ) THEN
    ALTER TABLE public.rivalry_events ADD CONSTRAINT chk_rivalry_events_mode CHECK (rivalry_mode IN ('STUDY_TIME', 'RANK_CLASH'));
  END IF;
END $$;

-- Populate default for any NULL values
UPDATE public.rivalry_events
SET rivalry_mode = 'STUDY_TIME'
WHERE rivalry_mode IS NULL;
