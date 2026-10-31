-- ==============================================================================
-- STUDYROOM — PRESET AVATAR CATEGORY MANAGEMENT & DELETION MIGRATION
-- ==============================================================================
-- File: supabase/migrations/20261101_avatar_category_deletion.sql
-- Description:
--   Atomic RPC for deleting an avatar category, allowing administrators to either
--   relocate all avatars to another designated category or delete them entirely.

CREATE OR REPLACE FUNCTION public.rpc_admin_delete_avatar_category(
  p_category TEXT,
  p_relocate_to_category TEXT DEFAULT NULL,
  p_delete_avatars BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_is_admin BOOLEAN := false;
  v_affected_count INT := 0;
  v_affected_ids TEXT[];
  v_asset_paths TEXT[];
  v_trimmed_cat TEXT := TRIM(p_category);
  v_trimmed_relocate TEXT := NULLIF(TRIM(p_relocate_to_category), '');
BEGIN
  -- 1. Authorization Check:
  -- If invoked from an authenticated HTTP session, ensure the user has admin role.
  IF v_uid IS NOT NULL THEN
    SELECT COALESCE(is_admin, false) INTO v_is_admin FROM public.users WHERE id = v_uid;
    IF NOT v_is_admin THEN
      RAISE EXCEPTION 'Unauthorized: Administrator privileges required to delete avatar categories.';
    END IF;
  END IF;

  -- 2. Validation: Category cannot be null, empty, or 'All'
  IF v_trimmed_cat IS NULL OR v_trimmed_cat = '' OR LOWER(v_trimmed_cat) = 'all' THEN
    RAISE EXCEPTION 'Invalid category identifier specified for deletion: %', p_category;
  END IF;

  -- 3. Case A: Relocate avatars to target category
  IF v_trimmed_relocate IS NOT NULL AND LOWER(v_trimmed_relocate) != LOWER(v_trimmed_cat) THEN
    UPDATE public.preset_avatars
    SET
      category = v_trimmed_relocate,
      updated_at = NOW()
    WHERE LOWER(category) = LOWER(v_trimmed_cat);

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    RETURN jsonb_build_object(
      'success', true,
      'action', 'relocate',
      'category', v_trimmed_cat,
      'relocated_to', v_trimmed_relocate,
      'count', v_affected_count
    );

  -- 4. Case B: Permanently delete all avatars in this category
  ELSIF p_delete_avatars = true THEN
    -- Capture affected avatar IDs and asset paths before deletion for storage cleanup
    SELECT
      COALESCE(ARRAY_AGG(id), ARRAY[]::TEXT[]),
      COALESCE(ARRAY_AGG(asset_path), ARRAY[]::TEXT[])
    INTO v_affected_ids, v_asset_paths
    FROM public.preset_avatars
    WHERE LOWER(category) = LOWER(v_trimmed_cat);

    DELETE FROM public.preset_avatars
    WHERE LOWER(category) = LOWER(v_trimmed_cat);

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    RETURN jsonb_build_object(
      'success', true,
      'action', 'delete_avatars',
      'category', v_trimmed_cat,
      'deleted_ids', v_affected_ids,
      'asset_paths', v_asset_paths,
      'count', v_affected_count
    );

  -- 5. Case C: Invalid arguments
  ELSE
    RAISE EXCEPTION 'Must provide either p_relocate_to_category or p_delete_avatars = true';
  END IF;
END;
$$;

-- Grant execution to authenticated and service_role
GRANT EXECUTE ON FUNCTION public.rpc_admin_delete_avatar_category(TEXT, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_admin_delete_avatar_category(TEXT, TEXT, BOOLEAN) TO service_role;
