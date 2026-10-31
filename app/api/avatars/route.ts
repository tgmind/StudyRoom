import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAllAvatars, AVATAR_CATEGORIES, AvatarItem } from "@/lib/avatars/manifest";

export interface PublicAvatarsResponse {
  avatars: AvatarItem[];
  categories: string[];
  total: number;
}

/**
 * GET /api/avatars
 * Public endpoint that returns all active preset avatars for StudyRoom users.
 * Sourced from public.preset_avatars with automatic fallback to static manifest.
 * Cached at edge with stale-while-revalidate for 0ms response times.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("preset_avatars")
      .select("id, label, category, asset_path")
      .eq("is_active", true)
      .order("display_order", { ascending: true });

    if (error || !data || data.length === 0) {
      if (error) {
        console.warn("Public avatars fallback due to DB error:", error.message);
      }
      const staticList = getAllAvatars();
      return NextResponse.json(
        {
          avatars: staticList,
          categories: AVATAR_CATEGORIES,
          total: staticList.length,
        },
        {
          headers: {
            "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
          },
        }
      );
    }

    const avatars: AvatarItem[] = data.map((d: any) => ({
      id: d.id,
      label: d.label,
      category: d.category,
      assetPath: d.asset_path,
    }));

    const categoriesSet = new Set<string>();
    categoriesSet.add("All");
    avatars.forEach((a) => {
      if (a.category) categoriesSet.add(a.category);
    });

    return NextResponse.json(
      {
        avatars,
        categories: Array.from(categoriesSet),
        total: avatars.length,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        },
      }
    );
  } catch (err: any) {
    console.error("Failed to fetch public avatars:", err);
    const staticList = getAllAvatars();
    return NextResponse.json(
      {
        avatars: staticList,
        categories: AVATAR_CATEGORIES,
        total: staticList.length,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        },
      }
    );
  }
}
