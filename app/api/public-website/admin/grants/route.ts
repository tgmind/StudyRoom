import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthorizedAdmin, verifySameOrigin } from "@/lib/public-website/authUtils";

export async function GET(request: NextRequest) {
  try {
    const authorized = await isAuthorizedAdmin(request);
    if (!authorized) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminClient = createAdminClient();
    if (!adminClient) {
      return NextResponse.json({ grants: [] });
    }

    // Select recent grants from the last 24-hour audit retention window
    // NEVER select cryptographic token hashes or nonces
    let grantsData: any[] = [];
    const res1 = await adminClient
      .from("enrollment_grants")
      .select(
        "id, authorization_type, source_reference, name, contact, email, phone, status, otp_code, created_at, expires_at, preverified_at, consumed_at, consumed_email, failed_attempts, notes"
      )
      .order("created_at", { ascending: false })
      .limit(200);

    if (res1.error && res1.error.message?.includes("column")) {
      const res2 = await adminClient
        .from("enrollment_grants")
        .select(
          "id, authorization_type, source_reference, name, contact, status, otp_code, created_at, expires_at, preverified_at, consumed_at, consumed_email, failed_attempts, notes"
        )
        .order("created_at", { ascending: false })
        .limit(200);
      grantsData = res2.data || [];
    } else if (res1.error) {
      console.error("[Admin Grants] Error fetching grants:", res1.error.message);
      return NextResponse.json({ error: "Failed to fetch access grants" }, { status: 500 });
    } else {
      grantsData = res1.data || [];
    }

    const mapped = grantsData.map((g: any) => ({
      id: g.id,
      authorizationType: g.authorization_type,
      sourceReference: g.source_reference,
      name: g.name,
      contact: g.contact,
      email: g.email || (g.contact && g.contact.includes("@") ? g.contact : null),
      phone: g.phone || (!g.contact?.includes("@") ? g.contact : null),
      status: g.status,
      otpCode: g.otp_code,
      createdAt: g.created_at,
      expiresAt: g.expires_at,
      preverifiedAt: g.preverified_at,
      consumedAt: g.consumed_at,
      consumedEmail: g.consumed_email,
      failedAttempts: g.failed_attempts || 0,
      notes: g.notes,
    }));

    return NextResponse.json({ grants: mapped });
  } catch (err: any) {
    console.error("[Admin Grants] Unexpected error:", err);
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
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
    const { action, grantId } = body;

    if (action === "revoke" && grantId) {
      const adminClient = createAdminClient();
      if (!adminClient) {
        return NextResponse.json({ error: "Database client unavailable" }, { status: 500 });
      }

      const { error } = await adminClient
        .from("enrollment_grants")
        .update({
          status: "revoked",
          updated_at: new Date().toISOString(),
        })
        .eq("id", grantId);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, message: "Enrollment grant revoked successfully." });
    }

    return NextResponse.json({ error: "Invalid action or parameters" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}
