-- ============================================================
-- Migration: Ensure public.user_alerts table and check constraints
-- File: supabase/migrations/20260919_ensure_user_alerts_schema.sql
-- Idempotent and non-destructive
-- ============================================================

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

-- Performance & Deduplication Indexes
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
