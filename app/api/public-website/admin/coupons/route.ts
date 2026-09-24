import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedAdmin } from "@/lib/public-website/authUtils";
import {
  getAllCoupons,
  saveCoupon,
  getAllReferralEnrollments,
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
