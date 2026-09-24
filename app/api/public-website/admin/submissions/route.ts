import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  inMemorySubmissions,
  deleteSubmission,
  clearSubmissions,
} from "@/lib/public-website/submissionStore";
import { isAuthorizedAdmin } from "@/lib/public-website/authUtils";

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
          amount: Number(d.amount) || 50,
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
    const authorized = await isAuthorizedAdmin(request);
    if (!authorized) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { id, status, notes } = body;

    if (!id || !status) {
      return NextResponse.json({ error: "id and status are required" }, { status: 400 });
    }

    // Update in-memory item
    const memoryItem = inMemorySubmissions.find((s) => s.id === id);
    if (memoryItem) {
      memoryItem.status = status;
      if (notes) memoryItem.notes = notes;
    }

    // Update database item if available
    try {
      const supabase = createAdminClient() || (await createClient());
      await (supabase as any)
        .from("public_payment_submissions")
        .update({
          status,
          notes,
          verified_at: status === "verified" ? new Date().toISOString() : null,
        })
        .eq("id", id);
    } catch {}

    return NextResponse.json({ success: true, message: `Submission marked as ${status}` });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Failed to update submission" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
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
