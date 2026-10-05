-- ==============================================================================
-- STUDYROOM — DATABASE MIGRATION
-- Migration: 20261005_fix_verify_payment_coalesce_and_phone_column.sql
-- Purpose:
--   1. Fix PostgreSQL error: "function pg_catalog.coalesce(text, text, text) does not exist"
--      in public.rpc_verify_payment_and_create_grant by using standard COALESCE().
--   2. Fix pg_catalog.coalesce in public.handle_new_user_with_grant() trigger.
--   3. Ensure public.public_payment_submissions and public.enrollment_grants have
--      canonical phone, email, and tracking columns.
--   4. Re-enforce strict SECURITY DEFINER search_path and least-privilege service_role grants.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. ENSURE CANONICAL COLUMNS ON public.public_payment_submissions
-- ------------------------------------------------------------------------------
ALTER TABLE public.public_payment_submissions
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS email_delivery_status TEXT DEFAULT 'NOT SENT',
  ADD COLUMN IF NOT EXISTS email_delivery_error TEXT;

CREATE INDEX IF NOT EXISTS idx_payment_submissions_phone 
  ON public.public_payment_submissions (phone);

CREATE INDEX IF NOT EXISTS idx_payment_submissions_email 
  ON public.public_payment_submissions (email);

CREATE INDEX IF NOT EXISTS idx_payment_submissions_email_status 
  ON public.public_payment_submissions (email_delivery_status);

-- ------------------------------------------------------------------------------
-- 2. ENSURE CANONICAL COLUMNS ON public.enrollment_grants
-- ------------------------------------------------------------------------------
ALTER TABLE public.enrollment_grants
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS access_token_hash TEXT,
  ADD COLUMN IF NOT EXISTS access_token_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_grants_access_token_hash 
  ON public.enrollment_grants (access_token_hash)
  WHERE access_token_hash IS NOT NULL;

-- ------------------------------------------------------------------------------
-- 3. PERMANENT ROOT-CAUSE FIX: public.rpc_verify_payment_and_create_grant
--    Root cause: In PostgreSQL, COALESCE is an intrinsic SQL expression, NOT a catalog
--    function in pg_catalog. Prefixing it with pg_catalog. raises SQLSTATE 42883
--    (function pg_catalog.coalesce(text, text, text) does not exist).
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.rpc_verify_payment_and_create_grant(UUID, TEXT, TEXT, TEXT);

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

  -- 2. Idempotency check: if already verified, return existing active grant without duplicates
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

  -- 4. Create enrollment grant with email, phone, and optional access token hash.
  --    CRITICAL FIX: Use standard COALESCE(...) instead of pg_catalog.coalesce(...)
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
    COALESCE(v_sub.email, v_sub.phone, v_sub.contact),
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

-- Enforce strict service_role execution on the RPC
REVOKE ALL ON FUNCTION public.rpc_verify_payment_and_create_grant(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_verify_payment_and_create_grant(UUID, TEXT, TEXT, TEXT, TEXT) TO service_role;

-- ------------------------------------------------------------------------------
-- 4. PERMANENT ROOT-CAUSE FIX: public.handle_new_user()
--    CRITICAL FIX: Replace pg_catalog.coalesce with standard COALESCE(...)
--    in the existing public.handle_new_user() trigger function.
--    NOTE: We update the function body in-place. The existing on_auth_user_created
--    trigger on auth.users points directly to public.handle_new_user() and
--    requires NO destructive drop/recreate.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_grant_id UUID;
  v_raw_nonce TEXT;
  v_nonce_hash TEXT;
  v_grant_rec RECORD;
BEGIN
  -- 1. Extract enrollment authorization metadata
  BEGIN
    v_grant_id := (NEW.raw_user_meta_data->>'enrollment_grant_id')::UUID;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Registration blocked: Invalid enrollment grant identifier.';
  END;

  v_raw_nonce := NEW.raw_user_meta_data->>'creation_nonce';

  IF v_grant_id IS NULL OR v_raw_nonce IS NULL OR pg_catalog.length(v_raw_nonce) < 32 THEN
    RAISE EXCEPTION 'Registration blocked: Valid enrollment reservation required to create an account.';
  END IF;

  -- 2. Compute SHA-256 hash of provided raw nonce using extensions.digest (pgcrypto)
  v_nonce_hash := pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(v_raw_nonce, 'UTF8'), 'sha256'),
    'hex'
  );

  -- 3. Atomically lock and verify the reservation row
  SELECT id, status, expires_at, reservation_expires_at
  INTO v_grant_rec
  FROM public.enrollment_grants
  WHERE id = v_grant_id
    AND creation_nonce_hash = v_nonce_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registration blocked: Nonexistent or invalid enrollment reservation.';
  END IF;

  IF v_grant_rec.status <> 'signup_in_progress' THEN
    RAISE EXCEPTION 'Registration blocked: Enrollment grant is not in reservation state (status: %).', v_grant_rec.status;
  END IF;

  IF v_grant_rec.expires_at < pg_catalog.now() THEN
    RAISE EXCEPTION 'Registration blocked: Enrollment grant has expired.';
  END IF;

  IF v_grant_rec.reservation_expires_at < pg_catalog.now() THEN
    RAISE EXCEPTION 'Registration blocked: Enrollment reservation has expired. Please retry signup.';
  END IF;

  -- 4. Consummate the grant atomically
  UPDATE public.enrollment_grants
  SET status = 'consumed',
      consumed_at = pg_catalog.now(),
      consumed_by_user_id = NEW.id,
      consumed_email = pg_catalog.lower(NEW.email),
      creation_nonce_hash = NULL,
      reservation_expires_at = NULL,
      updated_at = pg_catalog.now()
  WHERE id = v_grant_id;

  -- 5. Provision public.users preserving all existing production fields and ON CONFLICT logic
  --    CRITICAL FIX: Use standard COALESCE(...) instead of pg_catalog.coalesce(...)
  INSERT INTO public.users (
    id,
    display_name,
    avatar_url,
    email,
    enrollment_grant_id
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', pg_catalog.split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url',
    NEW.email,
    v_grant_id
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    display_name = COALESCE(public.users.display_name, EXCLUDED.display_name),
    enrollment_grant_id = COALESCE(public.users.enrollment_grant_id, EXCLUDED.enrollment_grant_id);

  RETURN NEW;
END;
$$;

-- Enforce strict service_role execution on the trigger function
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role, postgres, supabase_auth_admin;

-- Clean up any mistakenly named function if present
DROP FUNCTION IF EXISTS public.handle_new_user_with_grant();
