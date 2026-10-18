-- =============================================================================
-- Migration: 20261018_optimize_study_sessions_user_start_idx.sql
-- Purpose: Optimize user-scoped study session history and streak queries
-- Status: APPLIED & VERIFIED IN PRODUCTION (is_valid = t, is_ready = t)
-- Target Table: public.study_sessions
-- Target Queries:
--   - hooks/useStudyHistory.ts: WHERE user_id = $1 AND start_time >= $2 ORDER BY start_time DESC
--   - hooks/useUserStreak.ts:   WHERE user_id = $1 AND start_time >= $2 ORDER BY start_time DESC
-- =============================================================================

-- -----------------------------------------------------------------------------
-- OPERATIONAL ADVISORY & TRANSACTION WARNING:
-- 1. DO NOT RUN THIS SCRIPT INSIDE A TRANSACTION BLOCK (BEGIN ... COMMIT).
--    PostgreSQL error 25001: "CREATE INDEX CONCURRENTLY cannot run inside a transaction block".
-- 2. Many automated migration runners (including default Supabase CLI migration up)
--    wrap scripts in a transaction block.
-- 3. Execution Recommendation:
--    - Execute directly via the Supabase Dashboard SQL Editor (outside a transaction).
--    - OR execute via psql with AUTOCOMMIT on:
--      psql -h <host> -U postgres -d postgres -c "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_study_sessions_user_start ON public.study_sessions(user_id, start_time DESC);"
-- 4. Lock Impact:
--    - CONCURRENTLY acquires a SHARE UPDATE EXCLUSIVE lock.
--    - SELECT, INSERT, UPDATE, and DELETE operations on public.study_sessions remain
--      COMPLETELY UNBLOCKED during index build.
-- -----------------------------------------------------------------------------

-- PREFLIGHT CHECK:
-- Run this check before building the index to inspect existing indexes and row count:
/*
SELECT 
    schemaname, 
    tablename, 
    indexname, 
    indexdef 
FROM pg_indexes 
WHERE tablename = 'study_sessions';

SELECT count(*) AS total_study_sessions FROM public.study_sessions;
*/

-- FORWARD DDL:
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_study_sessions_user_start 
ON public.study_sessions(user_id, start_time DESC);

-- POST-EXECUTION VERIFICATION:
-- Verify that the index was built successfully and is marked VALID:
/*
SELECT 
    i.relname AS index_name,
    idx.indisvalid AS is_valid,
    idx.indisready AS is_ready
FROM pg_index idx
JOIN pg_class i ON i.oid = idx.indexrelid
JOIN pg_class t ON t.oid = idx.indrelid
WHERE t.relname = 'study_sessions' 
  AND i.relname = 'idx_study_sessions_user_start';
*/

-- -----------------------------------------------------------------------------
-- ROLLBACK SCRIPT:
-- In the event that index rollback or removal is required:
-- -----------------------------------------------------------------------------
/*
DROP INDEX CONCURRENTLY IF EXISTS public.idx_study_sessions_user_start;
*/
