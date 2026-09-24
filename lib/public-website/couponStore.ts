import { PublicCoupon, ReferralEnrollment } from "./types";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Default seed coupons for instant development / fallback
export const inMemoryCoupons: PublicCoupon[] = [
  {
    id: "cpn_seed_referral100",
    code: "REFERRAL100",
    discountPercent: 100,
    isActive: true,
    maxUses: 1000,
    usedCount: 0,
    note: "Official StudyRoom launch referral coupon",
    createdAt: new Date().toISOString(),
  },
  {
    id: "cpn_seed_study100",
    code: "STUDY100",
    discountPercent: 100,
    isActive: true,
    maxUses: 500,
    usedCount: 0,
    note: "Peer study group 100% scholarship code",
    createdAt: new Date().toISOString(),
  },
  {
    id: "cpn_seed_vip100",
    code: "VIP100",
    discountPercent: 100,
    isActive: true,
    maxUses: null,
    usedCount: 0,
    note: "VIP community partner pass",
    createdAt: new Date().toISOString(),
  },
];

export const inMemoryReferrals: ReferralEnrollment[] = [];

/**
 * Authoritatively find a coupon by code (case-insensitive)
 */
export async function findCouponByCode(code: string): Promise<PublicCoupon | null> {
  const normalized = String(code || "").trim().toUpperCase();
  if (!normalized) return null;

  // Try fetching from Supabase first
  try {
    const supabase = await createClient();
    const { data, error } = await (supabase as any)
      .from("public_coupons")
      .select("*")
      .ilike("code", normalized)
      .maybeSingle();

    if (!error && data) {
      return {
        id: data.id,
        code: data.code,
        discountPercent: data.discount_percent ?? 100,
        isActive: Boolean(data.is_active),
        maxUses: data.max_uses,
        usedCount: data.used_count ?? 0,
        note: data.note,
        createdAt: data.created_at,
      };
    }
  } catch {
    // Database table might not be initialized yet; fallback to in-memory store
  }

  // Fallback to in-memory
  const found = inMemoryCoupons.find((c) => c.code.toUpperCase() === normalized);
  return found || null;
}

/**
 * Validate a coupon code server-side
 */
export async function validateCouponCode(code: string): Promise<{
  valid: boolean;
  coupon?: PublicCoupon;
  errorMessage?: string;
}> {
  const coupon = await findCouponByCode(code);
  const genericError = "Invalid or inactive coupon code.";

  if (!coupon) {
    return { valid: false, errorMessage: genericError };
  }

  if (!coupon.isActive) {
    return { valid: false, errorMessage: genericError };
  }

  if (coupon.maxUses !== null && coupon.maxUses !== undefined && coupon.usedCount >= coupon.maxUses) {
    return { valid: false, errorMessage: genericError };
  }

  return { valid: true, coupon };
}

/**
 * Record a 100% OFF referral enrollment authoritatively
 */
export async function recordReferralEnrollment(params: {
  couponCode: string;
  name: string;
  referredBy: string;
  agreementAccepted: boolean;
}): Promise<{
  success: boolean;
  enrollmentId?: string;
  errorMessage?: string;
}> {
  const { couponCode, name, referredBy, agreementAccepted } = params;

  if (!agreementAccepted) {
    return {
      success: false,
      errorMessage: "You must accept the Referral Responsibility Agreement to proceed.",
    };
  }

  const trimmedName = String(name || "").trim();
  const trimmedReferredBy = String(referredBy || "").trim();

  if (trimmedName.length < 2) {
    return {
      success: false,
      errorMessage: "Please enter your full name (minimum 2 characters).",
    };
  }

  if (trimmedReferredBy.length < 2) {
    return {
      success: false,
      errorMessage: "Please enter who referred you (name or platform).",
    };
  }

  // Authoritatively re-verify coupon validity
  const { valid, coupon, errorMessage } = await validateCouponCode(couponCode);
  if (!valid || !coupon) {
    return { success: false, errorMessage: errorMessage || "Invalid or inactive coupon code." };
  }

  const enrollmentId = `ref_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const enrollment: ReferralEnrollment = {
    id: enrollmentId,
    couponCode: coupon.code,
    name: trimmedName,
    referredBy: trimmedReferredBy,
    agreementAccepted: true,
    submittedAt: new Date().toISOString(),
    status: "active",
  };

  // Increment in-memory coupon count & record enrollment
  coupon.usedCount += 1;
  inMemoryReferrals.unshift(enrollment);
  if (inMemoryReferrals.length > 500) {
    inMemoryReferrals.pop();
  }

  // Update Supabase if available
  try {
    const supabase = createAdminClient() || (await createClient());
    // Insert enrollment
    await (supabase as any).from("public_referral_enrollments").insert({
      id: enrollmentId,
      coupon_code: coupon.code,
      name: trimmedName,
      referred_by: trimmedReferredBy,
      agreement_accepted: true,
      status: "active",
    });

    // Increment coupon usage in DB
    await (supabase as any)
      .from("public_coupons")
      .update({ used_count: coupon.usedCount })
      .ilike("code", coupon.code);
  } catch (dbErr) {
    if (process.env.NODE_ENV !== "test") {
      console.warn("Could not record referral enrollment in DB, retained in memory:", dbErr);
    }
  }

  return { success: true, enrollmentId };
}

/**
 * Admin: Get all coupons
 */
export async function getAllCoupons(): Promise<PublicCoupon[]> {
  try {
    const supabase = createAdminClient() || (await createClient());
    const { data, error } = await (supabase as any)
      .from("public_coupons")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error && Array.isArray(data) && data.length > 0) {
      return data.map((d: any) => ({
        id: d.id,
        code: d.code,
        discountPercent: d.discount_percent ?? 100,
        isActive: Boolean(d.is_active),
        maxUses: d.max_uses,
        usedCount: d.used_count ?? 0,
        note: d.note,
        createdAt: d.created_at,
      }));
    }
  } catch {}

  return inMemoryCoupons;
}

/**
 * Admin: Create or update a coupon
 */
export async function saveCoupon(coupon: {
  code: string;
  discountPercent?: number;
  isActive?: boolean;
  maxUses?: number | null;
  note?: string;
}): Promise<PublicCoupon> {
  const normalizedCode = coupon.code.trim().toUpperCase();
  const existing = inMemoryCoupons.find((c) => c.code.toUpperCase() === normalizedCode);

  let resultCoupon: PublicCoupon;
  if (existing) {
    existing.isActive = coupon.isActive !== undefined ? coupon.isActive : existing.isActive;
    if (coupon.discountPercent !== undefined) existing.discountPercent = coupon.discountPercent;
    if (coupon.maxUses !== undefined) existing.maxUses = coupon.maxUses;
    if (coupon.note !== undefined) existing.note = coupon.note;
    resultCoupon = existing;
  } else {
    resultCoupon = {
      id: `cpn_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      code: normalizedCode,
      discountPercent: coupon.discountPercent ?? 100,
      isActive: coupon.isActive ?? true,
      maxUses: coupon.maxUses ?? null,
      usedCount: 0,
      note: coupon.note || "",
      createdAt: new Date().toISOString(),
    };
    inMemoryCoupons.unshift(resultCoupon);
  }

  // Update DB
  try {
    const supabase = createAdminClient() || (await createClient());
    await (supabase as any).from("public_coupons").upsert(
      {
        id: resultCoupon.id,
        code: resultCoupon.code,
        discount_percent: resultCoupon.discountPercent,
        is_active: resultCoupon.isActive,
        max_uses: resultCoupon.maxUses,
        note: resultCoupon.note,
      },
      { onConflict: "code" }
    );
  } catch (err) {
    if (process.env.NODE_ENV !== "test") {
      console.warn("Could not save coupon to DB:", err);
    }
  }

  return resultCoupon;
}

/**
 * Admin: Get all referral enrollments
 */
export async function getAllReferralEnrollments(): Promise<ReferralEnrollment[]> {
  try {
    const supabase = createAdminClient() || (await createClient());
    const { data, error } = await (supabase as any)
      .from("public_referral_enrollments")
      .select("*")
      .order("submitted_at", { ascending: false })
      .limit(100);

    if (!error && Array.isArray(data) && data.length > 0) {
      return data.map((d: any) => ({
        id: d.id,
        couponCode: d.coupon_code,
        name: d.name,
        referredBy: d.referred_by,
        agreementAccepted: Boolean(d.agreement_accepted),
        submittedAt: d.submitted_at,
        status: d.status || "active",
      }));
    }
  } catch {}

  return inMemoryReferrals;
}
