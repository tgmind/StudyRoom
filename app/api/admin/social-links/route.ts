import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail, isAdminUserId } from "@/lib/admin";
import { isValidHttpUrl, normalizeUrl } from "@/lib/social/urlValidation";
import { SocialLink } from "@/lib/social/types";

/**
 * Server-Side Admin Verification
 * Verifies that the request originates from an authentic authenticated administrator.
 * Checks Bearer token or session cookie against isAdminEmail, isAdminUserId, or users.is_admin in database.
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

/**
 * Helper to obtain the best database client for administrator mutations.
 */
function getMutationClient(authenticatedSupabase: any) {
  const adminClient = createAdminClient();
  return adminClient || authenticatedSupabase;
}

/**
 * Admin GET Endpoint
 * Returns all social links (enabled and disabled) ordered by display_order.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAdmin(request);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: 403 });
    }

    const client = getMutationClient(auth.supabase);
    const { data, error } = await client
      .from("social_community_links")
      .select("*")
      .order("display_order", { ascending: true });

    if (error) {
      console.error("Admin error fetching social links:", error);
      return NextResponse.json({ error: error.message, links: [] }, { status: 500 });
    }

    return NextResponse.json(
      { links: data || [] },
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
 * Admin POST Endpoint
 * Handles mutations: toggle, save, delete, reorder.
 * Enforces strict URL validation and admin authorization.
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

    // 1. TOGGLE ENABLED STATUS
    if (action === "toggle") {
      const { id, is_enabled } = body;
      if (!id || typeof is_enabled !== "boolean") {
        return NextResponse.json({ error: "Missing required fields: id and is_enabled (boolean)" }, { status: 400 });
      }

      const { data, error } = await client
        .from("social_community_links")
        .update({
          is_enabled,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();

      if (error) {
        console.error("Error toggling social link:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        link: data,
        message: `Social link "${data?.title || id}" is now ${is_enabled ? "enabled" : "disabled"}.`,
      });
    }

    // 2. SAVE (CREATE OR UPDATE)
    if (action === "save") {
      const link: Partial<SocialLink> = body.link;
      if (!link || typeof link !== "object") {
        return NextResponse.json({ error: "Invalid link payload" }, { status: 400 });
      }

      const title = (link.title || "").trim();
      const rawUrl = (link.url || "").trim();
      const platform = (link.platform || "").toLowerCase().trim() || "custom";
      const actionText = (link.action_text || "").trim() || "Join Now";
      const iconKey = (link.icon_key || platform).toLowerCase().trim();
      const isEnabled = link.is_enabled !== false;
      const displayOrder = typeof link.display_order === "number" ? link.display_order : 1;

      if (!title) {
        return NextResponse.json({ error: "Platform name / title is required." }, { status: 400 });
      }

      if (!rawUrl) {
        return NextResponse.json({ error: "URL is required." }, { status: 400 });
      }

      // STRICT URL VALIDATION
      if (!isValidHttpUrl(rawUrl)) {
        return NextResponse.json(
          { error: "Invalid URL. Please enter a valid web URL starting with https:// or http://" },
          { status: 400 }
        );
      }

      const cleanUrl = normalizeUrl(rawUrl);
      const id = (link.id || "").trim() || `${platform}-${Date.now()}`;

      const payload = {
        id,
        platform,
        title,
        url: cleanUrl,
        action_text: actionText,
        is_enabled: isEnabled,
        display_order: displayOrder,
        icon_key: iconKey,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await client
        .from("social_community_links")
        .upsert(payload)
        .select()
        .single();

      if (error) {
        console.error("Error saving social link:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        link: data,
        message: `Saved "${title}" successfully.`,
      });
    }

    // 3. DELETE
    if (action === "delete") {
      const { id } = body;
      if (!id) {
        return NextResponse.json({ error: "Link ID is required for deletion." }, { status: 400 });
      }

      const { error } = await client
        .from("social_community_links")
        .delete()
        .eq("id", id);

      if (error) {
        console.error("Error deleting social link:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        deletedId: id,
        message: "Social link deleted successfully.",
      });
    }

    // 4. ATOMIC REORDER (ACID Database Transaction via RPC)
    if (action === "reorder") {
      const { items } = body;
      if (!Array.isArray(items) || items.length === 0) {
        return NextResponse.json({ error: "Items array is required for reorder." }, { status: 400 });
      }

      // Validate that each item has a valid id and numeric display_order
      for (const item of items) {
        if (!item || typeof item.id !== "string" || !item.id.trim() || typeof item.display_order !== "number") {
          return NextResponse.json(
            { error: "Each reorder item must contain a non-empty string 'id' and numeric 'display_order'." },
            { status: 400 }
          );
        }
      }

      // Execute atomic transaction via database RPC: either all succeed or none are committed
      const { error: rpcErr } = await client.rpc("rpc_admin_reorder_social_links", {
        p_items: items,
      });

      if (rpcErr) {
        console.error("[Admin Social Links] Atomic reorder transaction failed:", rpcErr.message || rpcErr);
        return NextResponse.json(
          {
            error: `Atomic reorder transaction failed: ${rpcErr.message || "Database transaction error"}`,
          },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: "Order updated successfully.",
      });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}
