import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { inMemorySubmissions } from "@/lib/public-website/submissionStore";
import { PaymentSubmission } from "@/lib/public-website/types";
import {
  generateClaimSecret,
  hashToken,
  setClaimSecretCookie,
  extractClientIp,
  checkRateLimit,
  validateAndNormalizeIndianPhone,
} from "@/lib/auth/enrollment";
import {
  sendAdminPaymentNotification,
  sendUserPaymentPendingEmail,
} from "@/lib/email/mailer";

export async function POST(request: NextRequest) {
  try {
    // 1. IP Rate Limiting (max 5 submissions per 10 minutes)
    const clientIp = extractClientIp(request);
    const rateLimit = checkRateLimit(`submit_pay_${clientIp}`, 5, 10 * 60 * 1000);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many submissions from your connection. Please wait 10 minutes before retrying." },
        { status: 429 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { name, email, phone, contact, utr, amount = 20, notes = "" } = body;

    const trimmedName = String(name || "").trim();
    const trimmedEmail = String(email || (contact && String(contact).includes("@") ? contact : "")).trim().toLowerCase();
    const rawPhone = String(phone || (contact && !String(contact).includes("@") ? contact : "")).trim();
    const trimmedUtr = String(utr || "").trim().replace(/\s+/g, "").toUpperCase();

    // 2. Validate input fields
    if (!trimmedName || trimmedName.length < 2) {
      return NextResponse.json(
        { error: "Please enter your full name (at least 2 characters)." },
        { status: 400 }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!trimmedEmail || !emailRegex.test(trimmedEmail)) {
      return NextResponse.json(
        { error: "Please enter a valid email address (e.g. yourname@gmail.com)." },
        { status: 400 }
      );
    }

    let normalizedPhone: string | null = null;
    if (rawPhone) {
      const phoneValidation = validateAndNormalizeIndianPhone(rawPhone);
      if (!phoneValidation.valid || !phoneValidation.normalized) {
        return NextResponse.json(
          { error: phoneValidation.error || "Please enter a valid 10-digit Indian mobile number." },
          { status: 400 }
        );
      }
      normalizedPhone = phoneValidation.normalized;
    } else if (email && !phone) {
      // In new API contract with explicit email field, phone is required
      return NextResponse.json(
        { error: "Please enter a valid 10-digit Indian mobile number." },
        { status: 400 }
      );
    }

    if (!/^[A-Za-z0-9]{8,22}$/.test(trimmedUtr)) {
      return NextResponse.json(
        { error: "Please enter a valid 8 to 22 character UPI Transaction Reference / UTR." },
        { status: 400 }
      );
    }

    // 3. Generate Cryptographic Claim Secret for Payer Browser Continuation
    const claimSecret = generateClaimSecret();
    const claimSecretHash = hashToken(claimSecret);

    // 4. Save to Database via service_role client
    const adminClient = createAdminClient();
    let submissionId: string | undefined;

    if (adminClient) {
      // Check for existing pending or verified submission with identical UTR
      const { data: existing } = await adminClient
        .from("public_payment_submissions")
        .select("id, status")
        .eq("utr", trimmedUtr)
        .in("status", ["pending", "verified"])
        .maybeSingle();

      if (existing) {
        return NextResponse.json(
          { error: "This UPI transaction reference (UTR) has already been submitted." },
          { status: 409 }
        );
      }

      // Insert record (with backward-compatible column fallback)
      let inserted = null;
      let dbErr = null;

      const insertRes = await adminClient
        .from("public_payment_submissions")
        .insert({
          name: trimmedName,
          email: trimmedEmail,
          phone: normalizedPhone,
          contact: trimmedEmail,
          utr: trimmedUtr,
          amount: Number(amount) || 20,
          status: "pending",
          notes: String(notes || ""),
          claim_secret_hash: claimSecretHash,
        })
        .select("id")
        .single();

      if (insertRes.error && insertRes.error.message?.includes("column")) {
        // Fallback for pre-migration table schema
        const fallbackRes = await adminClient
          .from("public_payment_submissions")
          .insert({
            name: trimmedName,
            contact: `${trimmedEmail} (${normalizedPhone})`,
            utr: trimmedUtr,
            amount: Number(amount) || 20,
            status: "pending",
            notes: String(notes || ""),
            claim_secret_hash: claimSecretHash,
          })
          .select("id")
          .single();
        inserted = fallbackRes.data;
        dbErr = fallbackRes.error;
      } else {
        inserted = insertRes.data;
        dbErr = insertRes.error;
      }

      if (dbErr) {
        console.error("[Submit Payment] Database error:", dbErr.message);
        return NextResponse.json({ error: "Database error recording payment submission." }, { status: 500 });
      }

      submissionId = inserted?.id;
    }

    // Update in-memory cache for development fallback
    const memorySubmission: PaymentSubmission = {
      id: submissionId || `pay_${Date.now()}`,
      name: trimmedName,
      email: trimmedEmail,
      phone: normalizedPhone,
      contact: trimmedEmail,
      utr: trimmedUtr,
      amount: Number(amount) || 20,
      submittedAt: new Date().toISOString(),
      status: "pending",
      notes: String(notes || ""),
    };
    inMemorySubmissions.unshift(memorySubmission);
    if (inMemorySubmissions.length > 500) inMemorySubmissions.pop();

    // 5. Asynchronous, Non-Blocking Email Notifications
    const submittedTimestamp = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
    Promise.allSettled([
      sendAdminPaymentNotification({
        name: trimmedName,
        email: trimmedEmail,
        phone: normalizedPhone || "N/A",
        utr: trimmedUtr,
        amount: Number(amount) || 20,
        submittedAt: submittedTimestamp,
      }),
      sendUserPaymentPendingEmail({
        name: trimmedName,
        email: trimmedEmail,
        phone: normalizedPhone || undefined,
        utr: trimmedUtr,
      }),
    ]).catch((emailErr) => {
      console.warn("[Submit Payment] Async email alert dispatch warning:", emailErr);
    });

    // 6. Build response and set HttpOnly claim secret cookie
    const response = NextResponse.json({
      success: true,
      submissionId: submissionId || memorySubmission.id,
      status: "pending",
      message: "Payment details submitted. Waiting for administrative verification.",
    });

    setClaimSecretCookie(response, claimSecret);
    return response;
  } catch (err: any) {
    console.error("[Submit Payment] Unexpected error:", err);
    return NextResponse.json({ error: err?.message || "Failed to process payment submission" }, { status: 500 });
  }
}
