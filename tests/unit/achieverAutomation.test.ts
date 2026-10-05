import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  isMondayInTimezone,
  getMondayDateString,
  processWeeklyAchieverAutomation,
} from "@/lib/email/achieverAutomation";
import * as mailer from "@/lib/email/mailer";

describe("Weekly Achiever Automation Unit Tests", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("accurately detects Mondays in Asia/Kolkata timezone", () => {
    // 2026-09-14 is Monday
    const monday = new Date("2026-09-14T10:00:00Z");
    expect(isMondayInTimezone(monday, "Asia/Kolkata")).toBe(true);

    // 2026-09-15 is Tuesday
    const tuesday = new Date("2026-09-15T10:00:00Z");
    expect(isMondayInTimezone(tuesday, "Asia/Kolkata")).toBe(false);

    // 2026-09-13 is Sunday
    const sunday = new Date("2026-09-13T10:00:00Z");
    expect(isMondayInTimezone(sunday, "Asia/Kolkata")).toBe(false);
  });

  it("computes the correct Monday week date string", () => {
    // Monday itself
    const monday = new Date("2026-09-14T05:00:00Z");
    expect(getMondayDateString(monday, "Asia/Kolkata")).toBe("2026-09-14");

    // Thursday of the same week resolves to Monday 2026-09-14
    const thursday = new Date("2026-09-17T12:00:00Z");
    expect(getMondayDateString(thursday, "Asia/Kolkata")).toBe("2026-09-14");
  });

  it("skips execution on non-Mondays when not forced", async () => {
    const tuesday = new Date("2026-09-15T10:00:00Z");
    vi.setSystemTime(tuesday);

    const result = await processWeeklyAchieverAutomation({
      force: false,
      timezone: "Asia/Kolkata",
    });

    expect(result.success).toBe(true);
    expect(result.processed).toBe(false);
    expect(result.skipped).toBe(true);
    expect(result.isMonday).toBe(false);
    expect(result.reason).toContain("Today is not Monday");

    vi.useRealTimers();
  });

  it("fails gracefully if mailer is not configured", async () => {
    vi.spyOn(mailer, "isMailerConfigured").mockReturnValue({
      configured: false,
      reason: "Missing ALERT_GMAIL_USER",
    });

    const result = await processWeeklyAchieverAutomation({
      force: true,
      timezone: "Asia/Kolkata",
    });

    expect(result.success).toBe(false);
    expect(result.processed).toBe(false);
    expect(result.error).toContain("Missing ALERT_GMAIL_USER");
  });

  it("deduplicates and prevents multiple sends in the same week", async () => {
    vi.spyOn(mailer, "isMailerConfigured").mockReturnValue({
      configured: true,
      user: "studyaliveapp@gmail.com",
    });

    // Mock Supabase client returning an existing Type A alert for this week
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              gte: vi.fn().mockResolvedValue({
                data: [{ id: "alert-1", sent_at: "2026-09-14T06:00:00Z", user_name: "Ritesh" }],
                error: null,
              }),
            }),
          }),
        }),
      }),
      rpc: vi.fn(),
    };

    const result = await processWeeklyAchieverAutomation({
      force: false,
      timezone: "Asia/Kolkata",
      now: new Date("2026-09-14T10:00:00Z"), // Monday
      supabaseOverride: mockSupabase,
    });

    expect(result.success).toBe(true);
    expect(result.processed).toBe(false);
    expect(result.skipped).toBe(true);
    expect(result.alreadySentThisWeek).toBe(true);
    expect(result.reason).toContain("already dispatched for Monday");
  });

  it("dispatches Achiever Congratulations email when eligible on Monday", async () => {
    vi.spyOn(mailer, "isMailerConfigured").mockReturnValue({
      configured: true,
      user: "studyaliveapp@gmail.com",
    });

    const sendSpy = vi.spyOn(mailer, "sendAlertEmail").mockResolvedValue({
      success: true,
      messageId: "<test-achiever-msg@gmail.com>",
    });

    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              gte: vi.fn().mockResolvedValue({
                data: [], // No previous alert sent this week
                error: null,
              }),
            }),
          }),
        }),
      }),
      rpc: vi.fn().mockImplementation((fnName: string) => {
        if (fnName === "rpc_get_current_weekly_achiever") {
          return Promise.resolve({
            data: [
              {
                user_id: "user-ritesh",
                display_name: "Ritesh",
                email: "ritesh@test.com",
                already_sent_this_week: false,
              },
            ],
            error: null,
          });
        }
        if (fnName === "rpc_admin_log_alert_result") {
          return Promise.resolve({ data: "logged-uuid-1", error: null });
        }
        return Promise.resolve({ data: null, error: null });
      }),
    };

    const result = await processWeeklyAchieverAutomation({
      force: false,
      now: new Date("2026-09-14T10:00:00Z"),
      timezone: "Asia/Kolkata",
      supabaseOverride: mockSupabase,
    });

    expect(result.success).toBe(true);
    expect(result.processed).toBe(true);
    expect(result.winner?.name).toBe("Ritesh");
    expect(result.winner?.email).toBe("ritesh@test.com");
    expect(result.messageId).toBe("<test-achiever-msg@gmail.com>");
    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "ritesh@test.com",
        name: "Ritesh",
        type: "A",
        isTest: false,
      })
    );
  });

  it("correctly aggregates mail counts and types per user", () => {
    const rawAlerts = [
      { user_id: "u1", alert_type: "A", status: "sent", sent_at: "2026-09-01T10:00:00Z" },
      { user_id: "u1", alert_type: "W", status: "sent", sent_at: "2026-09-08T10:00:00Z" },
      { user_id: "u1", alert_type: "I", status: "sent", sent_at: "2026-09-12T10:00:00Z" },
      { user_id: "u1", alert_type: "D", status: "failed", sent_at: null },
      { user_id: "u2", alert_type: "D", status: "sent", sent_at: "2026-09-14T10:00:00Z" },
    ];

    const userStats: Record<string, { total: number; A: number; W: number; I: number; D: number }> = {};
    rawAlerts.forEach((a) => {
      if (a.status === "sent") {
        if (!userStats[a.user_id]) {
          userStats[a.user_id] = { total: 0, A: 0, W: 0, I: 0, D: 0 };
        }
        userStats[a.user_id].total += 1;
        if (a.alert_type === "A") userStats[a.user_id].A += 1;
        if (a.alert_type === "W") userStats[a.user_id].W += 1;
        if (a.alert_type === "I") userStats[a.user_id].I += 1;
        if (a.alert_type === "D") userStats[a.user_id].D += 1;
      }
    });

    expect(userStats["u1"]).toEqual({ total: 3, A: 1, W: 1, I: 1, D: 0 });
    expect(userStats["u2"]).toEqual({ total: 1, A: 0, W: 0, I: 0, D: 1 });
  });

  describe("Atomic Deduplication & Concurrency Race Protection", () => {
    it("prevents double dispatch race condition when two workers execute concurrently", async () => {
      vi.spyOn(mailer, "isMailerConfigured").mockReturnValue({
        configured: true,
        user: "studyaliveapp@gmail.com",
      });

      const sendSpy = vi.spyOn(mailer, "sendAlertEmail").mockResolvedValue({
        success: true,
        messageId: "<race-test-msg@gmail.com>",
      });

      let claimCount = 0;
      const completedCalls: Array<{ p_alert_id: string; p_status: string }> = [];

      const createMockSupabase = () => ({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                gte: vi.fn().mockResolvedValue({
                  data: [], // No sent alerts in user_alerts table yet (the exact race condition!)
                  error: null,
                }),
              }),
            }),
          }),
        }),
        rpc: vi.fn().mockImplementation((fnName: string, params: any) => {
          if (fnName === "rpc_get_current_weekly_achiever") {
            return Promise.resolve({
              data: [
                {
                  user_id: "user-winner-1",
                  display_name: "Winner User",
                  email: "winner@example.com",
                  already_sent_this_week: false,
                },
              ],
              error: null,
            });
          }
          if (fnName === "rpc_claim_weekly_achiever_alert") {
            claimCount++;
            if (claimCount === 1) {
              // Worker 1 wins the atomic claim
              return Promise.resolve({
                data: {
                  claimed: true,
                  status: "claimed",
                  alert_id: "claim-uuid-worker-1",
                },
                error: null,
              });
            } else {
              // Worker 2 arrives while Worker 1 is in progress; claim denied!
              return Promise.resolve({
                data: {
                  claimed: false,
                  status: "in_progress",
                  alert_id: "claim-uuid-worker-1",
                  reason: "Achiever email claim is currently in progress by another worker",
                },
                error: null,
              });
            }
          }
          if (fnName === "rpc_complete_weekly_achiever_alert") {
            completedCalls.push({
              p_alert_id: params.p_alert_id,
              p_status: params.p_status,
            });
            return Promise.resolve({
              data: { success: true, alert_id: params.p_alert_id, status: params.p_status },
              error: null,
            });
          }
          return Promise.resolve({ data: null, error: null });
        }),
      });

      // Both workers run simultaneously for the same Monday
      const [res1, res2] = await Promise.all([
        processWeeklyAchieverAutomation({
          force: false,
          now: new Date("2026-09-14T10:00:00Z"),
          timezone: "Asia/Kolkata",
          supabaseOverride: createMockSupabase(),
        }),
        processWeeklyAchieverAutomation({
          force: false,
          now: new Date("2026-09-14T10:00:00Z"),
          timezone: "Asia/Kolkata",
          supabaseOverride: createMockSupabase(),
        }),
      ]);

      // Worker 1 succeeded in sending
      expect(res1.success).toBe(true);
      expect(res1.processed).toBe(true);
      expect(res1.messageId).toBe("<race-test-msg@gmail.com>");

      // Worker 2 was safely serialized and skipped without dispatching email
      expect(res2.success).toBe(true);
      expect(res2.processed).toBe(false);
      expect(res2.skipped).toBe(true);
      expect(res2.reason).toContain("in progress by another worker");

      // Email was dispatched EXACTLY ONCE
      expect(sendSpy).toHaveBeenCalledTimes(1);

      // Claim was completed as 'sent'
      expect(completedCalls).toEqual([
        { p_alert_id: "claim-uuid-worker-1", p_status: "sent" },
      ]);
    });

    it("skips dispatch if atomic claim indicates email was already_sent", async () => {
      vi.spyOn(mailer, "isMailerConfigured").mockReturnValue({
        configured: true,
        user: "studyaliveapp@gmail.com",
      });

      const sendSpy = vi.spyOn(mailer, "sendAlertEmail");

      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                gte: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          }),
        }),
        rpc: vi.fn().mockImplementation((fnName: string) => {
          if (fnName === "rpc_get_current_weekly_achiever") {
            return Promise.resolve({
              data: [
                {
                  user_id: "user-winner-1",
                  display_name: "Winner User",
                  email: "winner@example.com",
                  already_sent_this_week: false,
                },
              ],
              error: null,
            });
          }
          if (fnName === "rpc_claim_weekly_achiever_alert") {
            return Promise.resolve({
              data: {
                claimed: false,
                status: "already_sent",
                reason: "Achiever email already dispatched for week 2026-09-14",
              },
              error: null,
            });
          }
          return Promise.resolve({ data: null, error: null });
        }),
      };

      const result = await processWeeklyAchieverAutomation({
        force: false,
        now: new Date("2026-09-14T10:00:00Z"),
        timezone: "Asia/Kolkata",
        supabaseOverride: mockSupabase,
      });

      expect(result.success).toBe(true);
      expect(result.processed).toBe(false);
      expect(result.skipped).toBe(true);
      expect(result.alreadySentThisWeek).toBe(true);
      expect(result.reason).toContain("already dispatched");
      expect(sendSpy).not.toHaveBeenCalled();
    });

    it("records status=failed when sendAlertEmail fails, allowing future retry", async () => {
      vi.spyOn(mailer, "isMailerConfigured").mockReturnValue({
        configured: true,
        user: "studyaliveapp@gmail.com",
      });

      vi.spyOn(mailer, "sendAlertEmail").mockResolvedValue({
        success: false,
        error: "SMTP connection timeout",
      });

      const completedCalls: any[] = [];
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                gte: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          }),
        }),
        rpc: vi.fn().mockImplementation((fnName: string, params: any) => {
          if (fnName === "rpc_get_current_weekly_achiever") {
            return Promise.resolve({
              data: [
                {
                  user_id: "user-winner-1",
                  display_name: "Winner User",
                  email: "winner@example.com",
                  already_sent_this_week: false,
                },
              ],
              error: null,
            });
          }
          if (fnName === "rpc_claim_weekly_achiever_alert") {
            return Promise.resolve({
              data: { claimed: true, status: "claimed", alert_id: "claim-fail-uuid" },
              error: null,
            });
          }
          if (fnName === "rpc_complete_weekly_achiever_alert") {
            completedCalls.push(params);
            return Promise.resolve({ data: { success: true }, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        }),
      };

      const result = await processWeeklyAchieverAutomation({
        force: false,
        now: new Date("2026-09-14T10:00:00Z"),
        timezone: "Asia/Kolkata",
        supabaseOverride: mockSupabase,
      });

      expect(result.success).toBe(false);
      expect(result.processed).toBe(false);
      expect(result.error).toContain("SMTP connection timeout");
      expect(completedCalls).toEqual([
        {
          p_alert_id: "claim-fail-uuid",
          p_status: "failed",
          p_error_message: "SMTP connection timeout",
        },
      ]);
    });

    it("reclaims stale pending claims older than 5 minutes", async () => {
      vi.spyOn(mailer, "isMailerConfigured").mockReturnValue({
        configured: true,
        user: "studyaliveapp@gmail.com",
      });

      const sendSpy = vi.spyOn(mailer, "sendAlertEmail").mockResolvedValue({
        success: true,
        messageId: "<reclaimed-msg@gmail.com>",
      });

      const completedCalls: any[] = [];
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                gte: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          }),
        }),
        rpc: vi.fn().mockImplementation((fnName: string, params: any) => {
          if (fnName === "rpc_get_current_weekly_achiever") {
            return Promise.resolve({
              data: [
                {
                  user_id: "user-winner-1",
                  display_name: "Winner User",
                  email: "winner@example.com",
                  already_sent_this_week: false,
                },
              ],
              error: null,
            });
          }
          if (fnName === "rpc_claim_weekly_achiever_alert") {
            // Server reclaimed a stale pending row
            return Promise.resolve({
              data: {
                claimed: true,
                status: "reclaimed",
                alert_id: "stale-claim-uuid-reclaimed",
              },
              error: null,
            });
          }
          if (fnName === "rpc_complete_weekly_achiever_alert") {
            completedCalls.push(params);
            return Promise.resolve({ data: { success: true }, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        }),
      };

      const result = await processWeeklyAchieverAutomation({
        force: false,
        now: new Date("2026-09-14T10:00:00Z"),
        timezone: "Asia/Kolkata",
        supabaseOverride: mockSupabase,
      });

      expect(result.success).toBe(true);
      expect(result.processed).toBe(true);
      expect(result.messageId).toBe("<reclaimed-msg@gmail.com>");
      expect(sendSpy).toHaveBeenCalledTimes(1);
      expect(completedCalls).toEqual([
        {
          p_alert_id: "stale-claim-uuid-reclaimed",
          p_status: "sent",
          p_error_message: null,
        },
      ]);
    });

    it("handles concurrent conflict gracefully when two workers race during initial insert", async () => {
      vi.spyOn(mailer, "isMailerConfigured").mockReturnValue({
        configured: true,
        user: "studyaliveapp@gmail.com",
      });

      const sendSpy = vi.spyOn(mailer, "sendAlertEmail");

      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                gte: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          }),
        }),
        rpc: vi.fn().mockImplementation((fnName: string) => {
          if (fnName === "rpc_get_current_weekly_achiever") {
            return Promise.resolve({
              data: [
                {
                  user_id: "user-winner-1",
                  display_name: "Winner User",
                  email: "winner@example.com",
                  already_sent_this_week: false,
                },
              ],
              error: null,
            });
          }
          if (fnName === "rpc_claim_weekly_achiever_alert") {
            return Promise.resolve({
              data: {
                claimed: false,
                status: "concurrent_conflict",
                reason: "Another process claimed the weekly achiever alert simultaneously",
              },
              error: null,
            });
          }
          return Promise.resolve({ data: null, error: null });
        }),
      };

      const result = await processWeeklyAchieverAutomation({
        force: false,
        now: new Date("2026-09-14T10:00:00Z"),
        timezone: "Asia/Kolkata",
        supabaseOverride: mockSupabase,
      });

      expect(result.success).toBe(true);
      expect(result.processed).toBe(false);
      expect(result.skipped).toBe(true);
      expect(result.reason).toContain("claimed the weekly achiever alert simultaneously");
      expect(sendSpy).not.toHaveBeenCalled();
    });
  });
});
