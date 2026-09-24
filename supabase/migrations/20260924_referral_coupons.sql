-- ==============================================================================
-- STUDY ROOM REFERRAL COUPON & ACCESS SCHEME
-- ==============================================================================

-- 1. Referral Coupons Table
CREATE TABLE IF NOT EXISTS public.public_coupons (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  code text UNIQUE NOT NULL,
  discount_percent integer NOT NULL DEFAULT 100 CHECK (discount_percent BETWEEN 1 AND 100),
  is_active boolean NOT NULL DEFAULT true,
  max_uses integer DEFAULT NULL,
  used_count integer NOT NULL DEFAULT 0,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.public_coupons ENABLE ROW LEVEL SECURITY;

-- Public can read coupons (server-side API validates authoritative eligibility)
CREATE POLICY "Public can read active coupons"
  ON public.public_coupons
  FOR SELECT
  USING (true);

-- Only admins can insert, update, or delete coupons
CREATE POLICY "Only admins can manage coupons"
  ON public.public_coupons
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid() AND users.is_admin = true
    )
  );

-- 2. Referral Enrollments Table
CREATE TABLE IF NOT EXISTS public.public_referral_enrollments (
  id text PRIMARY KEY,
  coupon_code text NOT NULL,
  name text NOT NULL,
  referred_by text NOT NULL,
  agreement_accepted boolean NOT NULL DEFAULT true CHECK (agreement_accepted = true),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'flagged', 'revoked'))
);

-- Enable RLS
ALTER TABLE public.public_referral_enrollments ENABLE ROW LEVEL SECURITY;

-- Public can submit referral enrollments
CREATE POLICY "Public can submit referral enrollments"
  ON public.public_referral_enrollments
  FOR INSERT
  WITH CHECK (true);

-- Only admins can view and manage referral enrollments
CREATE POLICY "Only admins can view and manage referral enrollments"
  ON public.public_referral_enrollments
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid() AND users.is_admin = true
    )
  );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_public_coupons_code ON public.public_coupons (code);
CREATE INDEX IF NOT EXISTS idx_public_coupons_active ON public.public_coupons (is_active);
CREATE INDEX IF NOT EXISTS idx_referral_enrollments_code ON public.public_referral_enrollments (coupon_code);
CREATE INDEX IF NOT EXISTS idx_referral_enrollments_date ON public.public_referral_enrollments (submitted_at DESC);

-- Seed Initial Coupons (Idempotent)
INSERT INTO public.public_coupons (id, code, discount_percent, is_active, max_uses, used_count, note)
VALUES
  ('cpn_seed_referral100', 'REFERRAL100', 100, true, 1000, 0, 'Official StudyRoom launch referral coupon'),
  ('cpn_seed_study100', 'STUDY100', 100, true, 500, 0, 'Peer study group 100% scholarship code'),
  ('cpn_seed_vip100', 'VIP100', 100, true, NULL, 0, 'VIP community partner pass')
ON CONFLICT (code) DO NOTHING;
