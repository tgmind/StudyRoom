import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail, isAdminUserId } from "@/lib/admin";
import { getAllAvatars, AVATAR_CATEGORIES } from "@/lib/avatars/manifest";

/**
 * Server-Side Admin Verification
 */
async function verifyAdmin(request: NextRequest) {
  try {
    const supabase = await createClient();
    let user = null;

    // 1. Check Bearer token from header
    const authHeader = request.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.substring(7).trim();
      if (token && token !== "undefined" && token !== "null") {
        try {
          const { data } = await supabase.auth.getUser(token);
          user = data?.user ?? null;
        } catch {
          // ignore token error
        }
      }
    }

    // 2. Fallback to cookie-based session
    if (!user) {
      try {
        const { data, error: authError } = await supabase.auth.getUser();
        if (!authError && data?.user) {
          user = data.user;
        }
      } catch {
        // ignore cookie error
      }
    }

    if (!user) {
      return { authorized: false, user: null, supabase, error: "Not authenticated" };
    }

    // 3. Verify admin authorization
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

function getMutationClient(authenticatedSupabase: any) {
  const adminClient = createAdminClient();
  return adminClient || authenticatedSupabase;
}

export interface PresetAvatarRecord {
  id: string;
  label: string;
  category: string;
  asset_path: string;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * GET /api/admin/avatars
 * Returns all preset avatars (both active and inactive) with statistics.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAdmin(request);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: 403 });
    }

    const client = getMutationClient(auth.supabase);
    const { data, error } = await client
      .from("preset_avatars")
      .select("*")
      .order("display_order", { ascending: true });

    if (error) {
      console.error("Error fetching preset avatars from DB:", error);
      // Fallback to static manifest if table not accessible
      const fallbackAvatars = getAllAvatars().map((a, idx) => ({
        id: a.id,
        label: a.label,
        category: a.category,
        asset_path: a.assetPath,
        display_order: idx + 1,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));

      return NextResponse.json({
        avatars: fallbackAvatars,
        categories: AVATAR_CATEGORIES,
        stats: {
          total: fallbackAvatars.length,
          active: fallbackAvatars.length,
          inactive: 0,
          categoriesCount: AVATAR_CATEGORIES.length - 1,
        },
      });
    }

    const avatars: PresetAvatarRecord[] = data || [];
    const categoriesSet = new Set<string>();
    categoriesSet.add("All");
    avatars.forEach((a) => {
      if (a.category) categoriesSet.add(a.category);
    });

    const categories = Array.from(categoriesSet);
    const activeCount = avatars.filter((a) => a.is_active).length;

    return NextResponse.json(
      {
        avatars,
        categories,
        stats: {
          total: avatars.length,
          active: activeCount,
          inactive: avatars.length - activeCount,
          categoriesCount: categories.length - 1,
        },
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        },
      }
    );
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/admin/avatars
 * Handles mutations: create, update, delete, toggle, reorder.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAdmin(request);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: 403 });
    }

    const body = await request.json();
    const { action } = body;
    const client = getMutationClient(auth.supabase);

    // 1. CREATE NEW PRESET AVATAR
    if (action === "create") {
      const { id, label, category, asset_path, display_order, is_active } = body;

      if (!id || !label || !category || !asset_path) {
        return NextResponse.json(
          { error: "Missing required fields: id, label, category, and asset_path" },
          { status: 400 }
        );
      }

      // Check for valid ID pattern
      if (!/^[a-zA-Z0-9_.-]+$/.test(id)) {
        return NextResponse.json(
          { error: "Invalid avatar ID format. Must contain only letters, numbers, hyphens, and underscores." },
          { status: 400 }
        );
      }

      let order = typeof display_order === "number" ? display_order : 999;
      if (!display_order) {
        const { count } = await client
          .from("preset_avatars")
          .select("*", { count: "exact", head: true });
        order = (count || 0) + 1;
      }

      const { data, error } = await client
        .from("preset_avatars")
        .insert({
          id: id.trim(),
          label: label.trim(),
          category: category.trim(),
          asset_path: asset_path.trim(),
          display_order: order,
          is_active: is_active !== false,
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) {
        console.error("Error creating preset avatar:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, avatar: data });
    }

    // 2. UPDATE EXISTING AVATAR
    if (action === "update") {
      const { id, label, category, display_order, is_active, asset_path } = body;

      if (!id) {
        return NextResponse.json({ error: "Missing required field: id" }, { status: 400 });
      }

      const updates: Record<string, any> = {
        updated_at: new Date().toISOString(),
      };

      if (typeof label === "string" && label.trim()) updates.label = label.trim();
      if (typeof category === "string" && category.trim()) updates.category = category.trim();
      if (typeof display_order === "number") updates.display_order = display_order;
      if (typeof is_active === "boolean") updates.is_active = is_active;
      if (typeof asset_path === "string" && asset_path.trim()) updates.asset_path = asset_path.trim();

      // Check if previous custom storage asset should be cleaned up when replaced
      let oldCustomAsset: string | null = null;
      if (typeof asset_path === "string" && asset_path.trim()) {
        const { data: prevAvatar } = await client
          .from("preset_avatars")
          .select("asset_path")
          .eq("id", id)
          .maybeSingle();

        if (
          prevAvatar?.asset_path &&
          prevAvatar.asset_path !== asset_path.trim() &&
          prevAvatar.asset_path.includes("/avatars/presets/")
        ) {
          oldCustomAsset = prevAvatar.asset_path;
        }
      }

      const { data, error } = await client
        .from("preset_avatars")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) {
        console.error("Error updating preset avatar:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      // Asynchronously clean up old custom storage object if replaced
      if (oldCustomAsset) {
        try {
          const parts = oldCustomAsset.split("/avatars/presets/");
          if (parts[1]) {
            await client.storage.from("avatars").remove([`presets/${parts[1]}`]);
          }
        } catch (cleanupErr) {
          console.warn("Storage cleanup error on avatar replace:", cleanupErr);
        }
      }

      return NextResponse.json({ success: true, avatar: data });
    }

    // 3. DELETE AVATAR
    if (action === "delete") {
      const { id } = body;

      if (!id) {
        return NextResponse.json({ error: "Missing required field: id" }, { status: 400 });
      }

      // First fetch the avatar to check if it has a custom storage path to clean up
      const { data: existing } = await client
        .from("preset_avatars")
        .select("asset_path")
        .eq("id", id)
        .maybeSingle();

      const { error } = await client.from("preset_avatars").delete().eq("id", id);

      if (error) {
        console.error("Error deleting preset avatar:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      // If the asset was stored in Supabase storage under presets/, delete the object
      if (existing?.asset_path && existing.asset_path.includes("/avatars/presets/")) {
        try {
          const match = existing.asset_path.match(/presets\/[^?#]+/);
          if (match && match[0]) {
            await client.storage.from("avatars").remove([match[0]]);
          }
        } catch (storageErr) {
          console.warn("Storage deletion error (non-fatal):", storageErr);
        }
      }

      return NextResponse.json({ success: true, deletedId: id });
    }

    // 4. BATCH REORDER
    if (action === "reorder") {
      const { items } = body; // Array of { id, display_order }
      if (!Array.isArray(items)) {
        return NextResponse.json({ error: "Invalid items array" }, { status: 400 });
      }

      const updates = items.map((item: { id: string; display_order: number }) =>
        client
          .from("preset_avatars")
          .update({ display_order: item.display_order, updated_at: new Date().toISOString() })
          .eq("id", item.id)
      );

      await Promise.allSettled(updates);
      return NextResponse.json({ success: true });
    }

    // 5. DELETE CATEGORY (WITH OPTIONAL RELOCATION OR BULK REMOVAL)
    if (action === "delete_category") {
      const { category, relocateToCategory, deleteAvatars } = body;

      if (!category || typeof category !== "string" || category.trim().toLowerCase() === "all") {
        return NextResponse.json({ error: "Invalid category to delete" }, { status: 400 });
      }

      const trimmedCategory = category.trim();
      const targetCategory = typeof relocateToCategory === "string" ? relocateToCategory.trim() : null;

      // Try calling authoritative PostgreSQL RPC function first
      const { data: rpcData, error: rpcError } = await client.rpc(
        "rpc_admin_delete_avatar_category",
        {
          p_category: trimmedCategory,
          p_relocate_to_category: targetCategory,
          p_delete_avatars: deleteAvatars === true,
        }
      );

      let resultAction = "";
      let affectedCount = 0;
      let deletedIds: string[] = [];
      let assetPaths: string[] = [];

      if (!rpcError && rpcData?.success) {
        resultAction = rpcData.action;
        affectedCount = rpcData.count || 0;
        deletedIds = rpcData.deleted_ids || [];
        assetPaths = rpcData.asset_paths || [];
      } else {
        // Fallback to direct client mutations if RPC is bypassed or fails
        if (targetCategory && targetCategory.toLowerCase() !== trimmedCategory.toLowerCase()) {
          const { data: updated, error: updateError } = await client
            .from("preset_avatars")
            .update({
              category: targetCategory,
              updated_at: new Date().toISOString(),
            })
            .ilike("category", trimmedCategory)
            .select("id");

          if (updateError) {
            return NextResponse.json({ error: updateError.message }, { status: 500 });
          }
          resultAction = "relocate";
          affectedCount = updated?.length || 0;
        } else if (deleteAvatars === true) {
          const { data: existing, error: fetchErr } = await client
            .from("preset_avatars")
            .select("id, asset_path")
            .ilike("category", trimmedCategory);

          if (fetchErr) {
            return NextResponse.json({ error: fetchErr.message }, { status: 500 });
          }

          deletedIds = (existing || []).map((e: any) => e.id);
          assetPaths = (existing || []).map((e: any) => e.asset_path);

          const { error: delErr } = await client
            .from("preset_avatars")
            .delete()
            .ilike("category", trimmedCategory);

          if (delErr) {
            return NextResponse.json({ error: delErr.message }, { status: 500 });
          }

          resultAction = "delete_avatars";
          affectedCount = deletedIds.length;
        } else {
          return NextResponse.json(
            { error: "Must specify either relocateToCategory or deleteAvatars: true" },
            { status: 400 }
          );
        }
      }

      // If avatars were permanently deleted, clean up cloud storage objects
      if (resultAction === "delete_avatars" && deletedIds.length > 0) {
        const storagePathsToDelete: string[] = [];
        for (let i = 0; i < deletedIds.length; i++) {
          const id = deletedIds[i];
          const path = assetPaths[i] || "";
          if (path.includes("/avatars/presets/")) {
            const match = path.match(/presets\/[^?#]+/);
            if (match && match[0]) storagePathsToDelete.push(match[0]);
          } else {
            storagePathsToDelete.push(`presets/${id}.webp`);
          }
        }

        if (storagePathsToDelete.length > 0) {
          try {
            await client.storage.from("avatars").remove(storagePathsToDelete);
          } catch (stErr) {
            console.warn("Storage removal warning:", stErr);
          }
        }
      }

      return NextResponse.json({
        success: true,
        action: resultAction,
        category: trimmedCategory,
        relocatedTo: targetCategory,
        count: affectedCount,
      });
    }

    // 6. BATCH CREATE PRESET AVATARS (WITH AUTOMATIC ORDERING)
    if (action === "batch_create") {
      const { items } = body;
      if (!Array.isArray(items) || items.length === 0) {
        return NextResponse.json({ error: "Missing or empty items array" }, { status: 400 });
      }

      // Query current max display_order for automatic sequential ordering
      const { data: maxRow } = await client
        .from("preset_avatars")
        .select("display_order")
        .order("display_order", { ascending: false })
        .limit(1)
        .maybeSingle();

      let nextOrder = (maxRow?.display_order || 0) + 1;

      const recordsToInsert = items.map((item: any, idx: number) => ({
        id: item.id.trim(),
        label: item.label.trim(),
        category: item.category.trim(),
        asset_path: item.asset_path.trim(),
        display_order: typeof item.display_order === "number" ? item.display_order : nextOrder + idx,
        is_active: item.is_active !== false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));

      const { data, error } = await client
        .from("preset_avatars")
        .insert(recordsToInsert)
        .select();

      if (error) {
        console.error("Batch create preset avatars error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        count: data?.length || 0,
        avatars: data,
      });
    }

    return NextResponse.json({ error: `Unknown action: "${action}"` }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}
