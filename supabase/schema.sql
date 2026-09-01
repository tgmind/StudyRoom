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
  active_study_seconds_snapshot INTEGER NOT NULL DEFAULT 0,
  has_achiever_badge BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Idempotent column migrations for existing databases
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_resumed_at TIMESTAMPTZ;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS active_study_seconds_snapshot INTEGER NOT NULL DEFAULT 0;

-- Indexes for Users
CREATE INDEX IF NOT EXISTS idx_users_current_status ON public.users(current_status);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON public.users(created_at);

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
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
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
  focus_tag TEXT,
  completed_tasks JSONB DEFAULT '[]'::JSONB
);

-- Idempotent column migrations for existing databases
ALTER TABLE public.study_sessions ADD COLUMN IF NOT EXISTS focus_tag TEXT;
ALTER TABLE public.study_sessions ADD COLUMN IF NOT EXISTS completed_tasks JSONB DEFAULT '[]'::JSONB;

-- Indexes for Study Sessions
CREATE INDEX IF NOT EXISTS idx_study_sessions_user_id ON public.study_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_study_sessions_start_time ON public.study_sessions(start_time);
CREATE INDEX IF NOT EXISTS idx_study_sessions_end_time ON public.study_sessions(end_time);

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
  TO authenticated
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

-- RPC: Start Session
CREATE OR REPLACE FUNCTION public.rpc_start_session(p_focus TEXT DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_status TEXT;
  v_trimmed_focus TEXT;
  v_now TIMESTAMPTZ := NOW();
  v_block_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Lock user row
  SELECT current_status INTO v_status
  FROM public.users
  WHERE id = v_user_id
  FOR UPDATE;

  IF v_status = 'studying' THEN
    RAISE EXCEPTION 'Session already active';
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
       active_study_seconds_snapshot = 0
  WHERE id = v_user_id;

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
    'block_id', v_block_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC: Pause Session
CREATE OR REPLACE FUNCTION public.rpc_pause_session()
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_status TEXT;
  v_now TIMESTAMPTZ := NOW();
  v_total_study_seconds INTEGER := 0;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT current_status INTO v_status
  FROM public.users
  WHERE id = v_user_id
  FOR UPDATE;

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

  -- Update user status with frozen active study seconds snapshot
  UPDATE public.users
  SET current_status = 'break',
      last_resumed_at = NULL,
      active_study_seconds_snapshot = v_total_study_seconds
  WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'status', 'break',
    'paused_at', v_now,
    'active_study_seconds_snapshot', v_total_study_seconds
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC: Resume Session
CREATE OR REPLACE FUNCTION public.rpc_resume_session()
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_status TEXT;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT current_status INTO v_status
  FROM public.users
  WHERE id = v_user_id
  FOR UPDATE;

  IF v_status <> 'break' THEN
    RAISE EXCEPTION 'User is not currently on break';
  END IF;

  -- Close current active break block
  UPDATE public.session_blocks
  SET end_time = v_now
  WHERE user_id = v_user_id AND block_type = 'break' AND end_time IS NULL;

  -- Open new study block
  INSERT INTO public.session_blocks (user_id, block_type, start_time)
  VALUES (v_user_id, 'study', v_now);

  -- Update user status with new resume timestamp (preserves accrued snapshot)
  UPDATE public.users
  SET current_status = 'studying',
      last_resumed_at = v_now
  WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'status', 'studying',
    'resumed_at', v_now
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC: Finish Session (Atomic Transaction for Stop Hook)
CREATE OR REPLACE FUNCTION public.rpc_finish_session(p_completed_task_ids TEXT[] DEFAULT ARRAY[]::TEXT[])
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_status TEXT;
  v_session_start TIMESTAMPTZ;
  v_focus TEXT;
  v_now TIMESTAMPTZ := NOW();
  v_total_study_seconds NUMERIC := 0;
  v_duration_minutes INTEGER := 0;
  v_session_id UUID;
  v_active_goal_id UUID;
  v_tasks JSONB;
  v_updated_tasks JSONB;
  v_session_completed_tasks JSONB := '[]'::JSONB;
  v_elem JSONB;
  v_task_id TEXT;
  v_is_completed BOOLEAN;
  v_task_text TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Lock user profile row
  SELECT current_status, session_start_time, current_focus INTO v_status, v_session_start, v_focus
  FROM public.users
  WHERE id = v_user_id
  FOR UPDATE;

  IF v_status = 'offline' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'No active session found'
    );
  END IF;

  -- Close any open block at v_now
  UPDATE public.session_blocks
  SET end_time = v_now
  WHERE user_id = v_user_id AND end_time IS NULL;

  IF v_session_start IS NULL THEN
    v_session_start := v_now;
  END IF;

  -- Calculate total active study seconds from study blocks (EXCLUDING BREAKS)
  SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(end_time, v_now) - start_time))), 0)
  INTO v_total_study_seconds
  FROM public.session_blocks
  WHERE user_id = v_user_id
    AND block_type = 'study'
    AND session_id IS NULL;

  v_duration_minutes := GREATEST(0, FLOOR(v_total_study_seconds / 60)::INTEGER);

  -- Update Goal Task completions if active unexpired goal window exists
  SELECT id, tasks INTO v_active_goal_id, v_tasks
  FROM public.daily_goals
  WHERE user_id = v_user_id AND expires_at > v_now
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

      -- Check if task ID is in p_completed_task_ids
      IF p_completed_task_ids IS NOT NULL AND v_task_id = ANY(p_completed_task_ids) THEN
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

  -- Insert study session record with completed tasks and focus tag
  INSERT INTO public.study_sessions (user_id, start_time, end_time, duration_minutes, focus_tag, completed_tasks)
  VALUES (v_user_id, v_session_start, v_now, v_duration_minutes, v_focus, v_session_completed_tasks)
  RETURNING id INTO v_session_id;

  -- Associate unlinked blocks with this session
  UPDATE public.session_blocks
  SET session_id = v_session_id
  WHERE user_id = v_user_id AND session_id IS NULL;

  -- Reset user to offline and clear active snapshots
  UPDATE public.users
  SET current_status = 'offline',
      current_focus = NULL,
      session_start_time = NULL,
      last_resumed_at = NULL,
      active_study_seconds_snapshot = 0
  WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'session_id', v_session_id,
    'duration_minutes', v_duration_minutes,
    'start_time', v_session_start,
    'end_time', v_now,
    'completed_tasks', v_session_completed_tasks
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
  v_now TIMESTAMPTZ := NOW();
  v_expires TIMESTAMPTZ := v_now + INTERVAL '24 hours';
  v_new_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Check for unexpired goal set
  SELECT id INTO v_existing_id
  FROM public.daily_goals
  WHERE user_id = v_user_id AND expires_at > v_now
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RAISE EXCEPTION 'Active 24-hour goal set already exists for this user';
  END IF;

  IF jsonb_array_length(p_tasks) = 0 THEN
    RAISE EXCEPTION 'Tasks array cannot be empty';
  END IF;

  INSERT INTO public.daily_goals (user_id, tasks, created_at, expires_at, is_locked)
  VALUES (v_user_id, p_tasks, v_now, v_expires, true)
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object(
    'success', true,
    'goal_id', v_new_id,
    'created_at', v_now,
    'expires_at', v_expires
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Append new goal tasks to active 24-hour window (STRICTLY NO DELETION)
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

  -- Find active unexpired goal window
  SELECT id, tasks INTO v_active_goal_id, v_current_tasks
  FROM public.daily_goals
  WHERE user_id = v_user_id AND expires_at > v_now
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_active_goal_id IS NULL THEN
    RAISE EXCEPTION 'No active 24-hour goal set found to add tasks to';
  END IF;

  -- Append new tasks to existing tasks (NEVER delete any existing task!)
  v_updated_tasks := COALESCE(v_current_tasks, '[]'::JSONB) || p_new_tasks;

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
CREATE OR REPLACE FUNCTION public.rpc_get_study_history()
RETURNS TABLE (
  id UUID,
  user_id UUID,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  duration_minutes INTEGER,
  focus_tag TEXT,
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
    s.focus_tag,
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

-- Function to get leaderboard entries for a given week
CREATE OR REPLACE FUNCTION public.rpc_get_leaderboard(p_week_start TIMESTAMPTZ DEFAULT NULL)
RETURNS TABLE (
  user_id UUID,
  display_name TEXT,
  avatar_url TEXT,
  has_achiever_badge BOOLEAN,
  current_status TEXT,
  total_study_minutes INTEGER,
  goal_completion_pct NUMERIC,
  streak_days INTEGER,
  score NUMERIC
) AS $$
DECLARE
  v_week_start TIMESTAMPTZ;
  v_week_end TIMESTAMPTZ;
  v_max_study_minutes INTEGER := 1;
BEGIN
  IF p_week_start IS NULL THEN
    -- Default to current week's Monday 00:00:00 UTC
    v_week_start := DATE_TRUNC('week', NOW());
  ELSE
    v_week_start := DATE_TRUNC('week', p_week_start);
  END IF;
  v_week_end := v_week_start + INTERVAL '7 days';

  -- Create temporary table of aggregate weekly statistics per user
  CREATE TEMP TABLE IF NOT EXISTS temp_user_stats ON COMMIT DROP AS
  WITH weekly_study AS (
    SELECT s.user_id, COALESCE(SUM(s.duration_minutes), 0)::INTEGER AS study_mins
    FROM public.study_sessions s
    WHERE s.start_time >= v_week_start AND s.start_time < v_week_end
    GROUP BY s.user_id
  ),
  weekly_goals AS (
    SELECT g.user_id,
           COALESCE(
             ROUND(
               (SUM( (SELECT COUNT(*) FROM jsonb_array_elements(g.tasks) t WHERE (t->>'completed')::boolean = true) )::NUMERIC /
                NULLIF(SUM(jsonb_array_length(g.tasks)), 0)::NUMERIC) * 100, 2
             ), 0
           ) AS completion_pct
    FROM public.daily_goals g
    WHERE g.created_at >= v_week_start AND g.created_at < v_week_end
    GROUP BY g.user_id
  ),
  user_streaks AS (
    -- Days with >= 30 mins active study in rolling window
    SELECT s.user_id, COUNT(DISTINCT DATE_TRUNC('day', s.start_time))::INTEGER AS streak
    FROM public.study_sessions s
    WHERE s.start_time >= (NOW() - INTERVAL '7 days')
    GROUP BY s.user_id
    HAVING SUM(s.duration_minutes) >= 30
  )
  SELECT
    u.id AS user_id,
    u.display_name,
    u.avatar_url,
    u.has_achiever_badge,
    u.current_status,
    COALESCE(ws.study_mins, 0) AS total_study_minutes,
    COALESCE(wg.completion_pct, 0) AS goal_completion_pct,
    COALESCE(st.streak, 0) AS streak_days
  FROM public.users u
  LEFT JOIN weekly_study ws ON u.id = ws.user_id
  LEFT JOIN weekly_goals wg ON u.id = wg.user_id
  LEFT JOIN user_streaks st ON u.id = st.user_id;

  SELECT GREATEST(1, MAX(temp_user_stats.total_study_minutes)) INTO v_max_study_minutes FROM temp_user_stats;

  RETURN QUERY
  SELECT
    ts.user_id,
    ts.display_name,
    ts.avatar_url,
    ts.has_achiever_badge,
    ts.current_status,
    ts.total_study_minutes,
    ts.goal_completion_pct,
    ts.streak_days,
    ROUND(
      (0.50 * (ts.total_study_minutes::NUMERIC / v_max_study_minutes::NUMERIC * 100)) +
      (0.30 * ts.goal_completion_pct) +
      (0.20 * LEAST(ts.streak_days::NUMERIC / 7.0 * 100, 100.0)),
      1
    ) AS score
  FROM temp_user_stats ts
  ORDER BY score DESC, ts.total_study_minutes DESC, ts.display_name ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to calculate and award Weekly Achiever Badge (Run every Monday)
CREATE OR REPLACE FUNCTION public.rpc_calculate_weekly_achiever()
RETURNS UUID AS $$
DECLARE
  v_prev_week_start TIMESTAMPTZ;
  v_winner_id UUID;
BEGIN
  v_prev_week_start := DATE_TRUNC('week', NOW() - INTERVAL '7 days');

  SELECT user_id INTO v_winner_id
  FROM public.rpc_get_leaderboard(v_prev_week_start)
  ORDER BY score DESC, total_study_minutes DESC
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
