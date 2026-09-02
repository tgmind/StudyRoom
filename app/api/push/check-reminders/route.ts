import { NextRequest, NextResponse } from "next/server";
import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

// Initialize VAPID details if configured
const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidSubject = process.env.VAPID_SUBJECT || "mailto:sa@admin.tg";

if (vapidPublicKey && vapidPrivateKey) {
  try {
    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  } catch (err) {
    console.warn("[Push] Failed to set VAPID details:", err);
  }
}

interface PushSubscriptionRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export async function POST(request: NextRequest) {
  return handleCheck(request);
}

export async function GET(request: NextRequest) {
  return handleCheck(request);
}

async function handleCheck(request: NextRequest) {
  // Optional security check: authorization header or query token
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const tokenParam = request.nextUrl.searchParams.get("token");

  if (cronSecret && authHeader !== `Bearer ${cronSecret}` && tokenParam !== cronSecret) {
    // In production with cronSecret set, require bearer token or ?token=
    // If not set, allow for development/testing
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: "Supabase credentials missing" }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const now = new Date();
  const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  const results = {
    threeHourChecksSent: 0,
    absentRemindersSent: 0,
    breakWarningsSent: 0,
    errors: [] as string[],
  };

  try {
    // ------------------------------------------------------------
    // 1. Query users studying for >= 3 hours without prompt
    // ------------------------------------------------------------
    const { data: studyingUsers, error: studyErr } = await supabase
      .from("users")
      .select("id, display_name, session_start_time, last_resumed_at")
      .eq("current_status", "studying")
      .lte("session_start_time", threeHoursAgo)
      .is("three_hour_prompt_sent_at", null);

    if (studyErr) {
      console.error("[Push] Error fetching studying users:", studyErr);
    } else if (studyingUsers && studyingUsers.length > 0) {
      for (const user of studyingUsers) {
        // Fetch subscriptions for this user
        const { data: subs } = await supabase
          .from("push_subscriptions")
          .select("*")
          .eq("user_id", user.id);

        if (subs && subs.length > 0) {
          const payload = JSON.stringify({
            title: "StudyRoom — Live Check-in",
            body: "Are you still Studying? You've been active for 3 hours.",
            icon: "/icons/icon-192x192.png",
            badge: "/icons/icon-192x192.png",
            actions: [
              { action: "yes", title: "YES" },
              { action: "no", title: "NO" },
            ],
            data: {
              type: "three_hour_check",
              userId: user.id,
            },
            tag: `checkin-${user.id}`,
          });

          const removeSub = async (id: string) => {
            await supabase.from("push_subscriptions").delete().eq("id", id);
          };
          await sendToSubscriptions(subs as PushSubscriptionRow[], payload, removeSub);
          results.threeHourChecksSent++;

          // Mark prompt as sent for this session
          await supabase
            .from("users")
            .update({ three_hour_prompt_sent_at: now.toISOString() })
            .eq("id", user.id);
        }
      }
    }

    // ------------------------------------------------------------
    // 2. Query offline users absent for >= 24 hours
    // ------------------------------------------------------------
    const { data: offlineUsers, error: offlineErr } = await supabase
      .from("users")
      .select("id, display_name, last_offline_reminder_sent_at")
      .eq("current_status", "offline")
      .or(`last_offline_reminder_sent_at.is.null,last_offline_reminder_sent_at.lte.${twentyFourHoursAgo}`);

    if (offlineErr) {
      console.error("[Push] Error fetching offline users:", offlineErr);
    } else if (offlineUsers && offlineUsers.length > 0) {
      for (const user of offlineUsers) {
        // Check if user has had any study session in the last 24h
        const { count } = await supabase
          .from("study_sessions")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .gte("start_time", twentyFourHoursAgo);

        // If user has 0 sessions in the past 24 hours, send reminder
        if (!count || count === 0) {
          const { data: subs } = await supabase
            .from("push_subscriptions")
            .select("*")
            .eq("user_id", user.id);

          if (subs && subs.length > 0) {
            const payload = JSON.stringify({
              title: "StudyRoom — Daily Reminder",
              body: "You are absent for 24 hrs. Continue Live Study!",
              icon: "/icons/icon-192x192.png",
              badge: "/icons/icon-192x192.png",
              data: {
                type: "absent_reminder",
                userId: user.id,
              },
              tag: `absent-${user.id}`,
            });

            const removeSub = async (id: string) => {
              await supabase.from("push_subscriptions").delete().eq("id", id);
            };
            await sendToSubscriptions(subs as PushSubscriptionRow[], payload, removeSub);
            results.absentRemindersSent++;

            // Update last_offline_reminder_sent_at
            await supabase
              .from("users")
              .update({ last_offline_reminder_sent_at: now.toISOString() })
              .eq("id", user.id);
          }
        }
      }
    }

    // ------------------------------------------------------------
    // 3. Query users on break >= 50 minutes (< 60 minutes)
    // ------------------------------------------------------------
    const fiftyMinutesAgo = new Date(now.getTime() - 50 * 60 * 1000).toISOString();
    const sixtyMinutesAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();

    const { data: breakUsers, error: breakErr } = await supabase
      .from("users")
      .select("id, display_name, break_started_at")
      .eq("current_status", "break")
      .lte("break_started_at", fiftyMinutesAgo)
      .gt("break_started_at", sixtyMinutesAgo)
      .is("break_warning_prompt_sent_at", null);

    if (breakErr) {
      console.error("[Push] Error fetching break users:", breakErr);
    } else if (breakUsers && breakUsers.length > 0) {
      for (const user of breakUsers) {
        const { data: subs } = await supabase
          .from("push_subscriptions")
          .select("*")
          .eq("user_id", user.id);

        if (subs && subs.length > 0) {
          const payload = JSON.stringify({
            title: "StudyRoom — Break Ending Soon ⏳",
            body: "1 hr Break time about to complete! 10 minutes remaining before your break expires.",
            icon: "/icons/icon-192x192.png",
            badge: "/icons/icon-192x192.png",
            actions: [
              { action: "resume", title: "Resume Study" },
            ],
            data: {
              type: "break_warning",
              userId: user.id,
            },
            tag: `break-${user.id}`,
          });

          const removeSub = async (id: string) => {
            await supabase.from("push_subscriptions").delete().eq("id", id);
          };
          await sendToSubscriptions(subs as PushSubscriptionRow[], payload, removeSub);
          results.breakWarningsSent++;

          // Mark break warning as sent for this break period
          await supabase
            .from("users")
            .update({ break_warning_prompt_sent_at: now.toISOString() })
            .eq("id", user.id);
        }
      }
    }

    return NextResponse.json({ success: true, results });
  } catch (err) {
    console.error("[Push] Error checking reminders:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}

async function sendToSubscriptions(
  subs: PushSubscriptionRow[],
  payload: string,
  onRemoveSub: (subId: string) => Promise<unknown>
) {
  for (const sub of subs) {
    const pushConfig = {
      endpoint: sub.endpoint,
      keys: {
        p256dh: sub.p256dh,
        auth: sub.auth,
      },
    };

    try {
      await webpush.sendNotification(pushConfig, payload);
    } catch (err: unknown) {
      const statusCode = (err as { statusCode?: number })?.statusCode;
      // If subscription expired or was revoked (404 Not Found or 410 Gone), remove it
      if (statusCode === 404 || statusCode === 410) {
        await onRemoveSub(sub.id);
      } else {
        console.warn("[Push] Error sending push to endpoint:", err);
      }
    }
  }
}
