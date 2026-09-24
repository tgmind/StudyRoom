import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { inMemorySubmissions } from "@/lib/public-website/submissionStore";
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

      if (!error && Array.isArray(data) && data.length > 0) {
        return NextResponse.json({ submissions: data });
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
