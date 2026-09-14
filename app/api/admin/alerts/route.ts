import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isMailerConfigured, sendAlertEmail } from "@/lib/email/mailer";
import { AlertType } from "@/lib/email/templates";
import { isAdminEmail, isAdminUserId } from "@/hooks/useAdmin";

type RpcCaller = {
  rpc: (name: string, params?: Record<string, unknown>) => Promise<{ data: unknown; error: Error | null }>;
};

async function verifyAdmin(request: NextRequest) {
  const supabase = await createClient();
  let user = null;

  // 1. Check Bearer token from header (for mobile/client-side fetch)
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.substring(7).trim();
    if (token) {
      const { data } = await supabase.auth.getUser(token);
      user = data?.user ?? null;
    }
  }

  // 2. Fallback to cookie-based session
  if (!user) {
    const { data, error: authError } = await supabase.auth.getUser();
    if (!authError && data?.user) {
      user = data.user;
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

    // 2. Fetch alert sent history
    if (action === "history") {
      const limit = parseInt(searchParams.get("limit") || "50", 10);
      const { data, error } = await (auth.supabase as unknown as RpcCaller).rpc("rpc_admin_get_alert_history", {
        p_limit: limit,
      });

      if (error) {
        return NextResponse.json(
          { error: error.message, needsMigration: error.message.toLowerCase().includes("does not exist") },
          { status: 500 }
        );
      }

      return NextResponse.json({ history: data || [] });
    }

    // 3. Default: Scan candidates
    const { data, error } = await (auth.supabase as unknown as RpcCaller).rpc("rpc_admin_scan_alert_candidates", {
      p_admin_email: auth.user?.email || null,
    });

    if (error) {
      return NextResponse.json(
        {
          error: error.message,
          needsMigration: error.message.toLowerCase().includes("does not exist"),
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      candidates: data || [],
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
      const { to, name, type, consecutiveDays } = body;
      if (!to || !type) {
        return NextResponse.json({ error: "Recipient 'to' and 'type' are required for test email" }, { status: 400 });
      }

      const result = await sendAlertEmail({
        to: String(to).trim(),
        name: String(name || "Student").trim(),
        type: type as AlertType,
        consecutiveDays: Number(consecutiveDays || 0),
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
        const { candidate_id, user_id, user_name, user_email, alert_type, consecutive_inactive_days, reason } = item;

        // Attempt dispatch
        const sendResult = await sendAlertEmail({
          to: user_email,
          name: user_name,
          type: alert_type as AlertType,
          consecutiveDays: consecutive_inactive_days,
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

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
