-- ==============================================================================
-- STUDYROOM — COMMUNITY & SOCIAL CHANNEL LINKS CONFIGURATION
-- ==============================================================================
-- File: supabase/migrations/20261007_social_community_links.sql
-- Description:
--   Creates the authoritative database store for user Settings community buttons,
--   allowing administrators to manage, add, edit, reorder, or disable social links.

CREATE TABLE IF NOT EXISTS public.social_community_links (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  action_text TEXT NOT NULL DEFAULT 'Join Now',
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 1,
  icon_key TEXT NOT NULL DEFAULT 'whatsapp',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast ordering of active links
CREATE INDEX IF NOT EXISTS idx_social_links_order ON public.social_community_links(display_order ASC);
CREATE INDEX IF NOT EXISTS idx_social_links_enabled ON public.social_community_links(is_enabled);

-- Enable Row Level Security (RLS)
ALTER TABLE public.social_community_links ENABLE ROW LEVEL SECURITY;

-- 1. Read Policy:
-- Public and authenticated users can view active (enabled) social links.
-- Administrators can view all social links (enabled and disabled) for management.
DROP POLICY IF EXISTS "Active social links are viewable by all users" ON public.social_community_links;
CREATE POLICY "Active social links are viewable by all users"
  ON public.social_community_links
  FOR SELECT
  USING (
    is_enabled = true
    OR EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid() AND users.is_admin = true
    )
  );

-- 2. Admin Write Policy:
-- Only authenticated users with admin privileges (users.is_admin = true) can insert, update, or delete.
DROP POLICY IF EXISTS "Only administrators can modify social links" ON public.social_community_links;
CREATE POLICY "Only administrators can modify social links"
  ON public.social_community_links
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

-- Seed initial authoritative configuration: WhatsApp and Telegram
-- Note: ON CONFLICT (id) DO NOTHING ensures administrator customizations are never overwritten on re-runs.
INSERT INTO public.social_community_links (
  id,
  platform,
  title,
  url,
  action_text,
  is_enabled,
  display_order,
  icon_key,
  created_at,
  updated_at
) VALUES
  (
    'whatsapp',
    'whatsapp',
    'WhatsApp',
    'https://whatsapp.com/channel/0029VbDVgDFBvvseejxJ8L25',
    'Join Now',
    true,
    1,
    'whatsapp',
    now(),
    now()
  ),
  (
    'telegram',
    'telegram',
    'Telegram',
    'https://t.me/studyalive_telegram',
    'Join Now',
    true,
    2,
    'telegram',
    now(),
    now()
  )
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------
-- 3. ATOMIC REORDER RPC FUNCTION (Transactional Batch Update)
-- ------------------------------------------------------------
-- Executes the entire reorder operation in an ACID transaction.
-- If any item fails, all updates in the transaction automatically roll back.
CREATE OR REPLACE FUNCTION public.rpc_admin_reorder_social_links(p_items jsonb)
RETURNS jsonb AS $$
DECLARE
  v_item jsonb;
  v_id text;
  v_order integer;
BEGIN
  -- Strict administrator authorization
  IF NOT (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid() AND users.is_admin = true
    )
    OR (current_setting('role', true) = 'service_role')
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Administrator privileges required';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Items array cannot be empty';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_id := v_item->>'id';
    v_order := (v_item->>'display_order')::integer;

    IF v_id IS NULL OR TRIM(v_id) = '' OR v_order IS NULL THEN
      RAISE EXCEPTION 'Invalid reorder item payload';
    END IF;

    UPDATE public.social_community_links
    SET display_order = v_order, updated_at = now()
    WHERE id = v_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Social link not found: %', v_id;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE EXECUTE ON FUNCTION public.rpc_admin_reorder_social_links(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_admin_reorder_social_links(jsonb) TO authenticated, service_role;
