import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail, isAdminUserId } from "@/lib/admin";

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
        } catch {
          // ignore
        }
      }
    }

    if (!user) {
      try {
        const { data, error: authError } = await supabase.auth.getUser();
        if (!authError && data?.user) {
          user = data.user;
        }
      } catch {
        // ignore
      }
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
 * POST /api/admin/avatars/upload
 * Accepts multipart/form-data with pre-optimized WebP or PNG file.
 * Uploads to Supabase Storage bucket 'avatars' under presets/{filename}.
 * Returns public URL and file path.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAdmin(request);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: 403 });
    }

    const adminClient = createAdminClient();
    const client = adminClient || auth.supabase;

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const customId = formData.get("id") as string | null;

    if (!file) {
      return NextResponse.json({ error: "Missing file in form data" }, { status: 400 });
    }

    // Determine target file extension
    const ext = file.name.endsWith(".webp") || file.type === "image/webp" ? "webp" : "png";
    const avatarId = customId && /^[a-zA-Z0-9_.-]+$/.test(customId)
      ? customId
      : `avatar-custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

    const filePath = `presets/${avatarId}.${ext}`;
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await client.storage
      .from("avatars")
      .upload(filePath, fileBuffer, {
        contentType: file.type || (ext === "webp" ? "image/webp" : "image/png"),
        cacheControl: "31536000",
        upsert: true,
      });

    if (uploadError) {
      console.error("Error uploading avatar to storage:", uploadError);
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data: urlData } = client.storage
      .from("avatars")
      .getPublicUrl(filePath);

    if (!urlData?.publicUrl) {
      return NextResponse.json({ error: "Failed to resolve public URL" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      id: avatarId,
      publicUrl: urlData.publicUrl,
      asset_path: urlData.publicUrl,
      filePath,
      sizeBytes: fileBuffer.length,
    });
  } catch (err: any) {
    console.error("Unhandled avatar upload error:", err);
    return NextResponse.json({ error: err?.message || "Internal upload error" }, { status: 500 });
  }
}
