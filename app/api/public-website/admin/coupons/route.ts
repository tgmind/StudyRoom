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
    const { code, discountPercent, isActive, maxUses, note } = body;

    const trimmedCode = String(code || "").trim().toUpperCase();
    if (!trimmedCode) {
      return NextResponse.json(
        { error: "Coupon code is required." },
        { status: 400 }
      );
    }

    const saved = await saveCoupon({
      code: trimmedCode,
      discountPercent: discountPercent !== undefined ? Number(discountPercent) : 100,
      isActive: isActive !== undefined ? Boolean(isActive) : true,
      maxUses: maxUses !== undefined && maxUses !== "" && maxUses !== null ? Number(maxUses) : null,
      note: String(note || ""),
    });

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

    // 1. Delete Coupon
    if (type === "coupon" || code) {
      const couponCode = String(code || "").trim();
      if (!couponCode) {
        return NextResponse.json({ error: "Coupon code is required to delete." }, { status: 400 });
      }
      await deleteCoupon(couponCode);
      return NextResponse.json({ success: true, message: `Coupon ${couponCode} deleted successfully.` });
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
