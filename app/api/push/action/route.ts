import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { verifyPushAction } from "@/lib/pushAuth";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { action, userId, actionToken } = body;

    if (action !== "stop_session" || !userId) {
      return NextResponse.json(
        { error: "Invalid action or missing user identification" },
        { status: 400 }
      );
    }

    // Check 1: User session via cookie
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Check 2: Verify either active session matching userId OR valid cryptographic actionToken
    const isSessionOwner = Boolean(user && user.id === userId);
    const isTokenAuthorized = verifyPushAction(userId, actionToken);

    if (!isSessionOwner && !isTokenAuthorized) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid session or action token" },
        { status: 401 }
      );
    }

    // Execute authoritative stop using service role or server client
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (supabaseUrl && serviceKey) {
      const adminClient = createAdminClient(supabaseUrl, serviceKey);
      const { data, error } = await adminClient.rpc("rpc_stop_user_session", {
        p_user_id: userId,
      });

      if (!error) {
        return NextResponse.json({ success: true, result: data });
      }
      console.warn("[Push Action] adminClient rpc_stop_user_session error:", error);
    }

    // Fallback: server client with user session
    const { data: fallbackData, error: fallbackError } = await (supabase as unknown as {
      rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
    }).rpc("rpc_stop_user_session", {
      p_user_id: userId,
    });

    if (fallbackError) {
      console.error("[Push Action] Failed to stop session:", fallbackError);
      return NextResponse.json({ error: "Failed to stop session" }, { status: 500 });
    }

    return NextResponse.json({ success: true, result: fallbackData });
  } catch (err) {
    console.error("[Push Action] Error processing action:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
