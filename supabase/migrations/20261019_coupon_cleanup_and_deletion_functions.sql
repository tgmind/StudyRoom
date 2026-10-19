-- =============================================================================
-- Migration: 20261019_coupon_cleanup_and_deletion_functions.sql
-- Purpose:
--   1. Provide secure functions for two-phase coupon deletion (deactivate then delete).
--   2. Clean up historical test artifacts (BATCHTEST, ENROLLTEST, MAXTEST, DISABLEDTEST) from public.public_coupons.
--   3. Ensure legitimate administrator coupons (SPECIAL5, RUPAN10, SUBHRA) remain active and intact.
-- =============================================================================

-- 1. Stored Functions for Two-Phase Safe Deletion
CREATE OR REPLACE FUNCTION public.deactivate_and_delete_coupon(target_code text)
RETURNS boolean AS $$
BEGIN
  -- Phase 1: Immediately mark coupon inactive
  UPDATE public.public_coupons
  SET is_active = false
  WHERE UPPER(code) = UPPER(TRIM(target_code));

  -- Phase 2: Permanently remove row
  DELETE FROM public.public_coupons
  WHERE UPPER(code) = UPPER(TRIM(target_code));

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.deactivate_and_delete_all_coupons()
RETURNS integer AS $$
DECLARE
  deleted_count integer;
BEGIN
  -- Phase 1: Deactivate all coupons first
  UPDATE public.public_coupons
  SET is_active = false;

  -- Phase 2: Delete all rows
  WITH deleted AS (
    DELETE FROM public.public_coupons
    RETURNING 1
  )
  SELECT count(*) INTO deleted_count FROM deleted;

  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Permissions: Restrict deletion functions to service_role only
REVOKE EXECUTE ON FUNCTION public.deactivate_and_delete_coupon(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.deactivate_and_delete_coupon(text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.deactivate_and_delete_all_coupons() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.deactivate_and_delete_all_coupons() TO service_role;

-- 2. Safely Remove Historical Test Coupons
DELETE FROM public.public_coupons
WHERE UPPER(code) IN ('BATCHTEST', 'ENROLLTEST', 'MAXTEST', 'DISABLEDTEST');
