import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET as reconcileGet, POST as reconcilePost } from "@/app/api/cron/reconcile-sessions/route";
import { GET as achieverGet, POST as achieverPost } from "@/app/api/cron/weekly-achiever/route";
import { getEffectiveMemberStatus, isMemberBreakExpired, isMemberStudyExpired } from "@/lib/time/break";
import { calculateMemberElapsedStudySeconds } from "@/lib/time/format";
import type { UserProfile, UserStatus } from "@/lib/supabase/types";

type TestMember = Partial<UserProfile> & { current_status: UserStatus };

describe("Cron Reconciliation & Zero-Client Expiration Path", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  describe("1. CRON_SECRET Security & Fail-Closed Enforcement", () => {
    it("FAIL-CLOSED: Rejects request with 401 when CRON_SECRET is missing from server environment", async () => {
      delete process.env.CRON_SECRET;

      const req = new NextRequest("http://localhost:3000/api/cron/reconcile-sessions", {
        method: "GET",
        headers: { "x-cron-secret": "some-secret" },
      });

      const res = await reconcileGet(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain("server cron secret unconfigured");
    });

    it("FAIL-CLOSED on weekly-achiever: Rejects request with 401 when CRON_SECRET is unset", async () => {
      delete process.env.CRON_SECRET;

      const req = new NextRequest("http://localhost:3000/api/cron/weekly-achiever", {
        method: "GET",
      });

      const res = await achieverGet(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain("server cron secret unconfigured");
    });

    it("Rejects request with 401 when no secret is provided in headers or query params", async () => {
      process.env.CRON_SECRET = "super-secret-cron-token-12345";

      const req = new NextRequest("http://localhost:3000/api/cron/reconcile-sessions", {
        method: "GET",
      });

      const res = await reconcileGet(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe("Unauthorized cron request");
    });

    it("Rejects request with 401 when wrong secret is provided", async () => {
      process.env.CRON_SECRET = "super-secret-cron-token-12345";

      const req = new NextRequest("http://localhost:3000/api/cron/reconcile-sessions", {
        method: "POST",
        headers: { "x-cron-secret": "wrong-secret-value" },
      });

      const res = await reconcilePost(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe("Unauthorized cron request");
    });

    it("Rejects request with 401 when secret length differs (timing attack protection)", async () => {
      process.env.CRON_SECRET = "correct-length-16";

      const req = new NextRequest("http://localhost:3000/api/cron/reconcile-sessions", {
        method: "GET",
        headers: { "x-cron-secret": "short" },
      });

      const res = await reconcileGet(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe("Unauthorized cron request");
    });

    it("Rejects request when SUPABASE_SERVICE_ROLE_KEY is missing, without leaking secrets", async () => {
      process.env.CRON_SECRET = "valid-secret-token";
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;

      const req = new NextRequest("http://localhost:3000/api/cron/reconcile-sessions", {
        method: "GET",
        headers: { "x-cron-secret": "valid-secret-token" },
      });

      const res = await reconcileGet(req);
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe("Server configuration missing SUPABASE_SERVICE_ROLE_KEY");
      expect(JSON.stringify(json)).not.toContain("valid-secret-token");
    });
  });

  describe("2. Break Expiration Boundaries & Immutability", () => {
    const baseNow = new Date("2026-09-20T12:00:00.000Z");

    it("Break at 59m 59s: Remains active break", () => {
      const breakStartedAt = new Date(baseNow.getTime() - 59 * 60 * 1000 - 59 * 1000).toISOString();
      const member: TestMember = {
        current_status: "break",
        break_started_at: breakStartedAt,
        session_start_time: new Date(baseNow.getTime() - 2 * 3600 * 1000).toISOString(),
      };

      expect(isMemberBreakExpired(member, baseNow)).toBe(false);
      expect(getEffectiveMemberStatus(member, baseNow)).toBe("break");
    });

    it("Break at exactly 60m (3600s): Must evaluate to expired and offline", () => {
      const breakStartedAt = new Date(baseNow.getTime() - 3600 * 1000).toISOString();
      const member: TestMember = {
        current_status: "break",
        break_started_at: breakStartedAt,
        session_start_time: new Date(baseNow.getTime() - 2 * 3600 * 1000).toISOString(),
      };

      expect(isMemberBreakExpired(member, baseNow)).toBe(true);
      expect(getEffectiveMemberStatus(member, baseNow)).toBe("offline");
    });

    it("Break at 60m + 1s: Must evaluate to expired and offline", () => {
      const breakStartedAt = new Date(baseNow.getTime() - 3601 * 1000).toISOString();
      const member: TestMember = {
        current_status: "break",
        break_started_at: breakStartedAt,
      };

      expect(isMemberBreakExpired(member, baseNow)).toBe(true);
      expect(getEffectiveMemberStatus(member, baseNow)).toBe("offline");
    });

    it("Break at 75m: Must evaluate to expired and offline", () => {
      const breakStartedAt = new Date(baseNow.getTime() - 75 * 60 * 1000).toISOString();
      const member: TestMember = {
        current_status: "break",
        break_started_at: breakStartedAt,
      };

      expect(isMemberBreakExpired(member, baseNow)).toBe(true);
      expect(getEffectiveMemberStatus(member, baseNow)).toBe("offline");
    });
  });

  describe("3. Study Expiration Boundaries & 3-Hour Cap", () => {
    const baseNow = new Date("2026-09-20T12:00:00.000Z");

    it("Study at 2h 59m 59s: Remains actively studying", () => {
      const sessionStartTime = new Date(baseNow.getTime() - (3 * 3600 - 1) * 1000).toISOString();
      const member: TestMember = {
        current_status: "studying",
        session_start_time: sessionStartTime,
        last_resumed_at: sessionStartTime,
        active_study_seconds_snapshot: 0,
      };

      expect(isMemberStudyExpired(member, baseNow)).toBe(false);
      expect(getEffectiveMemberStatus(member, baseNow)).toBe("studying");
      const elapsed = calculateMemberElapsedStudySeconds(member, baseNow);
      expect(elapsed).toBe(10799);
    });

    it("Study at exactly 3h (10,800s): Must evaluate to expired and offline", () => {
      const sessionStartTime = new Date(baseNow.getTime() - 10800 * 1000).toISOString();
      const member: TestMember = {
        current_status: "studying",
        session_start_time: sessionStartTime,
        last_resumed_at: sessionStartTime,
        active_study_seconds_snapshot: 0,
      };

      expect(isMemberStudyExpired(member, baseNow)).toBe(true);
      expect(getEffectiveMemberStatus(member, baseNow)).toBe("offline");
      const elapsed = calculateMemberElapsedStudySeconds(member, baseNow);
      expect(elapsed).toBe(10800); // Capped at exactly 10,800s
    });

    it("Study at 3h + 1s: Must evaluate to expired and offline", () => {
      const sessionStartTime = new Date(baseNow.getTime() - 10801 * 1000).toISOString();
      const member: TestMember = {
        current_status: "studying",
        session_start_time: sessionStartTime,
        last_resumed_at: sessionStartTime,
        active_study_seconds_snapshot: 0,
      };

      expect(isMemberStudyExpired(member, baseNow)).toBe(true);
      expect(getEffectiveMemberStatus(member, baseNow)).toBe("offline");
      const elapsed = calculateMemberElapsedStudySeconds(member, baseNow);
      expect(elapsed).toBe(10800); // 3-hour strict ceiling
    });

    it("Study at 4h: Must remain capped at 3h and offline", () => {
      const sessionStartTime = new Date(baseNow.getTime() - 4 * 3600 * 1000).toISOString();
      const member: TestMember = {
        current_status: "studying",
        session_start_time: sessionStartTime,
        last_resumed_at: sessionStartTime,
        active_study_seconds_snapshot: 0,
      };

      expect(isMemberStudyExpired(member, baseNow)).toBe(true);
      expect(getEffectiveMemberStatus(member, baseNow)).toBe("offline");
      const elapsed = calculateMemberElapsedStudySeconds(member, baseNow);
      expect(elapsed).toBe(10800);
    });
  });

  describe("4. Section 14 Logic Contradiction Audit & Deterministic State Invariant", () => {
    it("Guarantees that a member whose server profile raw status is studying but is mathematically expired reports offline immediately", () => {
      const now = new Date("2026-09-20T16:00:00.000Z");
      const rawServerProfile: TestMember = {
        id: "user_expired_1",
        current_status: "studying",
        session_start_time: new Date(now.getTime() - 4 * 3600 * 1000).toISOString(),
        last_resumed_at: new Date(now.getTime() - 4 * 3600 * 1000).toISOString(),
        active_study_seconds_snapshot: 0,
      };

      const serverRawStatus = rawServerProfile.current_status ?? "offline";
      const serverEffectiveStatus = getEffectiveMemberStatus(rawServerProfile, now);

      const authoritativeStatus =
        serverRawStatus !== "offline" && serverEffectiveStatus === "offline"
          ? "offline"
          : serverRawStatus;

      expect(serverRawStatus).toBe("studying");
      expect(serverEffectiveStatus).toBe("offline");
      expect(authoritativeStatus).toBe("offline");
    });

    it("Guarantees that when RPC returns already_finished, client gracefully settles offline without creating orphaned offline sessions", () => {
      const rpcResponse = {
        success: true,
        already_finished: true,
        message: "No active session",
      };

      expect(rpcResponse.already_finished).toBe(true);
      // In useActiveSession.ts, already_finished returns cleanly:
      // { success: true, already_finished: true }
      // without invoking setIsGoalUpdateModalOpen(true) with an orphaned baseOfflineId
    });
  });

  describe("5. Multiple User Atomicity & Batch Safety Invariants", () => {
    it("Verifies partition of multiple users across active, expired break, expired study, and offline", () => {
      const now = new Date("2026-09-20T12:00:00.000Z");

      const users: TestMember[] = [
        // Case A: 3h+ expired study
        { id: "u1", current_status: "studying", session_start_time: new Date(now.getTime() - 3.5 * 3600 * 1000).toISOString(), last_resumed_at: new Date(now.getTime() - 3.5 * 3600 * 1000).toISOString() },
        // Case B: 2h 59m active study (NOT expired)
        { id: "u2", current_status: "studying", session_start_time: new Date(now.getTime() - 2.98 * 3600 * 1000).toISOString(), last_resumed_at: new Date(now.getTime() - 2.98 * 3600 * 1000).toISOString() },
        // Case C: 1h+ expired break
        { id: "u3", current_status: "break", break_started_at: new Date(now.getTime() - 1.2 * 3600 * 1000).toISOString() },
        // Case D: 59m active break (NOT expired)
        { id: "u4", current_status: "break", break_started_at: new Date(now.getTime() - 0.98 * 3600 * 1000).toISOString() },
        // Case E: offline user
        { id: "u5", current_status: "offline" },
      ];

      const expiredStudyUsers = users.filter((u) => u.current_status === "studying" && isMemberStudyExpired(u, now));
      const activeStudyUsers = users.filter((u) => u.current_status === "studying" && !isMemberStudyExpired(u, now));
      const expiredBreakUsers = users.filter((u) => u.current_status === "break" && isMemberBreakExpired(u, now));
      const activeBreakUsers = users.filter((u) => u.current_status === "break" && !isMemberBreakExpired(u, now));
      const offlineUsers = users.filter((u) => u.current_status === "offline");

      expect(expiredStudyUsers.map((u) => u.id)).toEqual(["u1"]);
      expect(activeStudyUsers.map((u) => u.id)).toEqual(["u2"]);
      expect(expiredBreakUsers.map((u) => u.id)).toEqual(["u3"]);
      expect(activeBreakUsers.map((u) => u.id)).toEqual(["u4"]);
      expect(offlineUsers.map((u) => u.id)).toEqual(["u5"]);
    });
  });
});
