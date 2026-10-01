import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ENROLLMENT_COOKIE_NAME,
  hashToken,
  clearEnrollmentTokenCookie,
} from "@/lib/auth/enrollment";

export async function GET(request: NextRequest) {
  try {
    const enrollmentToken = request.cookies.get(ENROLLMENT_COOKIE_NAME)?.value;

    if (!enrollmentToken) {
      return NextResponse.json({
        preverified: false,
        reason: "missing_cookie",
        message: "No enrollment session found. Please complete payment or enter a referral coupon.",
      });
    }

    const adminClient = createAdminClient();
    if (!adminClient) {
      // Local development or test fallback
      return NextResponse.json({
        preverified: true,
        otp: "1234",
        name: "Test Student",
      });
    }

    const tokenHash = hashToken(enrollmentToken);

    const { data: grant, error } = await adminClient
      .from("enrollment_grants")
      .select("id, otp_code, authorization_type, name, status, expires_at, failed_attempts")
      .eq("grant_token_hash", tokenHash)
      .maybeSingle();

    if (error || !grant) {
      const response = NextResponse.json({
        preverified: false,
        reason: "invalid_grant",
        message: "Enrollment grant session not found or invalid.",
      });
      clearEnrollmentTokenCookie(response);
      return response;
    }

    // Check expiration
    if (new Date(grant.expires_at).getTime() < Date.now()) {
      const response = NextResponse.json({
        preverified: false,
        reason: "expired",
        message: "Your enrollment authorization has expired (24-hour limit).",
      });
      clearEnrollmentTokenCookie(response);
      return response;
    }

    // Check lockout
    if (grant.status === "revoked" || grant.failed_attempts >= 5) {
      const response = NextResponse.json({
        preverified: false,
        reason: "revoked",
        message: "This enrollment grant has been locked due to too many failed attempts.",
      });
      clearEnrollmentTokenCookie(response);
      return response;
    }

    // Check consumed
    if (grant.status === "consumed") {
      const response = NextResponse.json({
        preverified: false,
        reason: "already_consumed",
        message: "This enrollment grant has already been used to create an account.",
      });
      clearEnrollmentTokenCookie(response);
      return response;
    }

    // Mark as preverified if currently active
    if (grant.status === "active") {
      await adminClient
        .from("enrollment_grants")
        .update({
          status: "preverified",
          preverified_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", grant.id);
    }

    return NextResponse.json({
      preverified: true,
      otp: grant.otp_code,
      authorizationType: grant.authorization_type,
      name: grant.name,
    });
  } catch (err: any) {
    console.error("[Preverify Enrollment] Unexpected error:", err);
    return NextResponse.json(
      { preverified: false, error: err?.message || "Failed to preverify enrollment" },
      { status: 500 }
    );
  }
}
