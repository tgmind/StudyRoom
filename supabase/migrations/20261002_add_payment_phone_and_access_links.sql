-- ==============================================================================
-- STUDYROOM — PASS 9 INCREMENTAL DATABASE MIGRATION
-- File: supabase/migrations/20261002_add_payment_phone_and_access_links.sql
-- Description: Add separate email and phone fields to payment submissions and
--              enrollment grants, plus secure single-use email access token hashes.
-- Invariants:
--   1. 100% additive and backward-compatible with existing records.
--   2. Prevents any data loss or cascading deletions.
--   3. Hardened SECURITY DEFINER function with SET search_path = ''.
--   4. Explicit REVOKE from PUBLIC/anon/authenticated on RPCs.
-- ==============================================================================

-- 1. ADD COLUMNS TO public.public_payment_submissions
ALTER TABLE public.public_payment_submissions
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS email_delivery_status TEXT DEFAULT 'NOT SENT',
  ADD COLUMN IF NOT EXISTS email_delivery_error TEXT;

CREATE INDEX IF NOT EXISTS idx_payment_submissions_phone 
  ON public.public_payment_submissions (phone)
  WHERE phone IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_submissions_email 
  ON public.public_payment_submissions (email)
  WHERE email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_submissions_email_status 
  ON public.public_payment_submissions (email_delivery_status);

-- 2. ADD COLUMNS TO public.enrollment_grants
ALTER TABLE public.enrollment_grants
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS access_token_hash TEXT,
  ADD COLUMN IF NOT EXISTS access_token_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_grants_access_token_hash 
  ON public.enrollment_grants (access_token_hash)
  WHERE access_token_hash IS NOT NULL;

-- 3. DROP OBSOLETE 4-PARAMETER OVERLOAD TO PREVENT AMBIGUITY
DROP FUNCTION IF EXISTS public.rpc_verify_payment_and_create_grant(UUID, TEXT, TEXT, TEXT);

-- 4. UPGRADE RPC: rpc_verify_payment_and_create_grant
CREATE OR REPLACE FUNCTION public.rpc_verify_payment_and_create_grant(
  p_submission_id UUID,
  p_token_hash TEXT,
  p_otp TEXT,
  p_admin_identifier TEXT,
  p_access_token_hash TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sub RECORD;
  v_grant_id UUID;
  v_existing_otp VARCHAR(4);
BEGIN
  -- 1. Row-level lock on payment submission
  SELECT * INTO v_sub
  FROM public.public_payment_submissions
  WHERE id = p_submission_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'Payment submission not found.');
  END IF;

  -- 2. Idempotency check: if already verified, return existing grant
  IF v_sub.status = 'verified' THEN
    SELECT id, otp_code INTO v_grant_id, v_existing_otp
    FROM public.enrollment_grants
    WHERE payment_submission_id = p_submission_id AND status <> 'revoked'
    LIMIT 1;

    IF FOUND THEN
      RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'already_verified', true,
        'grant_id', v_grant_id,
        'otp', v_existing_otp
      );
    END IF;
  END IF;

  -- 3. Update submission status to 'verified'
  UPDATE public.public_payment_submissions
  SET status = 'verified',
      verified_at = pg_catalog.now(),
      verified_by = p_admin_identifier
  WHERE id = p_submission_id;

  -- 4. Create enrollment grant with email, phone, and optional access token hash
  INSERT INTO public.enrollment_grants (
    grant_token_hash,
    otp_code,
    authorization_type,
    source_reference,
    payment_submission_id,
    name,
    contact,
    email,
    phone,
    access_token_hash,
    access_token_expires_at,
    status,
    expires_at
  )
  VALUES (
    p_token_hash,
    p_otp,
    'payment',
    v_sub.utr,
    p_submission_id,
    v_sub.name,
    pg_catalog.coalesce(v_sub.email, v_sub.phone, v_sub.contact),
    v_sub.email,
    v_sub.phone,
    p_access_token_hash,
    CASE WHEN p_access_token_hash IS NOT NULL THEN pg_catalog.now() + INTERVAL '24 hours' ELSE NULL END,
    'active',
    pg_catalog.now() + INTERVAL '24 hours'
  )
  RETURNING id INTO v_grant_id;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'grant_id', v_grant_id,
    'otp', p_otp,
    'expires_at', pg_catalog.now() + INTERVAL '24 hours'
  );
END;
$$;

-- 5. RE-ENFORCE HARDENED RPC PRIVILEGES
REVOKE ALL ON FUNCTION public.rpc_verify_payment_and_create_grant(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_verify_payment_and_create_grant(UUID, TEXT, TEXT, TEXT, TEXT) TO service_role;
