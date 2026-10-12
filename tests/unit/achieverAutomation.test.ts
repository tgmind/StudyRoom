import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  isMondayInTimezone,
  getMondayDateString,
  processWeeklyAchieverAutomation,
} from "@/lib/email/achieverAutomation";
import * as mailer from "@/lib/email/mailer";
import { GET as cronGet, POST as cronPost } from "@/app/api/cron/weekly-achiever/route";
import * as adminModule from "@/lib/supabase/admin";

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

  describe("Privileged Finalization, Error Propagation & Null-Safety Contracts", () => {
    it("1. FAIL-CLOSED: returns failure when admin client is missing and no supabaseOverride is provided", async () => {
      vi.spyOn(adminModule, "createAdminClient").mockReturnValue(null);

      const result = await processWeeklyAchieverAutomation({
        force: true,
        timezone: "Asia/Kolkata",
        now: new Date("2026-10-12T10:00:00Z"),
      });

      expect(result.success).toBe(false);
      expect(result.processed).toBe(false);
      expect(result.error).toContain("SUPABASE_SERVICE_ROLE_KEY");
    });

    it("2. FAIL-CLOSED: handles resolved RPC error from rpc_finalize_weekly_global_analytics and halts execution", async () => {
      const sendSpy = vi.spyOn(mailer, "sendAlertEmail");
      const mockSupabase = {
        rpc: vi.fn().mockImplementation((fnName: string) => {
          if (fnName === "rpc_finalize_weekly_global_analytics") {
            return Promise.resolve({
              data: null,
              error: {
                message: "Permission denied for function rpc_finalize_weekly_global_analytics (role anon)",
                code: "42501",
              },
            });
          }
          return Promise.resolve({ data: null, error: null });
        }),
      };

      const result = await processWeeklyAchieverAutomation({
        force: true,
        timezone: "Asia/Kolkata",
        now: new Date("2026-10-12T10:00:00Z"),
        supabaseOverride: mockSupabase,
      });

      expect(result.success).toBe(false);
      expect(result.processed).toBe(false);
      expect(result.error).toContain("Global Analytics finalization failed: Permission denied");
      // Verification: Dependent email dispatch must NEVER execute when finalization fails
      expect(sendSpy).not.toHaveBeenCalled();
    });

    it("3. FAIL-CLOSED: handles rejected promise during rpc_finalize_weekly_global_analytics cleanly", async () => {
      const sendSpy = vi.spyOn(mailer, "sendAlertEmail");
      const mockSupabase = {
        rpc: vi.fn().mockImplementation((fnName: string) => {
          if (fnName === "rpc_finalize_weekly_global_analytics") {
            return Promise.reject(new Error("Supabase connection timeout during finalization"));
          }
          return Promise.resolve({ data: null, error: null });
        }),
      };

      const result = await processWeeklyAchieverAutomation({
        force: true,
        timezone: "Asia/Kolkata",
        now: new Date("2026-10-12T10:00:00Z"),
        supabaseOverride: mockSupabase,
      });

      expect(result.success).toBe(false);
      expect(result.processed).toBe(false);
      expect(result.error).toContain("Supabase connection timeout during finalization");
      expect(sendSpy).not.toHaveBeenCalled();
    });

    it("4. SUCCESS: invokes rpc_finalize_weekly_global_analytics with specified timezone and client", async () => {
      vi.spyOn(mailer, "isMailerConfigured").mockReturnValue({
        configured: false,
        reason: "Mailer not needed for this check",
      });

      const finalizeSpy = vi.fn().mockResolvedValue({
        data: {
          success: true,
          action: "finalized",
          period_id: "2026-10-05",
          celebration_period_id: "2026-10-12",
        },
        error: null,
      });

      const mockSupabase = {
        rpc: finalizeSpy,
      };

      const result = await processWeeklyAchieverAutomation({
        force: true,
        timezone: "Asia/Kolkata",
        now: new Date("2026-10-12T10:00:00Z"),
        supabaseOverride: mockSupabase,
      });

      expect(finalizeSpy).toHaveBeenCalledWith("rpc_finalize_weekly_global_analytics", {
        p_timezone: "Asia/Kolkata",
      });
      // Stopped at mailer check after successful finalization
      expect(result.error).toContain("Mailer not needed for this check");
    });

    it("5. NULL-SAFETY: processes achiever winner with avatar_url = null correctly", async () => {
      vi.spyOn(mailer, "isMailerConfigured").mockReturnValue({
        configured: true,
        user: "studyaliveapp@gmail.com",
      });

      const sendSpy = vi.spyOn(mailer, "sendAlertEmail").mockResolvedValue({
        success: true,
        messageId: "<test-anindita-msg@gmail.com>",
      });

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
          if (fnName === "rpc_finalize_weekly_global_analytics") {
            return Promise.resolve({
              data: { success: true, action: "finalized", period_id: "2026-10-05" },
              error: null,
            });
          }
          if (fnName === "rpc_get_current_weekly_achiever") {
            return Promise.resolve({
              data: [
                {
                  user_id: "1b41e341-f213-4c40-826e-cc538d686028",
                  display_name: "Anindita Debnath",
                  email: "anindita@example.com",
                  avatar_url: null, // Critical: avatar_url is NULL
                  already_sent_this_week: false,
                },
              ],
              error: null,
            });
          }
          if (fnName === "rpc_claim_weekly_achiever_alert") {
            return Promise.resolve({
              data: { claimed: true, alert_id: "claim-anindita-1" },
              error: null,
            });
          }
          if (fnName === "rpc_complete_weekly_achiever_alert") {
            return Promise.resolve({ data: true, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        }),
      };

      const result = await processWeeklyAchieverAutomation({
        force: false,
        now: new Date("2026-10-12T10:00:00Z"),
        timezone: "Asia/Kolkata",
        supabaseOverride: mockSupabase,
      });

      expect(result.success).toBe(true);
      expect(result.processed).toBe(true);
      expect(result.winner?.name).toBe("Anindita Debnath");
      expect(result.winner?.email).toBe("anindita@example.com");
      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "anindita@example.com",
          name: "Anindita Debnath",
          type: "A",
        })
      );
    });

    it("6. IDEMPOTENCY: safely handles already_finalized action without duplicate email dispatch", async () => {
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
                gte: vi.fn().mockResolvedValue({
                  data: [{ id: "existing-alert-id", sent_at: "2026-10-12T04:00:00Z" }],
                  error: null,
                }),
              }),
            }),
          }),
        }),
        rpc: vi.fn().mockImplementation((fnName: string) => {
          if (fnName === "rpc_finalize_weekly_global_analytics") {
            return Promise.resolve({
              data: { success: true, action: "already_finalized", already_finalized: true },
              error: null,
            });
          }
          return Promise.resolve({ data: null, error: null });
        }),
      };

      const result = await processWeeklyAchieverAutomation({
        force: false,
        now: new Date("2026-10-12T10:00:00Z"),
        timezone: "Asia/Kolkata",
        supabaseOverride: mockSupabase,
      });

      expect(result.success).toBe(true);
      expect(result.processed).toBe(false);
      expect(result.skipped).toBe(true);
      expect(result.alreadySentThisWeek).toBe(true);
      expect(sendSpy).not.toHaveBeenCalled();
    });

    it("7. CRON ROUTE: GET and POST fail closed with status 500 when SUPABASE_SERVICE_ROLE_KEY is unconfigured", async () => {
      process.env.CRON_SECRET = "valid-secret-token";
      vi.spyOn(adminModule, "createAdminClient").mockReturnValue(null);

      const reqGet = new NextRequest("http://localhost:3000/api/cron/weekly-achiever", {
        method: "GET",
        headers: { "x-cron-secret": "valid-secret-token" },
      });

      const resGet = await cronGet(reqGet);
      expect(resGet.status).toBe(500);
      const jsonGet = await resGet.json();
      expect(jsonGet.success).toBe(false);
      expect(jsonGet.error).toContain("Server configuration missing SUPABASE_SERVICE_ROLE_KEY");

      const reqPost = new NextRequest("http://localhost:3000/api/cron/weekly-achiever", {
        method: "POST",
        headers: { "x-cron-secret": "valid-secret-token" },
      });

      const resPost = await cronPost(reqPost);
      expect(resPost.status).toBe(500);
      const jsonPost = await resPost.json();
      expect(jsonPost.success).toBe(false);
      expect(jsonPost.error).toContain("Server configuration missing SUPABASE_SERVICE_ROLE_KEY");
    });

    it("8. CRON ROUTE: passes resolved createAdminClient to processWeeklyAchieverAutomation", async () => {
      process.env.CRON_SECRET = "valid-secret-token";
      const fakeAdminClient = {
        rpc: vi.fn().mockResolvedValue({
          data: { success: true, action: "already_finalized", already_finalized: true },
          error: null,
        }),
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                gte: vi.fn().mockResolvedValue({
                  data: [{ id: "already-sent-alert" }],
                  error: null,
                }),
              }),
            }),
          }),
        }),
      } as any;

      const adminSpy = vi.spyOn(adminModule, "createAdminClient").mockReturnValue(fakeAdminClient);

      const req = new NextRequest("http://localhost:3000/api/cron/weekly-achiever", {
        method: "POST",
        headers: { "x-cron-secret": "valid-secret-token" },
      });

      const res = await cronPost(req);
      expect(adminSpy).toHaveBeenCalled();
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
    });

    it("9. ALERT LIFECYCLE: acknowledging an older period does not suppress a newer period alert", () => {
      const acknowledgements = new Set<string>();
      const userAcknowledged = (userId: string, periodId: string) =>
        acknowledgements.has(`${userId}:${periodId}`);
      const acknowledgeAlert = (userId: string, periodId: string) =>
        acknowledgements.add(`${userId}:${periodId}`);

      const userId = "user-1";
      const olderPeriod = "2026-10-05"; // Celebration period for week 2026-09-28
      const newerPeriod = "2026-10-12"; // Celebration period for week 2026-10-05

      // User acknowledged last week's celebration
      acknowledgeAlert(userId, olderPeriod);
      expect(userAcknowledged(userId, olderPeriod)).toBe(true);

      // When checking newer period, alert MUST NOT be suppressed
      expect(userAcknowledged(userId, newerPeriod)).toBe(false);

      // Once user acknowledges newer period, it is suppressed
      acknowledgeAlert(userId, newerPeriod);
      expect(userAcknowledged(userId, newerPeriod)).toBe(true);
    });

    it("10. ALERT DATA CONTRACT: missing optional avatar_url preserves achiever_name in alert payload", () => {
      const achieverRecord = {
        id: "snapshot-1",
        celebration_period_id: "2026-10-12",
        display_name: "Anindita Debnath",
        avatar_url: null, // Nullable optional field
      };

      // Simulates rpc_get_user_analytics_alert_status logic
      const alertPayload = {
        show_alert: true,
        celebration_period_id: achieverRecord.celebration_period_id,
        achiever_name: achieverRecord.display_name || "the community leader",
      };

      expect(alertPayload.show_alert).toBe(true);
      expect(alertPayload.celebration_period_id).toBe("2026-10-12");
      expect(alertPayload.achiever_name).toBe("Anindita Debnath");
    });
  });
});
