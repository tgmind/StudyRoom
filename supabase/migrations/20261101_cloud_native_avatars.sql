-- ==============================================================================
-- STUDYROOM — CLOUD-NATIVE PRESET AVATARS MIGRATION
-- ==============================================================================
-- File: supabase/migrations/20261101_cloud_native_avatars.sql
-- Description:
--   Transitions preset avatars store to 100% cloud-native Supabase Storage CDN URLs,
--   eliminating local filesystem coupling and enabling instantaneous, future-proof
--   avatar and category modifications across all environments.

UPDATE public.preset_avatars
SET
  asset_path = 'https://mshudehtxhsmnojirjls.supabase.co/storage/v1/object/public/avatars/presets/' || id || '.webp',
  updated_at = NOW()
WHERE
  asset_path LIKE '/avatars/%'
  OR asset_path NOT LIKE '%supabase.co%';

-- Ensure index on category and display_order
CREATE INDEX IF NOT EXISTS idx_preset_avatars_order ON public.preset_avatars(display_order ASC);
CREATE INDEX IF NOT EXISTS idx_preset_avatars_category ON public.preset_avatars(category);
CREATE INDEX IF NOT EXISTS idx_preset_avatars_active ON public.preset_avatars(is_active);
