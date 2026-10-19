import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedAdmin } from "@/lib/public-website/authUtils";
import {
  getAllCoupons,
  saveCoupon,
  deleteCoupon,
  getAllReferralEnrollments,
  deleteReferralEnrollment,
  clearAllReferralEnrollments,
} from "@/lib/public-website/couponStore";

export async function GET(request: NextRequest) {
  try {
    const authorized = await isAuthorizedAdmin(request);
    if (!authorized) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [coupons, referrals] = await Promise.all([
      getAllCoupons(),
      getAllReferralEnrollments(),
    ]);

    return NextResponse.json({
      coupons,
      referrals,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to fetch coupon data" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const authorized = await isAuthorizedAdmin(request);
    if (!authorized) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
    }

    const { code, discountPercent, isActive, maxUses, note } = body;

    const trimmedCode = String(code || "").trim().toUpperCase();
    if (!trimmedCode || trimmedCode.length < 2 || trimmedCode.length > 50) {
      return NextResponse.json(
        { error: "Valid coupon code (2-50 characters) is required." },
        { status: 400 }
      );
    }

    const payload: {
      code: string;
      discountPercent?: number;
      isActive?: boolean;
      maxUses?: number | null;
      note?: string;
    } = { code: trimmedCode };

    if (isActive !== undefined) {
      if (typeof isActive !== "boolean") {
        return NextResponse.json({ error: "isActive must be a boolean." }, { status: 400 });
      }
      payload.isActive = isActive;
    }

    if (discountPercent !== undefined) {
      const parsedDiscount = Number(discountPercent);
      if (isNaN(parsedDiscount) || parsedDiscount < 1 || parsedDiscount > 100) {
        return NextResponse.json({ error: "discountPercent must be between 1 and 100." }, { status: 400 });
      }
      payload.discountPercent = parsedDiscount;
    }

    if (maxUses !== undefined) {
      if (maxUses === null || maxUses === "") {
        payload.maxUses = null;
      } else {
        const parsedMaxUses = Number(maxUses);
        if (isNaN(parsedMaxUses) || !Number.isInteger(parsedMaxUses) || parsedMaxUses < 1) {
          return NextResponse.json({ error: "maxUses must be a positive integer or null." }, { status: 400 });
        }
        payload.maxUses = parsedMaxUses;
      }
    }

    if (note !== undefined) {
      if (typeof note !== "string" || note.length > 500) {
        return NextResponse.json({ error: "note must be a string up to 500 characters." }, { status: 400 });
      }
      payload.note = note.trim();
    }

    const saved = await saveCoupon(payload);

    return NextResponse.json({
      success: true,
      coupon: saved,
      message: `Coupon ${saved.code} saved successfully.`,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to save coupon" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const authorized = await isAuthorizedAdmin(request);
    if (!authorized) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { type, code, id } = body;

    // 1. Delete Coupon (Automatically deactivates first, then deletes)
    if (type === "coupon" || code) {
      const couponCode = String(code || "").trim();
      if (!couponCode) {
        return NextResponse.json({ error: "Coupon code is required to delete." }, { status: 400 });
      }
      await deleteCoupon(couponCode);
      return NextResponse.json({ success: true, message: `Coupon ${couponCode} was deactivated and permanently deleted.` });
    }

    // 2. Delete Single Referral Enrollment
    if (type === "referral" || id) {
      const referralId = String(id || "").trim();
      if (!referralId) {
        return NextResponse.json({ error: "Referral ID is required to delete." }, { status: 400 });
      }
      await deleteReferralEnrollment(referralId);
      return NextResponse.json({ success: true, message: "Referral enrollment deleted successfully." });
    }

    // 3. Clear All Referral Enrollments
    if (type === "all_referrals") {
      await clearAllReferralEnrollments();
      return NextResponse.json({ success: true, message: "All referral enrollments cleared successfully." });
    }

    return NextResponse.json({ error: "Invalid delete criteria (code, id, or type required)." }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Failed to delete entry" }, { status: 500 });
  }
}
