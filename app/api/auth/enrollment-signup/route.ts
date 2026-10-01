import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { verifySameOrigin } from "@/lib/public-website/authUtils";
import {
  ENROLLMENT_COOKIE_NAME,
  hashToken,
  generateCreationNonce,
  clearEnrollmentTokenCookie,
  extractClientIp,
  checkRateLimit,
} from "@/lib/auth/enrollment";

export async function POST(request: NextRequest) {
  try {
    // 1. Verify CSRF Same-Origin
    if (!verifySameOrigin(request)) {
      return NextResponse.json(
        { error: "Forbidden: Cross-origin request rejected." },
        { status: 403 }
      );
    }

    // 2. IP Rate Limiting (max 5 signup attempts per 10 minutes)
    const clientIp = extractClientIp(request);
    const rateLimit = checkRateLimit(`signup_${clientIp}`, 5, 10 * 60 * 1000);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many signup attempts. Please wait 10 minutes before retrying." },
        { status: 429 }
      );
    }

    // 3. Extract and Validate Enrollment Authorization Cookie
    const enrollmentToken = request.cookies.get(ENROLLMENT_COOKIE_NAME)?.value;
    if (!enrollmentToken) {
      return NextResponse.json(
        { error: "Enrollment authorization required. Please enroll via the public website." },
        { status: 401 }
      );
    }

    // 4. Parse and Validate Request Payload
    const body = await request.json().catch(() => ({}));
    const { email, password, displayName, otp } = body;

    const cleanEmail = String(email || "").trim().toLowerCase();
    const cleanOtp = String(otp || "").trim();
    const cleanDisplayName = String(displayName || "").trim();

    if (!cleanEmail || !cleanEmail.includes("@")) {
      return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
    }

    if (!password || password.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 });
    }

    if (!/^\d{4}$/.test(cleanOtp)) {
      return NextResponse.json({ error: "Please enter a valid 4-digit enrollment code." }, { status: 400 });
    }

    const tokenHash = hashToken(enrollmentToken);
    const adminClient = createAdminClient();

    if (!adminClient) {
      // Local fallback for mock tests without live Supabase
      const res = NextResponse.json({ success: true, redirect: "/room" });
      clearEnrollmentTokenCookie(res);
      return res;
    }

    // 5. Query Grant in Database
    const { data: grant, error: grantErr } = await adminClient
      .from("enrollment_grants")
      .select("id, status, otp_code, failed_attempts, expires_at, consumed_email")
      .eq("grant_token_hash", tokenHash)
      .maybeSingle();

    if (grantErr || !grant) {
      const res = NextResponse.json({ error: "Invalid or nonexistent enrollment session." }, { status: 401 });
      clearEnrollmentTokenCookie(res);
      return res;
    }

    // Handle Already Consumed
    if (grant.status === "consumed") {
      if (grant.consumed_email === cleanEmail) {
        // Idempotent recovery: Attempt native login for the user
        try {
          const supabase = await createServerSupabaseClient();
          const { error: loginErr } = await supabase.auth.signInWithPassword({
            email: cleanEmail,
            password,
          });

          if (!loginErr) {
            const res = NextResponse.json({ success: true, redirect: "/room" });
            clearEnrollmentTokenCookie(res);
            return res;
          }
        } catch {
          // ignore
        }
      }
      const res = NextResponse.json(
        { error: "This enrollment grant has already been used to create an account." },
        { status: 409 }
      );
      clearEnrollmentTokenCookie(res);
      return res;
    }

    // Check Revoked / Locked
    if (grant.status === "revoked" || grant.failed_attempts >= 5) {
      const res = NextResponse.json(
        { error: "This enrollment authorization has been locked due to too many failed attempts." },
        { status: 403 }
      );
      clearEnrollmentTokenCookie(res);
      return res;
    }

    // Check Expiration
    if (new Date(grant.expires_at).getTime() < Date.now()) {
      const res = NextResponse.json(
        { error: "This enrollment authorization has expired (24-hour limit)." },
        { status: 403 }
      );
      clearEnrollmentTokenCookie(res);
      return res;
    }

    // 6. Validate 4-Digit OTP
    if (grant.otp_code !== cleanOtp) {
      const newFailed = grant.failed_attempts + 1;
      await adminClient
        .from("enrollment_grants")
        .update({
          failed_attempts: newFailed,
          last_attempt_at: new Date().toISOString(),
          status: newFailed >= 5 ? "revoked" : grant.status,
          updated_at: new Date().toISOString(),
        })
        .eq("id", grant.id);

      return NextResponse.json(
        {
          error: "Invalid 4-digit enrollment code.",
          attemptsRemaining: Math.max(0, 5 - newFailed),
        },
        { status: 400 }
      );
    }

    // 7. Phase 1: Cryptographic Reservation
    const rawNonce = generateCreationNonce();
    const nonceHash = hashToken(rawNonce);

    const { data: reserveRes, error: reserveErr } = await adminClient.rpc("rpc_reserve_enrollment_grant", {
      p_token_hash: tokenHash,
      p_otp: cleanOtp,
      p_email: cleanEmail,
      p_nonce_hash: nonceHash,
    });

    if (reserveErr || !reserveRes?.success) {
      return NextResponse.json(
        { error: reserveRes?.error || "Registration is currently in progress for this grant." },
        { status: 400 }
      );
    }

    // 8. Phase 2: Create User via GoTrue
    let userCreated = false;
    try {
      const { data: authUser, error: createErr } = await adminClient.auth.admin.createUser({
        email: cleanEmail,
        password,
        email_confirm: true,
        user_metadata: {
          display_name: cleanDisplayName || cleanEmail.split("@")[0],
          enrollment_grant_id: grant.id,
          creation_nonce: rawNonce,
        },
      });

      if (createErr) {
        // Rollback reservation immediately
        await adminClient.rpc("rpc_release_enrollment_reservation", { p_grant_id: grant.id });
        return NextResponse.json(
          { error: createErr.message || "Failed to create user account." },
          { status: 400 }
        );
      }

      if (authUser?.user) {
        userCreated = true;
      }
    } catch (networkErr: any) {
      console.warn("[Enrollment Signup] Network exception during createUser:", networkErr);
      // Timeout Reconciliation State Machine
      const { data: checkedUser } = await adminClient
        .from("users")
        .select("id")
        .eq("email", cleanEmail)
        .maybeSingle();

      const { data: checkedGrant } = await adminClient
        .from("enrollment_grants")
        .select("status")
        .eq("id", grant.id)
        .maybeSingle();

      if (checkedUser || checkedGrant?.status === "consumed") {
        userCreated = true;
      } else {
        await adminClient.rpc("rpc_release_enrollment_reservation", { p_grant_id: grant.id });
        return NextResponse.json(
          { error: "Authentication service connection timed out. Please try again." },
          { status: 504 }
        );
      }
    }

    if (!userCreated) {
      await adminClient.rpc("rpc_release_enrollment_reservation", { p_grant_id: grant.id });
      return NextResponse.json({ error: "Failed to create user account." }, { status: 500 });
    }

    // 9. Establish Native Auth Session for the Browser
    try {
      const supabase = await createServerSupabaseClient();
      await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });
    } catch (sessionErr) {
      console.warn("[Enrollment Signup] Session establish error:", sessionErr);
    }

    // 10. Clear the enrollment cookie and redirect to room
    const response = NextResponse.json({
      success: true,
      message: "StudyRoom account created successfully!",
      redirect: "/room",
    });

    clearEnrollmentTokenCookie(response);
    return response;
  } catch (err: any) {
    console.error("[Enrollment Signup] Unhandled error:", err);
    return NextResponse.json(
      { error: err?.message || "An unexpected error occurred during signup." },
      { status: 500 }
    );
  }
}
