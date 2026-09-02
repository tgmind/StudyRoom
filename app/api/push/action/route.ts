import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, userId } = body;

    if (action !== "stop_session") {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const targetUserId = user?.id || userId;

    if (!targetUserId) {
      return NextResponse.json(
        { error: "User identification required to stop session" },
        { status: 400 }
      );
    }

    // Call rpc_stop_user_session to authoritatively stop the session in Supabase
    const { data, error } = await (supabase as unknown as {
      rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
    }).rpc("rpc_stop_user_session", {
      p_user_id: targetUserId,
    });

    if (error) {
      // Fallback to rpc_finish_session if user is authenticated
      const { data: finishData, error: finishError } = await (supabase as unknown as {
        rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
      }).rpc("rpc_finish_session", {
        p_completed_task_ids: [],
      });

      if (finishError) {
        console.error("[Push Action] Failed to stop session:", error, finishError);
        return NextResponse.json({ error: "Failed to stop session" }, { status: 500 });
      }

      return NextResponse.json({ success: true, result: finishData });
    }

    return NextResponse.json({ success: true, result: data });
  } catch (err) {
    console.error("[Push Action] Error processing action:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
