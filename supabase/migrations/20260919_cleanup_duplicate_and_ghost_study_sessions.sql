-- ==============================================================================
-- CLEANUP MIGRATION: Deduplicate Overlapping Sessions & Purge Ghost Sessions
-- Description:
--   1. Safely re-links session_blocks and users.pending_goal_session_id from duplicate
--      sessions to the canonical session (the one with highest duration_minutes).
--   2. Deletes duplicate study_sessions that were created due to RPC errors / retries.
--   3. Purges 0-minute ghost sessions (0 duration, 0 break, 0 tasks) that have no
--      active or historical value.
--   4. NON-DESTRUCTIVE: Preserves all legitimate user study sessions, blocks, and tasks.
-- ==============================================================================

DO $$
DECLARE
  v_dup_count INTEGER := 0;
  v_ghost_count INTEGER := 0;
  rec RECORD;
BEGIN
  RAISE NOTICE 'Starting study_sessions deduplication and cleanup...';

  -- 1. Deduplicate study sessions for the same user with identical or near-identical start_time (within the same minute)
  FOR rec IN
    WITH ranked_sessions AS (
      SELECT
        s.id,
        s.user_id,
        s.start_time,
        s.duration_minutes,
        s.break_minutes,
        s.completed_tasks,
        ROW_NUMBER() OVER (
          PARTITION BY s.user_id, DATE_TRUNC('minute', s.start_time)
          ORDER BY 
            s.duration_minutes DESC,
            jsonb_array_length(COALESCE(s.completed_tasks, '[]'::jsonb)) DESC,
            s.created_at DESC,
            s.id DESC
        ) AS rank,
        FIRST_VALUE(s.id) OVER (
          PARTITION BY s.user_id, DATE_TRUNC('minute', s.start_time)
          ORDER BY 
            s.duration_minutes DESC,
            jsonb_array_length(COALESCE(s.completed_tasks, '[]'::jsonb)) DESC,
            s.created_at DESC,
            s.id DESC
        ) AS winner_id
      FROM public.study_sessions s
      WHERE s.split_part IS NULL -- Do not conflate midnight split sessions
    )
    SELECT id AS duplicate_id, winner_id, user_id
    FROM ranked_sessions
    WHERE rank > 1
  LOOP
    -- Re-link any session_blocks from the duplicate session to the winning session
    UPDATE public.session_blocks
    SET session_id = rec.winner_id
    WHERE session_id = rec.duplicate_id;

    -- Re-link any user pending goal references
    UPDATE public.users
    SET pending_goal_session_id = rec.winner_id
    WHERE pending_goal_session_id = rec.duplicate_id;

    -- Safely delete the duplicate session
    DELETE FROM public.study_sessions
    WHERE id = rec.duplicate_id;

    v_dup_count := v_dup_count + 1;
  END LOOP;

  RAISE NOTICE 'Deleted % duplicate study session records.', v_dup_count;

  -- 2. Purge 0-minute ghost sessions with 0 break and no completed tasks
  WITH deleted_ghosts AS (
    DELETE FROM public.study_sessions
    WHERE duration_minutes = 0
      AND break_minutes = 0
      AND (completed_tasks IS NULL OR jsonb_array_length(completed_tasks) = 0)
      AND split_part IS NULL
    RETURNING id
  )
  SELECT COUNT(*) INTO v_ghost_count FROM deleted_ghosts;

  RAISE NOTICE 'Purged % zero-minute ghost sessions.', v_ghost_count;

  -- 3. Clean any orphaned pending_goal_session_id references in users table
  UPDATE public.users u
  SET pending_goal_session_id = NULL
  WHERE pending_goal_session_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.study_sessions s WHERE s.id = u.pending_goal_session_id
    );

  RAISE NOTICE 'Cleanup complete successfully.';
END $$;
