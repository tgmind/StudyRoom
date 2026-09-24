import { NextRequest, NextResponse } from "next/server";
import { recordReferralEnrollment } from "@/lib/public-website/couponStore";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { code, name, referredBy, agreementAccepted } = body;

    const trimmedCode = String(code || "").trim();
    const trimmedName = String(name || "").trim();
    const trimmedReferredBy = String(referredBy || "").trim();

    if (!trimmedCode) {
      return NextResponse.json(
        { error: "A valid coupon code is required." },
        { status: 400 }
      );
    }

    if (!trimmedName || trimmedName.length < 2) {
      return NextResponse.json(
        { error: "Please enter your full name (at least 2 characters)." },
        { status: 400 }
      );
    }

    if (!trimmedReferredBy || trimmedReferredBy.length < 2) {
      return NextResponse.json(
        { error: "Please enter who referred you (name or platform)." },
        { status: 400 }
      );
    }

    if (!agreementAccepted) {
      return NextResponse.json(
        {
          error:
            "You must accept the Referral Responsibility Agreement to activate your enrollment.",
        },
        { status: 400 }
      );
    }

    const recordResult = await recordReferralEnrollment({
      couponCode: trimmedCode,
      name: trimmedName,
      referredBy: trimmedReferredBy,
      agreementAccepted: true,
    });

    if (!recordResult.success) {
      return NextResponse.json(
        { error: recordResult.errorMessage || "Failed to process referral enrollment." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      enrollmentId: recordResult.enrollmentId,
      message: "Referral access verified! Redirecting to StudyRoom account registration...",
      redirectUrl: "/signup?ref=referral",
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to process referral enrollment." },
      { status: 500 }
    );
  }
}
