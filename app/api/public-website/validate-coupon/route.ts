import { NextRequest, NextResponse } from "next/server";
import { validateCouponCode } from "@/lib/public-website/couponStore";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const code = String(body.code || "").trim();

    if (!code) {
      return NextResponse.json(
        { valid: false, message: "Please enter a coupon code." },
        { status: 400 }
      );
    }

    const result = await validateCouponCode(code);

    if (!result.valid || !result.coupon) {
      return NextResponse.json(
        {
          valid: false,
          message: result.errorMessage || "Invalid or inactive coupon code.",
        },
        { status: 200 }
      );
    }

    return NextResponse.json({
      valid: true,
      code: result.coupon.code,
      discountPercent: result.coupon.discountPercent,
      message: "100% discount applied via referral coupon.",
    });
  } catch (err: any) {
    return NextResponse.json(
      { valid: false, message: "Failed to validate coupon code." },
      { status: 500 }
    );
  }
}
