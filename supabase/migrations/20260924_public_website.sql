-- ==============================================================================
-- STUDY ROOM PUBLIC WEBSITE & PAYMENT VERIFICATION SCHEMA
-- ==============================================================================

-- 1. Public Website CMS Content
CREATE TABLE IF NOT EXISTS public.public_website_content (
  id text PRIMARY KEY DEFAULT 'main',
  content jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

-- Enable RLS
ALTER TABLE public.public_website_content ENABLE ROW LEVEL SECURITY;

-- Public can read content
DROP POLICY IF EXISTS "Public website content is publicly readable" ON public.public_website_content;
CREATE POLICY "Public website content is publicly readable"
  ON public.public_website_content
  FOR SELECT
  USING (true);

-- Only admins can update content
DROP POLICY IF EXISTS "Only admins can modify public website content" ON public.public_website_content;
CREATE POLICY "Only admins can modify public website content"
  ON public.public_website_content
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid() AND users.is_admin = true
    )
  );

-- 2. ₹50 UPI Payment Submissions Queue
CREATE TABLE IF NOT EXISTS public.public_payment_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  contact text NOT NULL,
  utr text NOT NULL,
  amount numeric(10, 2) NOT NULL DEFAULT 50.00,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected')),
  verified_at timestamptz,
  verified_by text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.public_payment_submissions ENABLE ROW LEVEL SECURITY;

-- Public can insert new payment submission
DROP POLICY IF EXISTS "Public can insert payment submissions" ON public.public_payment_submissions;
CREATE POLICY "Public can insert payment submissions"
  ON public.public_payment_submissions
  FOR INSERT
  WITH CHECK (true);

-- Only admins can view or update submissions
DROP POLICY IF EXISTS "Only admins can view and manage payment submissions" ON public.public_payment_submissions;
CREATE POLICY "Only admins can view and manage payment submissions"
  ON public.public_payment_submissions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid() AND users.is_admin = true
    )
  );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_payment_submissions_utr ON public.public_payment_submissions(utr);
CREATE INDEX IF NOT EXISTS idx_payment_submissions_status ON public.public_payment_submissions(status);
CREATE INDEX IF NOT EXISTS idx_payment_submissions_submitted ON public.public_payment_submissions(submitted_at DESC);
