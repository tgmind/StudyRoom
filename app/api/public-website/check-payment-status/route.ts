import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  CLAIM_SECRET_COOKIE_NAME,
  ENROLLMENT_COOKIE_NAME,
  hashToken,
  setEnrollmentTokenCookie,
  clearClaimSecretCookie,
} from "@/lib/auth/enrollment";

export async function POST(request: NextRequest) {
  try {
    const claimSecret = request.cookies.get(CLAIM_SECRET_COOKIE_NAME)?.value;
    const existingEnrollmentToken = request.cookies.get(ENROLLMENT_COOKIE_NAME)?.value;

    const adminClient = createAdminClient();
    if (!adminClient) {
      // In local dev without Supabase, check memory or return pending
      return NextResponse.json({ status: "pending" });
    }

    // 1. If user already has an enrollment token, check if their grant is active
    if (existingEnrollmentToken) {
      const tokenHash = hashToken(existingEnrollmentToken);
      const { data: grant } = await adminClient
        .from("enrollment_grants")
        .select("id, status, otp_code")
        .eq("grant_token_hash", tokenHash)
        .maybeSingle();

      if (grant && (grant.status === "active" || grant.status === "preverified")) {
        return NextResponse.json({
          status: "verified",
          otp: grant.otp_code,
          redirectUrl: "/signup",
        });
      }
    }

    // 2. If no claim secret cookie exists, user has not submitted or cookie expired
    if (!claimSecret) {
      return NextResponse.json(
        { status: "none", message: "No active payment submission found." },
        { status: 200 }
      );
    }

    const claimSecretHash = hashToken(claimSecret);

    // 3. Find submission matching claim_secret_hash
    const { data: sub, error: subErr } = await adminClient
      .from("public_payment_submissions")
      .select("id, status, notes")
      .eq("claim_secret_hash", claimSecretHash)
      .maybeSingle();

    if (subErr || !sub) {
      return NextResponse.json(
        { status: "none", message: "Payment submission record not found." },
        { status: 200 }
      );
    }

    // 4. Handle Pending
    if (sub.status === "pending") {
      return NextResponse.json({
        status: "pending",
        message: "Payment submission is awaiting admin verification.",
      });
    }

    // 5. Handle Rejected
    if (sub.status === "rejected") {
      const response = NextResponse.json({
        status: "rejected",
        message: sub.notes || "Payment verification was rejected by administration.",
      });
      clearClaimSecretCookie(response);
      return response;
    }

    // 6. Handle Verified
    if (sub.status === "verified") {
      // Lookup linked enrollment grant
      const { data: grant, error: grantErr } = await adminClient
        .from("enrollment_grants")
        .select("id, status, otp_code")
        .eq("payment_submission_id", sub.id)
        .neq("status", "revoked")
        .maybeSingle();

      if (grantErr || !grant) {
        return NextResponse.json({
          status: "pending",
          message: "Payment verified. Preparing enrollment grant...",
        });
      }

      // Successful verification: set enrollment token cookie and clear claim cookie
      const response = NextResponse.json({
        status: "verified",
        otp: grant.otp_code,
        redirectUrl: "/signup",
        message: "Payment verified successfully. Enrollment access granted.",
      });

      // The claim secret functions as the cryptographic enrollment token
      setEnrollmentTokenCookie(response, claimSecret);
      clearClaimSecretCookie(response);

      return response;
    }

    return NextResponse.json({ status: "pending" });
  } catch (err: any) {
    console.error("[Check Payment Status] Error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to check payment status" },
      { status: 500 }
    );
  }
}
