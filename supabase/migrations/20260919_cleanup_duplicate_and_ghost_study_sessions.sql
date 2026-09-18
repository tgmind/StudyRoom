-- ==============================================================================
-- CLEANUP MIGRATION: Purge Zero-Minute Ghost Sessions Only
-- Version: 2 (Safe Rewrite — replaces original minute-partition dedup logic)
--
-- ROOT CAUSE OF PRIOR DATA LOSS:
--   The original version used DATE_TRUNC('minute', start_time) as a partition
--   key to detect "duplicate" sessions. This was fatally flawed:
--   Any two legitimate sessions for the same user starting within the same
--   clock minute were treated as duplicates, causing one to be deleted even
--   if it contained completed goals. This caused irreversible data loss on
--   the production database (session with "Bug Fixing" goal was deleted).
--
-- THIS REWRITE:
--   1. ONLY deletes sessions that are unambiguously ghost records:
--      - duration_minutes = 0
--      - break_minutes = 0
--      - completed_tasks is empty or NULL
--      - split_part IS NULL (not a legitimate midnight-split fragment)
--      These sessions have zero historical or analytical value.
--   2. NEVER uses time-window partitioning to detect "duplicates" on the server.
--      Server-side deduplication belongs in the client (localStorage) layer only.
--   3. Cleans orphaned pending_goal_session_id references in users table.
--
-- SAFE-BY-DESIGN RULES (applied to every future cleanup migration):
--   - Always preview with SELECT before DELETE.
--   - Never partition by time window coarser than the session start_time itself.
--   - Never delete a session that has completed_tasks.
--   - Never delete a session that has a sibling_session_id (midnight split).
--   - Wrap every DELETE in a RETURNING clause to audit what was removed.
-- ==============================================================================

DO $$
DECLARE
  v_ghost_count INTEGER := 0;
  rec RECORD;
BEGIN
  RAISE NOTICE '=== study_sessions ghost purge starting ===';

  -- PREVIEW: Log what would be deleted before committing
  RAISE NOTICE 'Ghost sessions that will be deleted (0 min, 0 break, 0 tasks, no split):';
  FOR rec IN
    SELECT id, user_id, start_time, end_time, duration_minutes
    FROM public.study_sessions
    WHERE duration_minutes = 0
      AND break_minutes = 0
      AND (completed_tasks IS NULL OR jsonb_array_length(completed_tasks) = 0)
      AND split_part IS NULL
      AND sibling_session_id IS NULL
    ORDER BY start_time DESC
    LIMIT 100
  LOOP
    RAISE NOTICE '  → id=% user=% start=%', rec.id, rec.user_id, rec.start_time;
  END LOOP;

  -- Purge 0-minute ghost sessions that have:
  --   • 0 duration_minutes (no study recorded)
  --   • 0 break_minutes    (no break recorded)
  --   • empty/null completed_tasks (no goals linked)
  --   • split_part IS NULL (not a midnight split fragment)
  --   • sibling_session_id IS NULL (not linked to a sibling session)
  WITH deleted_ghosts AS (
    DELETE FROM public.study_sessions
    WHERE duration_minutes = 0
      AND break_minutes = 0
      AND (completed_tasks IS NULL OR jsonb_array_length(completed_tasks) = 0)
      AND split_part IS NULL
      AND sibling_session_id IS NULL
    RETURNING id
  )
  SELECT COUNT(*) INTO v_ghost_count FROM deleted_ghosts;

  RAISE NOTICE 'Purged % zero-minute ghost session(s).', v_ghost_count;

  -- Clean orphaned pending_goal_session_id references (sessions that no longer exist)
  UPDATE public.users u
  SET pending_goal_session_id = NULL,
      pending_goal_seconds = NULL,
      pending_goal_reason = NULL
  WHERE pending_goal_session_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.study_sessions s WHERE s.id = u.pending_goal_session_id
    );

  RAISE NOTICE '=== Cleanup complete. ===';
END $$;
