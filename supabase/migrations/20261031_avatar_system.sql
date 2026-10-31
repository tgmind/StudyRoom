-- ==============================================================================
-- Migration: 20261031_avatar_system.sql
-- Purpose:
--   1. Add 'avatar_id' column to public.users for persistent, structured avatar selection.
--   2. Add performance index on public.users(avatar_id).
--   3. Create secure RPC 'rpc_update_user_avatar' with authentication checks,
--      avatar ID pattern validation, and atomic profile updates.
--   4. Ensure full backward compatibility with existing avatar_url values.
-- ==============================================================================

-- 1. Add column to public.users idempotently
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS avatar_id TEXT;

-- 2. Index for avatar querying
CREATE INDEX IF NOT EXISTS idx_users_avatar_id ON public.users(avatar_id) WHERE avatar_id IS NOT NULL;

-- 3. Authoritative RPC: rpc_update_user_avatar
CREATE OR REPLACE FUNCTION public.rpc_update_user_avatar(
  p_avatar_id TEXT,
  p_avatar_url TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_result JSONB;
BEGIN
  -- Security check: Require authenticated user
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Caller must be authenticated to update their avatar.';
  END IF;

  -- Validation: Validate avatar ID format if provided
  IF p_avatar_id IS NOT NULL AND p_avatar_id != '' THEN
    IF p_avatar_id !~ '^avatar-[1-7]-[0-9]{2}$' THEN
      RAISE EXCEPTION 'Invalid avatar identifier: %', p_avatar_id;
    END IF;
  END IF;

  -- Update user record atomically
  UPDATE public.users
  SET
    avatar_id = NULLIF(TRIM(p_avatar_id), ''),
    avatar_url = NULLIF(TRIM(p_avatar_url), ''),
    updated_at = NOW()
  WHERE id = v_uid
  RETURNING jsonb_build_object(
    'id', id,
    'display_name', display_name,
    'avatar_id', avatar_id,
    'avatar_url', avatar_url,
    'state_version', state_version,
    'updated_at', updated_at
  ) INTO v_result;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'User profile not found for id: %', v_uid;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'profile', v_result
  );
END;
$$;

-- Revoke public execution, grant to authenticated and service_role
REVOKE EXECUTE ON FUNCTION public.rpc_update_user_avatar(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_update_user_avatar(TEXT, TEXT) TO authenticated, service_role;
