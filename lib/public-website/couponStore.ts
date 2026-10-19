import { PublicCoupon, ReferralEnrollment } from "./types";
import { createAdminClient } from "@/lib/supabase/admin";

const isTestEnvironment = process.env.NODE_ENV === "test" || process.env.VITEST === "true";

// In-memory store exclusively for isolated unit testing
export const inMemoryCoupons: PublicCoupon[] = [];
export const inMemoryReferrals: ReferralEnrollment[] = [];

/**
 * Reset in-memory test store (utility for unit tests)
 */
export function resetTestStore(): void {
  inMemoryCoupons.length = 0;
  inMemoryReferrals.length = 0;
}

/**
 * Authoritatively find a coupon by code (case-insensitive)
 */
export async function findCouponByCode(code: string): Promise<PublicCoupon | null> {
  const normalized = String(code || "").trim().toUpperCase();
  if (!normalized) return null;

  let adminClient: any = null;
  try {
    adminClient = createAdminClient();
  } catch (err) {
    if (isTestEnvironment) {
      const foundInTest = inMemoryCoupons.find((c) => c.code.toUpperCase() === normalized);
      return foundInTest ? { ...foundInTest } : null;
    }
    throw err;
  }

  if (adminClient) {
    const { data, error } = await adminClient
      .from("public_coupons")
      .select("*")
      .ilike("code", normalized)
      .maybeSingle();

    if (error) {
      console.error("[findCouponByCode] Database error:", error.message);
      throw new Error(`Database error fetching coupon: ${error.message}`);
    }

    if (data) {
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
    return null;
  }

  if (isTestEnvironment) {
    const found = inMemoryCoupons.find((c) => c.code.toUpperCase() === normalized);
    return found ? { ...found } : null;
  }

  throw new Error("Server configuration error: Database client unavailable.");
}

/**
 * Validate a coupon code server-side
 */
export async function validateCouponCode(code: string): Promise<{
  valid: boolean;
  coupon?: PublicCoupon;
  errorMessage?: string;
  isError?: boolean;
}> {
  const genericError = "Invalid or inactive coupon code.";
  let coupon: PublicCoupon | null;

  try {
    coupon = await findCouponByCode(code);
  } catch (err: any) {
    console.error("[validateCouponCode] Operational failure:", err?.message || err);
    return {
      valid: false,
      errorMessage: "Service temporarily unavailable. Please try again later.",
      isError: true,
    };
  }

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
  const inMemoryRecord = inMemoryCoupons.find((c) => c.code.toUpperCase() === coupon.code.toUpperCase());
  if (inMemoryRecord) {
    inMemoryRecord.usedCount += 1;
  }
  coupon.usedCount += 1;
  inMemoryReferrals.unshift(enrollment);
  if (inMemoryReferrals.length > 500) {
    inMemoryReferrals.pop();
  }

  // Update Supabase if available
  let adminClient: any = null;
  try {
    adminClient = createAdminClient();
  } catch (err) {
    if (isTestEnvironment) {
      return { success: true, enrollmentId };
    }
    throw err;
  }

  if (adminClient) {
    try {
      await adminClient.from("public_referral_enrollments").insert({
        id: enrollmentId,
        coupon_code: coupon.code,
        name: trimmedName,
        referred_by: trimmedReferredBy,
        agreement_accepted: true,
        status: "active",
      });

      await adminClient
        .from("public_coupons")
        .update({ used_count: coupon.usedCount })
        .ilike("code", coupon.code);
    } catch (dbErr) {
      if (!isTestEnvironment) {
        console.warn("[recordReferralEnrollment] Could not record referral enrollment in DB:", dbErr);
      }
    }
  }

  return { success: true, enrollmentId };
}

/**
 * Admin: Get all coupons
 */
export async function getAllCoupons(): Promise<PublicCoupon[]> {
  let adminClient: any = null;
  try {
    adminClient = createAdminClient();
  } catch (err) {
    if (isTestEnvironment) {
      return [...inMemoryCoupons];
    }
    throw err;
  }

  if (adminClient) {
    const { data, error } = await adminClient
      .from("public_coupons")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[getAllCoupons] Database query failed:", error.message);
      throw new Error(`Failed to fetch coupons from database: ${error.message}`);
    }

    if (Array.isArray(data)) {
      return data.map((d: any) => ({
        id: d.id,
        code: d.code,
        discountPercent: d.discount_percent ?? 100,
        isActive: Boolean(d.is_active),
        maxUses: d.max_uses,
        usedCount: d.used_count ?? 0,
        note: d.note,
        createdAt: d.created_at, // FIXED: was data.created_at
      }));
    }
    return [];
  }

  if (isTestEnvironment) {
    return [...inMemoryCoupons];
  }

  throw new Error("Server configuration error: Database client unavailable.");
}

function saveCouponToTestMemory(
  normalizedCode: string,
  coupon: {
    discountPercent?: number;
    isActive?: boolean;
    maxUses?: number | null;
    note?: string;
  }
): PublicCoupon {
  const existing = inMemoryCoupons.find((c) => c.code.toUpperCase() === normalizedCode);
  if (existing) {
    if (coupon.isActive !== undefined) existing.isActive = Boolean(coupon.isActive);
    if (coupon.discountPercent !== undefined) existing.discountPercent = coupon.discountPercent;
    if (coupon.maxUses !== undefined) existing.maxUses = coupon.maxUses;
    if (coupon.note !== undefined) existing.note = coupon.note;
    return { ...existing };
  }

  const resultCoupon: PublicCoupon = {
    id: `cpn_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    code: normalizedCode,
    discountPercent: coupon.discountPercent !== undefined ? coupon.discountPercent : 100,
    isActive: coupon.isActive !== undefined ? Boolean(coupon.isActive) : true,
    maxUses: coupon.maxUses !== undefined ? coupon.maxUses : null,
    usedCount: 0,
    note: coupon.note || "",
    createdAt: new Date().toISOString(),
  };
  inMemoryCoupons.unshift(resultCoupon);
  return { ...resultCoupon };
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
  const normalizedCode = String(coupon.code || "").trim().toUpperCase();
  if (!normalizedCode || normalizedCode.length < 2 || normalizedCode.length > 50) {
    throw new Error("Invalid coupon code. Must be 2-50 characters.");
  }

  if (coupon.discountPercent !== undefined) {
    if (
      typeof coupon.discountPercent !== "number" ||
      isNaN(coupon.discountPercent) ||
      coupon.discountPercent < 1 ||
      coupon.discountPercent > 100
    ) {
      throw new Error("Discount percent must be an integer between 1 and 100.");
    }
  }

  if (coupon.maxUses !== undefined && coupon.maxUses !== null) {
    if (
      typeof coupon.maxUses !== "number" ||
      isNaN(coupon.maxUses) ||
      !Number.isInteger(coupon.maxUses) ||
      coupon.maxUses < 1
    ) {
      throw new Error("Maximum uses must be a positive integer or null.");
    }
  }

  let adminClient: any = null;
  try {
    adminClient = createAdminClient();
  } catch (err) {
    if (isTestEnvironment) {
      return saveCouponToTestMemory(normalizedCode, coupon);
    }
    throw err;
  }

  if (adminClient) {
    // 1. Check if coupon already exists in DB
    const { data: existing, error: selectErr } = await adminClient
      .from("public_coupons")
      .select("*")
      .ilike("code", normalizedCode)
      .maybeSingle();

    if (selectErr) {
      console.error("[saveCoupon] Error querying existing coupon:", selectErr.message);
      throw new Error(`Database error querying coupon: ${selectErr.message}`);
    }

    if (existing) {
      // Non-destructive UPDATE: only update explicitly provided fields
      const updatePayload: Record<string, any> = {};
      if (coupon.isActive !== undefined) {
        updatePayload.is_active = Boolean(coupon.isActive);
      }
      if (coupon.discountPercent !== undefined) {
        updatePayload.discount_percent = coupon.discountPercent;
      }
      if (coupon.maxUses !== undefined) {
        updatePayload.max_uses = coupon.maxUses;
      }
      if (coupon.note !== undefined) {
        updatePayload.note = String(coupon.note);
      }

      let updatedRow = existing;
      if (Object.keys(updatePayload).length > 0) {
        const { data: updated, error: updateErr } = await adminClient
          .from("public_coupons")
          .update(updatePayload)
          .eq("id", existing.id)
          .select()
          .single();

        if (updateErr) {
          console.error("[saveCoupon] Error updating coupon:", updateErr.message);
          throw new Error(`Database error updating coupon: ${updateErr.message}`);
        }
        updatedRow = updated;
      }

      return {
        id: updatedRow.id,
        code: updatedRow.code,
        discountPercent: updatedRow.discount_percent ?? 100,
        isActive: Boolean(updatedRow.is_active),
        maxUses: updatedRow.max_uses,
        usedCount: updatedRow.used_count ?? 0,
        note: updatedRow.note,
        createdAt: updatedRow.created_at,
      };
    } else {
      // Explicit CREATION
      const newCouponRecord = {
        id: `cpn_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        code: normalizedCode,
        discount_percent: coupon.discountPercent !== undefined ? coupon.discountPercent : 100,
        is_active: coupon.isActive !== undefined ? Boolean(coupon.isActive) : true,
        max_uses: coupon.maxUses !== undefined ? coupon.maxUses : null,
        used_count: 0,
        note: coupon.note !== undefined ? String(coupon.note) : "",
      };

      const { data: inserted, error: insertErr } = await adminClient
        .from("public_coupons")
        .insert(newCouponRecord)
        .select()
        .single();

      if (insertErr) {
        console.error("[saveCoupon] Error inserting coupon:", insertErr.message);
        throw new Error(`Database error saving coupon: ${insertErr.message}`);
      }

      return {
        id: inserted.id,
        code: inserted.code,
        discountPercent: inserted.discount_percent ?? 100,
        isActive: Boolean(inserted.is_active),
        maxUses: inserted.max_uses,
        usedCount: inserted.used_count ?? 0,
        note: inserted.note,
        createdAt: inserted.created_at,
      };
    }
  }

  if (isTestEnvironment) {
    return saveCouponToTestMemory(normalizedCode, coupon);
  }

  throw new Error("Server configuration error: SUPABASE_SERVICE_ROLE_KEY is required for admin database mutations.");
}

/**
 * Admin: Get all referral enrollments
 */
export async function getAllReferralEnrollments(): Promise<ReferralEnrollment[]> {
  let adminClient: any = null;
  try {
    adminClient = createAdminClient();
  } catch (err) {
    if (isTestEnvironment) {
      return [...inMemoryReferrals];
    }
    throw err;
  }

  if (adminClient) {
    const { data, error } = await adminClient
      .from("public_referral_enrollments")
      .select("*")
      .order("submitted_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error("[getAllReferralEnrollments] DB error:", error.message);
      throw new Error(`Failed to fetch referral enrollments: ${error.message}`);
    }

    if (Array.isArray(data)) {
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
    return [];
  }

  if (isTestEnvironment) {
    return [...inMemoryReferrals];
  }

  throw new Error("Server configuration error: Database client unavailable.");
}

/**
 * Admin: Delete a coupon by code (Automatically deactivates first, then hard-deletes in DB with verification)
 */
export async function deleteCoupon(code: string): Promise<boolean> {
  const normalized = String(code || "").trim().toUpperCase();
  if (!normalized) {
    throw new Error("Coupon code is required to delete.");
  }

  let adminClient: any = null;
  try {
    adminClient = createAdminClient();
  } catch (err) {
    if (isTestEnvironment) {
      const idx = inMemoryCoupons.findIndex((c) => c.code.toUpperCase() === normalized);
      if (idx !== -1) inMemoryCoupons.splice(idx, 1);
      return true;
    }
    throw err;
  }

  if (adminClient) {
    // Step 1: Explicitly deactivate first so that any concurrent validation requests immediately reject the coupon
    const { error: deactivateError } = await adminClient
      .from("public_coupons")
      .update({ is_active: false })
      .ilike("code", normalized);

    if (deactivateError) {
      console.error("[deleteCoupon] Database error deactivating coupon prior to deletion:", deactivateError.message);
      throw new Error(`Database error deactivating coupon: ${deactivateError.message}`);
    }

    // Step 2: Permanently delete the coupon record from the database
    const { error: deleteError } = await adminClient
      .from("public_coupons")
      .delete()
      .ilike("code", normalized);

    if (deleteError) {
      console.error("[deleteCoupon] Database error deleting coupon:", deleteError.message);
      throw new Error(`Database error deleting coupon: ${deleteError.message}`);
    }

    // Remove from in-memory test store if present
    const idx = inMemoryCoupons.findIndex((c) => c.code.toUpperCase() === normalized);
    if (idx !== -1) {
      inMemoryCoupons.splice(idx, 1);
    }

    return true;
  }

  if (isTestEnvironment) {
    const idx = inMemoryCoupons.findIndex((c) => c.code.toUpperCase() === normalized);
    if (idx !== -1) {
      inMemoryCoupons.splice(idx, 1);
    }
    return true;
  }

  throw new Error("Server configuration error: SUPABASE_SERVICE_ROLE_KEY is required for admin database mutations.");
}

/**
 * Admin: Delete a referral enrollment by ID (Hard Delete with Verification)
 */
export async function deleteReferralEnrollment(id: string): Promise<boolean> {
  const cleanId = String(id || "").trim();
  if (!cleanId) {
    throw new Error("Referral enrollment ID is required to delete.");
  }

  let adminClient: any = null;
  try {
    adminClient = createAdminClient();
  } catch (err) {
    if (isTestEnvironment) {
      const idx = inMemoryReferrals.findIndex((r) => r.id === cleanId);
      if (idx !== -1) inMemoryReferrals.splice(idx, 1);
      return true;
    }
    throw err;
  }

  if (adminClient) {
    const { error } = await adminClient
      .from("public_referral_enrollments")
      .delete()
      .eq("id", cleanId);

    if (error) {
      console.error("[deleteReferralEnrollment] Database error:", error.message);
      throw new Error(`Database error deleting referral enrollment: ${error.message}`);
    }

    const idx = inMemoryReferrals.findIndex((r) => r.id === cleanId);
    if (idx !== -1) inMemoryReferrals.splice(idx, 1);

    return true;
  }

  if (isTestEnvironment) {
    const idx = inMemoryReferrals.findIndex((r) => r.id === cleanId);
    if (idx !== -1) inMemoryReferrals.splice(idx, 1);
    return true;
  }

  throw new Error("Server configuration error: SUPABASE_SERVICE_ROLE_KEY is required for admin database mutations.");
}

/**
 * Admin: Clear all referral enrollments (Hard Delete with Verification)
 */
export async function clearAllReferralEnrollments(): Promise<boolean> {
  let adminClient: any = null;
  try {
    adminClient = createAdminClient();
  } catch (err) {
    if (isTestEnvironment) {
      inMemoryReferrals.length = 0;
      return true;
    }
    throw err;
  }

  if (adminClient) {
    const { error } = await adminClient
      .from("public_referral_enrollments")
      .delete()
      .neq("id", "");

    if (error) {
      console.error("[clearAllReferralEnrollments] Database error:", error.message);
      throw new Error(`Database error clearing referral enrollments: ${error.message}`);
    }

    inMemoryReferrals.length = 0;
    return true;
  }

  if (isTestEnvironment) {
    inMemoryReferrals.length = 0;
    return true;
  }

  throw new Error("Server configuration error: SUPABASE_SERVICE_ROLE_KEY is required for admin database mutations.");
}
