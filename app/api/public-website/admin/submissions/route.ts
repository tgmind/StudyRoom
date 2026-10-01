import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  inMemorySubmissions,
  deleteSubmission,
  clearSubmissions,
} from "@/lib/public-website/submissionStore";
import { isAuthorizedAdmin, verifySameOrigin } from "@/lib/public-website/authUtils";
import { generateEnrollmentToken, generateOtpCode, hashToken } from "@/lib/auth/enrollment";

export async function GET(request: NextRequest) {
  try {
    const authorized = await isAuthorizedAdmin(request);
    if (!authorized) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
      const supabase = createAdminClient() || (await createClient());
      const { data, error } = await (supabase as any)
        .from("public_payment_submissions")
        .select("*")
        .order("submitted_at", { ascending: false })
        .limit(100);

      if (!error && Array.isArray(data)) {
        const mapped = data.map((d: any) => ({
          id: d.id,
          name: d.name,
          contact: d.contact,
          utr: d.utr,
          amount: Number(d.amount) || 20,
          submittedAt: d.submitted_at || d.submittedAt || d.created_at || new Date().toISOString(),
          status: d.status || "pending",
          verifiedAt: d.verified_at,
          verifiedBy: d.verified_by,
          notes: d.notes,
        }));
        return NextResponse.json({ submissions: mapped });
      }
    } catch {}

    // Fallback to in-memory submissions
    return NextResponse.json({ submissions: inMemorySubmissions });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Failed to fetch submissions" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!verifySameOrigin(request)) {
      return NextResponse.json({ error: "Forbidden: Cross-origin request rejected" }, { status: 403 });
    }

    const authorized = await isAuthorizedAdmin(request);
    if (!authorized) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { id, status, notes } = body;

    if (!id || !status) {
      return NextResponse.json({ error: "id and status are required" }, { status: 400 });
    }

    const adminClient = createAdminClient();

    if (status === "verified") {
      if (adminClient) {
        // Fetch submission to get claim_secret_hash if present
        const { data: sub } = await adminClient
          .from("public_payment_submissions")
          .select("id, claim_secret_hash, name")
          .eq("id", id)
          .maybeSingle();

        const tokenHash = sub?.claim_secret_hash || hashToken(generateEnrollmentToken());
        const otpCode = generateOtpCode();

        const { data: rpcRes, error: rpcErr } = await adminClient.rpc(
          "rpc_verify_payment_and_create_grant",
          {
            p_submission_id: id,
            p_token_hash: tokenHash,
            p_otp: otpCode,
            p_admin_identifier: "platform_admin",
          }
        );

        if (rpcErr) {
          console.error("[Admin Submissions] Verify RPC error:", rpcErr.message);
          return NextResponse.json({ error: `Database error: ${rpcErr.message}` }, { status: 500 });
        }

        if (!rpcRes?.success) {
          return NextResponse.json({ error: rpcRes?.error || "Verification failed" }, { status: 400 });
        }
      }

      // Update in-memory item
      const memoryItem = inMemorySubmissions.find((s) => s.id === id);
      if (memoryItem) {
        memoryItem.status = "verified";
        if (notes) memoryItem.notes = notes;
      }

      return NextResponse.json({
        success: true,
        message: "Payment verified and enrollment grant generated successfully.",
      });
    }

    // Status is 'rejected' or custom update
    if (adminClient) {
      const { error } = await (adminClient as any)
        .from("public_payment_submissions")
        .update({
          status,
          notes,
          verified_at: null,
        })
        .eq("id", id);

      if (error) {
        console.error("Database error updating submission status:", error);
        return NextResponse.json({ error: `Database error: ${error.message}` }, { status: 500 });
      }
    }

    const memoryItem = inMemorySubmissions.find((s) => s.id === id);
    if (memoryItem) {
      memoryItem.status = status;
      if (notes) memoryItem.notes = notes;
    }

    return NextResponse.json({ success: true, message: `Submission marked as ${status}` });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Failed to update submission" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    if (!verifySameOrigin(request)) {
      return NextResponse.json({ error: "Forbidden: Cross-origin request rejected" }, { status: 403 });
    }

    const authorized = await isAuthorizedAdmin(request);
    if (!authorized) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { id, all, status } = body;

    if (id) {
      await deleteSubmission(id);
      return NextResponse.json({ success: true, message: "Submission deleted successfully." });
    }

    if (all === true) {
      await clearSubmissions({ all: true });
      return NextResponse.json({ success: true, message: "All submissions deleted successfully." });
    }

    if (status) {
      await clearSubmissions({ status });
      return NextResponse.json({ success: true, message: `All ${status} submissions deleted successfully.` });
    }

    return NextResponse.json({ error: "Missing delete criteria (id, all, or status required)." }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Failed to delete submission" }, { status: 500 });
  }
}
