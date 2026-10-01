import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordReferralEnrollment } from "@/lib/public-website/couponStore";
import {
  generateEnrollmentToken,
  generateOtpCode,
  hashToken,
  setEnrollmentTokenCookie,
  extractClientIp,
  checkRateLimit,
} from "@/lib/auth/enrollment";

export async function POST(request: NextRequest) {
  try {
    // 1. IP Rate Limiting (max 5 coupon submissions per 10 minutes)
    const clientIp = extractClientIp(request);
    const rateLimit = checkRateLimit(`submit_ref_${clientIp}`, 5, 10 * 60 * 1000);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many attempts from your connection. Please wait 10 minutes before retrying." },
        { status: 429 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { code, couponCode, name, referredBy, agreementAccepted } = body;

    const trimmedCode = String(code || couponCode || "").trim();
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
        { error: "You must accept the Referral Responsibility Agreement to activate your enrollment." },
        { status: 400 }
      );
    }

    // 2. Generate Cryptographic Bearer Token & 4-Digit OTP
    const grantToken = generateEnrollmentToken();
    const grantTokenHash = hashToken(grantToken);
    const otpCode = generateOtpCode();

    // 3. Atomically validate coupon, increment usage, and create grant via service_role RPC
    const adminClient = createAdminClient();
    if (adminClient) {
      const { data: rpcRes, error: rpcErr } = await adminClient.rpc("rpc_claim_coupon_and_create_grant", {
        p_coupon_code: trimmedCode,
        p_name: trimmedName,
        p_referred_by: trimmedReferredBy,
        p_token_hash: grantTokenHash,
        p_otp: otpCode,
        p_ip_address: clientIp,
      });

      if (rpcErr) {
        console.error("[Submit Referral] RPC error:", rpcErr.message);
        return NextResponse.json(
          { error: "Database error processing referral enrollment." },
          { status: 500 }
        );
      }

      if (!rpcRes?.success) {
        return NextResponse.json(
          { error: rpcRes?.error || "Failed to process coupon." },
          { status: 400 }
        );
      }
    } else {
      // In-memory fallback for local development or mock environments
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
    }

    // 4. Set HttpOnly cookie and return OTP to user
    const response = NextResponse.json({
      success: true,
      otp: otpCode,
      message: "Referral access verified! Your enrollment OTP has been generated.",
      redirectUrl: "/signup",
      redirect: "/signup",
    });

    setEnrollmentTokenCookie(response, grantToken);
    return response;
  } catch (err: any) {
    console.error("[Submit Referral] Unexpected error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to process referral enrollment." },
      { status: 500 }
    );
  }
}
