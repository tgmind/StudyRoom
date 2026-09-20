import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { processWeeklyAchieverAutomation } from "@/lib/email/achieverAutomation";

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
 * Weekly Achiever Cron / Automation Endpoint
 *
 * Runs automatically every Monday (or can be triggered manually/via cron-job.org / GitHub Actions).
 * If today is Monday and the email has not yet been sent this week, it dispatches the Congratulation email.
 * If already sent for this Monday, it safely exits without duplicate dispatch.
 */
export async function GET(request: NextRequest) {
  return handleRequest(request);
}

export async function POST(request: NextRequest) {
  return handleRequest(request);
}

async function handleRequest(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      console.error("[Cron Weekly Achiever] CRON_SECRET is not configured on the server");
      return NextResponse.json(
        { success: false, error: "Unauthorized: server cron secret unconfigured" },
        { status: 401 }
      );
    }

    const authHeader = request.headers.get("authorization");
    const bearerToken = authHeader?.startsWith("Bearer ")
      ? authHeader.substring(7).trim()
      : null;
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

    const force = searchParams.get("force") === "true";
    const timezone = searchParams.get("timezone") || process.env.NEXT_PUBLIC_APP_TIMEZONE || "Asia/Kolkata";

    const result = await processWeeklyAchieverAutomation({
      force,
      timezone,
    });

    return NextResponse.json(result, { status: result.success ? 200 : 500 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    console.error("[Cron Weekly Achiever] Unexpected error:", message);
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 });
  }
}
