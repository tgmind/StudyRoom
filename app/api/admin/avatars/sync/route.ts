import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail, isAdminUserId } from "@/lib/admin";
import { syncAvatarsFromCloud } from "@/lib/avatars/avatarSyncEngine";

/**
 * Server-Side Admin Verification
 */
async function verifyAdmin(request: NextRequest) {
  try {
    const supabase = await createClient();
    let user = null;

    const authHeader = request.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.substring(7).trim();
      if (token && token !== "undefined" && token !== "null") {
        try {
          const { data } = await supabase.auth.getUser(token);
          user = data?.user ?? null;
        } catch {}
      }
    }

    if (!user) {
      try {
        const { data, error: authError } = await supabase.auth.getUser();
        if (!authError && data?.user) {
          user = data.user;
        }
      } catch {}
    }

    if (!user) {
      return { authorized: false, user: null, supabase, error: "Not authenticated" };
    }

    let authorized = isAdminEmail(user.email) || isAdminUserId(user.id);
    if (!authorized) {
      const { data: profile } = await (supabase as any)
        .from("users")
        .select("is_admin")
        .eq("id", user.id)
        .maybeSingle();

      if (profile && (profile as { is_admin?: boolean }).is_admin === true) {
        authorized = true;
      }
    }

    if (!authorized) {
      return { authorized: false, user, supabase, error: "Unauthorized: Administrator privileges required" };
    }

    return { authorized: true, user, supabase, error: null };
  } catch (err: any) {
    return { authorized: false, user: null, supabase: null as any, error: err?.message || "Auth error" };
  }
}

/**
 * POST /api/admin/avatars/sync
 *
 * Downloads cloud-stored avatars (from Supabase Storage) into public/avatars/optimized/,
 * updates database asset_path, regenerates avatar manifest files, and purges Supabase Storage.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAdmin(request);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: 403 });
    }

    const result = await syncAvatarsFromCloud();

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("Avatar cloud sync error:", err);
    return NextResponse.json({ error: err?.message || "Avatar sync failed" }, { status: 500 });
  }
}
