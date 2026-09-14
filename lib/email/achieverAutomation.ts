import { getWeekStartTimestamp } from "@/lib/time/format";
import { isMailerConfigured, sendAlertEmail } from "@/lib/email/mailer";
import { createClient as createServerClient } from "@/lib/supabase/server";

export interface AchieverAutomationResult {
  success: boolean;
  processed: boolean;
  skipped?: boolean;
  alreadySentThisWeek?: boolean;
  reason?: string;
  weekKey?: string;
  winner?: {
    id: string;
    name: string;
    email: string;
  } | null;
  messageId?: string;
  error?: string;
  isMonday?: boolean;
}

type RpcCaller = {
  rpc: (name: string, params?: Record<string, unknown>) => Promise<{ data: unknown; error: Error | null }>;
};

/**
 * Returns true if the given date is Monday in the specified timezone (e.g. "Asia/Kolkata").
 */
export function isMondayInTimezone(
  date: Date = new Date(),
  timezone: string = process.env.NEXT_PUBLIC_APP_TIMEZONE || "Asia/Kolkata"
): boolean {
  try {
    const weekday = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
    }).format(date);
    return weekday === "Mon";
  } catch {
    // Fallback: UTC day 1 = Monday
    return date.getUTCDay() === 1;
  }
}

/**
 * Returns the Monday date string (e.g. "2026-09-14") for the week of the given date in the target timezone.
 */
export function getMondayDateString(
  date: Date = new Date(),
  timezone: string = process.env.NEXT_PUBLIC_APP_TIMEZONE || "Asia/Kolkata"
): string {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
    });
    const parts = formatter.formatToParts(date);
    const getPart = (type: string) => parts.find((p) => p.type === type)?.value || "";

    const year = parseInt(getPart("year"), 10);
    const month = parseInt(getPart("month"), 10);
    const day = parseInt(getPart("day"), 10);
    const weekday = getPart("weekday");

    const dayMap: Record<string, number> = {
      Mon: 0,
      Tue: 1,
      Wed: 2,
      Thu: 3,
      Fri: 4,
      Sat: 5,
      Sun: 6,
    };
    const daysSinceMonday = dayMap[weekday] ?? 0;
    const mondayDate = new Date(Date.UTC(year, month - 1, day));
    mondayDate.setUTCDate(mondayDate.getUTCDate() - daysSinceMonday);

    const pad = (n: number) => String(n).padStart(2, "0");
    return `${mondayDate.getUTCFullYear()}-${pad(mondayDate.getUTCMonth() + 1)}-${pad(mondayDate.getUTCDate())}`;
  } catch {
    return date.toISOString().split("T")[0];
  }
}

/**
 * Processes the Weekly Achiever Congratulation Email on Monday.
 *
 * Rules:
 * 1. Automatically detects Monday (when leaderboard & data reset).
 * 2. Strictly ONCE PER WEEK on Mondays (checks if Type A email was already sent this week).
 * 3. Idempotent: Can be called multiple times safely without sending duplicate emails.
 * 4. Updates audit log (user_alerts) and per-user tracking counts.
 */
export async function processWeeklyAchieverAutomation(options?: {
  force?: boolean;
  timezone?: string;
  supabaseOverride?: unknown;
}): Promise<AchieverAutomationResult> {
  const timezone = options?.timezone || process.env.NEXT_PUBLIC_APP_TIMEZONE || "Asia/Kolkata";
  const now = new Date();
  const isMonday = isMondayInTimezone(now, timezone);
  const weekKey = getMondayDateString(now, timezone);
  const weekStartMs = getWeekStartTimestamp(now, timezone);
  const weekStartIso = new Date(weekStartMs).toISOString();

  // 1. If not Monday and not force-triggered, skip safely
  if (!isMonday && !options?.force) {
    return {
      success: true,
      processed: false,
      skipped: true,
      reason: `Today is not Monday in timezone ${timezone}. Weekly achiever alert runs on Mondays.`,
      isMonday: false,
      weekKey,
    };
  }

  // 2. Check mailer configuration
  const mailerStatus = isMailerConfigured();
  if (!mailerStatus.configured) {
    return {
      success: false,
      processed: false,
      error: mailerStatus.reason || "Gmail mailer is not configured.",
      weekKey,
      isMonday,
    };
  }

  // 3. Initialize Supabase client
  const supabase = options?.supabaseOverride
    ? (options.supabaseOverride as ReturnType<typeof createServerClient> extends Promise<infer U> ? U : unknown)
    : await createServerClient();

  const rpcClient = supabase as unknown as RpcCaller;

  // 4. Check if Type A achiever email was ALREADY sent since this Monday
  try {
    const { data: recentAlerts, error: checkError } = await (supabase as unknown as {
      from: (t: string) => {
        select: (cols: string) => {
          eq: (col: string, val: string) => {
            eq: (col2: string, val2: string) => {
              gte: (col3: string, val3: string) => Promise<{ data: unknown[] | null; error: Error | null }>;
            };
          };
        };
      };
    })
      .from("user_alerts")
      .select("id, sent_at, user_name, user_email")
      .eq("alert_type", "A")
      .eq("status", "sent")
      .gte("sent_at", weekStartIso);

    if (!checkError && Array.isArray(recentAlerts) && recentAlerts.length > 0) {
      if (!options?.force) {
        return {
          success: true,
          processed: false,
          skipped: true,
          alreadySentThisWeek: true,
          weekKey,
          reason: `Achiever congratulations email already dispatched for Monday (${weekKey}).`,
          isMonday,
        };
      }
    }
  } catch (err) {
    console.warn("Could not check recent user_alerts; proceeding with caution:", err);
  }

  // 5. Calculate or confirm weekly achiever in database
  let winnerId: string | null = null;
  let winnerName = "";
  let winnerEmail = "";

  try {
    // Attempt dedicated weekly achiever RPC
    const { data: rpcAchiever, error: rpcAchieverErr } = await rpcClient.rpc(
      "rpc_get_current_weekly_achiever",
      { p_timezone: timezone }
    );

    if (!rpcAchieverErr && Array.isArray(rpcAchiever) && rpcAchiever.length > 0) {
      const top = rpcAchiever[0] as {
        user_id: string;
        display_name: string;
        email: string;
        already_sent_this_week?: boolean;
      };

      if (top.already_sent_this_week && !options?.force) {
        return {
          success: true,
          processed: false,
          skipped: true,
          alreadySentThisWeek: true,
          weekKey,
          reason: `Achiever email already logged as sent for this week (${weekKey}).`,
          isMonday,
        };
      }

      winnerId = top.user_id;
      winnerName = top.display_name;
      winnerEmail = top.email;
    }
  } catch {
    // Fall back to general evaluation below
  }

  // Fallback: evaluate via rpc_calculate_weekly_achiever and candidates scan
  if (!winnerEmail) {
    try {
      const calcResult = await rpcClient.rpc("rpc_calculate_weekly_achiever", {
        p_timezone: timezone,
      });
      winnerId = (calcResult.data as string) || null;
    } catch (err) {
      console.warn("rpc_calculate_weekly_achiever call warning:", err);
    }

    // Fetch candidates to locate winner's display name and email
    try {
      const { data: candidates } = await rpcClient.rpc("rpc_admin_scan_alert_candidates");
      if (Array.isArray(candidates)) {
        const achieverCandidate = candidates.find(
          (c: { alert_type: string; user_id: string; has_achiever_badge: boolean }) =>
            (winnerId && c.user_id === winnerId) || c.alert_type === "A" || c.has_achiever_badge === true
        ) as { user_id: string; user_name: string; user_email: string } | undefined;

        if (achieverCandidate) {
          winnerId = achieverCandidate.user_id;
          winnerName = achieverCandidate.user_name;
          winnerEmail = achieverCandidate.user_email;
        }
      }
    } catch (err) {
      console.warn("Candidates scan fallback warning:", err);
    }
  }

  if (!winnerEmail || !winnerName) {
    return {
      success: false,
      processed: false,
      error: "No qualifying weekly achiever with a valid email address was found.",
      weekKey,
      isMonday,
    };
  }

  // 6. Send Congratulations Email (Type A)
  const sendResult = await sendAlertEmail({
    to: winnerEmail,
    name: winnerName,
    type: "A",
    isTest: false,
  });

  if (!sendResult.success) {
    // Log failure in database
    try {
      if (winnerId) {
        await rpcClient.rpc("rpc_admin_log_alert_result", {
          p_user_id: winnerId,
          p_user_name: winnerName,
          p_user_email: winnerEmail,
          p_alert_type: "A",
          p_status: "failed",
          p_consecutive_days: 0,
          p_reason: `Weekly Achiever Title: Week of ${weekKey}`,
          p_error_message: sendResult.error || "Email delivery failed",
        });
      }
    } catch {
      // ignore db logging error
    }

    return {
      success: false,
      processed: false,
      error: sendResult.error || "Failed to deliver Achiever Congratulations email.",
      weekKey,
      isMonday,
      winner: { id: winnerId || "", name: winnerName, email: winnerEmail },
    };
  }

  // 7. Log success in database & increment counts
  try {
    if (winnerId) {
      const { error: rpcLogErr } = await rpcClient.rpc("rpc_admin_log_alert_result", {
        p_user_id: winnerId,
        p_user_name: winnerName,
        p_user_email: winnerEmail,
        p_alert_type: "A",
        p_status: "sent",
        p_consecutive_days: 0,
        p_reason: `Weekly Achiever Title: Week of ${weekKey}`,
        p_error_message: null,
      });

      if (rpcLogErr && typeof (rpcClient as any).from === "function") {
        // Direct table fallback
        await (rpcClient as any).from("user_alerts").insert({
          user_id: winnerId,
          user_name: winnerName,
          user_email: winnerEmail,
          alert_type: "A",
          status: "sent",
          consecutive_inactive_days: 0,
          reason: `Weekly Achiever Title: Week of ${weekKey}`,
          error_message: null,
          sent_at: new Date().toISOString(),
        });
      }
    }
  } catch (dbErr) {
    console.warn("Could not log alert result to database:", dbErr);
  }

  return {
    success: true,
    processed: true,
    weekKey,
    isMonday,
    messageId: sendResult.messageId,
    winner: {
      id: winnerId || "",
      name: winnerName,
      email: winnerEmail,
    },
  };
}
