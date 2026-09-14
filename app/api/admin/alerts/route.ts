import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isMailerConfigured, sendAlertEmail } from "@/lib/email/mailer";
import { AlertType } from "@/lib/email/templates";
import { isAdminEmail, isAdminUserId } from "@/hooks/useAdmin";
import { processWeeklyAchieverAutomation, isMondayInTimezone, getMondayDateString } from "@/lib/email/achieverAutomation";
import { getWeekStartTimestamp } from "@/lib/time/format";

type RpcCaller = {
  rpc: (name: string, params?: Record<string, unknown>) => Promise<{ data: unknown; error: Error | null }>;
};

async function verifyAdmin(request: NextRequest) {
  try {
    const supabase = await createClient();
    let user = null;

    // 1. Check Bearer token from header (for mobile/client-side fetch)
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

    const authorized = isAdminEmail(user.email) || isAdminUserId(user.id);
    if (!authorized) {
      return { authorized: false, user, supabase, error: "Unauthorized: Administrator privileges required" };
    }

    return { authorized: true, user, supabase, error: null };
  } catch (err: any) {
    return { authorized: false, user: null, supabase: null as any, error: err?.message || "Auth error" };
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAdmin(request);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action") || "candidates";

    // 1. Check SMTP credentials configuration
    if (action === "config") {
      const configStatus = isMailerConfigured();
      return NextResponse.json(configStatus);
    }

    // 2. Fetch alert sent history with graceful direct table fallback
    if (action === "history") {
      const limit = parseInt(searchParams.get("limit") || "50", 10);
      let historyList = [];

      try {
        const { data, error } = await (auth.supabase as unknown as RpcCaller).rpc("rpc_admin_get_alert_history", {
          p_limit: limit,
        });
        if (!error && Array.isArray(data)) {
          historyList = data;
        } else {
          // Direct table fallback
          const { data: directData } = await (auth.supabase as any)
            .from("user_alerts")
            .select("*")
            .order("sent_at", { ascending: false })
            .limit(limit);
          historyList = directData || [];
        }
      } catch {
        historyList = [];
      }

      return NextResponse.json({ history: historyList });
    }

    // 3. Fetch weekly achiever status & Monday automation info
    if (action === "achiever_status") {
      const timezone = process.env.NEXT_PUBLIC_APP_TIMEZONE || "Asia/Kolkata";
      const now = new Date();
      const isMonday = isMondayInTimezone(now, timezone);
      const weekKey = getMondayDateString(now, timezone);
      const weekStartMs = getWeekStartTimestamp(now, timezone);
      const weekStartIso = new Date(weekStartMs).toISOString();

      let alreadySentThisWeek = false;
      let lastSentAlert = null;
      let currentAchiever = null;

      try {
        const { data: sentAlerts } = await (auth.supabase as any)
          .from("user_alerts")
          .select("id, sent_at, user_name, user_email")
          .eq("alert_type", "A")
          .eq("status", "sent")
          .gte("sent_at", weekStartIso);

        alreadySentThisWeek = Array.isArray(sentAlerts) && sentAlerts.length > 0;
        lastSentAlert = alreadySentThisWeek ? sentAlerts[0] : null;
      } catch {
        // user_alerts query fallback
      }

      try {
        const { data: achieverData } = await (auth.supabase as unknown as RpcCaller).rpc(
          "rpc_get_current_weekly_achiever",
          { p_timezone: timezone }
        );
        if (Array.isArray(achieverData) && achieverData.length > 0) {
          currentAchiever = achieverData[0];
        }
      } catch {
        // rpc fallback
      }

      return NextResponse.json({
        isMonday,
        weekKey,
        alreadySentThisWeek,
        lastSentAlert,
        achiever: currentAchiever,
      });
    }

    // 4. Fetch per-user alert tracking stats
    if (action === "user_stats") {
      try {
        const { data, error } = await (auth.supabase as unknown as RpcCaller).rpc("rpc_admin_get_user_alert_stats");
        if (!error && data) {
          return NextResponse.json({ stats: data });
        }
      } catch {
        // ignore
      }
      return NextResponse.json({ stats: [] });
    }

    // 5. Default: Scan candidates
    let candidateList = [];
    try {
      const { data, error } = await (auth.supabase as unknown as RpcCaller).rpc("rpc_admin_scan_alert_candidates", {
        p_admin_email: auth.user?.email || null,
      });
      if (!error && Array.isArray(data)) {
        candidateList = data;
      }
    } catch {
      // client fallback will supply candidates
    }

    return NextResponse.json({
      candidates: candidateList,
      mailerStatus: isMailerConfigured(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAdmin(request);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: 403 });
    }

    const body = await request.json();
    const { action } = body;

    // Check mailer setup before sending
    const mailerConfig = isMailerConfigured();
    if (!mailerConfig.configured) {
      return NextResponse.json(
        {
          error: mailerConfig.reason || "Mailer not configured",
          configured: false,
        },
        { status: 400 }
      );
    }

    // A. Send Test Email
    if (action === "send_test") {
      const { to, name, type, consecutiveDays, weeklyHours } = body;
      if (!to || !type) {
        return NextResponse.json({ error: "Recipient 'to' and 'type' are required for test email" }, { status: 400 });
      }

      const result = await sendAlertEmail({
        to: String(to).trim(),
        name: String(name || "Student").trim(),
        type: type as AlertType,
        consecutiveDays: Number(consecutiveDays || 0),
        weeklyHours: Number(weeklyHours || 0),
        isTest: true,
      });

      if (!result.success) {
        return NextResponse.json({ error: result.error || "Failed to send test email" }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        messageId: result.messageId,
        recipient: to,
      });
    }

    // B. Send Batch Alerts
    if (action === "send_batch") {
      const { candidates } = body;
      if (!Array.isArray(candidates) || candidates.length === 0) {
        return NextResponse.json({ error: "candidates must be a non-empty array" }, { status: 400 });
      }

      const results = [];

      for (const item of candidates) {
        const { candidate_id, user_id, user_name, user_email, alert_type, consecutive_inactive_days, reason, past_week_study_minutes } = item;

        // Attempt dispatch
        const sendResult = await sendAlertEmail({
          to: user_email,
          name: user_name,
          type: alert_type as AlertType,
          consecutiveDays: consecutive_inactive_days,
          weeklyHours: Math.round((past_week_study_minutes || 0) / 60),
          isTest: false,
        });

        const status = sendResult.success ? "sent" : "failed";
        const errorMsg = sendResult.error || null;

        // Log result in database
        try {
          await (auth.supabase as unknown as RpcCaller).rpc("rpc_admin_log_alert_result", {
            p_user_id: user_id,
            p_user_name: user_name,
            p_user_email: user_email,
            p_alert_type: alert_type,
            p_status: status,
            p_consecutive_days: consecutive_inactive_days || 0,
            p_reason: reason || "",
            p_error_message: errorMsg,
          });
        } catch (dbErr) {
          console.error("Failed to log alert in db:", dbErr);
        }

        results.push({
          candidate_id,
          user_id,
          user_name,
          user_email,
          alert_type,
          success: sendResult.success,
          error: errorMsg,
          messageId: sendResult.messageId,
        });
      }

      const totalSent = results.filter((r) => r.success).length;
      const totalFailed = results.filter((r) => !r.success).length;

      return NextResponse.json({
        success: true,
        totalRequested: candidates.length,
        totalSent,
        totalFailed,
        results,
      });
    }

    // C. Process Monday Achiever Email (Manual or Automated)
    if (action === "process_achiever") {
      const { force } = body;
      const timezone = process.env.NEXT_PUBLIC_APP_TIMEZONE || "Asia/Kolkata";
      const result = await processWeeklyAchieverAutomation({
        force: Boolean(force),
        timezone,
        supabaseOverride: auth.supabase,
      });

      return NextResponse.json(result);
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
