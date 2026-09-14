import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isMailerConfigured, sendAlertEmail } from "@/lib/email/mailer";
import { AlertType } from "@/lib/email/templates";
import { isAdminEmail, isAdminUserId } from "@/lib/admin";
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

    // 5. Fetch all platform members with their authentic auth.users emails
    if (action === "members") {
      let membersList: any[] = [];
      try {
        const { data, error } = await (auth.supabase as unknown as RpcCaller).rpc("rpc_admin_get_platform_members", {
          p_admin_email: auth.user?.email || "studyaliveapp@gmail.com",
        });
        if (!error && Array.isArray(data) && data.length > 0) {
          membersList = data;
        }
      } catch {
        // RPC fallback
      }

      if (membersList.length === 0) {
        try {
          const { data: directUsers } = await (auth.supabase as any)
            .from("users")
            .select("id, display_name, email, avatar_url, current_status, has_achiever_badge, last_offline_at, created_at, total_alerts_sent, alert_counts, last_alert_sent_at, last_alert_type")
            .eq("is_admin", false)
            .order("display_name", { ascending: true });

          if (Array.isArray(directUsers)) {
            membersList = directUsers.map((u: any) => ({
              ...u,
              email: (u.email && !u.email.includes("@student.studyroom")) ? u.email.trim() : "",
            }));
          }
        } catch {
          membersList = [];
        }
      }

      return NextResponse.json({ members: membersList });
    }

    // 6. Default / action === "candidates": Scan candidates with authentic emails
    let candidateList: any[] = [];
    try {
      const { data, error } = await (auth.supabase as unknown as RpcCaller).rpc("rpc_admin_scan_alert_candidates", {
        p_admin_email: auth.user?.email || "studyaliveapp@gmail.com",
      });
      if (!error && Array.isArray(data) && data.length > 0) {
        // Ensure no dummy email placeholders slip through
        candidateList = data.map((c: any) => ({
          ...c,
          user_email: (c.user_email && !c.user_email.includes("@student.studyroom")) ? c.user_email.trim() : "",
        }));
      }
    } catch {
      // client or server fallback
    }

    // Server-side resilient fallback if RPC returned 0 rows or is not yet installed
    if (candidateList.length === 0) {
      candidateList = await scanCandidatesFallback(auth.supabase);
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

// Resilient server-side candidate scanner that never generates dummy @student.studyroom emails
async function scanCandidatesFallback(supabase: any) {
  try {
    const [usersRes, sessionsRes, alertsRes] = await Promise.allSettled([
      supabase.from("users").select("*"),
      supabase.from("study_sessions").select("id, user_id, start_time, end_time, duration_minutes"),
      supabase.from("user_alerts").select("user_id, alert_type, sent_at").eq("status", "sent"),
    ]);

    const rawUsers = usersRes.status === "fulfilled" && Array.isArray(usersRes.value.data) ? usersRes.value.data : [];
    const rawSessions = sessionsRes.status === "fulfilled" && Array.isArray(sessionsRes.value.data) ? sessionsRes.value.data : [];
    const rawAlerts = alertsRes.status === "fulfilled" && Array.isArray(alertsRes.value.data) ? alertsRes.value.data : [];

    const now = Date.now();
    const weekAgo = now - 7 * 86400 * 1000;

    const latestAlerts: Record<string, Record<string, string>> = {};
    rawAlerts.forEach((a: any) => {
      if (!latestAlerts[a.user_id]) latestAlerts[a.user_id] = {};
      const existing = latestAlerts[a.user_id][a.alert_type];
      if (!existing || new Date(a.sent_at).getTime() > new Date(existing).getTime()) {
        latestAlerts[a.user_id][a.alert_type] = a.sent_at;
      }
    });

    const candidates: any[] = [];
    const nonAdmin = rawUsers.filter((u: any) => !u.is_admin);

    for (const u of nonAdmin) {
      const userEmail = (u.email && !u.email.includes("@student.studyroom")) ? u.email.trim() : "";

      const userSessions = rawSessions.filter((s: any) => s.user_id === u.id);
      let maxTime: number | null = null;
      let totalMins = 0;
      let weekMins = 0;

      userSessions.forEach((s: any) => {
        const t = new Date(s.end_time || s.start_time).getTime();
        if (!maxTime || t > maxTime) maxTime = t;
        const dur = s.duration_minutes || 0;
        totalMins += dur;
        if (new Date(s.start_time).getTime() >= weekAgo) {
          weekMins += dur;
        }
      });

      const offlineTime = u.last_offline_at ? new Date(u.last_offline_at).getTime() : null;
      const createdTime = new Date(u.created_at || now).getTime();
      const latestActive = maxTime || offlineTime || createdTime;

      const isCurrentlyActive = u.current_status === "studying" || u.current_status === "break";
      const inactiveDays = isCurrentlyActive ? 0 : Math.max(0, Math.floor((now - latestActive) / (1000 * 86400)));

      const userAlertLogs = latestAlerts[u.id] || {};

      // 1. TYPE A: Achiever
      if (u.has_achiever_badge && inactiveDays < 3) {
        const lastSent = userAlertLogs["A"];
        const canSend = !lastSent || (now - new Date(lastSent).getTime()) >= 7 * 86400 * 1000;
        if (canSend) {
          candidates.push({
            candidate_id: `A-${u.id}`,
            user_id: u.id,
            user_name: u.display_name,
            user_email: userEmail,
            alert_type: "A",
            consecutive_inactive_days: inactiveDays,
            reason: "Active Achiever Title holder",
            last_active_at: new Date(latestActive).toISOString(),
            last_alert_sent_at: lastSent || null,
            has_achiever_badge: true,
            total_study_minutes: totalMins,
            past_week_study_minutes: weekMins,
          });
        }
      }

      // 2. TYPE D: Account Deletion (>= 5 days inactive)
      if (!isCurrentlyActive && inactiveDays >= 5) {
        const lastSent = userAlertLogs["D"];
        const canSend = !lastSent || (now - new Date(lastSent).getTime()) >= 3 * 86400 * 1000;
        if (canSend) {
          candidates.push({
            candidate_id: `D-${u.id}`,
            user_id: u.id,
            user_name: u.display_name,
            user_email: userEmail,
            alert_type: "D",
            consecutive_inactive_days: inactiveDays,
            reason: `Inactive for ${inactiveDays} consecutive days (Threshold: 5 days)`,
            last_active_at: new Date(latestActive).toISOString(),
            last_alert_sent_at: lastSent || null,
            has_achiever_badge: Boolean(u.has_achiever_badge),
            total_study_minutes: totalMins,
            past_week_study_minutes: weekMins,
          });
        }
      }

      // 3. TYPE I: Account Activity Notice (3 to 4 days inactive)
      if (!isCurrentlyActive && inactiveDays >= 3 && inactiveDays < 5) {
        const lastSent = userAlertLogs["I"];
        const canSend = !lastSent || (now - new Date(lastSent).getTime()) >= 3 * 86400 * 1000;
        if (canSend) {
          candidates.push({
            candidate_id: `I-${u.id}`,
            user_id: u.id,
            user_name: u.display_name,
            user_email: userEmail,
            alert_type: "I",
            consecutive_inactive_days: inactiveDays,
            reason: `Inactive for ${inactiveDays} consecutive days (Threshold: 3 days)`,
            last_active_at: new Date(latestActive).toISOString(),
            last_alert_sent_at: lastSent || null,
            has_achiever_badge: Boolean(u.has_achiever_badge),
            total_study_minutes: totalMins,
            past_week_study_minutes: weekMins,
          });
        }
      }

      // 4. TYPE W: Weekly Slump (active within 3 days, low output < 2 hours)
      if (inactiveDays < 3 && !u.has_achiever_badge && weekMins < 120) {
        const lastSent = userAlertLogs["W"];
        const canSend = !lastSent || (now - new Date(lastSent).getTime()) >= 4 * 86400 * 1000;
        if (canSend) {
          candidates.push({
            candidate_id: `W-${u.id}`,
            user_id: u.id,
            user_name: u.display_name,
            user_email: userEmail,
            alert_type: "W",
            consecutive_inactive_days: inactiveDays,
            reason: `Low study output in past 7 days (${(weekMins / 60).toFixed(1)}h logged)`,
            last_active_at: new Date(latestActive).toISOString(),
            last_alert_sent_at: lastSent || null,
            has_achiever_badge: false,
            total_study_minutes: totalMins,
            past_week_study_minutes: weekMins,
          });
        }
      }
    }

    return candidates;
  } catch (err) {
    console.error("Candidates fallback error:", err);
    return [];
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

    // A. Reset All Alert Counts & Clear History (Does NOT require mailer)
    if (action === "reset_alerts") {
      let rpcSucceeded = false;
      try {
        const { error: rpcErr } = await (auth.supabase as unknown as RpcCaller).rpc("rpc_admin_reset_alert_counts", {
          p_admin_email: auth.user?.email || "studyaliveapp@gmail.com",
        });
        if (!rpcErr) {
          rpcSucceeded = true;
        }
      } catch {
        // Direct fallback below
      }

      // Direct table fallback to guarantee reset
      try {
        await (auth.supabase as any)
          .from("user_alerts")
          .delete()
          .neq("id", "00000000-0000-0000-0000-000000000000");

        await (auth.supabase as any)
          .from("users")
          .update({
            total_alerts_sent: 0,
            alert_counts: { A: 0, W: 0, I: 0, D: 0 },
            last_alert_sent_at: null,
            last_alert_type: null,
          })
          .neq("id", "00000000-0000-0000-0000-000000000000");
      } catch (tableErr: any) {
        if (!rpcSucceeded) {
          return NextResponse.json({ error: tableErr?.message || "Failed to reset alert counts" }, { status: 500 });
        }
      }

      return NextResponse.json({
        success: true,
        message: "All alert counts and history have been successfully reset to 0.",
      });
    }

    // B. Update Student Email Directly
    if (action === "update_user_email") {
      const { user_id, email } = body;
      if (!user_id || !email) {
        return NextResponse.json({ error: "user_id and email are required" }, { status: 400 });
      }

      const cleanEmail = String(email).trim().toLowerCase();
      if (!cleanEmail.includes("@") || !cleanEmail.includes(".") || cleanEmail.includes("@student.studyroom")) {
        return NextResponse.json({ error: "Please provide a valid, authentic email address." }, { status: 400 });
      }

      try {
        const { error: rpcErr } = await (auth.supabase as unknown as RpcCaller).rpc("rpc_admin_update_user_email", {
          p_user_id: user_id,
          p_email: cleanEmail,
          p_admin_email: auth.user?.email || "studyaliveapp@gmail.com",
        });

        if (rpcErr) {
          const { error: updateErr } = await (auth.supabase as any)
            .from("users")
            .update({ email: cleanEmail })
            .eq("id", user_id);

          if (updateErr) {
            throw updateErr;
          }
        }

        return NextResponse.json({
          success: true,
          user_id,
          email: cleanEmail,
          message: "Student email updated successfully.",
        });
      } catch (err: any) {
        return NextResponse.json({ error: err?.message || "Failed to update email" }, { status: 500 });
      }
    }

    // C. Sync All Emails from Supabase Auth
    if (action === "sync_auth_emails") {
      let syncedCount = 0;
      let syncError: string | null = null;

      try {
        const { data, error } = await (auth.supabase as unknown as RpcCaller).rpc("rpc_admin_sync_auth_emails", {
          p_admin_email: auth.user?.email || "studyaliveapp@gmail.com",
        });
        if (!error) {
          syncedCount = (data as any)?.synced_count ?? 0;
        } else if (error) {
          syncError = error.message;
        }
      } catch (err: any) {
        syncError = err?.message;
      }

      if (syncError) {
        return NextResponse.json({
          success: false,
          error: "To sync emails directly from auth.users, execute the SQL migration in your Supabase SQL Editor.",
          details: syncError,
        }, { status: 400 });
      }

      return NextResponse.json({
        success: true,
        syncedCount,
        message: "Successfully synchronized member emails from Supabase Authentication.",
      });
    }

    // Check mailer setup for email dispatch actions
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

    // B. Send Test Email
    if (action === "send_test") {
      const { to, name, type, consecutiveDays, weeklyHours } = body;
      if (!to || !type) {
        return NextResponse.json({ error: "Recipient 'to' and 'type' are required for test email" }, { status: 400 });
      }

      const cleanTo = String(to).trim();
      if (cleanTo.includes("@student.studyroom") || !cleanTo.includes("@") || !cleanTo.includes(".")) {
        return NextResponse.json({ error: "Invalid recipient email address: Must be a valid email." }, { status: 400 });
      }

      const result = await sendAlertEmail({
        to: cleanTo,
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
        recipient: cleanTo,
      });
    }

    // C. Send Batch Alerts
    if (action === "send_batch") {
      const { candidates } = body;
      if (!Array.isArray(candidates) || candidates.length === 0) {
        return NextResponse.json({ error: "candidates must be a non-empty array" }, { status: 400 });
      }

      const results = [];

      for (const item of candidates) {
        const { candidate_id, user_id, user_name, user_email, alert_type, consecutive_inactive_days, reason, past_week_study_minutes } = item;

        // Reject any placeholder email
        const cleanEmail = (user_email || "").trim();
        if (!cleanEmail || cleanEmail.includes("@student.studyroom") || !cleanEmail.includes("@") || !cleanEmail.includes(".")) {
          results.push({
            candidate_id,
            user_id,
            user_name,
            user_email: cleanEmail,
            alert_type,
            success: false,
            emailSent: false,
            dbLogged: false,
            error: "Cannot send alert: Student has no authentic signup email registered.",
            emailError: "No authentic signup email registered.",
            dbError: null,
            messageId: null,
          });
          continue;
        }

        // Attempt dispatch via Google SMTP
        const sendResult = await sendAlertEmail({
          to: cleanEmail,
          name: user_name,
          type: alert_type as AlertType,
          consecutiveDays: consecutive_inactive_days,
          weeklyHours: Math.round((past_week_study_minutes || 0) / 60),
          isTest: false,
        });

        const status = sendResult.success ? "sent" : "failed";
        const emailErrorMsg = sendResult.error || null;
        let dbLogErr: string | null = null;

        // 1. Try logging result via RPC
        let loggedViaRpc = false;
        try {
          const { error: rpcLogErr } = await (auth.supabase as unknown as RpcCaller).rpc("rpc_admin_log_alert_result", {
            p_user_id: user_id,
            p_user_name: user_name,
            p_user_email: cleanEmail,
            p_alert_type: alert_type,
            p_status: status,
            p_consecutive_days: consecutive_inactive_days || 0,
            p_reason: reason || "",
            p_error_message: emailErrorMsg,
          });
          if (!rpcLogErr) {
            loggedViaRpc = true;
          } else {
            dbLogErr = rpcLogErr.message || JSON.stringify(rpcLogErr);
          }
        } catch (e: any) {
          loggedViaRpc = false;
          dbLogErr = e?.message || "RPC log call failed";
        }

        // 2. Direct table fallback if RPC didn't log
        if (!loggedViaRpc) {
          try {
            const { error: insertErr } = await (auth.supabase as any).from("user_alerts").insert({
              user_id,
              user_name,
              user_email: cleanEmail,
              alert_type,
              status,
              consecutive_inactive_days: consecutive_inactive_days || 0,
              reason: reason || "",
              error_message: emailErrorMsg,
              sent_at: status === "sent" ? new Date().toISOString() : null,
            });

            if (insertErr) {
              dbLogErr = insertErr.message || JSON.stringify(insertErr);
              console.error("Direct table log failed:", insertErr);
            } else {
              dbLogErr = null; // Direct insert succeeded!
            }
          } catch (dbErr: any) {
            console.error("Direct table log exception:", dbErr);
            dbLogErr = dbErr?.message || "Direct DB insert exception";
          }
        }

        // 3. Update public.users aggregated stats whenever email was sent via SMTP
        if (sendResult.success && !loggedViaRpc) {
          try {
            const { data: userData } = await (auth.supabase as any)
              .from("users")
              .select("total_alerts_sent, alert_counts")
              .eq("id", user_id)
              .maybeSingle();

            const prevCounts = userData?.alert_counts || { A: 0, W: 0, I: 0, D: 0 };
            const updatedCounts = {
              ...prevCounts,
              [alert_type]: (prevCounts[alert_type] || 0) + 1,
            };

            await (auth.supabase as any)
              .from("users")
              .update({
                total_alerts_sent: (userData?.total_alerts_sent || 0) + 1,
                alert_counts: updatedCounts,
                last_alert_sent_at: new Date().toISOString(),
                last_alert_type: alert_type,
              })
              .eq("id", user_id);
          } catch (statErr) {
            console.error("Failed to update user aggregated counts:", statErr);
          }
        }

        const isFullySuccessful = sendResult.success && !dbLogErr;
        let formattedError: string | null = null;
        if (!sendResult.success) {
          formattedError = emailErrorMsg || "Email delivery failed via SMTP";
        } else if (dbLogErr) {
          formattedError = `Email delivered to inbox, but DB audit log failed: ${dbLogErr}`;
        }

        results.push({
          candidate_id,
          user_id,
          user_name,
          user_email: cleanEmail,
          alert_type,
          success: isFullySuccessful,
          emailSent: sendResult.success,
          dbLogged: !dbLogErr,
          error: formattedError,
          emailError: emailErrorMsg,
          dbError: dbLogErr,
          messageId: sendResult.messageId,
        });
      }

      const totalSent = results.filter((r) => r.emailSent).length;
      const totalLogged = results.filter((r) => r.dbLogged).length;
      const totalFailed = results.filter((r) => !r.emailSent).length;
      const totalDbErrors = results.filter((r) => Boolean(r.dbError)).length;
      const hasConstraintViolation = results.some((r) =>
        r.dbError?.includes("user_alerts_alert_type_check") ||
        r.error?.includes("user_alerts_alert_type_check")
      );

      return NextResponse.json({
        success: totalFailed === 0 && totalDbErrors === 0,
        hasErrors: totalFailed > 0 || totalDbErrors > 0,
        hasConstraintViolation,
        totalRequested: candidates.length,
        totalSent,
        totalLogged,
        totalFailed,
        totalDbErrors,
        results,
      });
    }

    // D. Repair Alert Constraints via RPC
    if (action === "repair_constraints") {
      try {
        const { data, error } = await (auth.supabase as unknown as RpcCaller).rpc("rpc_admin_repair_alert_constraints", {
          p_admin_email: auth.user?.email || "studyaliveapp@gmail.com",
        });

        if (error) {
          return NextResponse.json({
            success: false,
            error: error.message,
            sqlFix: `ALTER TABLE public.user_alerts DROP CONSTRAINT IF EXISTS user_alerts_alert_type_check;\nALTER TABLE public.user_alerts ADD CONSTRAINT user_alerts_alert_type_check CHECK (alert_type IN ('A', 'I', 'D', 'W'));`
          }, { status: 400 });
        }

        return NextResponse.json({
          success: true,
          message: "Database alert constraints verified and repaired successfully.",
          data,
        });
      } catch (err: any) {
        return NextResponse.json({
          success: false,
          error: err?.message || "Failed to execute constraint repair",
          sqlFix: `ALTER TABLE public.user_alerts DROP CONSTRAINT IF EXISTS user_alerts_alert_type_check;\nALTER TABLE public.user_alerts ADD CONSTRAINT user_alerts_alert_type_check CHECK (alert_type IN ('A', 'I', 'D', 'W'));`
        }, { status: 500 });
      }
    }

    // D. Process Monday Achiever Email (Manual or Automated)
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
