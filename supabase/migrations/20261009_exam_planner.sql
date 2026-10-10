-- ============================================================
-- STUDYROOM — EXAM PLANNER & PREPARATION SLOTS MIGRATION
-- ============================================================
-- File: supabase/migrations/20261009_exam_planner.sql
-- Description: Creates exam_plans and preparation_slots tables with
--              strict RLS, lock-protection triggers, referential
--              integrity, and atomic RPCs.
-- ============================================================

-- 1. EXAM PLANS TABLE
CREATE TABLE IF NOT EXISTS public.exam_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  exam_name TEXT NOT NULL,
  exam_date DATE NOT NULL,
  description TEXT,
  show_in_streaks BOOLEAN NOT NULL DEFAULT TRUE,
  is_locked BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure all required columns exist in case exam_plans was pre-created in an earlier attempt
ALTER TABLE public.exam_plans ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.exam_plans ADD COLUMN IF NOT EXISTS show_in_streaks BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.exam_plans ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.exam_plans ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

-- Indexes for exam_plans
CREATE INDEX IF NOT EXISTS idx_exam_plans_user_order ON public.exam_plans(user_id, sort_order ASC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_exam_plans_user_streaks ON public.exam_plans(user_id, show_in_streaks) WHERE show_in_streaks = TRUE;
CREATE INDEX IF NOT EXISTS idx_exam_plans_exam_date ON public.exam_plans(user_id, exam_date);

-- 2. PREPARATION SLOTS TABLE
CREATE TABLE IF NOT EXISTS public.preparation_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES public.exam_plans(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  category TEXT NOT NULL DEFAULT 'custom',
  color TEXT NOT NULL DEFAULT '#3b82f6',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure all required columns and constraints exist in case preparation_slots was pre-created
ALTER TABLE public.preparation_slots ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.preparation_slots ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'custom';
ALTER TABLE public.preparation_slots ADD COLUMN IF NOT EXISTS color TEXT NOT NULL DEFAULT '#3b82f6';
ALTER TABLE public.preparation_slots ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_slot_dates'
  ) THEN
    ALTER TABLE public.preparation_slots ADD CONSTRAINT chk_slot_dates CHECK (start_date <= end_date);
  END IF;
END $$;

-- Indexes for preparation_slots
CREATE INDEX IF NOT EXISTS idx_prep_slots_plan_dates ON public.preparation_slots(plan_id, start_date ASC, sort_order ASC);
CREATE INDEX IF NOT EXISTS idx_prep_slots_user_id ON public.preparation_slots(user_id);

-- 3. UPDATED_AT TIMESTAMP TRIGGERS
CREATE OR REPLACE FUNCTION public.trg_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_exam_plans_updated_at ON public.exam_plans;
CREATE TRIGGER trg_exam_plans_updated_at
  BEFORE UPDATE ON public.exam_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_prep_slots_updated_at ON public.preparation_slots;
CREATE TRIGGER trg_prep_slots_updated_at
  BEFORE UPDATE ON public.preparation_slots
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_set_updated_at();

-- 4. DATABASE-LEVEL LOCK ENFORCEMENT & INTEGRITY TRIGGERS
-- A locked plan cannot have its details modified or deleted until explicitly unlocked.
-- Unlocking does NOT permit smuggled edits in the same update transaction.
CREATE OR REPLACE FUNCTION public.prevent_locked_plan_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.is_locked = TRUE THEN
      RAISE EXCEPTION 'Cannot delete a locked exam plan. Unlock it first.';
    END IF;
    RETURN OLD;
  END IF;

  -- On UPDATE: If plan was locked, NO protected fields may change (even if is_locked is being set to false)
  IF OLD.is_locked = TRUE THEN
    IF (OLD.exam_name IS DISTINCT FROM NEW.exam_name) OR
       (OLD.exam_date IS DISTINCT FROM NEW.exam_date) OR
       (OLD.description IS DISTINCT FROM NEW.description) OR
       (OLD.show_in_streaks IS DISTINCT FROM NEW.show_in_streaks) OR
       (OLD.sort_order IS DISTINCT FROM NEW.sort_order) OR
       (OLD.user_id IS DISTINCT FROM NEW.user_id) OR
       (OLD.created_at IS DISTINCT FROM NEW.created_at) THEN
      RAISE EXCEPTION 'Plan is locked and cannot be modified. Unlock the plan first before making any changes.';
    END IF;
  END IF;

  -- Ensure ownership cannot be transferred even on unlocked plans
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Cannot transfer plan ownership to another user';
  END IF;

  -- If exam_date is changed on an unlocked plan, verify no existing slot ends after the new exam_date
  IF NEW.exam_date IS DISTINCT FROM OLD.exam_date THEN
    IF EXISTS (
      SELECT 1 FROM public.preparation_slots
      WHERE plan_id = NEW.id AND end_date > NEW.exam_date
    ) THEN
      RAISE EXCEPTION 'Cannot change exam date to % because existing preparation slot(s) extend beyond this date', NEW.exam_date;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_locked_plan_mutation ON public.exam_plans;
CREATE TRIGGER trg_prevent_locked_plan_mutation
  BEFORE UPDATE OR DELETE ON public.exam_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_locked_plan_mutation();

-- Slots belonging to a locked plan cannot be inserted, updated, or deleted.
-- Slots cannot be moved into/out of a locked plan, and slot end_date cannot exceed exam_date.
CREATE OR REPLACE FUNCTION public.prevent_locked_slot_mutation()
RETURNS TRIGGER AS $$
DECLARE
  v_old_locked BOOLEAN;
  v_new_locked BOOLEAN;
  v_exam_date DATE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT is_locked INTO v_old_locked
    FROM public.exam_plans
    WHERE id = OLD.plan_id;

    IF v_old_locked = TRUE THEN
      RAISE EXCEPTION 'Cannot delete preparation slots of a locked exam plan';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT is_locked, exam_date INTO v_new_locked, v_exam_date
    FROM public.exam_plans
    WHERE id = NEW.plan_id;

    IF v_new_locked = TRUE THEN
      RAISE EXCEPTION 'Cannot insert preparation slots into a locked exam plan';
    END IF;

    IF v_exam_date IS NOT NULL AND NEW.end_date > v_exam_date THEN
      RAISE EXCEPTION 'Slot end date (%) cannot be after exam date (%)', NEW.end_date, v_exam_date;
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Check old plan lock status
    SELECT is_locked INTO v_old_locked
    FROM public.exam_plans
    WHERE id = OLD.plan_id;

    IF v_old_locked = TRUE THEN
      RAISE EXCEPTION 'Cannot modify preparation slots of a locked exam plan';
    END IF;

    -- Ensure slot ownership cannot be transferred
    IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION 'Cannot transfer slot ownership to another user';
    END IF;

    -- If plan_id is changed, also verify new plan is not locked
    IF NEW.plan_id IS DISTINCT FROM OLD.plan_id THEN
      SELECT is_locked, exam_date INTO v_new_locked, v_exam_date
      FROM public.exam_plans
      WHERE id = NEW.plan_id;

      IF v_new_locked = TRUE THEN
        RAISE EXCEPTION 'Cannot move preparation slots into a locked exam plan';
      END IF;
    ELSE
      SELECT exam_date INTO v_exam_date
      FROM public.exam_plans
      WHERE id = NEW.plan_id;
    END IF;

    IF v_exam_date IS NOT NULL AND NEW.end_date > v_exam_date THEN
      RAISE EXCEPTION 'Slot end date (%) cannot be after exam date (%)', NEW.end_date, v_exam_date;
    END IF;

    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_locked_slot_mutation ON public.preparation_slots;
CREATE TRIGGER trg_prevent_locked_slot_mutation
  BEFORE INSERT OR UPDATE OR DELETE ON public.preparation_slots
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_locked_slot_mutation();

-- 5. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.exam_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.preparation_slots ENABLE ROW LEVEL SECURITY;

-- Exam Plans Policies
DROP POLICY IF EXISTS "Users can view own exam plans" ON public.exam_plans;
CREATE POLICY "Users can view own exam plans"
  ON public.exam_plans FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own exam plans" ON public.exam_plans;
CREATE POLICY "Users can insert own exam plans"
  ON public.exam_plans FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own exam plans" ON public.exam_plans;
CREATE POLICY "Users can update own exam plans"
  ON public.exam_plans FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own exam plans" ON public.exam_plans;
CREATE POLICY "Users can delete own exam plans"
  ON public.exam_plans FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Preparation Slots Policies
DROP POLICY IF EXISTS "Users can view own preparation slots" ON public.preparation_slots;
CREATE POLICY "Users can view own preparation slots"
  ON public.preparation_slots FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own preparation slots" ON public.preparation_slots;
CREATE POLICY "Users can insert own preparation slots"
  ON public.preparation_slots FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM public.exam_plans p
      WHERE p.id = plan_id AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update own preparation slots" ON public.preparation_slots;
CREATE POLICY "Users can update own preparation slots"
  ON public.preparation_slots FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM public.exam_plans p
      WHERE p.id = plan_id AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can delete own preparation slots" ON public.preparation_slots;
CREATE POLICY "Users can delete own preparation slots"
  ON public.preparation_slots FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- 6. REPLICA IDENTITY & REALTIME
ALTER TABLE public.exam_plans REPLICA IDENTITY FULL;
ALTER TABLE public.preparation_slots REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.exam_plans;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.preparation_slots;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

-- 7. ATOMIC REORDER RPC
CREATE OR REPLACE FUNCTION public.rpc_reorder_exam_plans(
  p_plan_ids UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_id UUID;
  v_idx INTEGER := 0;
  v_locked_count INTEGER;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  IF p_plan_ids IS NULL OR array_length(p_plan_ids, 1) = 0 THEN
    RETURN jsonb_build_object('success', true);
  END IF;

  -- Ensure none of the plans belong to other users
  IF EXISTS (
    SELECT 1 FROM unnest(p_plan_ids) AS pid
    LEFT JOIN public.exam_plans ep ON ep.id = pid AND ep.user_id = v_uid
    WHERE ep.id IS NULL
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid plan ID or plan does not belong to user');
  END IF;

  -- Ensure no duplicate plan IDs were passed
  IF (SELECT COUNT(*) FROM unnest(p_plan_ids)) <> (SELECT COUNT(DISTINCT pid) FROM unnest(p_plan_ids) AS pid) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Duplicate plan IDs provided');
  END IF;

  -- Verify none of the plans are locked if order changes
  SELECT COUNT(*) INTO v_locked_count
  FROM public.exam_plans
  WHERE id = ANY(p_plan_ids) AND is_locked = TRUE;

  IF v_locked_count > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot reorder plans when one or more plans are locked. Unlock them first.');
  END IF;

  -- Apply new sort_order atomically
  FOREACH v_id IN ARRAY p_plan_ids LOOP
    UPDATE public.exam_plans
    SET sort_order = v_idx, updated_at = NOW()
    WHERE id = v_id AND user_id = v_uid;
    v_idx := v_idx + 1;
  END LOOP;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 8. TRANSACTIONAL CREATE EXAM PLAN WITH INITIAL SLOT
CREATE OR REPLACE FUNCTION public.rpc_create_exam_plan_with_slot(
  p_exam_name TEXT,
  p_exam_date DATE,
  p_description TEXT DEFAULT NULL,
  p_show_in_streaks BOOLEAN DEFAULT TRUE,
  p_initial_slot JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_plan_id UUID;
  v_max_order INTEGER;
  v_slot_title TEXT;
  v_slot_start DATE;
  v_slot_end DATE;
  v_slot_category TEXT;
  v_slot_color TEXT;
  v_slot_desc TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  IF p_exam_name IS NULL OR trim(p_exam_name) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Exam name is required');
  END IF;

  IF p_exam_date IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Exam date is required');
  END IF;

  -- Calculate next sort_order for user
  SELECT COALESCE(MAX(sort_order), -1) + 1 INTO v_max_order
  FROM public.exam_plans
  WHERE user_id = v_uid;

  INSERT INTO public.exam_plans (
    user_id,
    exam_name,
    exam_date,
    description,
    show_in_streaks,
    sort_order,
    is_locked
  ) VALUES (
    v_uid,
    trim(p_exam_name),
    p_exam_date,
    p_description,
    COALESCE(p_show_in_streaks, TRUE),
    v_max_order,
    FALSE
  ) RETURNING id INTO v_plan_id;

  -- Optional initial slot
  IF p_initial_slot IS NOT NULL AND (p_initial_slot->>'title') IS NOT NULL AND trim(p_initial_slot->>'title') <> '' THEN
    v_slot_title := trim(p_initial_slot->>'title');

    IF (p_initial_slot->>'start_date') IS NULL OR (p_initial_slot->>'end_date') IS NULL THEN
      RAISE EXCEPTION 'Slot start date and end date are required';
    END IF;

    v_slot_start := (p_initial_slot->>'start_date')::DATE;
    v_slot_end := (p_initial_slot->>'end_date')::DATE;
    v_slot_category := COALESCE(p_initial_slot->>'category', 'custom');
    v_slot_color := COALESCE(p_initial_slot->>'color', '#3b82f6');
    v_slot_desc := p_initial_slot->>'description';

    IF v_slot_start > v_slot_end THEN
      RAISE EXCEPTION 'Slot start date must not be after end date';
    END IF;

    IF v_slot_end > p_exam_date THEN
      RAISE EXCEPTION 'Slot end date must not be after exam date';
    END IF;

    INSERT INTO public.preparation_slots (
      plan_id,
      user_id,
      title,
      description,
      start_date,
      end_date,
      category,
      color,
      sort_order
    ) VALUES (
      v_plan_id,
      v_uid,
      v_slot_title,
      v_slot_desc,
      v_slot_start,
      v_slot_end,
      v_slot_category,
      v_slot_color,
      0
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'plan_id', v_plan_id
  );
END;
$$;

-- 9. FUNCTION GRANTS & PERMISSION HARDENING
-- Revoke execution from anonymous/unauthenticated users; grant only to authenticated & service_role
REVOKE EXECUTE ON FUNCTION public.rpc_reorder_exam_plans(UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_reorder_exam_plans(UUID[]) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.rpc_create_exam_plan_with_slot(TEXT, DATE, TEXT, BOOLEAN, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_create_exam_plan_with_slot(TEXT, DATE, TEXT, BOOLEAN, JSONB) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.prevent_locked_plan_mutation() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.prevent_locked_slot_mutation() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.trg_set_updated_at() FROM PUBLIC, anon;
