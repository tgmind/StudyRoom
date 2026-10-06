import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SocialLink } from "@/lib/social/types";

/**
 * Public Social Links Endpoint
 * Returns strictly enabled social links ordered by display_order.
 * Authoritative: Reads directly from database. Never falls back to default links if disabled or empty.
 */
export async function GET() {
  try {
    const supabase = await createClient();

    const { data, error } = await (supabase as any)
      .from("social_community_links")
      .select("id, platform, title, url, action_text, is_enabled, display_order, icon_key, created_at, updated_at")
      .eq("is_enabled", true)
      .order("display_order", { ascending: true });

    if (error) {
      console.error("Failed to fetch active social links from database:", error.message);
      // Return empty list on DB error; DO NOT resurrect defaults
      return NextResponse.json(
        { links: [], error: error.message },
        {
          status: 500,
          headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          },
        }
      );
    }

    const links: SocialLink[] = Array.isArray(data) ? data : [];

    return NextResponse.json(
      { links },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        },
      }
    );
  } catch (err: any) {
    console.error("Exception fetching active social links:", err?.message);
    return NextResponse.json(
      { links: [], error: err?.message || "Internal server error" },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        },
      }
    );
  }
}
