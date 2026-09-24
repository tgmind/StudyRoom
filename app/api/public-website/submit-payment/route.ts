import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { PaymentSubmission } from "@/lib/public-website/types";
import { inMemorySubmissions } from "@/lib/public-website/submissionStore";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, contact, utr, amount = 50, notes = "" } = body;

    const trimmedName = String(name || "").trim();
    const trimmedContact = String(contact || "").trim();
    const trimmedUtr = String(utr || "").trim().replace(/\s+/g, "");

    if (!trimmedName) {
      return NextResponse.json({ error: "Please enter your full name." }, { status: 400 });
    }

    if (!trimmedContact) {
      return NextResponse.json({ error: "Please enter your email or phone number." }, { status: 400 });
    }

    if (!/^[A-Za-z0-9]{8,22}$/.test(trimmedUtr)) {
      return NextResponse.json({
        error: "Please enter a valid UPI transaction reference / UTR (8 to 22 alphanumeric characters).",
      }, { status: 400 });
    }

    const submissionId = `pay_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const newSubmission: PaymentSubmission = {
      id: submissionId,
      name: trimmedName,
      contact: trimmedContact,
      utr: trimmedUtr,
      amount: Number(amount) || 50,
      submittedAt: new Date().toISOString(),
      status: "pending",
      notes: String(notes || ""),
    };

    inMemorySubmissions.unshift(newSubmission);
    if (inMemorySubmissions.length > 500) {
      inMemorySubmissions.pop();
    }

    // Try saving to Supabase if table exists
    try {
      const supabase = await createClient();
      await (supabase as any).from("public_payment_submissions").insert({
        name: trimmedName,
        contact: trimmedContact,
        utr: trimmedUtr,
        amount: Number(amount) || 50,
        status: "pending",
        notes: String(notes || ""),
      });
    } catch (dbErr) {
      console.warn("Could not insert into public_payment_submissions table:", dbErr);
    }

    return NextResponse.json({
      success: true,
      submissionId,
      message: "Payment details submitted successfully. Verification is manual by administration.",
      redirectUrl: "/signup",
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Failed to process payment submission" }, { status: 500 });
  }
}
