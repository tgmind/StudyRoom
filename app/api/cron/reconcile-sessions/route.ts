import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Constant-time string comparison to prevent timing attacks.
 */
function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Server-Side Session Reconciliation Cron Endpoint
 *
 * Scheduled background execution path to guarantee zero-client server-side
 * termination of sessions exceeding the 3-hour study limit or 1-hour break limit.
 *
 * Security:
 * - Fail-closed: Requires CRON_SECRET to be configured and matched.
 * - Privilege: Requires SUPABASE_SERVICE_ROLE_KEY to invoke administrative RPC.
 */
export async function GET(request: NextRequest) {
  return handleRequest(request);
}

export async function POST(request: NextRequest) {
  return handleRequest(request);
}

async function handleRequest(request: NextRequest) {
  const startTime = Date.now();
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      console.error("[Cron Reconcile] CRON_SECRET is not configured on the server");
      return NextResponse.json(
        { success: false, error: "Unauthorized: server cron secret unconfigured" },
        { status: 401 }
      );
    }

    const authHeader = request.headers.get("authorization");
    const bearerToken = authHeader?.startsWith("Bearer ")
      ? authHeader.substring(7).trim()
      : null;
    const { searchParams } = new URL(request.url);
    const providedSecret =
      request.headers.get("x-cron-secret") ||
      bearerToken ||
      searchParams.get("secret");

    if (!providedSecret || !timingSafeEqual(providedSecret, cronSecret)) {
      return NextResponse.json(
        { success: false, error: "Unauthorized cron request" },
        { status: 401 }
      );
    }

    const adminClient = createAdminClient();
    if (!adminClient) {
      console.error("[Cron Reconcile] SUPABASE_SERVICE_ROLE_KEY is not configured");
      return NextResponse.json(
        { success: false, error: "Server configuration missing SUPABASE_SERVICE_ROLE_KEY" },
        { status: 500 }
      );
    }

    console.log("[Cron Reconcile] Starting session reconciliation", {
      started_at: new Date(startTime).toISOString(),
    });

    const { data, error } = await (adminClient as any).rpc("rpc_reconcile_expired_sessions");

    if (error) {
      console.error("[Cron Reconcile] Error executing rpc_reconcile_expired_sessions:", {
        message: error.message,
        code: error.code,
      });
      return NextResponse.json(
        { success: false, error: "Database reconciliation error" },
        { status: 500 }
      );
    }

    const totalDurationMs = Date.now() - startTime;
    const result = data || { success: true, reconciled_count: 0 };

    console.log("[Cron Reconcile] Completed session reconciliation", {
      reconciled_count: result.reconciled_count ?? 0,
      expired_study_count: result.expired_study_count ?? 0,
      expired_break_count: result.expired_break_count ?? 0,
      rpc_duration_ms: result.duration_ms,
      total_duration_ms: totalDurationMs,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json(result);
  } catch (err) {
    const totalDurationMs = Date.now() - startTime;
    console.error("[Cron Reconcile] Unexpected exception during reconciliation:", {
      error: err instanceof Error ? err.message : "Unknown error",
      total_duration_ms: totalDurationMs,
    });
    return NextResponse.json(
      { success: false, error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
