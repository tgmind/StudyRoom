import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_PUBLIC_CONTENT } from "@/lib/public-website/defaultContent";
import { PublicWebsiteContent } from "@/lib/public-website/types";
import { isAuthorizedAdmin } from "@/lib/public-website/authUtils";
import { synchronizeContentPricing } from "@/lib/public-website/priceUtils";

// In-memory runtime cache for seamless local testing or when DB table is not yet migrated
let memoryCachedContent: PublicWebsiteContent = { ...DEFAULT_PUBLIC_CONTENT };

export async function GET() {
  try {
    const supabase = await createClient();
    const { data, error } = await (supabase as any)
      .from("public_website_content")
      .select("content")
      .eq("id", "main")
      .maybeSingle();

    if (!error && data?.content) {
      const merged: PublicWebsiteContent = synchronizeContentPricing({
        ...DEFAULT_PUBLIC_CONTENT,
        ...data.content,
        general: { ...DEFAULT_PUBLIC_CONTENT.general, ...(data.content.general || {}) },
        branding: { ...DEFAULT_PUBLIC_CONTENT.branding, ...(data.content.branding || {}) },
        hero: { ...DEFAULT_PUBLIC_CONTENT.hero, ...(data.content.hero || {}) },
        membership: { ...DEFAULT_PUBLIC_CONTENT.membership, ...(data.content.membership || {}) },
        conditions: { ...DEFAULT_PUBLIC_CONTENT.conditions, ...(data.content.conditions || {}) },
      });
      memoryCachedContent = merged;
      return NextResponse.json(merged);
    }
  } catch (err) {
    console.warn("Public website content fetch fallback to default:", err);
  }

  return NextResponse.json(synchronizeContentPricing(memoryCachedContent));
}

export async function POST(request: NextRequest) {
  try {
    const authorized = await isAuthorizedAdmin(request);
    if (!authorized) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as Partial<PublicWebsiteContent>;
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid content payload" }, { status: 400 });
    }

    const updated: PublicWebsiteContent = synchronizeContentPricing({
      ...memoryCachedContent,
      ...body,
      lastUpdated: new Date().toISOString(),
      version: (memoryCachedContent.version || 1) + 1,
    });

    memoryCachedContent = updated;

    try {
      const supabase = createAdminClient() || (await createClient());
      await (supabase as any).from("public_website_content").upsert({
        id: "main",
        content: updated,
        updated_at: new Date().toISOString(),
      });
    } catch (dbErr) {
      console.warn("Could not persist to public_website_content table:", dbErr);
    }

    return NextResponse.json({
      success: true,
      content: updated,
      message: "Public website content updated successfully.",
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Failed to update content" }, { status: 500 });
  }
}
