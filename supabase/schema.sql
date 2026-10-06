-- ============================================================
-- STUDYROOM — DATABASE INITIALIZATION SCHEMA
-- ============================================================
-- File: supabase/schema.sql
-- Description: Complete, idempotent database initialization for StudyRoom.
-- Executable against a fresh Supabase PostgreSQL database.

-- ------------------------------------------------------------
-- 1. EXTENSIONS & UTILITIES
-- ------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ------------------------------------------------------------
-- 2. USERS TABLE (Application Profiles)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  current_status TEXT NOT NULL DEFAULT 'offline' CHECK (current_status IN ('offline', 'studying', 'break')),
  current_focus TEXT,
  session_start_time TIMESTAMPTZ,
  last_resumed_at TIMESTAMPTZ,
  break_started_at TIMESTAMPTZ,
  active_study_seconds_snapshot INTEGER NOT NULL DEFAULT 0,
  has_achiever_badge BOOLEAN NOT NULL DEFAULT FALSE,
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  last_break_expired_study_seconds INTEGER DEFAULT NULL,
  pending_goal_session_id UUID REFERENCES public.study_sessions(id) ON DELETE SET NULL,
  pending_goal_seconds INTEGER DEFAULT NULL,
  pending_goal_reason TEXT DEFAULT NULL,
  last_offline_at TIMESTAMPTZ,
  state_version BIGINT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Idempotent column migrations for existing databases
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_resumed_at TIMESTAMPTZ;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS break_started_at TIMESTAMPTZ;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS active_study_seconds_snapshot INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_break_expired_study_seconds INTEGER DEFAULT NULL;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS pending_goal_session_id UUID REFERENCES public.study_sessions(id) ON DELETE SET NULL;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS pending_goal_seconds INTEGER DEFAULT NULL;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS pending_goal_reason TEXT DEFAULT NULL;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_offline_at TIMESTAMPTZ;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS state_version BIGINT NOT NULL DEFAULT 1;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Clean up legacy push notification artifacts if upgrading an existing database
ALTER TABLE public.users DROP COLUMN IF EXISTS three_hour_prompt_sent_at;
ALTER TABLE public.users DROP COLUMN IF EXISTS last_offline_reminder_sent_at;
ALTER TABLE public.users DROP COLUMN IF EXISTS break_warning_prompt_sent_at;
DROP TABLE IF EXISTS public.push_subscriptions CASCADE;

-- Ensure full replica identity for realtime update payloads
ALTER TABLE public.users REPLICA IDENTITY FULL;

-- Indexes for Users
CREATE INDEX IF NOT EXISTS idx_users_current_status ON public.users(current_status);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON public.users(created_at);
CREATE INDEX IF NOT EXISTS idx_users_is_admin ON public.users(is_admin) WHERE is_admin = TRUE;
CREATE INDEX IF NOT EXISTS idx_users_state_version ON public.users(state_version);
CREATE INDEX IF NOT EXISTS idx_users_updated_at ON public.users(updated_at);

-- Before update trigger to monotonically increment state_version and set updated_at
CREATE OR REPLACE FUNCTION public.trg_users_state_version()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  NEW.state_version = COALESCE(OLD.state_version, 0) + 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_state_version ON public.users;
CREATE TRIGGER trg_users_state_version
BEFORE UPDATE ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.trg_users_state_version();

-- Protect system fields from direct user update via trigger
CREATE OR REPLACE FUNCTION public.prevent_user_badge_tampering()
RETURNS TRIGGER AS $$
BEGIN
  -- Prevent ordinary users from altering has_achiever_badge directly unless invoked by SECURITY DEFINER function
  IF (OLD.has_achiever_badge IS DISTINCT FROM NEW.has_achiever_badge) AND (current_setting('role', true) <> 'service_role') THEN
    -- Check if setting badge via security definer RPC
    IF current_setting('studyroom.internal_badge_update', true) IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'has_achiever_badge cannot be updated directly';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_badge_tampering ON public.users;
CREATE TRIGGER trg_prevent_badge_tampering
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_user_badge_tampering();

-- Prevent unauthorized users from modifying is_admin
CREATE OR REPLACE FUNCTION public.prevent_admin_flag_tampering()
RETURNS TRIGGER AS $$
BEGIN
  IF (OLD.is_admin IS DISTINCT FROM NEW.is_admin) AND (current_setting('role', true) <> 'service_role') THEN
    IF current_setting('studyroom.internal_admin_update', true) IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'is_admin cannot be updated directly';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_admin_tampering ON public.users;
CREATE TRIGGER trg_prevent_admin_tampering
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_admin_flag_tampering();

-- Automatically sync new auth.users into public.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', SPLIT_PART(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ------------------------------------------------------------
-- 3. DAILY GOALS TABLE
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.daily_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  tasks JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '20 hours'),
  is_locked BOOLEAN NOT NULL DEFAULT TRUE,
  archived_at TIMESTAMPTZ
);

-- Indexes for Daily Goals
CREATE INDEX IF NOT EXISTS idx_daily_goals_user_id ON public.daily_goals(user_id);
CREATE INDEX IF NOT EXISTS idx_daily_goals_expires_at ON public.daily_goals(expires_at);
CREATE INDEX IF NOT EXISTS idx_daily_goals_user_active ON public.daily_goals(user_id, expires_at);

-- ------------------------------------------------------------
-- 4. STUDY SESSIONS TABLE
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.study_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes >= 0),
  break_minutes INTEGER NOT NULL DEFAULT 0,
  completed_tasks JSONB DEFAULT '[]'::JSONB
);

-- Idempotent column migrations for existing databases
ALTER TABLE public.study_sessions ADD COLUMN IF NOT EXISTS completed_tasks JSONB DEFAULT '[]'::JSONB;
ALTER TABLE public.study_sessions ADD COLUMN IF NOT EXISTS break_minutes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.study_sessions ADD COLUMN IF NOT EXISTS split_part INTEGER DEFAULT NULL;
ALTER TABLE public.study_sessions ADD COLUMN IF NOT EXISTS sibling_session_id UUID REFERENCES public.study_sessions(id) ON DELETE SET NULL;

-- Indexes for Study Sessions
CREATE INDEX IF NOT EXISTS idx_study_sessions_user_id ON public.study_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_study_sessions_start_time ON public.study_sessions(start_time);
CREATE INDEX IF NOT EXISTS idx_study_sessions_end_time ON public.study_sessions(end_time);
CREATE INDEX IF NOT EXISTS idx_study_sessions_sibling_id ON public.study_sessions(sibling_session_id);
CREATE INDEX IF NOT EXISTS idx_study_sessions_split_part ON public.study_sessions(split_part);

-- ------------------------------------------------------------
-- 5. SESSION BLOCKS TABLE (Active Study vs Break Tracking)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.session_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  session_id UUID REFERENCES public.study_sessions(id) ON DELETE CASCADE,
  block_type TEXT NOT NULL CHECK (block_type IN ('study', 'break')),
  start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_time TIMESTAMPTZ
);

-- Indexes for Session Blocks
CREATE INDEX IF NOT EXISTS idx_session_blocks_user_id ON public.session_blocks(user_id);
CREATE INDEX IF NOT EXISTS idx_session_blocks_session_id ON public.session_blocks(session_id);
CREATE INDEX IF NOT EXISTS idx_session_blocks_type ON public.session_blocks(block_type);
CREATE INDEX IF NOT EXISTS idx_session_blocks_active_user ON public.session_blocks(user_id) WHERE session_id IS NULL;

-- ------------------------------------------------------------
-- 6. ROW LEVEL SECURITY (RLS)
-- ------------------------------------------------------------
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_blocks ENABLE ROW LEVEL SECURITY;

-- RLS Policies for public.users
DROP POLICY IF EXISTS "Users can view all member profiles" ON public.users;
CREATE POLICY "Users can view all member profiles"
  ON public.users FOR SELECT
  TO authenticated, anon
  USING (true);

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.users;
CREATE POLICY "Users can insert their own profile"
  ON public.users FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.users;
CREATE POLICY "Users can update their own profile"
  ON public.users FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- RLS Policies for public.daily_goals
DROP POLICY IF EXISTS "Users can view their own goals" ON public.daily_goals;
CREATE POLICY "Users can view their own goals"
  ON public.daily_goals FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own goals" ON public.daily_goals;
CREATE POLICY "Users can insert their own goals"
  ON public.daily_goals FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own goals" ON public.daily_goals;
CREATE POLICY "Users can update their own goals"
  ON public.daily_goals FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- RLS Policies for public.study_sessions
DROP POLICY IF EXISTS "Users can view all study sessions for leaderboard" ON public.study_sessions;
CREATE POLICY "Users can view all study sessions for leaderboard"
  ON public.study_sessions FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Users can insert their own study sessions" ON public.study_sessions;
CREATE POLICY "Users can insert their own study sessions"
  ON public.study_sessions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own study sessions" ON public.study_sessions;
CREATE POLICY "Users can delete their own study sessions"
  ON public.study_sessions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- RLS Policies for public.session_blocks
DROP POLICY IF EXISTS "Users can view their own session blocks" ON public.session_blocks;
CREATE POLICY "Users can view their own session blocks"
  ON public.session_blocks FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own session blocks" ON public.session_blocks;
CREATE POLICY "Users can insert their own session blocks"
  ON public.session_blocks FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own session blocks" ON public.session_blocks;
CREATE POLICY "Users can update their own session blocks"
  ON public.session_blocks FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ------------------------------------------------------------
-- 7. AUTHORITATIVE SESSION MANAGEMENT RPCs
-- ------------------------------------------------------------

-- Cleanly drop legacy RPC signatures so PostgreSQL accepts updated return types (RETURNS TABLE)
-- and parameter overloads without throwing ERROR 42P13 ("cannot change return type of existing function")
DO $$
DECLARE
  f RECORD;
BEGIN
  FOR f IN (
    SELECT p.oid::regprocedure AS func_signature
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'rpc_get_study_history',
        'rpc_get_leaderboard',
        'rpc_admin_get_all_users',
        'rpc_admin_get_platform_stats',
        'rpc_start_session',
        'rpc_pause_session',
        'rpc_resume_session',
        'rpc_finish_session',
        'rpc_terminate_expired_break',
        'rpc_create_daily_goal',
        'rpc_add_goal_tasks',
        'rpc_clear_study_history',
        'rpc_calculate_weekly_achiever',
        'check_is_admin',
        'rpc_admin_rename_user',
        'rpc_admin_delete_user',
        'rpc_admin_force_end_session',
        'rpc_stop_user_session',
        'rpc_complete_session_goals',
        'rpc_acknowledge_break_expiry',
        'rpc_cleanup_expired_breaks'
      )
  ) LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || f.func_signature || ' RESTRICT;';
  END LOOP;
END;
$$;

-- RPC: Start Session
CREATE OR REPLACE FUNCTION public.rpc_start_session(p_focus TEXT DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_status TEXT;
  v_trimmed_focus TEXT;
  v_now TIMESTAMPTZ := NOW();
  v_block_id UUID;
  v_version BIGINT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Strict row-level lock
  SELECT current_status, state_version INTO v_status, v_version
  FROM public.users
  WHERE id = v_user_id
  FOR UPDATE;

  -- Idempotent check: if already studying, return current state without error
  IF v_status = 'studying' THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_active', true,
      'status', 'studying',
      'state_version', v_version,
      'server_now', v_now
    );
  END IF;

  v_trimmed_focus := NULLIF(TRIM(p_focus), '');
  IF v_trimmed_focus IS NOT NULL AND LENGTH(v_trimmed_focus) > 60 THEN
    v_trimmed_focus := SUBSTRING(v_trimmed_focus FROM 1 FOR 60);
  END IF;

  -- Close any orphaned session blocks for this user
  UPDATE public.session_blocks
  SET end_time = v_now
  WHERE user_id = v_user_id AND end_time IS NULL;

  -- Update user status with active resume timestamp
  UPDATE public.users
  SET current_status = 'studying',
      current_focus = v_trimmed_focus,
      session_start_time = v_now,
      last_resumed_at = v_now,
      break_started_at = NULL,
      active_study_seconds_snapshot = 0,
      last_break_expired_study_seconds = NULL
  WHERE id = v_user_id
  RETURNING state_version INTO v_version;

  -- Create active study block
  INSERT INTO public.session_blocks (user_id, block_type, start_time)
  VALUES (v_user_id, 'study', v_now)
  RETURNING id INTO v_block_id;

  RETURN jsonb_build_object(
    'success', true,
    'status', 'studying',
    'focus', v_trimmed_focus,
    'session_start_time', v_now,
    'last_resumed_at', v_now,
    'active_study_seconds_snapshot', 0,
    'block_id', v_block_id,
    'state_version', v_version,
    'server_now', v_now
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC: Pause Session
DROP FUNCTION IF EXISTS public.rpc_pause_session() CASCADE;
DROP FUNCTION IF EXISTS public.rpc_pause_session(TIMESTAMPTZ, INTEGER) CASCADE;

CREATE OR REPLACE FUNCTION public.rpc_pause_session(
  p_paused_at TIMESTAMPTZ DEFAULT NULL,
  p_elapsed_study_seconds INTEGER DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_status TEXT;
  v_break_started_at TIMESTAMPTZ;
  v_now TIMESTAMPTZ := COALESCE(p_paused_at, NOW());
  v_total_study_seconds INTEGER := 0;
  v_version BIGINT;
  v_snapshot INTEGER;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT current_status, break_started_at, active_study_seconds_snapshot, state_version
  INTO v_status, v_break_started_at, v_snapshot, v_version
  FROM public.users
  WHERE id = v_user_id
  FOR UPDATE;

  -- Idempotency check: if already paused on break, return safe success
  IF v_status = 'break' THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_paused', true,
      'status', 'break',
      'break_started_at', v_break_started_at,
      'active_study_seconds_snapshot', v_snapshot,
      'state_version', v_version,
      'server_now', v_now
    );
  END IF;

  IF v_status <> 'studying' THEN
    RAISE EXCEPTION 'User is not currently studying';
  END IF;

  -- Close current active study block
  UPDATE public.session_blocks
  SET end_time = v_now
  WHERE user_id = v_user_id AND block_type = 'study' AND end_time IS NULL;

  -- Open break block
  INSERT INTO public.session_blocks (user_id, block_type, start_time)
  VALUES (v_user_id, 'break', v_now);

  -- Calculate total active study seconds from study blocks so far (excluding breaks)
  SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(end_time, v_now) - start_time))), 0)::INTEGER
  INTO v_total_study_seconds
  FROM public.session_blocks
  WHERE user_id = v_user_id
    AND block_type = 'study'
    AND session_id IS NULL;

  IF p_elapsed_study_seconds IS NOT NULL AND p_elapsed_study_seconds > v_total_study_seconds THEN
    v_total_study_seconds := p_elapsed_study_seconds;
  END IF;

  -- Update user status with frozen active study seconds snapshot and break start timestamp
  UPDATE public.users
  SET current_status = 'break',
      last_resumed_at = NULL,
      break_started_at = v_now,
      active_study_seconds_snapshot = v_total_study_seconds
  WHERE id = v_user_id
  RETURNING state_version INTO v_version;

  RETURN jsonb_build_object(
    'success', true,
    'status', 'break',
    'paused_at', v_now,
    'break_started_at', v_now,
    'active_study_seconds_snapshot', v_total_study_seconds,
    'state_version', v_version,
    'server_now', v_now
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC: Resume Session (with 1-hour break timeout protection)
DROP FUNCTION IF EXISTS public.rpc_resume_session() CASCADE;
DROP FUNCTION IF EXISTS public.rpc_resume_session(TIMESTAMPTZ) CASCADE;

CREATE OR REPLACE FUNCTION public.rpc_resume_session(
  p_resumed_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_status TEXT;
  v_break_started_at TIMESTAMPTZ;
  v_now TIMESTAMPTZ := COALESCE(p_resumed_at, NOW());
  v_total_study_seconds INTEGER := 0;
  v_version BIGINT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT current_status, break_started_at, state_version
  INTO v_status, v_break_started_at, v_version
  FROM public.users
  WHERE id = v_user_id
  FOR UPDATE;

  -- Idempotency check: if already resumed (studying), return safe success
  IF v_status = 'studying' THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_resumed', true,
      'status', 'studying',
      'state_version', v_version,
      'server_now', v_now
    );
  END IF;

  IF v_status <> 'break' THEN
    RAISE EXCEPTION 'User is not currently on break';
  END IF;

  -- 1-HOUR BREAK EXPIRY ENFORCEMENT:
  -- If break exceeded 1 hour (3600 seconds), end session and save only study time before break
  IF v_break_started_at IS NOT NULL AND EXTRACT(EPOCH FROM (v_now - v_break_started_at)) >= 3600 THEN
    SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(end_time, v_now) - start_time))), 0)::INTEGER
    INTO v_total_study_seconds
    FROM public.session_blocks
    WHERE user_id = v_user_id AND block_type = 'study' AND session_id IS NULL;

    PERFORM public.rpc_finish_session(ARRAY[]::TEXT[], 'break_expired');

    UPDATE public.users
    SET last_break_expired_study_seconds = v_total_study_seconds
    WHERE id = v_user_id
    RETURNING state_version INTO v_version;

    RETURN jsonb_build_object(
      'success', false,
      'error', 'break_expired',
      'message', 'You stayed on break for more than 1 hour. Session has been stopped. Start a new session.',
      'state_version', v_version,
      'server_now', v_now
    );
  END IF;

  -- Close current active break block
  UPDATE public.session_blocks
  SET end_time = v_now
  WHERE user_id = v_user_id AND block_type = 'break' AND end_time IS NULL;

  -- Open new study block
  INSERT INTO public.session_blocks (user_id, block_type, start_time)
  VALUES (v_user_id, 'study', v_now);

  -- Update user status with new resume timestamp
  UPDATE public.users
  SET current_status = 'studying',
      last_resumed_at = v_now,
      break_started_at = NULL,
      last_break_expired_study_seconds = NULL
  WHERE id = v_user_id
  RETURNING state_version INTO v_version;

  RETURN jsonb_build_object(
    'success', true,
    'status', 'studying',
    'resumed_at', v_now,
    'state_version', v_version,
    'server_now', v_now
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC: Terminate Expired Break
CREATE OR REPLACE FUNCTION public.rpc_terminate_expired_break()
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_status TEXT;
  v_break_started_at TIMESTAMPTZ;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT current_status, break_started_at INTO v_status, v_break_started_at
  FROM public.users
  WHERE id = v_user_id
  FOR UPDATE;

  IF v_status = 'break' AND v_break_started_at IS NOT NULL AND EXTRACT(EPOCH FROM (v_now - v_break_started_at)) >= 3600 THEN
    PERFORM public.rpc_finish_session(ARRAY[]::TEXT[]);
    RETURN jsonb_build_object(
      'success', true,
      'terminated', true,
      'message', 'You stayed on break for more than 1 hour. Session has been stopped. Start a new session.'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'terminated', false
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC: Finish Session (Atomic Transaction for Stop Hook with Midnight Splitting)
DROP FUNCTION IF EXISTS public.rpc_finish_session() CASCADE;
DROP FUNCTION IF EXISTS public.rpc_finish_session(TEXT[]) CASCADE;
DROP FUNCTION IF EXISTS public.rpc_finish_session(TEXT[], TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.rpc_finish_session(TEXT, TEXT[]) CASCADE;

CREATE OR REPLACE FUNCTION public.rpc_finish_session(
  p_completed_task_ids TEXT[] DEFAULT ARRAY[]::TEXT[],
  p_reason TEXT DEFAULT 'manual_stop'
)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_status TEXT;
  v_session_start TIMESTAMPTZ;
  v_focus TEXT;
  v_version BIGINT;
  v_now TIMESTAMPTZ := NOW();
  v_tz TEXT := 'Asia/Kolkata';
  v_midnight TIMESTAMPTZ;
  v_crossed_midnight BOOLEAN := false;
  v_total_study_seconds NUMERIC := 0;
  v_total_break_seconds NUMERIC := 0;
  v_duration_minutes INTEGER := 0;
  v_break_minutes INTEGER := 0;
  v_dur_1 INTEGER := 0;
  v_dur_2 INTEGER := 0;
  v_session_id UUID;
  v_session_id_1 UUID := NULL;
  v_session_id_2 UUID := NULL;
  v_active_goal_id UUID;
  v_tasks JSONB;
  v_updated_tasks JSONB;
  v_session_completed_tasks JSONB := '[]'::JSONB;
  v_elem JSONB;
  v_task_id TEXT;
  v_is_completed BOOLEAN;
  v_task_text TEXT;
  v_block RECORD;
  v_has_completed_tasks BOOLEAN := false;
  v_last_study_end TIMESTAMPTZ;
  v_session_actual_end TIMESTAMPTZ;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Lock user profile row
  SELECT current_status, session_start_time, current_focus, state_version 
  INTO v_status, v_session_start, v_focus, v_version
  FROM public.users
  WHERE id = v_user_id
  FOR UPDATE;

  -- Idempotency check: already finished
  IF v_status = 'offline' THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_finished', true,
      'state_version', v_version,
      'message', 'No active session found'
    );
  END IF;

  -- Close any open block at v_now
  UPDATE public.session_blocks
  SET end_time = v_now
  WHERE user_id = v_user_id AND end_time IS NULL;

  IF v_session_start IS NULL THEN
    v_session_start := v_now;
  END IF;

  -- Authoritative study session end time:
  -- If user ended session while on break, active study concluded when the last study block ended.
  SELECT COALESCE(MAX(end_time), v_session_start)
  INTO v_last_study_end
  FROM public.session_blocks
  WHERE user_id = v_user_id
    AND block_type = 'study'
    AND session_id IS NULL;

  IF v_status = 'break' THEN
    v_session_actual_end := v_last_study_end;
  ELSE
    v_session_actual_end := v_now;
  END IF;

  -- Enforce 3-hour limit on end time if app was closed longer than 3 hours
  IF v_session_actual_end > (v_session_start + INTERVAL '3 hours') THEN
    v_session_actual_end := v_session_start + INTERVAL '3 hours';
  END IF;

  -- Calculate total break duration from unlinked break blocks
  SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(end_time, v_now) - start_time))), 0)
  INTO v_total_break_seconds
  FROM public.session_blocks
  WHERE user_id = v_user_id
    AND block_type = 'break'
    AND session_id IS NULL;
  v_break_minutes := GREATEST(0, FLOOR(v_total_break_seconds / 60)::INTEGER);

  -- Detect if session crossed midnight in application timezone (Asia/Kolkata)
  IF DATE(v_session_start AT TIME ZONE v_tz) <> DATE(v_session_actual_end AT TIME ZONE v_tz) THEN
    v_crossed_midnight := true;
    v_midnight := (DATE_TRUNC('day', v_session_actual_end AT TIME ZONE v_tz) AT TIME ZONE v_tz);

    -- Split any unlinked block that straddles v_midnight
    FOR v_block IN
      SELECT id, block_type, start_time, end_time
      FROM public.session_blocks
      WHERE user_id = v_user_id
        AND session_id IS NULL
        AND start_time < v_midnight
        AND end_time > v_midnight
    LOOP
      INSERT INTO public.session_blocks (user_id, block_type, start_time, end_time, session_id)
      VALUES (v_user_id, v_block.block_type, v_midnight, v_block.end_time, NULL);

      UPDATE public.session_blocks
      SET end_time = v_midnight
      WHERE id = v_block.id;
    END LOOP;
  END IF;

  -- Check if tasks were passed directly
  IF p_completed_task_ids IS NOT NULL AND array_length(p_completed_task_ids, 1) > 0 THEN
    v_has_completed_tasks := true;
    SELECT id, tasks INTO v_active_goal_id, v_tasks
    FROM public.daily_goals
    WHERE user_id = v_user_id
      AND (
        expires_at > v_now
        OR (v_session_start IS NOT NULL AND expires_at >= v_session_start)
        OR expires_at >= (v_now - INTERVAL '4 hours')
      )
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF v_active_goal_id IS NOT NULL AND v_tasks IS NOT NULL THEN
      v_updated_tasks := '[]'::JSONB;
      FOR v_elem IN SELECT * FROM jsonb_array_elements(v_tasks)
      LOOP
        v_task_id := v_elem->>'id';
        v_is_completed := COALESCE((v_elem->>'completed')::BOOLEAN, false);
        v_task_text := v_elem->>'task';

        IF v_task_id = ANY(p_completed_task_ids) THEN
          v_is_completed := true;
          v_session_completed_tasks := v_session_completed_tasks || jsonb_build_object(
            'id', v_task_id,
            'task', v_task_text
          );
        END IF;

        v_updated_tasks := v_updated_tasks || jsonb_build_object(
          'id', v_task_id,
          'task', v_task_text,
          'completed', v_is_completed
        );
      END LOOP;

      UPDATE public.daily_goals
      SET tasks = v_updated_tasks
      WHERE id = v_active_goal_id;
    END IF;
  END IF;

  -- Handle Session and Block insertion
  IF v_crossed_midnight THEN
    SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (end_time - start_time))), 0)
    INTO v_total_study_seconds
    FROM public.session_blocks
    WHERE user_id = v_user_id
      AND block_type = 'study'
      AND session_id IS NULL
      AND end_time <= v_midnight;
    v_dur_1 := LEAST(180, GREATEST(0, FLOOR(v_total_study_seconds / 60)::INTEGER));

    SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (end_time - start_time))), 0)
    INTO v_total_study_seconds
    FROM public.session_blocks
    WHERE user_id = v_user_id
      AND block_type = 'study'
      AND session_id IS NULL
      AND start_time >= v_midnight;
    v_dur_2 := LEAST(180, GREATEST(0, FLOOR(v_total_study_seconds / 60)::INTEGER));

    IF v_dur_1 = 0 AND v_dur_2 = 0 THEN
      SELECT COALESCE(active_study_seconds_snapshot, 0)
      INTO v_total_study_seconds
      FROM public.users WHERE id = v_user_id;

      IF v_total_study_seconds > 0 THEN
        v_dur_1 := LEAST(180, FLOOR(v_total_study_seconds / 60)::INTEGER);
      END IF;
    END IF;

    v_duration_minutes := v_dur_1 + v_dur_2;

    IF v_dur_1 > 0 OR v_dur_2 = 0 THEN
      INSERT INTO public.study_sessions (
        user_id, start_time, end_time, duration_minutes, break_minutes, completed_tasks, split_part
      )
      VALUES (
        v_user_id, v_session_start, v_midnight, v_dur_1, 0, v_session_completed_tasks, 1
      )
      RETURNING id INTO v_session_id_1;

      UPDATE public.session_blocks
      SET session_id = v_session_id_1
      WHERE user_id = v_user_id AND session_id IS NULL AND end_time <= v_midnight;
    END IF;

    IF v_dur_2 > 0 THEN
      INSERT INTO public.study_sessions (
        user_id, start_time, end_time, duration_minutes, break_minutes, completed_tasks, split_part, sibling_session_id
      )
      VALUES (
        v_user_id, v_midnight, v_session_actual_end, v_dur_2, v_break_minutes, v_session_completed_tasks, 2, v_session_id_1
      )
      RETURNING id INTO v_session_id_2;

      IF v_session_id_1 IS NOT NULL THEN
        UPDATE public.study_sessions
        SET sibling_session_id = v_session_id_2
        WHERE id = v_session_id_1;
      END IF;

      UPDATE public.session_blocks
      SET session_id = v_session_id_2
      WHERE user_id = v_user_id AND session_id IS NULL AND start_time >= v_midnight;
    END IF;

    UPDATE public.session_blocks
    SET session_id = COALESCE(v_session_id_2, v_session_id_1)
    WHERE user_id = v_user_id AND session_id IS NULL;

    v_session_id := COALESCE(v_session_id_2, v_session_id_1);
  ELSE
    SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(end_time, v_now) - start_time))), 0)
    INTO v_total_study_seconds
    FROM public.session_blocks
    WHERE user_id = v_user_id
      AND block_type = 'study'
      AND session_id IS NULL;

    v_duration_minutes := LEAST(180, GREATEST(0, FLOOR(v_total_study_seconds / 60)::INTEGER));

    INSERT INTO public.study_sessions (user_id, start_time, end_time, duration_minutes, break_minutes, completed_tasks)
    VALUES (v_user_id, v_session_start, v_session_actual_end, v_duration_minutes, v_break_minutes, v_session_completed_tasks)
    RETURNING id INTO v_session_id;

    UPDATE public.session_blocks
    SET session_id = v_session_id
    WHERE user_id = v_user_id AND session_id IS NULL;
  END IF;

  -- Reset user to offline and set pending_goal state if tasks not already submitted
  UPDATE public.users
  SET current_status = 'offline',
      current_focus = NULL,
      session_start_time = NULL,
      last_resumed_at = NULL,
      break_started_at = NULL,
      active_study_seconds_snapshot = 0,
      last_break_expired_study_seconds = NULL,
      pending_goal_session_id = CASE WHEN v_has_completed_tasks THEN NULL ELSE v_session_id END,
      pending_goal_seconds = CASE WHEN v_has_completed_tasks THEN NULL ELSE (v_duration_minutes * 60) END,
      pending_goal_reason = CASE WHEN v_has_completed_tasks THEN NULL ELSE COALESCE(p_reason, 'manual_stop') END,
      last_offline_at = v_now
  WHERE id = v_user_id
  RETURNING state_version INTO v_version;

  RETURN jsonb_build_object(
    'success', true,
    'session_id', v_session_id,
    'session_id_1', v_session_id_1,
    'session_id_2', v_session_id_2,
    'duration_minutes', v_duration_minutes,
    'break_minutes', v_break_minutes,
    'duration_minutes_1', v_dur_1,
    'duration_minutes_2', v_dur_2,
    'start_time', v_session_start,
    'end_time', v_session_actual_end,
    'completed_tasks', v_session_completed_tasks,
    'pending_goal_session_id', CASE WHEN v_has_completed_tasks THEN NULL ELSE v_session_id END,
    'pending_goal_seconds', CASE WHEN v_has_completed_tasks THEN NULL ELSE (v_duration_minutes * 60) END,
    'pending_goal_reason', CASE WHEN v_has_completed_tasks THEN NULL ELSE COALESCE(p_reason, 'manual_stop') END,
    'state_version', v_version,
    'server_now', v_now
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- One-time migration helper to retroactively split past cross-midnight sessions
CREATE OR REPLACE FUNCTION public.split_cross_midnight_sessions()
RETURNS JSONB AS $$
DECLARE
  v_rec RECORD;
  v_tz TEXT := 'Asia/Kolkata';
  v_midnight TIMESTAMPTZ;
  v_mins_before INTEGER;
  v_mins_after INTEGER;
  v_total_seconds NUMERIC;
  v_split_count INTEGER := 0;
  v_new_session_id UUID;
BEGIN
  FOR v_rec IN
    SELECT id, user_id, start_time, end_time, duration_minutes, completed_tasks
    FROM public.study_sessions
    WHERE DATE(start_time AT TIME ZONE v_tz) <> DATE(end_time AT TIME ZONE v_tz)
      AND end_time > start_time
    ORDER BY start_time ASC
  LOOP
    v_midnight := (DATE_TRUNC('day', v_rec.end_time AT TIME ZONE v_tz) AT TIME ZONE v_tz);

    -- Calculate proportional study minutes before and after midnight
    v_total_seconds := EXTRACT(EPOCH FROM (v_rec.end_time - v_rec.start_time));
    IF v_total_seconds > 0 THEN
      v_mins_before := ROUND(v_rec.duration_minutes * (EXTRACT(EPOCH FROM (v_midnight - v_rec.start_time)) / v_total_seconds))::INTEGER;
    ELSE
      v_mins_before := v_rec.duration_minutes / 2;
    END IF;
    v_mins_after := GREATEST(0, v_rec.duration_minutes - v_mins_before);

    -- 1. Update existing session to be Part 1 (ending at midnight)
    UPDATE public.study_sessions
    SET end_time = v_midnight,
        duration_minutes = v_mins_before,
        completed_tasks = '[]'::JSONB
    WHERE id = v_rec.id;

    -- 2. Insert Part 2 (starting at midnight)
    INSERT INTO public.study_sessions (user_id, start_time, end_time, duration_minutes, completed_tasks)
    VALUES (v_rec.user_id, v_midnight, v_rec.end_time, v_mins_after, COALESCE(v_rec.completed_tasks, '[]'::JSONB))
    RETURNING id INTO v_new_session_id;

    -- 3. Reassign blocks belonging to Part 2 if session_blocks exist
    UPDATE public.session_blocks
    SET session_id = v_new_session_id
    WHERE session_id = v_rec.id AND start_time >= v_midnight;

    v_split_count := v_split_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'split_sessions_count', v_split_count
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------
-- 8. AUTHORITATIVE GOAL CREATION & APPEND RPCs
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_create_daily_goal(p_tasks JSONB)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_existing_id UUID;
  v_existing_tasks JSONB;
  v_existing_expires TIMESTAMPTZ;
  v_now TIMESTAMPTZ := NOW();
  v_expires TIMESTAMPTZ := v_now + INTERVAL '20 hours';
  v_new_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Strictly serialize concurrent requests for the same user via transaction advisory lock
  PERFORM pg_advisory_xact_lock(hashtext(v_user_id::text));

  -- Check for unexpired goal set
  SELECT id, tasks, expires_at INTO v_existing_id, v_existing_tasks, v_existing_expires
  FROM public.daily_goals
  WHERE user_id = v_user_id AND expires_at > v_now
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_exists', true,
      'goal_id', v_existing_id,
      'expires_at', v_existing_expires,
      'message', 'Active 20-hour goal set already exists for this user'
    );
  END IF;

  IF jsonb_array_length(p_tasks) = 0 THEN
    RAISE EXCEPTION 'Tasks array cannot be empty';
  END IF;

  INSERT INTO public.daily_goals (user_id, tasks, created_at, expires_at, is_locked)
  VALUES (v_user_id, p_tasks, v_now, v_expires, true)
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object(
    'success', true,
    'already_exists', false,
    'goal_id', v_new_id,
    'created_at', v_now,
    'expires_at', v_expires
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Append new goal tasks to active 20-hour window (STRICTLY NO DELETION, DEDUPLICATED BY TASK ID)
CREATE OR REPLACE FUNCTION public.rpc_add_goal_tasks(p_new_tasks JSONB)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_active_goal_id UUID;
  v_current_tasks JSONB;
  v_updated_tasks JSONB;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_new_tasks IS NULL OR jsonb_array_length(p_new_tasks) = 0 THEN
    RAISE EXCEPTION 'New tasks array cannot be empty';
  END IF;

  -- Strictly serialize concurrent requests for the same user via transaction advisory lock
  PERFORM pg_advisory_xact_lock(hashtext(v_user_id::text));

  -- Find active unexpired goal window
  SELECT id, tasks INTO v_active_goal_id, v_current_tasks
  FROM public.daily_goals
  WHERE user_id = v_user_id AND expires_at > v_now
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_active_goal_id IS NULL THEN
    RAISE EXCEPTION 'No active 20-hour goal set found to add tasks to';
  END IF;

  v_current_tasks := COALESCE(v_current_tasks, '[]'::JSONB);

  -- Append only new tasks whose 'id' does not already exist in v_current_tasks
  -- and deduplicate within p_new_tasks itself
  SELECT v_current_tasks || COALESCE(
    (
      SELECT jsonb_agg(new_elem)
      FROM (
        SELECT DISTINCT ON (elem->>'id') elem AS new_elem
        FROM jsonb_array_elements(p_new_tasks) AS elem
      ) deduplicated_new
      WHERE NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(v_current_tasks) AS curr_elem
        WHERE curr_elem->>'id' = new_elem->>'id'
      )
    ),
    '[]'::JSONB
  ) INTO v_updated_tasks;

  UPDATE public.daily_goals
  SET tasks = v_updated_tasks
  WHERE id = v_active_goal_id;

  RETURN jsonb_build_object(
    'success', true,
    'goal_id', v_active_goal_id,
    'tasks', v_updated_tasks
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------
-- 8.5. STUDY HISTORY RPCs (3-Month Auto-Pruning)
-- ------------------------------------------------------------

-- Retrieve study history (Automatically purges records older than 90 days)
DROP FUNCTION IF EXISTS public.rpc_get_study_history() CASCADE;
CREATE OR REPLACE FUNCTION public.rpc_get_study_history()
RETURNS TABLE (
  id UUID,
  user_id UUID,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  duration_minutes INTEGER,
  break_minutes INTEGER,
  completed_tasks JSONB
) AS $$
DECLARE
  v_uid UUID;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Automatically purge records older than 90 days (3 months)
  DELETE FROM public.study_sessions
  WHERE public.study_sessions.user_id = v_uid 
    AND public.study_sessions.start_time < (NOW() - INTERVAL '90 days');

  RETURN QUERY
  SELECT
    s.id,
    s.user_id,
    s.start_time,
    s.end_time,
    s.duration_minutes,
    COALESCE(s.break_minutes, 0) AS break_minutes,
    COALESCE(s.completed_tasks, '[]'::JSONB) AS completed_tasks
  FROM public.study_sessions s
  WHERE s.user_id = v_uid
  ORDER BY s.start_time DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Clear study history for the calling user
CREATE OR REPLACE FUNCTION public.rpc_clear_study_history()
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_deleted_count INTEGER;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  DELETE FROM public.study_sessions
  WHERE user_id = v_user_id;

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'cleared_count', v_deleted_count
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------
-- 9. LEADERBOARD & ACHIEVER BADGE RPCs
-- ------------------------------------------------------------

-- Function to get leaderboard entries for a given week with timezone support (Default Asia/Kolkata)
-- Implements Dual-Pillar Goal Index + Realtime Live Study Sync (Safe in-place replacement)
CREATE OR REPLACE FUNCTION public.rpc_get_leaderboard(
  p_week_start TIMESTAMPTZ DEFAULT NULL,
  p_timezone TEXT DEFAULT 'Asia/Kolkata'
)
RETURNS TABLE (
  user_id UUID,
  display_name TEXT,
  avatar_url TEXT,
  has_achiever_badge BOOLEAN,
  current_status TEXT,
  total_study_minutes INTEGER,
  goal_completion_pct NUMERIC,
  streak_days INTEGER,
  score NUMERIC,
  completed_tasks INTEGER,
  total_tasks INTEGER
) AS $$
DECLARE
  v_tz TEXT := COALESCE(NULLIF(p_timezone, ''), 'Asia/Kolkata');
  v_week_start TIMESTAMPTZ;
  v_week_end TIMESTAMPTZ;
BEGIN
  -- Determine canonical week start in local timezone (Monday 00:00:00)
  IF p_week_start IS NULL THEN
    v_week_start := (DATE_TRUNC('week', NOW() AT TIME ZONE v_tz) AT TIME ZONE v_tz);
  ELSE
    v_week_start := (DATE_TRUNC('week', p_week_start AT TIME ZONE v_tz) AT TIME ZONE v_tz);
  END IF;
  v_week_end := v_week_start + INTERVAL '7 days';

  RETURN QUERY
  WITH weekly_study AS (
    SELECT
      u.id AS user_id,
      COALESCE(SUM(s.duration_minutes), 0)::INTEGER +
      CASE
        WHEN u.current_status = 'studying' AND u.session_start_time IS NOT NULL AND NOW() >= v_week_start AND NOW() < v_week_end THEN
          LEAST(
            180,
            GREATEST(
              0,
              FLOOR(
                (
                  COALESCE(u.active_study_seconds_snapshot, 0) +
                  EXTRACT(EPOCH FROM (NOW() - GREATEST(v_week_start, COALESCE(u.last_resumed_at, u.session_start_time))))
                ) / 60
              )::INTEGER
            )
          )
        WHEN u.current_status = 'break' AND u.active_study_seconds_snapshot IS NOT NULL AND NOW() >= v_week_start AND NOW() < v_week_end THEN
          LEAST(180, GREATEST(0, FLOOR(u.active_study_seconds_snapshot / 60)::INTEGER))
        ELSE 0
      END AS study_mins
    FROM public.users u
    LEFT JOIN public.study_sessions s ON u.id = s.user_id
      AND s.start_time >= v_week_start
      AND s.start_time < v_week_end
      AND s.duration_minutes > 0
    WHERE u.created_at < v_week_end
    GROUP BY u.id, u.current_status, u.session_start_time, u.last_resumed_at, u.active_study_seconds_snapshot
  ),
  completed_tasks_per_user AS (
    SELECT combined_tasks.user_id, COUNT(DISTINCT combined_tasks.task_id)::INTEGER AS completed_tasks_count
    FROM (
      SELECT g.user_id, t->>'id' AS task_id
      FROM public.daily_goals g,
           jsonb_array_elements(COALESCE(g.tasks, '[]'::JSONB)) t
      WHERE g.created_at >= v_week_start AND g.created_at < v_week_end
        AND (t->>'completed')::boolean = true
        AND t->>'id' IS NOT NULL
      UNION
      SELECT s.user_id, t->>'id' AS task_id
      FROM public.study_sessions s,
           jsonb_array_elements(COALESCE(s.completed_tasks, '[]'::JSONB)) t
      WHERE s.start_time >= v_week_start AND s.start_time < v_week_end
        AND (s.split_part IS NULL OR s.split_part != 2 OR s.start_time > v_week_start)
        AND t->>'id' IS NOT NULL
    ) combined_tasks
    GROUP BY combined_tasks.user_id
  ),
  total_tasks_per_user AS (
    SELECT g.user_id, COALESCE(SUM(jsonb_array_length(g.tasks)), 0)::INTEGER AS total_tasks_count
    FROM public.daily_goals g
    WHERE g.created_at >= v_week_start AND g.created_at < v_week_end
    GROUP BY g.user_id
  ),
  daily_study AS (
    SELECT
      s.user_id,
      DATE(s.start_time AT TIME ZONE v_tz) AS study_date,
      SUM(s.duration_minutes) AS day_mins
    FROM public.study_sessions s
    WHERE s.start_time >= v_week_start AND s.start_time < v_week_end
      AND s.duration_minutes > 0
    GROUP BY s.user_id, DATE(s.start_time AT TIME ZONE v_tz)
    UNION ALL
    SELECT
      u.id AS user_id,
      DATE(NOW() AT TIME ZONE v_tz) AS study_date,
      CASE
        WHEN u.current_status = 'studying' AND u.session_start_time IS NOT NULL THEN
          LEAST(
            180,
            GREATEST(
              0,
              FLOOR(
                (
                  COALESCE(u.active_study_seconds_snapshot, 0) +
                  EXTRACT(EPOCH FROM (NOW() - GREATEST(v_week_start, COALESCE(u.last_resumed_at, u.session_start_time))))
                ) / 60
              )::INTEGER
            )
          )
        WHEN u.current_status = 'break' AND u.active_study_seconds_snapshot IS NOT NULL THEN
          LEAST(180, GREATEST(0, FLOOR(u.active_study_seconds_snapshot / 60)::INTEGER))
        ELSE 0
      END AS day_mins
    FROM public.users u
    WHERE u.current_status IN ('studying', 'break')
      AND NOW() >= v_week_start AND NOW() < v_week_end
  ),
  qualifying_days AS (
    SELECT
      ds.user_id,
      ds.study_date
    FROM daily_study ds
    GROUP BY ds.user_id, ds.study_date
    HAVING SUM(ds.day_mins) >= 30
  ),
  weekly_streaks AS (
    SELECT
      qd.user_id,
      COUNT(DISTINCT qd.study_date)::INTEGER AS streak_days
    FROM qualifying_days qd
    GROUP BY qd.user_id
  ),
  user_stats AS (
    SELECT
      u.id AS user_id,
      COALESCE(u.display_name, 'Anonymous') AS display_name,
      u.avatar_url,
      COALESCE(u.has_achiever_badge, false) AS has_achiever_badge,
      COALESCE(u.current_status, 'offline') AS current_status,
      COALESCE(ws.study_mins, 0)::INTEGER AS total_study_minutes,
      CASE
        WHEN COALESCE(tt.total_tasks_count, 0) > 0 THEN
          ROUND((COALESCE(ct.completed_tasks_count, 0)::NUMERIC / tt.total_tasks_count::NUMERIC) * 100, 1)
        ELSE 0.0
      END AS goal_completion_pct,
      COALESCE(wstr.streak_days, 0)::INTEGER AS streak_days,
      COALESCE(ct.completed_tasks_count, 0)::INTEGER AS completed_tasks,
      COALESCE(tt.total_tasks_count, 0)::INTEGER AS total_tasks
    FROM public.users u
    LEFT JOIN weekly_study ws ON u.id = ws.user_id
    LEFT JOIN completed_tasks_per_user ct ON u.id = ct.user_id
    LEFT JOIN total_tasks_per_user tt ON u.id = tt.user_id
    LEFT JOIN weekly_streaks wstr ON u.id = wstr.user_id
    WHERE COALESCE(u.is_admin, FALSE) = FALSE
      AND u.created_at < v_week_end
  ),
  normalizers AS (
    SELECT
      GREATEST(1, COALESCE(MAX(us.total_study_minutes), 1))::NUMERIC AS max_study_minutes,
      GREATEST(3, LEAST(15, COALESCE(MAX(us.completed_tasks), 3)))::NUMERIC AS target_completed_tasks
    FROM user_stats us
  ),
  scored_users AS (
    SELECT
      us.user_id,
      us.display_name,
      us.avatar_url,
      us.has_achiever_badge,
      us.current_status,
      us.total_study_minutes,
      us.goal_completion_pct,
      us.streak_days,
      ROUND(
        (
          -- 1. 50% Study Hours Component (0 to 100 scale, weight 0.50)
          (0.50 * LEAST(100.0, (us.total_study_minutes::NUMERIC / norm.max_study_minutes) * 100.0)) +
          -- 2. 30% Dual-Pillar Goal Index Component (0 to 100 scale, weight 0.30)
          (0.30 * (
            -- Volume Pillar (60% weight): completed / target (capped at 100%)
            (0.60 * LEAST(100.0, (us.completed_tasks::NUMERIC / norm.target_completed_tasks) * 100.0)) +
            -- Discipline Pillar (40% weight): completed / max(3, total_tasks) (0 if total_tasks = 0)
            (0.40 * CASE
              WHEN us.total_tasks > 0 THEN
                LEAST(100.0, (us.completed_tasks::NUMERIC / GREATEST(3, us.total_tasks)::NUMERIC) * 100.0)
              ELSE 0.0
            END)
          )) +
          -- 3. 20% Consistency Streak Component (0 to 100 scale, weight 0.20, capped at 7 days)
          (0.20 * LEAST(100.0, (us.streak_days::NUMERIC / 7.0) * 100.0))
        ), 1
      )::NUMERIC AS calculated_score,
      us.completed_tasks,
      us.total_tasks
    FROM user_stats us
    CROSS JOIN normalizers norm
  )
  SELECT
    su.user_id,
    su.display_name,
    su.avatar_url,
    su.has_achiever_badge,
    su.current_status,
    su.total_study_minutes,
    su.goal_completion_pct,
    su.streak_days,
    su.calculated_score AS score,
    su.completed_tasks,
    su.total_tasks
  FROM scored_users su
  ORDER BY su.calculated_score DESC, su.total_study_minutes DESC, su.display_name ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.rpc_get_leaderboard(TIMESTAMPTZ, TEXT) TO authenticated, anon, service_role;

-- Function to calculate and award Weekly Achiever Badge (Run every Monday)
CREATE OR REPLACE FUNCTION public.rpc_calculate_weekly_achiever(p_timezone TEXT DEFAULT 'Asia/Kolkata')
RETURNS UUID AS $$
DECLARE
  v_tz TEXT := COALESCE(NULLIF(p_timezone, ''), 'Asia/Kolkata');
  v_prev_week_start TIMESTAMPTZ;
  v_winner_id UUID;
BEGIN
  v_prev_week_start := (DATE_TRUNC('week', (NOW() - INTERVAL '7 days') AT TIME ZONE v_tz) AT TIME ZONE v_tz);

  SELECT lb.user_id INTO v_winner_id
  FROM public.rpc_get_leaderboard(v_prev_week_start, v_tz) lb
  WHERE lb.total_study_minutes > 0
  ORDER BY lb.score DESC, lb.total_study_minutes DESC
  LIMIT 1;

  -- Allow update of protected badge column inside security definer function
  PERFORM set_config('studyroom.internal_badge_update', 'true', true);

  -- Clear previous achiever badges
  UPDATE public.users SET has_achiever_badge = FALSE WHERE has_achiever_badge = TRUE;

  -- Set new achiever badge
  IF v_winner_id IS NOT NULL THEN
    UPDATE public.users SET has_achiever_badge = TRUE WHERE id = v_winner_id;
  END IF;

  RETURN v_winner_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------
-- 10. REALTIME PUBLICATION CONFIGURATION
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

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'session_blocks' AND schemaname = 'public'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.session_blocks;
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- ------------------------------------------------------------
-- 11. SUPABASE STORAGE BUCKET & RLS POLICIES FOR AVATARS
-- ------------------------------------------------------------
-- Create public storage bucket 'avatars' with 2 MB limit & image MIME type restriction
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
-- 12. PERFORMANCE INDEXES & ADMIN MANAGEMENT RPCS
-- ------------------------------------------------------------

-- High-performance partial & composite indexes
CREATE INDEX IF NOT EXISTS idx_session_blocks_open_active ON public.session_blocks(user_id, block_type) WHERE end_time IS NULL;
CREATE INDEX IF NOT EXISTS idx_daily_goals_user_active_unexpired ON public.daily_goals(user_id, expires_at DESC);
CREATE INDEX IF NOT EXISTS idx_study_sessions_weekly_range ON public.study_sessions(start_time DESC, user_id);

-- Internal security verification helper
CREATE OR REPLACE FUNCTION public.check_is_admin()
RETURNS BOOLEAN AS $$
DECLARE
  v_email TEXT;
  v_is_admin BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT is_admin INTO v_is_admin FROM public.users WHERE id = auth.uid();
  IF v_is_admin IS TRUE THEN
    RETURN TRUE;
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
  IF v_email IS NOT NULL AND LOWER(v_email) IN ('studyaliveapp@gmail.com', 'sa@admin.tg') THEN
    -- Auto-flag is_admin in public.users
    PERFORM set_config('studyroom.internal_admin_update', 'true', true);
    UPDATE public.users SET is_admin = TRUE WHERE id = auth.uid();
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Admin RPC: Get All Users
DROP FUNCTION IF EXISTS public.rpc_admin_get_all_users(TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.rpc_admin_get_all_users() CASCADE;
CREATE OR REPLACE FUNCTION public.rpc_admin_get_all_users(p_admin_email TEXT DEFAULT NULL)
RETURNS TABLE (
  user_id UUID,
  display_name TEXT,
  avatar_url TEXT,
  current_status TEXT,
  current_focus TEXT,
  session_start_time TIMESTAMPTZ,
  break_started_at TIMESTAMPTZ,
  active_study_seconds_snapshot INTEGER,
  has_achiever_badge BOOLEAN,
  created_at TIMESTAMPTZ,
  active_goal_count INTEGER,
  total_sessions_count INTEGER
) AS $$
BEGIN
  IF NOT public.check_is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Caller is not an administrator';
  END IF;

  RETURN QUERY
  WITH active_goals AS (
    SELECT dg.user_id, COUNT(*)::INTEGER AS goal_cnt
    FROM public.daily_goals dg
    WHERE dg.expires_at > NOW()
    GROUP BY dg.user_id
  ),
  session_counts AS (
    SELECT ss.user_id, COUNT(*)::INTEGER AS sess_cnt
    FROM public.study_sessions ss
    GROUP BY ss.user_id
  )
  SELECT
    u.id AS user_id,
    u.display_name,
    u.avatar_url,
    u.current_status,
    u.current_focus,
    u.session_start_time,
    u.break_started_at,
    u.active_study_seconds_snapshot,
    u.has_achiever_badge,
    u.created_at,
    COALESCE(ag.goal_cnt, 0) AS active_goal_count,
    COALESCE(sc.sess_cnt, 0) AS total_sessions_count
  FROM public.users u
  LEFT JOIN active_goals ag ON u.id = ag.user_id
  LEFT JOIN session_counts sc ON u.id = sc.user_id
  WHERE u.id <> auth.uid() AND COALESCE(u.is_admin, FALSE) = FALSE
  ORDER BY
    CASE u.current_status
      WHEN 'studying' THEN 1
      WHEN 'break' THEN 2
      ELSE 3
    END,
    u.display_name ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Admin RPC: Rename User
CREATE OR REPLACE FUNCTION public.rpc_admin_rename_user(
  p_admin_email TEXT DEFAULT NULL,
  p_target_user_id UUID DEFAULT NULL,
  p_new_name TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_trimmed_name TEXT;
BEGIN
  IF NOT public.check_is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Caller is not an administrator';
  END IF;

  IF p_target_user_id IS NULL THEN
    RAISE EXCEPTION 'Target user ID is required';
  END IF;

  IF p_target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot modify admin account via this function';
  END IF;

  v_trimmed_name := TRIM(COALESCE(p_new_name, ''));
  IF LENGTH(v_trimmed_name) = 0 THEN
    RAISE EXCEPTION 'Display name cannot be empty';
  END IF;
  IF LENGTH(v_trimmed_name) > 32 THEN
    v_trimmed_name := SUBSTRING(v_trimmed_name FROM 1 FOR 32);
  END IF;

  UPDATE public.users
  SET display_name = v_trimmed_name
  WHERE id = p_target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', p_target_user_id,
    'new_name', v_trimmed_name
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Admin RPC: Delete User
CREATE OR REPLACE FUNCTION public.rpc_admin_delete_user(
  p_admin_email TEXT DEFAULT NULL,
  p_target_user_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_target_name TEXT;
BEGIN
  IF NOT public.check_is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Caller is not an administrator';
  END IF;

  IF p_target_user_id IS NULL THEN
    RAISE EXCEPTION 'Target user ID is required';
  END IF;

  IF p_target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot delete the administrator account';
  END IF;

  SELECT display_name INTO v_target_name
  FROM public.users
  WHERE id = p_target_user_id;

  IF v_target_name IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  DELETE FROM auth.users WHERE id = p_target_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'deleted_user_id', p_target_user_id,
    'deleted_user_name', v_target_name
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Admin RPC: Force End Session
DROP FUNCTION IF EXISTS public.rpc_admin_force_end_session(UUID, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.rpc_admin_force_end_session(TEXT, UUID) CASCADE;
DROP FUNCTION IF EXISTS public.rpc_admin_force_end_session() CASCADE;

CREATE OR REPLACE FUNCTION public.rpc_admin_force_end_session(
  p_target_user_id UUID,
  p_admin_email TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_status TEXT;
  v_session_start TIMESTAMPTZ;
  v_focus TEXT;
  v_now TIMESTAMPTZ := NOW();
  v_total_study_seconds NUMERIC := 0;
  v_total_break_seconds NUMERIC := 0;
  v_duration_minutes INTEGER := 0;
  v_break_minutes INTEGER := 0;
  v_session_id UUID;
  v_last_study_end TIMESTAMPTZ;
  v_session_actual_end TIMESTAMPTZ;
BEGIN
  IF NOT public.check_is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Caller is not an administrator';
  END IF;

  IF p_target_user_id IS NULL THEN
    RAISE EXCEPTION 'Target user ID is required';
  END IF;

  SELECT current_status, session_start_time, current_focus
  INTO v_status, v_session_start, v_focus
  FROM public.users
  WHERE id = p_target_user_id
  FOR UPDATE;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  IF v_status = 'offline' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'User has no active session'
    );
  END IF;

  UPDATE public.session_blocks
  SET end_time = v_now
  WHERE user_id = p_target_user_id AND end_time IS NULL;

  IF v_session_start IS NULL THEN
    v_session_start := v_now;
  END IF;
  SELECT COALESCE(MAX(end_time), v_session_start)
  INTO v_last_study_end
  FROM public.session_blocks
  WHERE user_id = p_target_user_id
    AND block_type = 'study'
    AND session_id IS NULL;

  IF v_status = 'break' THEN
    v_session_actual_end := v_last_study_end;
  ELSE
    v_session_actual_end := v_now;
  END IF;

  SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(end_time, v_now) - start_time))), 0)
  INTO v_total_study_seconds
  FROM public.session_blocks
  WHERE user_id = p_target_user_id
    AND block_type = 'study'
    AND session_id IS NULL;

  v_duration_minutes := LEAST(180, GREATEST(0, FLOOR(v_total_study_seconds / 60)::INTEGER));

  SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(end_time, v_now) - start_time))), 0)
  INTO v_total_break_seconds
  FROM public.session_blocks
  WHERE user_id = p_target_user_id
    AND block_type = 'break'
    AND session_id IS NULL;

  v_break_minutes := GREATEST(0, FLOOR(v_total_break_seconds / 60)::INTEGER);

  INSERT INTO public.study_sessions (user_id, start_time, end_time, duration_minutes, break_minutes, completed_tasks)
  VALUES (p_target_user_id, v_session_start, v_session_actual_end, v_duration_minutes, v_break_minutes, '[]'::JSONB)
  RETURNING id INTO v_session_id;

  UPDATE public.session_blocks
  SET session_id = v_session_id
  WHERE user_id = p_target_user_id AND session_id IS NULL;

  UPDATE public.users
  SET current_status = 'offline',
      current_focus = NULL,
      session_start_time = NULL,
      last_resumed_at = NULL,
      break_started_at = NULL,
      active_study_seconds_snapshot = 0,
      last_break_expired_study_seconds = NULL,
      last_offline_at = v_now
  WHERE id = p_target_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'session_id', v_session_id,
    'duration_minutes', v_duration_minutes,
    'break_minutes', v_break_minutes,
    'server_now', v_now,
    'message', 'Session suspended and saved by administrator'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Admin RPC: Platform Stats
CREATE OR REPLACE FUNCTION public.rpc_admin_get_platform_stats(p_admin_email TEXT DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
  v_total_users INTEGER := 0;
  v_studying INTEGER := 0;
  v_on_break INTEGER := 0;
  v_offline INTEGER := 0;
  v_week_start TIMESTAMPTZ;
  v_weekly_sessions INTEGER := 0;
  v_weekly_hours NUMERIC := 0;
BEGIN
  IF NOT public.check_is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Caller is not an administrator';
  END IF;

  SELECT
    COUNT(*)::INTEGER,
    COUNT(*) FILTER (WHERE current_status = 'studying')::INTEGER,
    COUNT(*) FILTER (WHERE current_status = 'break')::INTEGER,
    COUNT(*) FILTER (WHERE current_status = 'offline')::INTEGER
  INTO v_total_users, v_studying, v_on_break, v_offline
  FROM public.users
  WHERE id <> auth.uid() AND COALESCE(is_admin, FALSE) = FALSE;

  v_week_start := (DATE_TRUNC('week', NOW() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata');

  SELECT
    COALESCE(COUNT(*)::INTEGER, 0),
    COALESCE(ROUND(SUM(duration_minutes)::NUMERIC / 60.0, 1), 0)
  INTO v_weekly_sessions, v_weekly_hours
  FROM public.study_sessions
  WHERE start_time >= v_week_start
    AND user_id IN (
      SELECT id FROM public.users WHERE id <> auth.uid() AND COALESCE(is_admin, FALSE) = FALSE
    );

  RETURN jsonb_build_object(
    'total_users', v_total_users,
    'studying', v_studying,
    'on_break', v_on_break,
    'offline', v_offline,
    'weekly_sessions', v_weekly_sessions,
    'weekly_hours', v_weekly_hours
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------
-- 13. BREAK EXPIRATION & AUTO-CLEANUP RPCS
-- ------------------------------------------------------------

-- RPC to stop a user's session upon 1-hour break expiry or peer timeout detection
-- Dependency-safe overload cleanup using RESTRICT (strictly NO CASCADE)
DROP FUNCTION IF EXISTS public.rpc_stop_user_session(UUID, TEXT) RESTRICT;
DROP FUNCTION IF EXISTS public.rpc_stop_user_session(UUID) RESTRICT;
DROP FUNCTION IF EXISTS public.rpc_stop_user_session(UUID, TIMESTAMPTZ) RESTRICT;

CREATE OR REPLACE FUNCTION public.rpc_stop_user_session(
  p_user_id UUID,
  p_expected_start_time TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_status TEXT;
  v_session_start TIMESTAMPTZ;
  v_break_start TIMESTAMPTZ;
  v_focus TEXT;
  v_now TIMESTAMPTZ := NOW();
  v_total_study_seconds NUMERIC := 0;
  v_total_break_seconds NUMERIC := 0;
  v_duration_minutes INTEGER := 0;
  v_break_minutes INTEGER := 0;
  v_session_id UUID;
  v_last_study_end TIMESTAMPTZ;
  v_session_actual_end TIMESTAMPTZ;
  v_version BIGINT := 1;
  v_caller_uid UUID := auth.uid();
  v_is_system BOOLEAN;
  v_is_owner BOOLEAN;
BEGIN
  v_is_system := (current_setting('role', true) IN ('postgres', 'service_role')) OR public.check_is_admin();
  v_is_owner := (v_caller_uid IS NOT NULL AND v_caller_uid = p_user_id);

  SELECT current_status, session_start_time, break_started_at, current_focus, COALESCE(state_version, 1)
  INTO v_status, v_session_start, v_break_start, v_focus, v_version
  FROM public.users
  WHERE id = p_user_id
  FOR UPDATE;

  IF v_status IS NULL OR v_status = 'offline' THEN
    RETURN jsonb_build_object(
      'success', true, 
      'already_finished', true, 
      'message', 'No active session',
      'state_version', v_version
    );
  END IF;

  -- Security Guard for Third-Party Observers (auth.uid() != p_user_id and non-system):
  IF NOT v_is_owner AND NOT v_is_system THEN
    -- A. Observer must supply the expected start time of the session they observed
    IF p_expected_start_time IS NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'rejected', true,
        'reason', 'Observer must provide p_expected_start_time',
        'current_status', v_status
      );
    END IF;

    -- B. Session Identity Verification:
    -- In studying status: session_start_time must match p_expected_start_time.
    -- In break status: either session_start_time matches p_expected_start_time OR break_started_at matches p_expected_start_time.
    IF (v_status = 'studying' AND (v_session_start IS NULL OR v_session_start <> p_expected_start_time))
       OR (v_status = 'break' AND (v_session_start IS NULL OR v_session_start <> p_expected_start_time)
                              AND (v_break_start IS NULL OR v_break_start <> p_expected_start_time)) THEN
      RETURN jsonb_build_object(
        'success', false,
        'rejected', true,
        'reason', 'Session identity mismatch: user has a newer or different session',
        'current_status', v_status
      );
    END IF;

    -- C. Server-Side Duration Expiry:
    IF v_status = 'break' THEN
      IF v_break_start IS NULL OR (v_now - v_break_start) < INTERVAL '1 hour' THEN
        RETURN jsonb_build_object(
          'success', false,
          'rejected', true,
          'reason', 'Break has not exceeded 1 hour limit',
          'current_status', v_status
        );
      END IF;
    ELSIF v_status = 'studying' THEN
      SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(end_time, v_now) - start_time))), 0)
      INTO v_total_study_seconds
      FROM public.session_blocks
      WHERE user_id = p_user_id AND block_type = 'study' AND session_id IS NULL;

      -- Strict 3 hours (10,800 seconds) of actual accumulated study time (no wall-clock shortcut)
      IF v_total_study_seconds < 10800 THEN
        RETURN jsonb_build_object(
          'success', false,
          'rejected', true,
          'reason', 'Study session has not exceeded 3 hour limit',
          'current_status', v_status
        );
      END IF;
    END IF;
  END IF;

  -- Fallback anchor if session_start_time was unset
  IF v_session_start IS NULL THEN
    v_session_start := v_now;
  END IF;

  -- Proceed with authoritative finalization
  -- Close ONLY active open blocks belonging to this authoritative session
  UPDATE public.session_blocks
  SET end_time = v_now
  WHERE user_id = p_user_id
    AND session_id IS NULL
    AND start_time >= v_session_start
    AND start_time <= v_now
    AND end_time IS NULL;

  -- Determine actual end time of study
  SELECT COALESCE(MAX(end_time), v_session_start)
  INTO v_last_study_end
  FROM public.session_blocks
  WHERE user_id = p_user_id
    AND session_id IS NULL
    AND start_time >= v_session_start
    AND start_time <= v_now
    AND block_type = 'study';

  IF v_status = 'break' THEN
    v_session_actual_end := v_last_study_end;
  ELSE
    v_session_actual_end := v_now;
  END IF;

  -- Compute study seconds strictly from session blocks belonging to this session
  SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(end_time, v_now) - start_time))), 0)
  INTO v_total_study_seconds
  FROM public.session_blocks
  WHERE user_id = p_user_id
    AND session_id IS NULL
    AND start_time >= v_session_start
    AND start_time <= v_now
    AND block_type = 'study';

  -- Enforce strict 180-minute cap on stored study duration
  v_duration_minutes := LEAST(180, GREATEST(0, FLOOR(v_total_study_seconds / 60)::INTEGER));

  -- Compute break seconds strictly from session blocks belonging to this session
  SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(end_time, v_now) - start_time))), 0)
  INTO v_total_break_seconds
  FROM public.session_blocks
  WHERE user_id = p_user_id
    AND session_id IS NULL
    AND start_time >= v_session_start
    AND start_time <= v_now
    AND block_type = 'break';

  v_break_minutes := GREATEST(0, FLOOR(v_total_break_seconds / 60)::INTEGER);

  -- Insert finalized study session
  INSERT INTO public.study_sessions (user_id, start_time, end_time, duration_minutes, break_minutes, completed_tasks)
  VALUES (p_user_id, v_session_start, v_session_actual_end, v_duration_minutes, v_break_minutes, '[]'::JSONB)
  RETURNING id INTO v_session_id;

  -- Associate ONLY blocks from this session with the new session_id
  UPDATE public.session_blocks
  SET session_id = v_session_id
  WHERE user_id = p_user_id
    AND session_id IS NULL
    AND start_time >= v_session_start
    AND start_time <= v_now;

  UPDATE public.users
  SET current_status = 'offline',
      current_focus = NULL,
      session_start_time = NULL,
      last_resumed_at = NULL,
      break_started_at = NULL,
      active_study_seconds_snapshot = 0,
      last_break_expired_study_seconds = CASE WHEN v_status = 'break' THEN v_total_study_seconds::INTEGER ELSE NULL END,
      pending_goal_session_id = v_session_id,
      pending_goal_seconds = (v_duration_minutes * 60),
      pending_goal_reason = CASE WHEN v_status = 'break' THEN 'break_expired' ELSE 'session_limit' END,
      last_offline_at = v_now,
      state_version = COALESCE(state_version, 1) + 1
  WHERE id = p_user_id
  RETURNING state_version INTO v_version;

  RETURN jsonb_build_object(
    'success', true,
    'session_id', v_session_id,
    'duration_minutes', v_duration_minutes,
    'break_minutes', v_break_minutes,
    'pending_goal_session_id', v_session_id,
    'pending_goal_seconds', (v_duration_minutes * 60),
    'pending_goal_reason', CASE WHEN v_status = 'break' THEN 'break_expired' ELSE 'session_limit' END,
    'state_version', v_version,
    'server_now', v_now
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.rpc_stop_user_session(UUID, TIMESTAMPTZ) TO authenticated, service_role;

-- RPC: Complete Session Goals (Authoritative Cross-Device Goal Completion RPC)
DROP FUNCTION IF EXISTS public.rpc_complete_session_goals(UUID, TEXT[]) CASCADE;

CREATE OR REPLACE FUNCTION public.rpc_complete_session_goals(
  p_session_id UUID DEFAULT NULL,
  p_completed_task_ids TEXT[] DEFAULT ARRAY[]::TEXT[]
)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_active_goal_id UUID;
  v_tasks JSONB;
  v_updated_tasks JSONB;
  v_elem JSONB;
  v_task_id TEXT;
  v_is_completed BOOLEAN;
  v_task_text TEXT;
  v_session_completed_tasks JSONB := '[]'::JSONB;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Strictly serialize concurrent requests for the same user via transaction advisory lock
  PERFORM pg_advisory_xact_lock(hashtext(v_user_id::text));

  -- 1. If tasks were completed, update daily_goals and build completed array
  IF p_completed_task_ids IS NOT NULL AND array_length(p_completed_task_ids, 1) > 0 THEN
    SELECT id, tasks INTO v_active_goal_id, v_tasks
    FROM public.daily_goals
    WHERE user_id = v_user_id
      AND (
        expires_at > v_now
        OR expires_at >= (v_now - INTERVAL '20 hours')
      )
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF v_active_goal_id IS NOT NULL AND v_tasks IS NOT NULL THEN
      v_updated_tasks := '[]'::JSONB;
      FOR v_elem IN SELECT * FROM jsonb_array_elements(v_tasks)
      LOOP
        v_task_id := v_elem->>'id';
        v_is_completed := COALESCE((v_elem->>'completed')::BOOLEAN, false);
        v_task_text := v_elem->>'task';

        IF v_task_id = ANY(p_completed_task_ids) THEN
          v_is_completed := true;
          v_session_completed_tasks := v_session_completed_tasks || jsonb_build_object(
            'id', v_task_id,
            'task', v_task_text
          );
        END IF;

        v_updated_tasks := v_updated_tasks || jsonb_build_object(
          'id', v_task_id,
          'task', v_task_text,
          'completed', v_is_completed
        );
      END LOOP;

      UPDATE public.daily_goals
      SET tasks = v_updated_tasks
      WHERE id = v_active_goal_id;
    END IF;

    -- 2. Link completed tasks to the target study_session and its split sibling (idempotent deduplication, BUG-06)
    IF p_session_id IS NOT NULL AND jsonb_array_length(v_session_completed_tasks) > 0 THEN
      UPDATE public.study_sessions
      SET completed_tasks = (
        SELECT COALESCE(jsonb_agg(elem), '[]'::JSONB)
        FROM (
          SELECT DISTINCT ON (t->>'id') t AS elem
          FROM (
            SELECT jsonb_array_elements(COALESCE(completed_tasks, '[]'::JSONB)) AS t
            UNION ALL
            SELECT jsonb_array_elements(v_session_completed_tasks) AS t
          ) combined
          WHERE t->>'id' IS NOT NULL
        ) deduplicated
      )
      WHERE user_id = v_user_id
        AND (
          id = p_session_id
          OR id = (
            SELECT sibling_session_id
            FROM public.study_sessions
            WHERE id = p_session_id AND user_id = v_user_id
          )
          OR sibling_session_id = p_session_id
        );
    END IF;
  END IF;

  -- 3. Atomically clear pending goal state on user profile
  UPDATE public.users
  SET pending_goal_session_id = NULL,
      pending_goal_seconds = NULL,
      pending_goal_reason = NULL,
      last_break_expired_study_seconds = NULL
  WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'session_id', p_session_id,
    'completed_tasks', v_session_completed_tasks,
    'server_now', v_now
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC to acknowledge and clear break-expiry notice for authenticated user
CREATE OR REPLACE FUNCTION public.rpc_acknowledge_break_expiry()
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_version BIGINT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.users
  SET last_break_expired_study_seconds = NULL,
      pending_goal_session_id = NULL,
      pending_goal_seconds = NULL,
      pending_goal_reason = NULL
  WHERE id = v_user_id
  RETURNING state_version INTO v_version;

  RETURN jsonb_build_object('success', true, 'state_version', v_version);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC to record goal completions after break expiry and attach them to the latest session
CREATE OR REPLACE FUNCTION public.rpc_record_break_expiry_goals(p_completed_task_ids TEXT[] DEFAULT ARRAY[]::TEXT[])
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_session_id UUID;
  v_sibling_id UUID;
  v_active_goal_id UUID;
  v_tasks JSONB;
  v_updated_tasks JSONB;
  v_elem JSONB;
  v_task_id TEXT;
  v_is_completed BOOLEAN;
  v_task_text TEXT;
  v_session_completed_tasks JSONB := '[]'::JSONB;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Strictly serialize concurrent requests for the same user via transaction advisory lock
  PERFORM pg_advisory_xact_lock(hashtext(v_user_id::text));

  -- Update daily goals if tasks were selected
  IF p_completed_task_ids IS NOT NULL AND array_length(p_completed_task_ids, 1) > 0 THEN
    SELECT id, tasks INTO v_active_goal_id, v_tasks
    FROM public.daily_goals
    WHERE user_id = v_user_id
      AND (
        expires_at > v_now
        OR expires_at >= (v_now - INTERVAL '20 hours')
      )
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF v_active_goal_id IS NOT NULL AND v_tasks IS NOT NULL THEN
      v_updated_tasks := '[]'::JSONB;
      FOR v_elem IN SELECT * FROM jsonb_array_elements(v_tasks)
      LOOP
        v_task_id := v_elem->>'id';
        v_is_completed := COALESCE((v_elem->>'completed')::BOOLEAN, false);
        v_task_text := v_elem->>'task';

        IF v_task_id = ANY(p_completed_task_ids) THEN
          v_is_completed := true;
          v_session_completed_tasks := v_session_completed_tasks || jsonb_build_object(
            'id', v_task_id,
            'task', v_task_text
          );
        END IF;

        v_updated_tasks := v_updated_tasks || jsonb_build_object(
          'id', v_task_id,
          'task', v_task_text,
          'completed', v_is_completed
        );
      END LOOP;

      UPDATE public.daily_goals
      SET tasks = v_updated_tasks
      WHERE id = v_active_goal_id;
    END IF;

    -- Attach completed tasks to the latest study session and its split sibling if applicable (BUG-06)
    SELECT id, sibling_session_id INTO v_session_id, v_sibling_id
    FROM public.study_sessions
    WHERE user_id = v_user_id
    ORDER BY end_time DESC
    LIMIT 1;

    IF v_session_id IS NOT NULL AND jsonb_array_length(v_session_completed_tasks) > 0 THEN
      UPDATE public.study_sessions
      SET completed_tasks = (
        SELECT COALESCE(jsonb_agg(elem), '[]'::JSONB)
        FROM (
          SELECT DISTINCT ON (t->>'id') t AS elem
          FROM (
            SELECT jsonb_array_elements(COALESCE(completed_tasks, '[]'::JSONB)) AS t
            UNION ALL
            SELECT jsonb_array_elements(v_session_completed_tasks) AS t
          ) combined
          WHERE t->>'id' IS NOT NULL
        ) deduplicated
      )
      WHERE user_id = v_user_id
        AND (id = v_session_id OR (v_sibling_id IS NOT NULL AND id = v_sibling_id));
    END IF;
  END IF;

  -- Clear break expiry snapshot on user profile
  UPDATE public.users
  SET last_break_expired_study_seconds = NULL
  WHERE id = v_user_id;

  RETURN jsonb_build_object('success', true, 'server_now', v_now);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC to atomically terminate all expired breaks across the entire platform
CREATE OR REPLACE FUNCTION public.rpc_cleanup_expired_breaks()
RETURNS JSONB AS $$
DECLARE
  v_count INTEGER := 0;
  v_user_rec RECORD;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  FOR v_user_rec IN
    SELECT id FROM public.users
    WHERE current_status = 'break'
      AND break_started_at IS NOT NULL
      AND EXTRACT(EPOCH FROM (v_now - break_started_at)) >= 3600
  LOOP
    PERFORM public.rpc_stop_user_session(v_user_rec.id);
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'terminated_count', v_count,
    'server_now', v_now
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
-- ------------------------------------------------------------
-- 14. RIVALRY WIN ANNOUNCEMENTS & GLOBAL EVENT SYNC
-- ------------------------------------------------------------

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
  rivalry_mode TEXT DEFAULT 'STUDY_TIME' CHECK (rivalry_mode IN ('STUDY_TIME', 'RANK_CLASH')),
  occurred_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Performance and deduplication indexes
CREATE INDEX IF NOT EXISTS idx_rivalry_events_occurred_at ON public.rivalry_events(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_rivalry_events_created_at ON public.rivalry_events(created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rivalry_events_resolution_id_unique ON public.rivalry_events(resolution_id);

-- Full replica identity for realtime subscription payloads
ALTER TABLE public.rivalry_events REPLICA IDENTITY FULL;
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

-- Include in supabase_realtime publication for instant cross-device delivery
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

-- ------------------------------------------------------------
-- 15. USER ALERTS AUDIT & QUEUE TABLE
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.user_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  user_name TEXT NOT NULL,
  user_email TEXT NOT NULL,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('A', 'I', 'D', 'W')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'dismissed')),
  consecutive_inactive_days INTEGER DEFAULT 0,
  reason TEXT NOT NULL,
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure check constraint allows all valid alert types ('A', 'I', 'D', 'W')
DO $$
BEGIN
  ALTER TABLE public.user_alerts DROP CONSTRAINT IF EXISTS user_alerts_alert_type_check;
  ALTER TABLE public.user_alerts ADD CONSTRAINT user_alerts_alert_type_check CHECK (alert_type IN ('A', 'I', 'D', 'W'));
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- Indexes for Alert Queries & Deduplication
CREATE INDEX IF NOT EXISTS idx_user_alerts_user_id ON public.user_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_user_alerts_alert_type ON public.user_alerts(alert_type);
CREATE INDEX IF NOT EXISTS idx_user_alerts_status ON public.user_alerts(status);
CREATE INDEX IF NOT EXISTS idx_user_alerts_created_at ON public.user_alerts(created_at DESC);

-- Enable RLS
ALTER TABLE public.user_alerts ENABLE ROW LEVEL SECURITY;

-- Admins only policy
DROP POLICY IF EXISTS "Admins can view and manage user_alerts" ON public.user_alerts;
CREATE POLICY "Admins can view and manage user_alerts"
  ON public.user_alerts
  FOR ALL
  TO authenticated
  USING (public.check_is_admin())
  WITH CHECK (public.check_is_admin());

-- RPC: rpc_reconcile_expired_sessions (Server-Side Zero-Client Session Expiration)
CREATE OR REPLACE FUNCTION public.rpc_reconcile_expired_sessions()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_role TEXT;
  v_user RECORD;
  v_count INTEGER := 0;
  v_study_count INTEGER := 0;
  v_break_count INTEGER := 0;
  v_start_time TIMESTAMPTZ := clock_timestamp();
  v_duration_ms NUMERIC;
BEGIN
  -- Privilege Check: Allow postgres/supabase_admin (pg_cron or SQL editor), service_role (server cron / JWT), or authorized admins
  IF current_user NOT IN ('postgres', 'supabase_admin')
     AND session_user NOT IN ('postgres', 'supabase_admin')
     AND COALESCE(current_setting('role', true), '') NOT IN ('postgres', 'service_role')
     AND COALESCE(auth.jwt() ->> 'role', '') != 'service_role'
     AND NOT public.check_is_admin() THEN
    RAISE EXCEPTION 'Access denied: rpc_reconcile_expired_sessions requires service_role or admin privileges';
  END IF;

  -- Reconcile users who have been studying continuously >= 3 hours (10,800 seconds)
  FOR v_user IN
    SELECT id FROM public.users
    WHERE current_status = 'studying'
      AND (
        (session_start_time IS NOT NULL AND NOW() - session_start_time >= INTERVAL '3 hours') OR
        (last_resumed_at IS NOT NULL AND NOW() - last_resumed_at >= INTERVAL '3 hours')
      )
  LOOP
    BEGIN
      PERFORM public.rpc_stop_user_session(v_user.id);
      v_count := v_count + 1;
      v_study_count := v_study_count + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Failed to reconcile expired study session for user %: %', v_user.id, SQLERRM;
    END;
  END LOOP;

  -- Reconcile users whose break has exceeded 1 hour (3,600 seconds)
  FOR v_user IN
    SELECT id FROM public.users
    WHERE current_status = 'break'
      AND break_started_at IS NOT NULL
      AND NOW() - break_started_at >= INTERVAL '1 hour'
  LOOP
    BEGIN
      PERFORM public.rpc_stop_user_session(v_user.id);
      v_count := v_count + 1;
      v_break_count := v_break_count + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Failed to reconcile expired break for user %: %', v_user.id, SQLERRM;
    END;
  END LOOP;

  v_duration_ms := ROUND(EXTRACT(EPOCH FROM (clock_timestamp() - v_start_time)) * 1000, 2);

  RETURN jsonb_build_object(
    'success', true,
    'reconciled_count', v_count,
    'expired_study_count', v_study_count,
    'expired_break_count', v_break_count,
    'duration_ms', v_duration_ms,
    'server_now', NOW()
  );
END;
$$;

-- Function Authorization Grants
REVOKE EXECUTE ON FUNCTION public.rpc_reconcile_expired_sessions() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rpc_reconcile_expired_sessions() FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_reconcile_expired_sessions() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_reconcile_expired_sessions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_reconcile_expired_sessions() TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_reconcile_expired_sessions() TO postgres;

-- ============================================================
-- GLOBAL ANALYTICS OBSERVATORY & ACHIEVER SNAPSHOTS SCHEMA
-- ============================================================

-- 1. WEEKLY ACHIEVER CELEBRATION SNAPSHOTS
CREATE TABLE IF NOT EXISTS public.weekly_achiever_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  celebration_period_id TEXT NOT NULL UNIQUE, -- e.g. '2026-10-05' (active week)
  source_period_id TEXT NOT NULL,            -- e.g. '2026-09-28' (evaluated week)
  achiever_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  week_start TIMESTAMPTZ NOT NULL,
  week_end TIMESTAMPTZ NOT NULL,
  total_study_minutes INTEGER NOT NULL DEFAULT 0,
  average_study_minutes_per_day NUMERIC(5, 1) NOT NULL DEFAULT 0.0,
  study_sessions_count INTEGER NOT NULL DEFAULT 0,
  active_study_days INTEGER NOT NULL DEFAULT 0,
  goal_completion_pct NUMERIC(5, 1) NOT NULL DEFAULT 0.0,
  completed_goals_count INTEGER NOT NULL DEFAULT 0,
  total_goals_count INTEGER NOT NULL DEFAULT 0,
  leaderboard_score NUMERIC(5, 1) NOT NULL DEFAULT 0.0,
  global_rank INTEGER NOT NULL DEFAULT 1,
  is_finalized BOOLEAN NOT NULL DEFAULT FALSE,
  finalized_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_weekly_achiever_celebration_period 
  ON public.weekly_achiever_snapshots(celebration_period_id);
CREATE INDEX IF NOT EXISTS idx_weekly_achiever_user_id 
  ON public.weekly_achiever_snapshots(achiever_user_id);

-- 2. WEEKLY GLOBAL ANALYTICS SNAPSHOTS (Top 5 & Community Aggregates)
CREATE TABLE IF NOT EXISTS public.weekly_global_analytics_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id TEXT NOT NULL UNIQUE,             -- source evaluated period e.g. '2026-09-28'
  celebration_period_id TEXT NOT NULL UNIQUE, -- active celebration period e.g. '2026-10-05'
  week_start TIMESTAMPTZ NOT NULL,
  week_end TIMESTAMPTZ NOT NULL,
  rankings JSONB NOT NULL DEFAULT '{}'::jsonb,
  community_stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_finalized BOOLEAN NOT NULL DEFAULT FALSE,
  finalized_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_global_analytics_period_id 
  ON public.weekly_global_analytics_snapshots(period_id);
CREATE INDEX IF NOT EXISTS idx_global_analytics_celebration_period 
  ON public.weekly_global_analytics_snapshots(celebration_period_id);

-- 3. WEEKLY USER ANALYTICS RECORDS (O(1) Indexed User Position)
CREATE TABLE IF NOT EXISTS public.weekly_user_analytics_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id TEXT NOT NULL,                    -- source period e.g. '2026-09-28'
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  rank INTEGER NOT NULL,
  percentile NUMERIC(5, 1) NOT NULL DEFAULT 0.0,
  total_study_minutes INTEGER NOT NULL DEFAULT 0,
  daily_average_minutes NUMERIC(5, 1) NOT NULL DEFAULT 0.0,
  active_study_days INTEGER NOT NULL DEFAULT 0,
  completed_tasks INTEGER NOT NULL DEFAULT 0,
  total_tasks INTEGER NOT NULL DEFAULT 0,
  goal_completion_pct NUMERIC(5, 1) NOT NULL DEFAULT 0.0,
  score NUMERIC(5, 1) NOT NULL DEFAULT 0.0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_weekly_user_records UNIQUE (period_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_weekly_user_records_lookup 
  ON public.weekly_user_analytics_records(period_id, user_id);
CREATE INDEX IF NOT EXISTS idx_weekly_user_records_rank 
  ON public.weekly_user_analytics_records(period_id, rank);

-- 4. PER-USER PERIOD ACKNOWLEDGEMENTS (Room Alert Suppression)
CREATE TABLE IF NOT EXISTS public.user_analytics_acknowledgements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  period_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('dismissed', 'viewed')),
  acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_user_period_ack UNIQUE (user_id, period_id)
);

CREATE INDEX IF NOT EXISTS idx_user_analytics_ack_lookup 
  ON public.user_analytics_acknowledgements(user_id, period_id);

-- 5. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.weekly_achiever_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_global_analytics_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_user_analytics_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_analytics_acknowledgements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_read_weekly_achiever_snapshots ON public.weekly_achiever_snapshots;
CREATE POLICY p_read_weekly_achiever_snapshots 
  ON public.weekly_achiever_snapshots FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS p_read_weekly_global_analytics_snapshots ON public.weekly_global_analytics_snapshots;
CREATE POLICY p_read_weekly_global_analytics_snapshots 
  ON public.weekly_global_analytics_snapshots FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS p_read_weekly_user_analytics_records ON public.weekly_user_analytics_records;
CREATE POLICY p_read_weekly_user_analytics_records 
  ON public.weekly_user_analytics_records FOR SELECT TO authenticated 
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS p_read_user_analytics_acknowledgements ON public.user_analytics_acknowledgements;
CREATE POLICY p_read_user_analytics_acknowledgements 
  ON public.user_analytics_acknowledgements FOR SELECT TO authenticated 
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS p_insert_user_analytics_acknowledgements ON public.user_analytics_acknowledgements;
CREATE POLICY p_insert_user_analytics_acknowledgements 
  ON public.user_analytics_acknowledgements FOR INSERT TO authenticated 
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS p_update_user_analytics_acknowledgements ON public.user_analytics_acknowledgements;
CREATE POLICY p_update_user_analytics_acknowledgements 
  ON public.user_analytics_acknowledgements FOR UPDATE TO authenticated 
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 6. AUTHORITATIVE RPC: rpc_finalize_weekly_global_analytics
CREATE OR REPLACE FUNCTION public.rpc_finalize_weekly_global_analytics(
  p_timezone TEXT DEFAULT 'Asia/Kolkata',
  p_target_week_start TIMESTAMPTZ DEFAULT NULL,
  p_force BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_tz TEXT := COALESCE(NULLIF(p_timezone, ''), 'Asia/Kolkata');
  v_source_week_start TIMESTAMPTZ;
  v_source_week_end TIMESTAMPTZ;
  v_celebration_week_start TIMESTAMPTZ;
  v_source_period_id TEXT;
  v_celebration_period_id TEXT;
  v_existing_id UUID;
  v_winner_id UUID;
  v_achiever_rec RECORD;
  v_total_eligible INTEGER := 0;
  v_global_avg_study_mins NUMERIC(7, 1) := 0.0;
  v_global_avg_goal_pct NUMERIC(5, 1) := 0.0;
  v_total_community_hours NUMERIC(9, 1) := 0.0;
  v_total_completed_goals INTEGER := 0;
  v_most_studying JSONB := '[]'::jsonb;
  v_consistency_entries JSONB := '[]'::jsonb;
  v_achiever_winners JSONB := '[]'::jsonb;
  v_goal_chasers JSONB := '[]'::jsonb;
  v_community_stats JSONB := '{}'::jsonb;
  v_now TIMESTAMPTZ := NOW();
  v_default_admin_id UUID := '8076296e-134a-4036-b8ed-1a9c6ff26ec1'::uuid;
BEGIN
  -- 0. Caller authorization: only service_role, postgres, or platform admins can invoke finalization
  IF (COALESCE(auth.jwt() ->> 'role', '') != 'service_role')
     AND (current_user NOT IN ('postgres', 'supabase_admin'))
     AND (auth.uid() IS NULL OR NOT EXISTS (
       SELECT 1 FROM public.users WHERE id = auth.uid() AND (COALESCE(is_admin, FALSE) = TRUE OR id = v_default_admin_id)
     )) THEN
    RAISE EXCEPTION 'Unauthorized: Global Analytics finalization requires service_role or admin privileges.';
  END IF;

  -- 1. Determine canonical source and celebration week boundaries
  IF p_target_week_start IS NULL THEN
    v_source_week_start := (DATE_TRUNC('week', (v_now - INTERVAL '7 days') AT TIME ZONE v_tz) AT TIME ZONE v_tz);
  ELSE
    v_source_week_start := (DATE_TRUNC('week', p_target_week_start AT TIME ZONE v_tz) AT TIME ZONE v_tz);
  END IF;
  v_source_week_end := v_source_week_start + INTERVAL '7 days';
  v_celebration_week_start := v_source_week_end;

  v_source_period_id := TO_CHAR(v_source_week_start AT TIME ZONE v_tz, 'YYYY-MM-DD');
  v_celebration_period_id := TO_CHAR(v_celebration_week_start AT TIME ZONE v_tz, 'YYYY-MM-DD');

  -- 2. Strictly serialize finalization under advisory transaction lock
  PERFORM pg_advisory_xact_lock(hashtext('global_analytics_finalization_' || v_source_period_id));

  -- 3. Idempotency Check: If already finalized, exit immediately unless force recalculation is requested
  SELECT id INTO v_existing_id
  FROM public.weekly_global_analytics_snapshots
  WHERE period_id = v_source_period_id AND is_finalized = TRUE;

  IF v_existing_id IS NOT NULL AND NOT COALESCE(p_force, FALSE) THEN
    RETURN jsonb_build_object(
      'success', true,
      'action', 'already_finalized',
      'already_finalized', true,
      'period_id', v_source_period_id,
      'celebration_period_id', v_celebration_period_id
    );
  END IF;

  -- 4. Authoritatively reconcile any pending expired sessions prior to computing previous week's metrics
  BEGIN
    PERFORM public.rpc_reconcile_expired_sessions();
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Session reconciliation notice during finalization: %', SQLERRM;
  END;

  -- 5. Create temporary working table from canonical rpc_get_leaderboard for evaluated week
  DROP TABLE IF EXISTS temp_finalized_leaderboard;
  CREATE TEMP TABLE temp_finalized_leaderboard ON COMMIT DROP AS
  SELECT
    ROW_NUMBER() OVER (ORDER BY lb.score DESC, lb.total_study_minutes DESC, lb.display_name ASC)::INTEGER AS rank,
    lb.user_id,
    lb.display_name,
    lb.avatar_url,
    lb.total_study_minutes,
    ROUND((lb.total_study_minutes::NUMERIC / 7.0), 1) AS daily_average_minutes,
    lb.completed_tasks,
    lb.total_tasks,
    lb.goal_completion_pct,
    COALESCE(
      lb.streak_days,
      act_days.days_count,
      0
    )::INTEGER AS active_study_days,
    lb.score
  FROM public.rpc_get_leaderboard(v_source_week_start, v_tz) lb
  LEFT JOIN (
    SELECT
      day_study.user_id,
      COUNT(DISTINCT day_study.study_date)::INTEGER AS days_count
    FROM (
      SELECT
        ss.user_id,
        DATE(ss.start_time AT TIME ZONE v_tz) AS study_date,
        SUM(ss.duration_minutes) AS day_mins
      FROM public.study_sessions ss
      WHERE ss.start_time >= v_source_week_start
        AND ss.start_time < v_source_week_end
        AND ss.duration_minutes > 0
      GROUP BY ss.user_id, DATE(ss.start_time AT TIME ZONE v_tz)
      HAVING SUM(ss.duration_minutes) >= 30
    ) day_study
    GROUP BY day_study.user_id
  ) act_days ON lb.user_id = act_days.user_id
  JOIN public.users u ON lb.user_id = u.id
  WHERE COALESCE(u.is_admin, FALSE) = FALSE
    AND lb.user_id != v_default_admin_id
    AND u.created_at < v_source_week_end;

  SELECT COUNT(*)::INTEGER INTO v_total_eligible FROM temp_finalized_leaderboard;

  -- Compute community summary aggregates
  IF v_total_eligible > 0 THEN
    SELECT
      ROUND(AVG(total_study_minutes)::NUMERIC, 1),
      ROUND((SUM(total_study_minutes)::NUMERIC / 60.0), 1),
      ROUND(AVG(goal_completion_pct)::NUMERIC, 1),
      COALESCE(SUM(completed_tasks), 0)::INTEGER
    INTO
      v_global_avg_study_mins,
      v_total_community_hours,
      v_global_avg_goal_pct,
      v_total_completed_goals
    FROM temp_finalized_leaderboard;
  END IF;

  v_community_stats := jsonb_build_object(
    'total_eligible_students', v_total_eligible,
    'global_avg_study_minutes', v_global_avg_study_mins,
    'global_avg_daily_minutes', ROUND((v_global_avg_study_mins / 7.0), 1),
    'global_avg_goal_pct', v_global_avg_goal_pct,
    'total_community_hours', v_total_community_hours,
    'total_completed_goals', v_total_completed_goals
  );

  -- 6. Populate per-user historical records (weekly_user_analytics_records)
  DELETE FROM public.weekly_user_analytics_records WHERE period_id = v_source_period_id;

  IF v_total_eligible > 0 THEN
    INSERT INTO public.weekly_user_analytics_records (
      period_id,
      user_id,
      rank,
      percentile,
      total_study_minutes,
      daily_average_minutes,
      active_study_days,
      completed_tasks,
      total_tasks,
      goal_completion_pct,
      score,
      created_at
    )
    SELECT
      v_source_period_id,
      tf.user_id,
      tf.rank,
      CASE
        WHEN v_total_eligible <= 1 THEN 1.0
        ELSE GREATEST(1.0, LEAST(100.0, CEIL((tf.rank::NUMERIC / v_total_eligible::NUMERIC) * 100.0)))
      END AS percentile,
      tf.total_study_minutes,
      tf.daily_average_minutes,
      tf.active_study_days,
      tf.completed_tasks,
      tf.total_tasks,
      tf.goal_completion_pct,
      tf.score,
      v_now
    FROM temp_finalized_leaderboard tf;
  END IF;

  -- 7. Persist weekly_achiever_snapshots (Prior to Hall of Fame calculation to include current title)
  IF v_total_eligible > 0 THEN
    SELECT * INTO v_achiever_rec
    FROM temp_finalized_leaderboard
    WHERE rank = 1;
    v_winner_id := v_achiever_rec.user_id;

    -- If finalizing the immediately completed week, sync live badge in public.users
    IF (v_source_week_start = (DATE_TRUNC('week', (v_now - INTERVAL '7 days') AT TIME ZONE v_tz) AT TIME ZONE v_tz)) THEN
      PERFORM set_config('studyroom.internal_badge_update', 'true', true);
      UPDATE public.users SET has_achiever_badge = FALSE WHERE has_achiever_badge = TRUE;
      IF v_winner_id IS NOT NULL THEN
        UPDATE public.users SET has_achiever_badge = TRUE WHERE id = v_winner_id;
      END IF;
    END IF;
  END IF;

  IF v_achiever_rec IS NOT NULL THEN
    INSERT INTO public.weekly_achiever_snapshots (
      celebration_period_id,
      source_period_id,
      achiever_user_id,
      display_name,
      avatar_url,
      week_start,
      week_end,
      total_study_minutes,
      average_study_minutes_per_day,
      study_sessions_count,
      active_study_days,
      goal_completion_pct,
      completed_goals_count,
      total_goals_count,
      leaderboard_score,
      global_rank,
      is_finalized,
      finalized_at
    )
    VALUES (
      v_celebration_period_id,
      v_source_period_id,
      v_achiever_rec.user_id,
      v_achiever_rec.display_name,
      v_achiever_rec.avatar_url,
      v_source_week_start,
      v_source_week_end,
      v_achiever_rec.total_study_minutes,
      v_achiever_rec.daily_average_minutes,
      (SELECT COUNT(*)::INTEGER FROM public.study_sessions ss WHERE ss.user_id = v_achiever_rec.user_id AND ss.start_time >= v_source_week_start AND ss.start_time < v_source_week_end),
      v_achiever_rec.active_study_days,
      v_achiever_rec.goal_completion_pct,
      v_achiever_rec.completed_tasks,
      v_achiever_rec.total_tasks,
      v_achiever_rec.score,
      v_achiever_rec.rank,
      TRUE,
      v_now
    )
    ON CONFLICT (celebration_period_id) DO UPDATE SET
      display_name = EXCLUDED.display_name,
      avatar_url = EXCLUDED.avatar_url,
      total_study_minutes = EXCLUDED.total_study_minutes,
      average_study_minutes_per_day = EXCLUDED.average_study_minutes_per_day,
      goal_completion_pct = EXCLUDED.goal_completion_pct,
      leaderboard_score = EXCLUDED.leaderboard_score,
      is_finalized = TRUE,
      finalized_at = v_now
    WHERE weekly_achiever_snapshots.is_finalized = FALSE OR COALESCE(p_force, FALSE) = TRUE;
  END IF;

  -- 8. Build Four Core Global Analytics Rankings
  -- Category A: Top 5 Most Studying Students (Daily average DESC)
  SELECT COALESCE(jsonb_agg(row_data), '[]'::jsonb)
  INTO v_most_studying
  FROM (
    SELECT jsonb_build_object(
      'rank', ROW_NUMBER() OVER (ORDER BY daily_average_minutes DESC, total_study_minutes DESC, display_name ASC),
      'user_id', user_id,
      'display_name', display_name,
      'avatar_url', avatar_url,
      'total_study_minutes', total_study_minutes,
      'daily_average_minutes', daily_average_minutes,
      'active_study_days', active_study_days,
      'score', score
    ) AS row_data
    FROM temp_finalized_leaderboard
    ORDER BY daily_average_minutes DESC, total_study_minutes DESC, display_name ASC
    LIMIT 5
  ) sub_most;

  -- Category B: Top 5 Consistent Students (Active study days DESC, Total study minutes DESC)
  SELECT COALESCE(jsonb_agg(row_data), '[]'::jsonb)
  INTO v_consistency_entries
  FROM (
    SELECT jsonb_build_object(
      'rank', ROW_NUMBER() OVER (ORDER BY active_study_days DESC, total_study_minutes DESC, score DESC, display_name ASC, user_id ASC),
      'user_id', user_id,
      'display_name', display_name,
      'avatar_url', avatar_url,
      'total_study_minutes', total_study_minutes,
      'daily_average_minutes', daily_average_minutes,
      'active_study_days', active_study_days,
      'score', score
    ) AS row_data
    FROM temp_finalized_leaderboard
    ORDER BY active_study_days DESC, total_study_minutes DESC, score DESC, display_name ASC, user_id ASC
    LIMIT 5
  ) sub_low;

  -- Category C: Achiever Badge Winners (Historical badge count DESC, including current week)
  SELECT COALESCE(jsonb_agg(row_data), '[]'::jsonb)
  INTO v_achiever_winners
  FROM (
    SELECT jsonb_build_object(
      'rank', ROW_NUMBER() OVER (ORDER BY badge_counts.achiever_count DESC, tf.total_study_minutes DESC, tf.display_name ASC),
      'user_id', tf.user_id,
      'display_name', tf.display_name,
      'avatar_url', tf.avatar_url,
      'achiever_count', badge_counts.achiever_count,
      'total_study_minutes', tf.total_study_minutes
    ) AS row_data
    FROM temp_finalized_leaderboard tf
    JOIN (
      SELECT
        u.id AS user_id,
        GREATEST(
          COALESCE((SELECT COUNT(*)::INTEGER FROM public.weekly_achiever_snapshots was WHERE was.achiever_user_id = u.id AND was.week_start <= v_source_week_start AND was.is_finalized = TRUE), 0) +
          COALESCE((
            SELECT COUNT(DISTINCT DATE_TRUNC('week', (ua.sent_at - INTERVAL '1 day') AT TIME ZONE v_tz))::INTEGER 
            FROM public.user_alerts ua 
            WHERE ua.user_id = u.id 
              AND ua.alert_type = 'A' 
              AND ua.status = 'sent' 
              AND ua.sent_at < v_source_week_end
              AND DATE_TRUNC('week', (ua.sent_at - INTERVAL '1 day') AT TIME ZONE v_tz) NOT IN (
                SELECT DATE_TRUNC('week', was.week_start AT TIME ZONE v_tz)
                FROM public.weekly_achiever_snapshots was
                WHERE was.achiever_user_id IS NOT NULL
                  AND was.week_start <= v_source_week_start
              )
          ), 0),
          CASE WHEN u.has_achiever_badge AND (v_source_week_start >= (DATE_TRUNC('week', (v_now - INTERVAL '7 days') AT TIME ZONE v_tz) AT TIME ZONE v_tz)) THEN 1 ELSE 0 END
        ) AS achiever_count
      FROM public.users u
      WHERE COALESCE(u.is_admin, FALSE) = FALSE AND u.id != v_default_admin_id
        AND u.created_at < v_source_week_end
    ) badge_counts ON tf.user_id = badge_counts.user_id
    WHERE badge_counts.achiever_count > 0
    ORDER BY badge_counts.achiever_count DESC, tf.total_study_minutes DESC, tf.display_name ASC
    LIMIT 10
  ) sub_achievers;

  -- Category D: Top 5 Goal Chasers (Completion % DESC for users with total_tasks > 0)
  SELECT COALESCE(jsonb_agg(row_data), '[]'::jsonb)
  INTO v_goal_chasers
  FROM (
    SELECT jsonb_build_object(
      'rank', ROW_NUMBER() OVER (ORDER BY goal_completion_pct DESC, completed_tasks DESC, total_tasks DESC, total_study_minutes DESC, display_name ASC),
      'user_id', user_id,
      'display_name', display_name,
      'avatar_url', avatar_url,
      'completed_tasks', completed_tasks,
      'total_tasks', total_tasks,
      'goal_completion_pct', goal_completion_pct,
      'total_study_minutes', total_study_minutes
    ) AS row_data
    FROM temp_finalized_leaderboard
    WHERE total_tasks > 0
    ORDER BY goal_completion_pct DESC, completed_tasks DESC, total_tasks DESC, total_study_minutes DESC, display_name ASC
    LIMIT 5
  ) sub_goals;

  -- 9. Persist weekly_global_analytics_snapshots
  INSERT INTO public.weekly_global_analytics_snapshots (
    period_id,
    celebration_period_id,
    week_start,
    week_end,
    rankings,
    community_stats,
    is_finalized,
    finalized_at
  )
  VALUES (
    v_source_period_id,
    v_celebration_period_id,
    v_source_week_start,
    v_source_week_end,
    jsonb_build_object(
      'most_studying', v_most_studying,
      'consistency_rhythm_matrix', v_consistency_entries,
      'achiever_winners', v_achiever_winners,
      'goal_chasers', v_goal_chasers
    ),
    v_community_stats,
    TRUE,
    v_now
  )
  ON CONFLICT (period_id) DO UPDATE SET
    celebration_period_id = EXCLUDED.celebration_period_id,
    rankings = EXCLUDED.rankings,
    community_stats = EXCLUDED.community_stats,
    is_finalized = TRUE,
    finalized_at = v_now
  WHERE weekly_global_analytics_snapshots.is_finalized = FALSE OR COALESCE(p_force, FALSE) = TRUE;

  RETURN jsonb_build_object(
    'success', true,
    'action', 'finalized',
    'period_id', v_source_period_id,
    'celebration_period_id', v_celebration_period_id,
    'achiever_id', v_winner_id,
    'total_eligible', v_total_eligible,
    'finalized_at', v_now
  );
END;
$$;

-- 7. AUTHORITATIVE RPC: rpc_get_global_analytics
CREATE OR REPLACE FUNCTION public.rpc_get_global_analytics(
  p_timezone TEXT DEFAULT 'Asia/Kolkata',
  p_week_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_tz TEXT := COALESCE(NULLIF(p_timezone, ''), 'Asia/Kolkata');
  v_user_id UUID := auth.uid();
  v_source_week_start TIMESTAMPTZ;
  v_source_period_id TEXT;
  v_celebration_period_id TEXT;
  v_snapshot RECORD;
  v_achiever RECORD;
  v_user_record RECORD;
  v_user_position JSONB := NULL;
  v_top5_cutoff_mins INTEGER := 0;
  v_mins_to_top5 INTEGER := 0;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  -- 1. Determine period to inspect
  IF p_week_id IS NOT NULL AND p_week_id <> '' THEN
    v_source_period_id := p_week_id;
  ELSE
    SELECT period_id INTO v_source_period_id
    FROM public.weekly_global_analytics_snapshots
    WHERE is_finalized = TRUE
    ORDER BY week_start DESC
    LIMIT 1;

    IF v_source_period_id IS NULL THEN
      v_source_week_start := (DATE_TRUNC('week', (v_now - INTERVAL '7 days') AT TIME ZONE v_tz) AT TIME ZONE v_tz);
      v_source_period_id := TO_CHAR(v_source_week_start AT TIME ZONE v_tz, 'YYYY-MM-DD');
    END IF;
  END IF;

  -- 2. Fetch finalized snapshot (Pure read-only query; no side-effect mutations from GET)
  SELECT * INTO v_snapshot
  FROM public.weekly_global_analytics_snapshots
  WHERE period_id = v_source_period_id AND is_finalized = TRUE;

  IF v_snapshot IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'is_finalized', false,
      'period_id', v_source_period_id,
      'message', 'Analytics for this period have not yet been finalized.'
    );
  END IF;

  v_celebration_period_id := v_snapshot.celebration_period_id;

  -- 3. Fetch Achiever Celebration Snapshot
  SELECT * INTO v_achiever
  FROM public.weekly_achiever_snapshots
  WHERE celebration_period_id = v_celebration_period_id AND is_finalized = TRUE;

  -- 4. O(1) B-tree lookup for calling user's individual position
  IF v_user_id IS NOT NULL THEN
    SELECT * INTO v_user_record
    FROM public.weekly_user_analytics_records
    WHERE period_id = v_source_period_id AND user_id = v_user_id;

    IF v_user_record IS NOT NULL THEN
      -- Extract 5th place cutoff from rankings to compute distance to Top 5
      v_top5_cutoff_mins := COALESCE(
        (v_snapshot.rankings->'most_studying'->4->>'total_study_minutes')::INTEGER,
        (v_snapshot.rankings->'most_studying'->0->>'total_study_minutes')::INTEGER,
        0
      );

      IF (v_user_record.rank <= 5) OR (COALESCE((v_snapshot.community_stats->>'total_eligible_students')::INTEGER, 1) <= 5) THEN
        v_mins_to_top5 := 0;
      ELSE
        v_mins_to_top5 := GREATEST(0, v_top5_cutoff_mins - v_user_record.total_study_minutes + 1);
      END IF;

      v_user_position := jsonb_build_object(
        'user_id', v_user_id,
        'rank', v_user_record.rank,
        'total_eligible_students', COALESCE((v_snapshot.community_stats->>'total_eligible_students')::INTEGER, 1),
        'percentile', v_user_record.percentile,
        'total_study_minutes', v_user_record.total_study_minutes,
        'daily_average_minutes', v_user_record.daily_average_minutes,
        'active_study_days', v_user_record.active_study_days,
        'completed_tasks', v_user_record.completed_tasks,
        'total_tasks', v_user_record.total_tasks,
        'goal_completion_pct', v_user_record.goal_completion_pct,
        'score', v_user_record.score,
        'is_in_top5', ((v_user_record.rank <= 5) OR (COALESCE((v_snapshot.community_stats->>'total_eligible_students')::INTEGER, 1) <= 5)),
        'minutes_to_top5', v_mins_to_top5,
        'delta_vs_community_study_mins', ROUND(v_user_record.total_study_minutes - COALESCE((v_snapshot.community_stats->>'global_avg_study_minutes')::NUMERIC, 0), 1),
        'delta_vs_community_goal_pct', ROUND(v_user_record.goal_completion_pct - COALESCE((v_snapshot.community_stats->>'global_avg_goal_pct')::NUMERIC, 0), 1)
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'is_finalized', true,
    'period_id', v_source_period_id,
    'celebration_period_id', v_celebration_period_id,
    'week_start', v_snapshot.week_start,
    'week_end', v_snapshot.week_end,
    'finalized_at', v_snapshot.finalized_at,
    'achiever', CASE WHEN v_achiever IS NOT NULL THEN
      jsonb_build_object(
        'id', v_achiever.id,
        'celebration_period_id', v_celebration_period_id,
        'source_period_id', v_source_period_id,
        'achiever_user_id', v_achiever.achiever_user_id,
        'display_name', v_achiever.display_name,
        'avatar_url', v_achiever.avatar_url,
        'week_start', v_achiever.week_start,
        'week_end', v_achiever.week_end,
        'total_study_minutes', v_achiever.total_study_minutes,
        'average_study_minutes_per_day', v_achiever.average_study_minutes_per_day,
        'study_sessions_count', v_achiever.study_sessions_count,
        'active_study_days', v_achiever.active_study_days,
        'goal_completion_pct', v_achiever.goal_completion_pct,
        'completed_goals_count', v_achiever.completed_goals_count,
        'total_goals_count', v_achiever.total_goals_count,
        'leaderboard_score', v_achiever.leaderboard_score,
        'score', v_achiever.leaderboard_score,
        'global_rank', v_achiever.global_rank,
        'is_finalized', v_achiever.is_finalized,
        'finalized_at', v_achiever.finalized_at
      )
    ELSE NULL END,
    'rankings', v_snapshot.rankings,
    'community_stats', v_snapshot.community_stats,
    'user_position', v_user_position
  );
END;
$$;

-- 8. AUTHORITATIVE RPC: rpc_get_user_analytics_alert_status
CREATE OR REPLACE FUNCTION public.rpc_get_user_analytics_alert_status(
  p_timezone TEXT DEFAULT 'Asia/Kolkata'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_tz TEXT := COALESCE(NULLIF(p_timezone, ''), 'Asia/Kolkata');
  v_user_id UUID := auth.uid();
  v_current_monday TIMESTAMPTZ;
  v_celebration_period_id TEXT;
  v_achiever_name TEXT;
  v_has_finalized_analytics BOOLEAN := false;
  v_already_acknowledged BOOLEAN := false;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('show_alert', false);
  END IF;

  -- 1. Identify the latest finalized analytics period
  SELECT celebration_period_id INTO v_celebration_period_id
  FROM public.weekly_global_analytics_snapshots
  WHERE is_finalized = TRUE
  ORDER BY week_start DESC
  LIMIT 1;

  IF v_celebration_period_id IS NULL THEN
    SELECT celebration_period_id INTO v_celebration_period_id
    FROM public.weekly_achiever_snapshots
    WHERE is_finalized = TRUE
    ORDER BY week_start DESC
    LIMIT 1;
  END IF;

  IF v_celebration_period_id IS NULL THEN
    RETURN jsonb_build_object('show_alert', false);
  END IF;

  -- 2. Fetch the Achiever display name for this finalized period
  SELECT display_name INTO v_achiever_name
  FROM public.weekly_achiever_snapshots
  WHERE celebration_period_id = v_celebration_period_id AND is_finalized = TRUE;

  -- 3. Check if user already acknowledged for this specific period
  SELECT EXISTS (
    SELECT 1 FROM public.user_analytics_acknowledgements
    WHERE user_id = v_user_id AND period_id = v_celebration_period_id
  ) INTO v_already_acknowledged;

  IF v_already_acknowledged THEN
    RETURN jsonb_build_object('show_alert', false);
  END IF;

  RETURN jsonb_build_object(
    'show_alert', true,
    'celebration_period_id', v_celebration_period_id,
    'achiever_name', COALESCE(v_achiever_name, 'the community leader')
  );
END;
$$;

-- 9. AUTHORITATIVE RPC: rpc_acknowledge_analytics_alert
CREATE OR REPLACE FUNCTION public.rpc_acknowledge_analytics_alert(
  p_period_id TEXT,
  p_action TEXT DEFAULT 'dismissed'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_action TEXT := COALESCE(NULLIF(p_action, ''), 'dismissed');
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF v_action NOT IN ('dismissed', 'viewed') THEN
    v_action := 'dismissed';
  END IF;

  INSERT INTO public.user_analytics_acknowledgements (
    user_id,
    period_id,
    action,
    acknowledged_at
  )
  VALUES (
    v_user_id,
    p_period_id,
    v_action,
    NOW()
  )
  ON CONFLICT (user_id, period_id) DO UPDATE SET
    action = EXCLUDED.action,
    acknowledged_at = NOW();

  RETURN jsonb_build_object(
    'success', true,
    'user_id', v_user_id,
    'period_id', p_period_id,
    'action', v_action
  );
END;
$$;

-- 10. GRANTS & ACCESS CONTROL HARDENING
REVOKE EXECUTE ON FUNCTION public.rpc_finalize_weekly_global_analytics(TEXT, TIMESTAMPTZ, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_finalize_weekly_global_analytics(TEXT, TIMESTAMPTZ, BOOLEAN) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.rpc_get_global_analytics(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_get_global_analytics(TEXT, TEXT) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.rpc_get_user_analytics_alert_status(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_get_user_analytics_alert_status(TEXT) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.rpc_acknowledge_analytics_alert(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_acknowledge_analytics_alert(TEXT, TEXT) TO authenticated, service_role;



-- ==============================================================================
-- 11. COMMUNITY & SOCIAL CHANNEL LINKS CONFIGURATION
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.social_community_links (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  action_text TEXT NOT NULL DEFAULT 'Join Now',
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 1,
  icon_key TEXT NOT NULL DEFAULT 'whatsapp',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_social_links_order ON public.social_community_links(display_order ASC);
CREATE INDEX IF NOT EXISTS idx_social_links_enabled ON public.social_community_links(is_enabled);

ALTER TABLE public.social_community_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Active social links are viewable by all users" ON public.social_community_links;
CREATE POLICY "Active social links are viewable by all users"
  ON public.social_community_links
  FOR SELECT
  USING (
    is_enabled = true
    OR EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid() AND users.is_admin = true
    )
  );

DROP POLICY IF EXISTS "Only administrators can modify social links" ON public.social_community_links;
CREATE POLICY "Only administrators can modify social links"
  ON public.social_community_links
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid() AND users.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid() AND users.is_admin = true
    )
  );

-- Atomic reorder RPC function
CREATE OR REPLACE FUNCTION public.rpc_admin_reorder_social_links(p_items jsonb)
RETURNS jsonb AS $$
DECLARE
  v_item jsonb;
  v_id text;
  v_order integer;
BEGIN
  IF NOT (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid() AND users.is_admin = true
    )
    OR (current_setting('role', true) = 'service_role')
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Administrator privileges required';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Items array cannot be empty';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_id := v_item->>'id';
    v_order := (v_item->>'display_order')::integer;

    IF v_id IS NULL OR TRIM(v_id) = '' OR v_order IS NULL THEN
      RAISE EXCEPTION 'Invalid reorder item payload';
    END IF;

    UPDATE public.social_community_links
    SET display_order = v_order, updated_at = now()
    WHERE id = v_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Social link not found: %', v_id;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE EXECUTE ON FUNCTION public.rpc_admin_reorder_social_links(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_admin_reorder_social_links(jsonb) TO authenticated, service_role;
