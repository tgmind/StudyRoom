import { NextRequest, NextResponse } from "next/server";
import { processWeeklyAchieverAutomation } from "@/lib/email/achieverAutomation";

export const dynamic = "force-dynamic";

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
    const providedSecret =
      request.headers.get("x-cron-secret") ||
      request.headers.get("authorization")?.replace("Bearer ", "").trim() ||
      searchParams.get("secret");

    // If CRON_SECRET is defined in environment, enforce it for automated security
    if (cronSecret && providedSecret !== cronSecret) {
      return NextResponse.json({ error: "Unauthorized cron request" }, { status: 401 });
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
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
