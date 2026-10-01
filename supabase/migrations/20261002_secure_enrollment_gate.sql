-- ==============================================================================
-- STUDYROOM — PASS 7 PRODUCTION DATABASE MIGRATION
-- File: supabase/migrations/20261002_secure_enrollment_gate.sql
-- Description: Cryptographic Payment/Coupon -> 4-Digit OTP -> Signup Gate
-- Invariants:
--   1. Strict 100% fail-closed auth.users trigger (handle_new_user).
--   2. Two-phase enrollment reservation with SHA-256 creation nonce.
--   3. CSPRNG 4-digit human OTP (non-authoritative; no unique constraint).
--   4. Cryptographic enrollment token (stored strictly as SHA-256 hash).
--   5. Hardened SECURITY DEFINER functions with SET search_path = ''.
--   6. Explicit REVOKE from PUBLIC/anon/authenticated on RPCs and sensitive tables.
--   7. Safe foreign keys with ON DELETE SET NULL (zero cascading user deletion).
--   8. 24-hour audit retention for admin portal with hourly cleanup.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. EXTENSIONS
-- ------------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ------------------------------------------------------------------------------
-- 2. ALTER EXISTING TABLES
-- ------------------------------------------------------------------------------

-- Ensure public_payment_submissions has claim_secret_hash for cookie-based status recovery
ALTER TABLE public.public_payment_submissions 
  ADD COLUMN IF NOT EXISTS claim_secret_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_payment_submissions_claim_hash 
  ON public.public_payment_submissions (claim_secret_hash)
  WHERE claim_secret_hash IS NOT NULL;

-- Prevent duplicate UTR submissions while status is pending or verified
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_submissions_clean_utr 
  ON public.public_payment_submissions (UPPER(TRIM(utr))) 
  WHERE status IN ('pending', 'verified');

-- ------------------------------------------------------------------------------
-- 3. CREATE ENROLLMENT GRANTS TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.enrollment_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_token_hash TEXT UNIQUE NOT NULL,
  otp_code VARCHAR(4) NOT NULL,
  authorization_type TEXT NOT NULL CHECK (authorization_type IN ('payment', 'referral_coupon', 'admin_comp')),
  source_reference TEXT,
  payment_submission_id UUID REFERENCES public.public_payment_submissions(id) ON DELETE SET NULL,
  coupon_id TEXT REFERENCES public.public_coupons(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  contact TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'preverified', 'signup_in_progress', 'consumed', 'expired', 'revoked')),
  reserved_email TEXT,
  creation_nonce_hash TEXT,
  reservation_expires_at TIMESTAMPTZ,
  consumed_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  consumed_email TEXT,
  consumed_at TIMESTAMPTZ,
  preverified_at TIMESTAMPTZ,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (pg_catalog.now() + INTERVAL '24 hours'),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
);

-- Indexes for performant lookup, validation, and cleanup
CREATE INDEX IF NOT EXISTS idx_enrollment_grants_token_hash 
  ON public.enrollment_grants (grant_token_hash);

CREATE INDEX IF NOT EXISTS idx_enrollment_grants_status 
  ON public.enrollment_grants (status);

CREATE INDEX IF NOT EXISTS idx_enrollment_grants_expires_at 
  ON public.enrollment_grants (expires_at);

CREATE INDEX IF NOT EXISTS idx_enrollment_grants_creation_nonce_hash 
  ON public.enrollment_grants (creation_nonce_hash) 
  WHERE creation_nonce_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_enrollment_grants_consumed_email 
  ON public.enrollment_grants (consumed_email)
  WHERE consumed_email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_enrollment_grants_coupon_id 
  ON public.enrollment_grants (coupon_id)
  WHERE coupon_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_enrollment_grants_created_at 
  ON public.enrollment_grants (created_at DESC);

-- Ensure exactly ONE active or consumed grant per payment submission
CREATE UNIQUE INDEX IF NOT EXISTS idx_grant_unique_payment_sub 
  ON public.enrollment_grants (payment_submission_id) 
  WHERE payment_submission_id IS NOT NULL AND status <> 'revoked';

-- ------------------------------------------------------------------------------
-- 4. LINK PUBLIC.USERS TO ENROLLMENT_GRANTS
-- ------------------------------------------------------------------------------
ALTER TABLE public.users 
  ADD COLUMN IF NOT EXISTS enrollment_grant_id UUID REFERENCES public.enrollment_grants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_users_enrollment_grant 
  ON public.users(enrollment_grant_id)
  WHERE enrollment_grant_id IS NOT NULL;

-- ------------------------------------------------------------------------------
-- 5. TABLE-LEVEL PERMISSIONS (REVOKE DIRECT CLIENT GRANTS)
-- ------------------------------------------------------------------------------
REVOKE ALL ON public.enrollment_grants FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.enrollment_grants TO service_role;

REVOKE ALL ON public.public_payment_submissions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.public_payment_submissions TO service_role;

REVOKE ALL ON public.public_coupons FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.public_coupons TO service_role;

REVOKE ALL ON public.public_referral_enrollments FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.public_referral_enrollments TO service_role;

-- ------------------------------------------------------------------------------
-- 6. ROW-LEVEL SECURITY POLICIES (FAIL-CLOSED FOR UNTRUSTED CLIENTS)
-- ------------------------------------------------------------------------------
ALTER TABLE public.enrollment_grants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lockdown all direct client access to enrollment_grants" ON public.enrollment_grants;
CREATE POLICY "Lockdown all direct client access to enrollment_grants"
  ON public.enrollment_grants FOR ALL USING (false);

ALTER TABLE public.public_coupons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can read active coupons" ON public.public_coupons;
DROP POLICY IF EXISTS "No public direct read of coupons" ON public.public_coupons;
CREATE POLICY "No public direct read of coupons"
  ON public.public_coupons FOR SELECT USING (false);

ALTER TABLE public.public_referral_enrollments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can submit referral enrollments" ON public.public_referral_enrollments;
DROP POLICY IF EXISTS "No public direct insert of referral enrollments" ON public.public_referral_enrollments;
CREATE POLICY "No public direct insert of referral enrollments"
  ON public.public_referral_enrollments FOR ALL USING (false);

ALTER TABLE public.public_payment_submissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can insert payment submissions" ON public.public_payment_submissions;
DROP POLICY IF EXISTS "No client direct access on payment submissions" ON public.public_payment_submissions;
CREATE POLICY "No client direct access on payment submissions"
  ON public.public_payment_submissions FOR ALL USING (false);

-- ------------------------------------------------------------------------------
-- 7. SECURITY DEFINER RPC: ATOMIC COUPON CLAIM & GRANT CREATION
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_claim_coupon_and_create_grant(
  p_coupon_code TEXT,
  p_name TEXT,
  p_referred_by TEXT,
  p_token_hash TEXT,
  p_otp TEXT,
  p_ip_address TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_coupon RECORD;
  v_grant_id UUID;
  v_referral_id TEXT;
BEGIN
  -- 1. Row-level lock on coupon
  SELECT * INTO v_coupon
  FROM public.public_coupons
  WHERE pg_catalog.upper(pg_catalog.btrim(code)) = pg_catalog.upper(pg_catalog.btrim(p_coupon_code))
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'Invalid coupon code.');
  END IF;

  IF NOT v_coupon.is_active THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'This coupon is no longer active.');
  END IF;

  IF v_coupon.max_uses IS NOT NULL AND v_coupon.used_count >= v_coupon.max_uses THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'This coupon has reached its maximum usage limit.');
  END IF;

  -- 2. Increment used_count atomically
  UPDATE public.public_coupons
  SET used_count = used_count + 1
  WHERE id = v_coupon.id;

  -- 3. Record referral enrollment
  v_referral_id := 'ref_' || pg_catalog.floor(pg_catalog.date_part('epoch', pg_catalog.clock_timestamp()))::BIGINT || '_' || pg_catalog.substr(pg_catalog.md5(pg_catalog.random()::TEXT), 1, 6);
  INSERT INTO public.public_referral_enrollments (id, coupon_code, name, referred_by, agreement_accepted, status)
  VALUES (v_referral_id, v_coupon.code, p_name, p_referred_by, true, 'active');

  -- 4. Create enrollment grant
  INSERT INTO public.enrollment_grants (
    grant_token_hash,
    otp_code,
    authorization_type,
    source_reference,
    coupon_id,
    name,
    contact,
    status,
    expires_at
  )
  VALUES (
    p_token_hash,
    p_otp,
    'referral_coupon',
    v_coupon.code,
    v_coupon.id,
    p_name,
    p_referred_by,
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

-- ------------------------------------------------------------------------------
-- 8. SECURITY DEFINER RPC: ATOMIC PAYMENT VERIFICATION & GRANT CREATION
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_verify_payment_and_create_grant(
  p_submission_id UUID,
  p_token_hash TEXT,
  p_otp TEXT,
  p_admin_identifier TEXT
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

  -- 4. Create enrollment grant
  INSERT INTO public.enrollment_grants (
    grant_token_hash,
    otp_code,
    authorization_type,
    source_reference,
    payment_submission_id,
    name,
    contact,
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
    v_sub.contact,
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

-- ------------------------------------------------------------------------------
-- 9. SECURITY DEFINER RPC: TWO-PHASE SIGNUP RESERVATION (PHASE 1)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_reserve_enrollment_grant(
  p_token_hash TEXT,
  p_otp TEXT,
  p_email TEXT,
  p_nonce_hash TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_grant RECORD;
BEGIN
  -- 1. Atomically lock grant row
  SELECT * INTO v_grant
  FROM public.enrollment_grants
  WHERE grant_token_hash = p_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'Invalid enrollment authorization credential.');
  END IF;

  IF v_grant.status = 'consumed' THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'This enrollment grant has already been used.');
  END IF;

  IF v_grant.status = 'revoked' THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'This enrollment authorization has been revoked.');
  END IF;

  IF v_grant.expires_at < pg_catalog.now() THEN
    UPDATE public.enrollment_grants SET status = 'expired' WHERE id = v_grant.id;
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'This enrollment authorization has expired (24-hour limit).');
  END IF;

  -- Check brute-force lockout
  IF v_grant.failed_attempts >= 5 THEN
    UPDATE public.enrollment_grants SET status = 'revoked' WHERE id = v_grant.id;
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'Too many failed verification attempts. This authorization is locked.');
  END IF;

  -- Validate 4-digit OTP
  IF v_grant.otp_code <> p_otp THEN
    UPDATE public.enrollment_grants 
    SET failed_attempts = failed_attempts + 1, 
        last_attempt_at = pg_catalog.now(),
        status = CASE WHEN failed_attempts + 1 >= 5 THEN 'revoked' ELSE status END
    WHERE id = v_grant.id;

    RETURN pg_catalog.jsonb_build_object(
      'success', false, 
      'error', 'Invalid 4-digit enrollment code.',
      'attempts_remaining', GREATEST(0, 5 - (v_grant.failed_attempts + 1))
    );
  END IF;

  -- Prevent overlapping concurrent registration by a different user
  IF v_grant.status = 'signup_in_progress' 
     AND v_grant.reservation_expires_at > pg_catalog.now() 
     AND v_grant.reserved_email IS DISTINCT FROM pg_catalog.lower(p_email) THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'Registration is currently in progress for this grant.');
  END IF;

  -- Set reservation state with 2-minute timer and nonce hash
  UPDATE public.enrollment_grants
  SET status = 'signup_in_progress',
      reserved_email = pg_catalog.lower(p_email),
      creation_nonce_hash = p_nonce_hash,
      reservation_expires_at = pg_catalog.now() + INTERVAL '2 minutes',
      updated_at = pg_catalog.now()
  WHERE id = v_grant.id;

  RETURN pg_catalog.jsonb_build_object('success', true, 'grant_id', v_grant.id);
END;
$$;

-- ------------------------------------------------------------------------------
-- 10. SECURITY DEFINER RPC: RELEASE ENROLLMENT RESERVATION (ROLLBACK)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_release_enrollment_reservation(
  p_grant_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.enrollment_grants
  SET status = 'preverified',
      creation_nonce_hash = NULL,
      reservation_expires_at = NULL,
      updated_at = pg_catalog.now()
  WHERE id = p_grant_id AND status = 'signup_in_progress';
END;
$$;

-- ------------------------------------------------------------------------------
-- 11. SECURITY DEFINER RPC: CLEANUP EXPIRED ENROLLMENT GRANTS (HOURLY)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_cleanup_expired_enrollment_grants()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_deleted_count INTEGER := 0;
BEGIN
  -- Mark grants past 24-hour expiration that were never consumed
  UPDATE public.enrollment_grants
  SET status = 'expired', updated_at = pg_catalog.now()
  WHERE expires_at < pg_catalog.now()
    AND status IN ('active', 'preverified');

  -- Delete consumed, revoked, or expired records older than 24 hours (preserves 24h admin audit window)
  -- Active signup_in_progress grants are NEVER deleted
  WITH deleted AS (
    DELETE FROM public.enrollment_grants
    WHERE created_at < (pg_catalog.now() - INTERVAL '24 hours')
      AND status IN ('consumed', 'revoked', 'expired')
    RETURNING id
  )
  SELECT pg_catalog.count(*) INTO v_deleted_count FROM deleted;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'deleted_count', v_deleted_count,
    'cleaned_at', pg_catalog.now()
  );
END;
$$;

-- ------------------------------------------------------------------------------
-- 12. FAIL-CLOSED AUTH TRIGGER FUNCTION: handle_new_user() (PHASE 2 FINALIZATION)
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
  INSERT INTO public.users (
    id,
    display_name,
    avatar_url,
    email,
    enrollment_grant_id
  )
  VALUES (
    NEW.id,
    pg_catalog.coalesce(NEW.raw_user_meta_data->>'display_name', pg_catalog.split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url',
    NEW.email,
    v_grant_id
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    display_name = pg_catalog.coalesce(public.users.display_name, EXCLUDED.display_name),
    enrollment_grant_id = pg_catalog.coalesce(public.users.enrollment_grant_id, EXCLUDED.enrollment_grant_id);

  RETURN NEW;
END;
$$;

-- ------------------------------------------------------------------------------
-- 13. ATTACH TRIGGER TO auth.users
-- ------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ------------------------------------------------------------------------------
-- 14. RPC EXECUTE PRIVILEGES (REVOKE FROM UNTRUSTED ROLES, GRANT TO SERVICE_ROLE)
-- ------------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.rpc_claim_coupon_and_create_grant(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_claim_coupon_and_create_grant(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.rpc_verify_payment_and_create_grant(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_verify_payment_and_create_grant(UUID, TEXT, TEXT, TEXT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.rpc_reserve_enrollment_grant(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_reserve_enrollment_grant(TEXT, TEXT, TEXT, TEXT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.rpc_release_enrollment_reservation(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_release_enrollment_reservation(UUID) TO service_role;

REVOKE EXECUTE ON FUNCTION public.rpc_cleanup_expired_enrollment_grants() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_cleanup_expired_enrollment_grants() TO service_role, postgres;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role, postgres, supabase_auth_admin;

-- ------------------------------------------------------------------------------
-- 15. OPTIONAL PG_CRON SCHEDULE (IF PG_CRON IS INSTALLED)
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('studyroom_cleanup_expired_grants');
    PERFORM cron.schedule(
      'studyroom_cleanup_expired_grants',
      '0 * * * *',
      'SELECT public.rpc_cleanup_expired_enrollment_grants();'
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- Non-fatal if pg_cron is not configured in local environment
  NULL;
END;
$$;
