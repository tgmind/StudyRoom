-- ============================================================
-- STUDYROOM — FIX ALERT TYPE 'W' CONSTRAINT & BACKFILL HISTORY
-- File: supabase/migrations/20260914_fix_alert_type_w_constraint.sql
-- ============================================================

-- 1. DROP EXISTING CONSTRAINT ON public.user_alerts
ALTER TABLE public.user_alerts DROP CONSTRAINT IF EXISTS user_alerts_alert_type_check;

-- 2. RE-ADD CHECK CONSTRAINT TO INCLUDE TYPE 'W' (Weekly Review / Slump)
ALTER TABLE public.user_alerts ADD CONSTRAINT user_alerts_alert_type_check 
  CHECK (alert_type IN ('A', 'I', 'D', 'W'));

-- 3. UPGRADE RPC: rpc_admin_log_alert_result
DROP FUNCTION IF EXISTS public.rpc_admin_log_alert_result(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT) CASCADE;
CREATE OR REPLACE FUNCTION public.rpc_admin_log_alert_result(
  p_user_id UUID,
  p_user_name TEXT,
  p_user_email TEXT,
  p_alert_type TEXT,
  p_status TEXT,
  p_consecutive_days INTEGER DEFAULT 0,
  p_reason TEXT DEFAULT '',
  p_error_message TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_new_id UUID;
  v_current_counts JSONB;
BEGIN
  -- Insert into audit log
  INSERT INTO public.user_alerts (
    user_id,
    user_name,
    user_email,
    alert_type,
    status,
    consecutive_inactive_days,
    reason,
    error_message,
    sent_at
  )
  VALUES (
    p_user_id,
    p_user_name,
    p_user_email,
    p_alert_type,
    p_status,
    p_consecutive_days,
    p_reason,
    p_error_message,
    CASE WHEN p_status = 'sent' THEN NOW() ELSE NULL END
  )
  RETURNING id INTO v_new_id;

  -- If successfully sent, update user's aggregated alert counters
  IF p_status = 'sent' THEN
    PERFORM set_config('studyroom.internal_badge_update', 'true', true);

    SELECT COALESCE(alert_counts, '{"A":0,"W":0,"I":0,"D":0}'::jsonb)
    INTO v_current_counts
    FROM public.users
    WHERE id = p_user_id;

    IF v_current_counts IS NULL THEN
      v_current_counts := '{"A":0,"W":0,"I":0,"D":0}'::jsonb;
    END IF;

    UPDATE public.users
    SET
      total_alerts_sent = COALESCE(total_alerts_sent, 0) + 1,
      alert_counts = jsonb_set(
        v_current_counts,
        ARRAY[p_alert_type],
        to_jsonb(COALESCE((v_current_counts->>p_alert_type)::INTEGER, 0) + 1),
        true
      ),
      last_alert_sent_at = NOW(),
      last_alert_type = p_alert_type
    WHERE id = p_user_id;
  END IF;

  RETURN v_new_id;
END;
$$;

-- 4. BACKFILL AUDIT LOG RECORDS FOR THE 2 EMAILS SENT VIA SMTP TO RvS & Amit
INSERT INTO public.user_alerts (
  user_id,
  user_name,
  user_email,
  alert_type,
  status,
  consecutive_inactive_days,
  reason,
  sent_at
)
SELECT 
  'b7f055b9-849b-4d3c-af1c-aeddcd9fa01d'::uuid,
  'RvS',
  'gpintalk@gmail.com',
  'W',
  'sent',
  0,
  'Low study output in past 7 days (Weekly Review)',
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_alerts WHERE user_id = 'b7f055b9-849b-4d3c-af1c-aeddcd9fa01d'::uuid AND alert_type = 'W'
);

INSERT INTO public.user_alerts (
  user_id,
  user_name,
  user_email,
  alert_type,
  status,
  consecutive_inactive_days,
  reason,
  sent_at
)
SELECT 
  'ffc060f2-dcc0-4763-8e58-7795dda5d0d6'::uuid,
  'Amit',
  'amitkumarkushawaha66@gmail.com',
  'W',
  'sent',
  0,
  'Low study output in past 7 days (Weekly Review)',
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_alerts WHERE user_id = 'ffc060f2-dcc0-4763-8e58-7795dda5d0d6'::uuid AND alert_type = 'W'
);

-- Update user aggregated counts for RvS and Amit
UPDATE public.users
SET 
  total_alerts_sent = COALESCE(total_alerts_sent, 0) + 1,
  alert_counts = jsonb_set(
    COALESCE(alert_counts, '{"A":0,"W":0,"I":0,"D":0}'::jsonb),
    '{W}',
    '1'::jsonb,
    true
  ),
  last_alert_sent_at = NOW(),
  last_alert_type = 'W'
WHERE id = 'b7f055b9-849b-4d3c-af1c-aeddcd9fa01d'::uuid
  AND (alert_counts->>'W')::int = 0;

UPDATE public.users
SET 
  total_alerts_sent = COALESCE(total_alerts_sent, 0) + 1,
  alert_counts = jsonb_set(
    COALESCE(alert_counts, '{"A":0,"W":0,"I":0,"D":0}'::jsonb),
    '{W}',
    '1'::jsonb,
    true
  ),
  last_alert_sent_at = NOW(),
  last_alert_type = 'W'
WHERE id = 'ffc060f2-dcc0-4763-8e58-7795dda5d0d6'::uuid
  AND (alert_counts->>'W')::int = 0;
