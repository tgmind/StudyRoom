-- ============================================================
-- STUDYROOM — UPDATE ADMIN EMAIL TO studyaliveapp@gmail.com
-- ============================================================
-- Run this in Supabase Dashboard -> SQL Editor -> New Query -> Run
-- Safe and idempotent. Preserves existing admin ID and permissions.

-- 1. If sa@admin.tg exists in auth.users, update it to studyaliveapp@gmail.com
UPDATE auth.users
SET email = 'studyaliveapp@gmail.com',
    email_confirmed_at = COALESCE(email_confirmed_at, NOW())
WHERE LOWER(email) = 'sa@admin.tg';

-- 2. Mark is_admin = true for studyaliveapp@gmail.com in public.users
UPDATE public.users
SET is_admin = TRUE
WHERE id IN (
  SELECT id FROM auth.users WHERE LOWER(email) = 'studyaliveapp@gmail.com'
);

-- 3. Update internal security check function to recognize studyaliveapp@gmail.com
CREATE OR REPLACE FUNCTION public.check_is_admin()
RETURNS BOOLEAN AS $$
DECLARE
  v_email TEXT;
  v_is_admin BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT is_admin INTO v_is_admin FROM public.users WHERE id = auth.uid();
  IF v_is_admin IS TRUE THEN
    RETURN TRUE;
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
  IF v_email IS NOT NULL AND LOWER(v_email) IN ('studyaliveapp@gmail.com', 'sa@admin.tg') THEN
    PERFORM set_config('studyroom.internal_admin_update', 'true', true);
    UPDATE public.users SET is_admin = TRUE WHERE id = auth.uid();
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
