-- ============================================================
-- STUDYROOM — WEB PUSH NOTIFICATIONS SCHEMA & MIGRATION
-- ============================================================
-- File: supabase/push_notifications.sql
-- Run this in Supabase Dashboard -> SQL Editor -> New query -> Run.
-- Safe and idempotent (can be executed multiple times without errors).

-- 1. Push Subscriptions Table
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookup by user_id
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON public.push_subscriptions(user_id);

-- 2. Add notification reminder tracking columns to public.users
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS three_hour_prompt_sent_at TIMESTAMPTZ;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_offline_reminder_sent_at TIMESTAMPTZ;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS break_warning_prompt_sent_at TIMESTAMPTZ;

-- 3. Row Level Security for push_subscriptions
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can insert own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can insert own push subscriptions"
  ON public.push_subscriptions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can view own push subscriptions"
  ON public.push_subscriptions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can delete own push subscriptions"
  ON public.push_subscriptions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full access to push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Service role full access to push subscriptions"
  ON public.push_subscriptions FOR ALL
  TO service_role
  USING (true);

-- 4. Update rpc_start_session to reset three_hour_prompt_sent_at on session start
CREATE OR REPLACE FUNCTION public.rpc_start_session(p_focus TEXT DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_current_status TEXT;
  v_now TIMESTAMPTZ := NOW();
  v_block_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT current_status INTO v_current_status
  FROM public.users
  WHERE id = v_user_id
  FOR UPDATE;

  IF v_current_status IN ('studying', 'break') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'A session is already in progress'
    );
  END IF;

  -- Create first study block
  INSERT INTO public.session_blocks (user_id, session_id, block_type, start_time, end_time)
  VALUES (v_user_id, NULL, 'study', v_now, NULL)
  RETURNING id INTO v_block_id;

  -- Update user profile to studying and reset the 3-hour prompt timestamp
  UPDATE public.users
  SET current_status = 'studying',
      current_focus = p_focus,
      session_start_time = v_now,
      last_resumed_at = v_now,
      break_started_at = NULL,
      active_study_seconds_snapshot = 0,
      three_hour_prompt_sent_at = NULL
  WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'status', 'studying',
    'session_start_time', v_now,
    'block_id', v_block_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. RPC to stop user session on push notification action
CREATE OR REPLACE FUNCTION public.rpc_stop_user_session(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_status TEXT;
  v_session_start TIMESTAMPTZ;
  v_focus TEXT;
  v_now TIMESTAMPTZ := NOW();
  v_total_study_seconds NUMERIC := 0;
  v_duration_minutes INTEGER := 0;
  v_session_id UUID;
BEGIN
  SELECT current_status, session_start_time, current_focus
  INTO v_status, v_session_start, v_focus
  FROM public.users
  WHERE id = p_user_id
  FOR UPDATE;

  IF v_status IS NULL OR v_status = 'offline' THEN
    RETURN jsonb_build_object('success', false, 'error', 'No active session');
  END IF;

  UPDATE public.session_blocks
  SET end_time = v_now
  WHERE user_id = p_user_id AND end_time IS NULL;

  IF v_session_start IS NULL THEN
    v_session_start := v_now;
  END IF;

  SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(end_time, v_now) - start_time))), 0)
  INTO v_total_study_seconds
  FROM public.session_blocks
  WHERE user_id = p_user_id
    AND block_type = 'study'
    AND session_id IS NULL;

  v_duration_minutes := GREATEST(0, FLOOR(v_total_study_seconds / 60)::INTEGER);

  INSERT INTO public.study_sessions (user_id, start_time, end_time, duration_minutes, focus_tag, completed_tasks)
  VALUES (p_user_id, v_session_start, v_now, v_duration_minutes, v_focus, '[]'::JSONB)
  RETURNING id INTO v_session_id;

  UPDATE public.session_blocks
  SET session_id = v_session_id
  WHERE user_id = p_user_id AND session_id IS NULL;

  UPDATE public.users
  SET current_status = 'offline',
      current_focus = NULL,
      session_start_time = NULL,
      last_resumed_at = NULL,
      break_started_at = NULL,
      active_study_seconds_snapshot = 0,
      three_hour_prompt_sent_at = NULL,
      break_warning_prompt_sent_at = NULL
  WHERE id = p_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'session_id', v_session_id,
    'duration_minutes', v_duration_minutes
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

