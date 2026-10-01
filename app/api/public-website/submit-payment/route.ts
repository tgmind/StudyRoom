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
} from "@/lib/auth/enrollment";

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
    const { name, contact, utr, amount = 20, notes = "" } = body;

    const trimmedName = String(name || "").trim();
    const trimmedContact = String(contact || "").trim();
    const trimmedUtr = String(utr || "").trim().replace(/\s+/g, "").toUpperCase();

    // 2. Validate input fields
    if (!trimmedName || trimmedName.length < 2) {
      return NextResponse.json({ error: "Please enter your full name (at least 2 characters)." }, { status: 400 });
    }

    if (!trimmedContact || trimmedContact.length < 5) {
      return NextResponse.json({ error: "Please enter a valid email or phone number." }, { status: 400 });
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

      const { data: inserted, error: dbErr } = await adminClient
        .from("public_payment_submissions")
        .insert({
          name: trimmedName,
          contact: trimmedContact,
          utr: trimmedUtr,
          amount: Number(amount) || 20,
          status: "pending",
          notes: String(notes || ""),
          claim_secret_hash: claimSecretHash,
        })
        .select("id")
        .single();

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
      contact: trimmedContact,
      utr: trimmedUtr,
      amount: Number(amount) || 20,
      submittedAt: new Date().toISOString(),
      status: "pending",
      notes: String(notes || ""),
    };
    inMemorySubmissions.unshift(memorySubmission);
    if (inMemorySubmissions.length > 500) inMemorySubmissions.pop();

    // 5. Build response and set HttpOnly claim secret cookie
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
