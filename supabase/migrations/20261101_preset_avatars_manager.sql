-- ==============================================================================
-- STUDYROOM — PRESET AVATARS CONTROL MANAGER MIGRATION
-- ==============================================================================
-- File: supabase/migrations/20261101_preset_avatars_manager.sql
-- Description:
--   Creates authoritative store for preset avatars, allowing administrators to add,
--   edit, reorder, or delete avatars with automatic optimization.

CREATE TABLE IF NOT EXISTS public.preset_avatars (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  category TEXT NOT NULL,
  asset_path TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_preset_avatars_order ON public.preset_avatars(display_order ASC);
CREATE INDEX IF NOT EXISTS idx_preset_avatars_category ON public.preset_avatars(category);
CREATE INDEX IF NOT EXISTS idx_preset_avatars_active ON public.preset_avatars(is_active);

-- Enable RLS
ALTER TABLE public.preset_avatars ENABLE ROW LEVEL SECURITY;

-- Read Policy: Public and authenticated users can view active presets. Admins can view all.
DROP POLICY IF EXISTS "Preset avatars are viewable by all users" ON public.preset_avatars;
CREATE POLICY "Preset avatars are viewable by all users"
  ON public.preset_avatars
  FOR SELECT
  USING (
    is_active = true
    OR EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid() AND users.is_admin = true
    )
  );

-- Admin Write Policy: Only admins can insert, update, or delete.
DROP POLICY IF EXISTS "Only administrators can modify preset avatars" ON public.preset_avatars;
CREATE POLICY "Only administrators can modify preset avatars"
  ON public.preset_avatars
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid() AND users.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid() AND users.is_admin = true
    )
  );

-- Storage Policy: Allow admins to manage preset avatars in 'avatars' bucket under 'presets/' folder
DROP POLICY IF EXISTS "Admin Preset Avatar Storage Write Access" ON storage.objects;
CREATE POLICY "Admin Preset Avatar Storage Write Access"
  ON storage.objects FOR ALL
  TO authenticated
  USING (
    bucket_id = 'avatars' AND
    (storage.foldername(name))[1] = 'presets' AND
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid() AND users.is_admin = true
    )
  )
  WITH CHECK (
    bucket_id = 'avatars' AND
    (storage.foldername(name))[1] = 'presets' AND
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid() AND users.is_admin = true
    )
  );

-- Update rpc_update_user_avatar to support any valid avatar ID (including custom added)
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
    IF p_avatar_id !~ '^[a-zA-Z0-9_.-]+$' THEN
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

-- Seed the initial 139 preset avatars idempotently
INSERT INTO public.preset_avatars (id, label, category, asset_path, display_order, is_active)
VALUES
  ('avatar-1-01', 'Anime Girl #01', 'Anime Girls', '/avatars/optimized/avatar-1-01.webp', 1, true),
  ('avatar-1-02', 'Anime Girl #02', 'Anime Girls', '/avatars/optimized/avatar-1-02.webp', 2, true),
  ('avatar-1-03', 'Anime Girl #03', 'Anime Girls', '/avatars/optimized/avatar-1-03.webp', 3, true),
  ('avatar-1-04', 'Anime Girl #04', 'Anime Girls', '/avatars/optimized/avatar-1-04.webp', 4, true),
  ('avatar-1-05', 'Anime Girl #05', 'Anime Girls', '/avatars/optimized/avatar-1-05.webp', 5, true),
  ('avatar-1-06', 'Anime Girl #06', 'Anime Girls', '/avatars/optimized/avatar-1-06.webp', 6, true),
  ('avatar-1-07', 'Anime Girl #07', 'Anime Girls', '/avatars/optimized/avatar-1-07.webp', 7, true),
  ('avatar-1-08', 'Anime Girl #08', 'Anime Girls', '/avatars/optimized/avatar-1-08.webp', 8, true),
  ('avatar-1-09', 'Anime Girl #09', 'Anime Girls', '/avatars/optimized/avatar-1-09.webp', 9, true),
  ('avatar-1-10', 'Anime Girl #10', 'Anime Girls', '/avatars/optimized/avatar-1-10.webp', 10, true),
  ('avatar-1-11', 'Anime Girl #11', 'Anime Girls', '/avatars/optimized/avatar-1-11.webp', 11, true),
  ('avatar-1-12', 'Anime Girl #12', 'Anime Girls', '/avatars/optimized/avatar-1-12.webp', 12, true),
  ('avatar-1-13', 'Anime Girl #13', 'Anime Girls', '/avatars/optimized/avatar-1-13.webp', 13, true),
  ('avatar-1-14', 'Anime Girl #14', 'Anime Girls', '/avatars/optimized/avatar-1-14.webp', 14, true),
  ('avatar-1-15', 'Anime Girl #15', 'Anime Girls', '/avatars/optimized/avatar-1-15.webp', 15, true),
  ('avatar-1-16', 'Anime Girl #16', 'Anime Girls', '/avatars/optimized/avatar-1-16.webp', 16, true),
  ('avatar-1-17', 'Anime Girl #17', 'Anime Girls', '/avatars/optimized/avatar-1-17.webp', 17, true),
  ('avatar-1-18', 'Anime Girl #18', 'Anime Girls', '/avatars/optimized/avatar-1-18.webp', 18, true),
  ('avatar-1-19', 'Anime Girl #19', 'Anime Girls', '/avatars/optimized/avatar-1-19.webp', 19, true),
  ('avatar-1-20', 'Anime Girl #20', 'Anime Girls', '/avatars/optimized/avatar-1-20.webp', 20, true),
  ('avatar-2-01', 'Study Buddy #01', 'Study Buddies', '/avatars/optimized/avatar-2-01.webp', 21, true),
  ('avatar-2-02', 'Study Buddy #02', 'Study Buddies', '/avatars/optimized/avatar-2-02.webp', 22, true),
  ('avatar-2-03', 'Study Buddy #03', 'Study Buddies', '/avatars/optimized/avatar-2-03.webp', 23, true),
  ('avatar-2-04', 'Study Buddy #04', 'Study Buddies', '/avatars/optimized/avatar-2-04.webp', 24, true),
  ('avatar-2-05', 'Study Buddy #05', 'Study Buddies', '/avatars/optimized/avatar-2-05.webp', 25, true),
  ('avatar-2-06', 'Study Buddy #06', 'Study Buddies', '/avatars/optimized/avatar-2-06.webp', 26, true),
  ('avatar-2-07', 'Study Buddy #07', 'Study Buddies', '/avatars/optimized/avatar-2-07.webp', 27, true),
  ('avatar-2-08', 'Study Buddy #08', 'Study Buddies', '/avatars/optimized/avatar-2-08.webp', 28, true),
  ('avatar-2-09', 'Study Buddy #09', 'Study Buddies', '/avatars/optimized/avatar-2-09.webp', 29, true),
  ('avatar-2-10', 'Study Buddy #10', 'Study Buddies', '/avatars/optimized/avatar-2-10.webp', 30, true),
  ('avatar-2-11', 'Study Buddy #11', 'Study Buddies', '/avatars/optimized/avatar-2-11.webp', 31, true),
  ('avatar-2-12', 'Study Buddy #12', 'Study Buddies', '/avatars/optimized/avatar-2-12.webp', 32, true),
  ('avatar-2-13', 'Study Buddy #13', 'Study Buddies', '/avatars/optimized/avatar-2-13.webp', 33, true),
  ('avatar-2-14', 'Study Buddy #14', 'Study Buddies', '/avatars/optimized/avatar-2-14.webp', 34, true),
  ('avatar-2-15', 'Study Buddy #15', 'Study Buddies', '/avatars/optimized/avatar-2-15.webp', 35, true),
  ('avatar-2-16', 'Study Buddy #16', 'Study Buddies', '/avatars/optimized/avatar-2-16.webp', 36, true),
  ('avatar-2-17', 'Study Buddy #17', 'Study Buddies', '/avatars/optimized/avatar-2-17.webp', 37, true),
  ('avatar-2-18', 'Study Buddy #18', 'Study Buddies', '/avatars/optimized/avatar-2-18.webp', 38, true),
  ('avatar-2-19', 'Study Buddy #19', 'Study Buddies', '/avatars/optimized/avatar-2-19.webp', 39, true),
  ('avatar-2-20', 'Study Buddy #20', 'Study Buddies', '/avatars/optimized/avatar-2-20.webp', 40, true),
  ('avatar-3-01', 'Student Portrait #01', 'Student Portraits', '/avatars/optimized/avatar-3-01.webp', 41, true),
  ('avatar-3-02', 'Student Portrait #02', 'Student Portraits', '/avatars/optimized/avatar-3-02.webp', 42, true),
  ('avatar-3-03', 'Student Portrait #03', 'Student Portraits', '/avatars/optimized/avatar-3-03.webp', 43, true),
  ('avatar-3-04', 'Student Portrait #04', 'Student Portraits', '/avatars/optimized/avatar-3-04.webp', 44, true),
  ('avatar-3-05', 'Student Portrait #05', 'Student Portraits', '/avatars/optimized/avatar-3-05.webp', 45, true),
  ('avatar-3-06', 'Student Portrait #06', 'Student Portraits', '/avatars/optimized/avatar-3-06.webp', 46, true),
  ('avatar-3-07', 'Student Portrait #07', 'Student Portraits', '/avatars/optimized/avatar-3-07.webp', 47, true),
  ('avatar-3-08', 'Student Portrait #08', 'Student Portraits', '/avatars/optimized/avatar-3-08.webp', 48, true),
  ('avatar-3-09', 'Student Portrait #09', 'Student Portraits', '/avatars/optimized/avatar-3-09.webp', 49, true),
  ('avatar-3-10', 'Student Portrait #10', 'Student Portraits', '/avatars/optimized/avatar-3-10.webp', 50, true),
  ('avatar-3-11', 'Student Portrait #11', 'Student Portraits', '/avatars/optimized/avatar-3-11.webp', 51, true),
  ('avatar-3-12', 'Student Portrait #12', 'Student Portraits', '/avatars/optimized/avatar-3-12.webp', 52, true),
  ('avatar-3-13', 'Student Portrait #13', 'Student Portraits', '/avatars/optimized/avatar-3-13.webp', 53, true),
  ('avatar-3-14', 'Student Portrait #14', 'Student Portraits', '/avatars/optimized/avatar-3-14.webp', 54, true),
  ('avatar-3-15', 'Student Portrait #15', 'Student Portraits', '/avatars/optimized/avatar-3-15.webp', 55, true),
  ('avatar-3-16', 'Student Portrait #16', 'Student Portraits', '/avatars/optimized/avatar-3-16.webp', 56, true),
  ('avatar-3-17', 'Student Portrait #17', 'Student Portraits', '/avatars/optimized/avatar-3-17.webp', 57, true),
  ('avatar-3-18', 'Student Portrait #18', 'Student Portraits', '/avatars/optimized/avatar-3-18.webp', 58, true),
  ('avatar-3-19', 'Student Portrait #19', 'Student Portraits', '/avatars/optimized/avatar-3-19.webp', 59, true),
  ('avatar-3-20', 'Student Portrait #20', 'Student Portraits', '/avatars/optimized/avatar-3-20.webp', 60, true),
  ('avatar-4-01', 'Cat with Headphones', 'Cute Animals & Friends', '/avatars/optimized/avatar-4-01.webp', 61, true),
  ('avatar-4-02', 'Panda with Bamboo', 'Cute Animals & Friends', '/avatars/optimized/avatar-4-02.webp', 62, true),
  ('avatar-4-03', 'Puppy with Cap', 'Cute Animals & Friends', '/avatars/optimized/avatar-4-03.webp', 63, true),
  ('avatar-4-04', 'Cozy Penguin', 'Cute Animals & Friends', '/avatars/optimized/avatar-4-04.webp', 64, true),
  ('avatar-4-05', 'Parakeet on Branch', 'Cute Animals & Friends', '/avatars/optimized/avatar-4-05.webp', 65, true),
  ('avatar-4-06', 'Cool Duck with Sunglasses', 'Cute Animals & Friends', '/avatars/optimized/avatar-4-06.webp', 66, true),
  ('avatar-4-07', 'Teddy Bear with Bow', 'Cute Animals & Friends', '/avatars/optimized/avatar-4-07.webp', 67, true),
  ('avatar-4-08', 'Bunny with Carrot', 'Cute Animals & Friends', '/avatars/optimized/avatar-4-08.webp', 68, true),
  ('avatar-4-09', 'Turtle with Headphones', 'Cute Animals & Friends', '/avatars/optimized/avatar-4-09.webp', 69, true),
  ('avatar-4-10', 'Panda in Hoodie', 'Cute Animals & Friends', '/avatars/optimized/avatar-4-10.webp', 70, true),
  ('avatar-4-11', 'Snowy Owl', 'Cute Animals & Friends', '/avatars/optimized/avatar-4-11.webp', 71, true),
  ('avatar-4-12', 'Bluebird on Blossom', 'Cute Animals & Friends', '/avatars/optimized/avatar-4-12.webp', 72, true),
  ('avatar-4-13', 'Winking Corgi', 'Cute Animals & Friends', '/avatars/optimized/avatar-4-13.webp', 73, true),
  ('avatar-4-14', 'Astronaut with Star', 'Cute Animals & Friends', '/avatars/optimized/avatar-4-14.webp', 74, true),
  ('avatar-4-15', 'Cute Cactus in Pot', 'Cute Animals & Friends', '/avatars/optimized/avatar-4-15.webp', 75, true),
  ('avatar-4-16', 'Beanie Chick', 'Cute Animals & Friends', '/avatars/optimized/avatar-4-16.webp', 76, true),
  ('avatar-4-17', 'Sleeping Black Cat', 'Cute Animals & Friends', '/avatars/optimized/avatar-4-17.webp', 77, true),
  ('avatar-4-18', 'Coffee on Books', 'Cute Animals & Friends', '/avatars/optimized/avatar-4-18.webp', 78, true),
  ('avatar-4-19', 'Panda in Heart Box', 'Cute Animals & Friends', '/avatars/optimized/avatar-4-19.webp', 79, true),
  ('avatar-4-20', 'Flamingo with Sunglasses', 'Cute Animals & Friends', '/avatars/optimized/avatar-4-20.webp', 80, true),
  ('avatar-5-01', 'Happy Corgi', 'Playful Icons', '/avatars/optimized/avatar-5-01.webp', 81, true),
  ('avatar-5-02', 'Toucan on Branch', 'Playful Icons', '/avatars/optimized/avatar-5-02.webp', 82, true),
  ('avatar-5-03', 'Singing Chick', 'Playful Icons', '/avatars/optimized/avatar-5-03.webp', 83, true),
  ('avatar-5-04', 'Goldfish in Bubbles', 'Playful Icons', '/avatars/optimized/avatar-5-04.webp', 84, true),
  ('avatar-5-05', 'Beanie Penguin', 'Playful Icons', '/avatars/optimized/avatar-5-05.webp', 85, true),
  ('avatar-5-06', 'Red Expedition Jeep', 'Playful Icons', '/avatars/optimized/avatar-5-06.webp', 86, true),
  ('avatar-5-07', 'Curious Kitten', 'Playful Icons', '/avatars/optimized/avatar-5-07.webp', 87, true),
  ('avatar-5-08', 'Teddy Bear with Heart', 'Playful Icons', '/avatars/optimized/avatar-5-08.webp', 88, true),
  ('avatar-5-09', 'Watermelon Popsicle', 'Playful Icons', '/avatars/optimized/avatar-5-09.webp', 89, true),
  ('avatar-5-10', 'Blue Classic Car in Nest', 'Playful Icons', '/avatars/optimized/avatar-5-10.webp', 90, true),
  ('avatar-5-11', 'Little Bluebird', 'Playful Icons', '/avatars/optimized/avatar-5-11.webp', 91, true),
  ('avatar-5-12', 'Bunny with Giant Carrot', 'Playful Icons', '/avatars/optimized/avatar-5-12.webp', 92, true),
  ('avatar-5-13', 'Flower Bear Girl', 'Playful Icons', '/avatars/optimized/avatar-5-13.webp', 93, true),
  ('avatar-5-14', 'Magical Jellyfish', 'Playful Icons', '/avatars/optimized/avatar-5-14.webp', 94, true),
  ('avatar-5-15', 'Red Panda', 'Playful Icons', '/avatars/optimized/avatar-5-15.webp', 95, true),
  ('avatar-5-16', 'Gentle Giraffe', 'Playful Icons', '/avatars/optimized/avatar-5-16.webp', 96, true),
  ('avatar-5-17', 'Dragonfly', 'Playful Icons', '/avatars/optimized/avatar-5-17.webp', 97, true),
  ('avatar-5-18', 'Teddy Polar Bear', 'Playful Icons', '/avatars/optimized/avatar-5-18.webp', 98, true),
  ('avatar-5-19', 'Winged Butterfly Kitten', 'Playful Icons', '/avatars/optimized/avatar-5-19.webp', 99, true),
  ('avatar-6-01', 'Anime Boy #01', 'Anime Boys', '/avatars/optimized/avatar-6-01.webp', 100, true),
  ('avatar-6-02', 'Anime Boy #02', 'Anime Boys', '/avatars/optimized/avatar-6-02.webp', 101, true),
  ('avatar-6-03', 'Anime Boy #03', 'Anime Boys', '/avatars/optimized/avatar-6-03.webp', 102, true),
  ('avatar-6-04', 'Anime Boy #04', 'Anime Boys', '/avatars/optimized/avatar-6-04.webp', 103, true),
  ('avatar-6-05', 'Anime Boy #05', 'Anime Boys', '/avatars/optimized/avatar-6-05.webp', 104, true),
  ('avatar-6-06', 'Anime Boy #06', 'Anime Boys', '/avatars/optimized/avatar-6-06.webp', 105, true),
  ('avatar-6-07', 'Anime Boy #07', 'Anime Boys', '/avatars/optimized/avatar-6-07.webp', 106, true),
  ('avatar-6-08', 'Anime Boy #08', 'Anime Boys', '/avatars/optimized/avatar-6-08.webp', 107, true),
  ('avatar-6-09', 'Anime Boy #09', 'Anime Boys', '/avatars/optimized/avatar-6-09.webp', 108, true),
  ('avatar-6-10', 'Anime Boy #10', 'Anime Boys', '/avatars/optimized/avatar-6-10.webp', 109, true),
  ('avatar-6-11', 'Anime Boy #11', 'Anime Boys', '/avatars/optimized/avatar-6-11.webp', 110, true),
  ('avatar-6-12', 'Anime Boy #12', 'Anime Boys', '/avatars/optimized/avatar-6-12.webp', 111, true),
  ('avatar-6-13', 'Anime Boy #13', 'Anime Boys', '/avatars/optimized/avatar-6-13.webp', 112, true),
  ('avatar-6-14', 'Anime Boy #14', 'Anime Boys', '/avatars/optimized/avatar-6-14.webp', 113, true),
  ('avatar-6-15', 'Anime Boy #15', 'Anime Boys', '/avatars/optimized/avatar-6-15.webp', 114, true),
  ('avatar-6-16', 'Anime Boy #16', 'Anime Boys', '/avatars/optimized/avatar-6-16.webp', 115, true),
  ('avatar-6-17', 'Anime Boy #17', 'Anime Boys', '/avatars/optimized/avatar-6-17.webp', 116, true),
  ('avatar-6-18', 'Anime Boy #18', 'Anime Boys', '/avatars/optimized/avatar-6-18.webp', 117, true),
  ('avatar-6-19', 'Anime Boy #19', 'Anime Boys', '/avatars/optimized/avatar-6-19.webp', 118, true),
  ('avatar-6-20', 'Anime Boy #20', 'Anime Boys', '/avatars/optimized/avatar-6-20.webp', 119, true),
  ('avatar-7-01', 'Indian National Flag', 'Culture & Heritage', '/avatars/optimized/avatar-7-01.webp', 120, true),
  ('avatar-7-02', 'Map of India', 'Culture & Heritage', '/avatars/optimized/avatar-7-02.webp', 121, true),
  ('avatar-7-03', 'Mahatma Gandhi', 'Culture & Heritage', '/avatars/optimized/avatar-7-03.webp', 122, true),
  ('avatar-7-04', 'Swami Vivekananda', 'Culture & Heritage', '/avatars/optimized/avatar-7-04.webp', 123, true),
  ('avatar-7-05', 'Dr. B.R. Ambedkar', 'Culture & Heritage', '/avatars/optimized/avatar-7-05.webp', 124, true),
  ('avatar-7-06', 'Lord Ganesha', 'Culture & Heritage', '/avatars/optimized/avatar-7-06.webp', 125, true),
  ('avatar-7-07', 'Lord Krishna', 'Culture & Heritage', '/avatars/optimized/avatar-7-07.webp', 126, true),
  ('avatar-7-08', 'Lord Shiva', 'Culture & Heritage', '/avatars/optimized/avatar-7-08.webp', 127, true),
  ('avatar-7-09', 'Lord Hanuman', 'Culture & Heritage', '/avatars/optimized/avatar-7-09.webp', 128, true),
  ('avatar-7-10', 'Gautam Buddha', 'Culture & Heritage', '/avatars/optimized/avatar-7-10.webp', 129, true),
  ('avatar-7-11', 'India Gate', 'Culture & Heritage', '/avatars/optimized/avatar-7-11.webp', 130, true),
  ('avatar-7-12', 'Taj Mahal', 'Culture & Heritage', '/avatars/optimized/avatar-7-12.webp', 131, true),
  ('avatar-7-13', 'Red Fort', 'Culture & Heritage', '/avatars/optimized/avatar-7-13.webp', 132, true),
  ('avatar-7-14', 'Qutub Minar', 'Culture & Heritage', '/avatars/optimized/avatar-7-14.webp', 133, true),
  ('avatar-7-15', 'Lotus Temple', 'Culture & Heritage', '/avatars/optimized/avatar-7-15.webp', 134, true),
  ('avatar-7-16', 'Konark Sun Temple Wheel', 'Culture & Heritage', '/avatars/optimized/avatar-7-16.webp', 135, true),
  ('avatar-7-17', 'Classical Indian Dancer', 'Culture & Heritage', '/avatars/optimized/avatar-7-17.webp', 136, true),
  ('avatar-7-18', 'Royal Peacock', 'Culture & Heritage', '/avatars/optimized/avatar-7-18.webp', 137, true),
  ('avatar-7-19', 'Sacred Kamadhenu Cow', 'Culture & Heritage', '/avatars/optimized/avatar-7-19.webp', 138, true),
  ('avatar-7-20', 'Majestic Himalayas', 'Culture & Heritage', '/avatars/optimized/avatar-7-20.webp', 139, true)
ON CONFLICT (id) DO UPDATE SET
  label = EXCLUDED.label,
  category = EXCLUDED.category,
  asset_path = EXCLUDED.asset_path;
