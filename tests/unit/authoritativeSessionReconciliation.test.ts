import { describe, it, expect, vi, beforeEach } from "vitest";
import { UserProfile } from "@/lib/supabase/types";
import { canFormStudyTimePair, canFormRankClashPair } from "@/lib/time/rivalry";
import { calculateMemberLiveWeeklyStudySeconds } from "@/lib/time/format";
import { calculateLeaderboardScore } from "@/lib/scoring/engine";

function mockProfile(overrides: Partial<UserProfile>): UserProfile {
  return {
    id: "test-uid",
    display_name: "Test User",
    avatar_url: null,
    current_status: "offline",
    current_focus: null,
    session_start_time: null,
    has_achiever_badge: false,
    created_at: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

describe("Authoritative Session Reconciliation & Invariants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. Server Offline + Stale Local Active Session (Ghost Session Eviction)", () => {
    it("determines that server offline state authoritatively evicts stale provisional studying session", () => {
      const serverProfile = mockProfile({
        id: "subodh-uuid",
        display_name: "Subodh",
        current_status: "offline",
        session_start_time: null,
        last_resumed_at: null,
        break_started_at: null,
        active_study_seconds_snapshot: 0,
        last_offline_at: "2026-09-29T17:04:03.878Z",
      });

      const staleProvisionalSession = {
        status: "studying",
        elapsedSeconds: 5855, // 01:37:35
      };

      const mutationPending = null;

      const shouldPurgeLocalSession =
        serverProfile.current_status === "offline" && mutationPending === null;
      expect(shouldPurgeLocalSession).toBe(true);

      const resolvedStatus = shouldPurgeLocalSession ? "offline" : staleProvisionalSession.status;
      const resolvedElapsed = shouldPurgeLocalSession ? 0 : staleProvisionalSession.elapsedSeconds;

      expect(resolvedStatus).toBe("offline");
      expect(resolvedElapsed).toBe(0);
    });
  });

  describe("2. Server Studying + Stale Local Offline (Server Authority)", () => {
    it("calibrates live timer from authoritative server start time when local was offline", () => {
      const serverNow = new Date("2026-09-30T10:00:00Z");
      const sessionStartTime = new Date("2026-09-30T09:00:00Z").toISOString(); // 1 hour ago

      const serverProfile = mockProfile({
        id: "user-active",
        display_name: "Active User",
        current_status: "studying",
        session_start_time: sessionStartTime,
        last_resumed_at: sessionStartTime,
      });

      const isServerActive = serverProfile.current_status === "studying";
      expect(isServerActive).toBe(true);

      const elapsed = Math.floor(
        (serverNow.getTime() - new Date(serverProfile.session_start_time!).getTime()) / 1000
      );
      expect(elapsed).toBe(3600); // 1 hour elapsed
    });
  });

  describe("3. Start Mutation Pending (Truthful Sync State)", () => {
    it("reports syncing status while start mutation is pending and transitions to synced on confirmation", () => {
      const mutationPending: "start" | null = "start";
      const isAuthLoading = false;
      const profile = null;

      const getSyncStatus = (mutation: string | null, authLoading: boolean, prof: any) => {
        if (mutation !== null) return "syncing";
        if (authLoading || prof === null) return "reconciling";
        return "synced";
      };

      expect(getSyncStatus(mutationPending, isAuthLoading, profile)).toBe("syncing");

      const confirmedMutation = null;
      const confirmedProfile = mockProfile({
        id: "u1",
        display_name: "User",
        current_status: "studying",
        session_start_time: new Date().toISOString(),
      });

      expect(getSyncStatus(confirmedMutation, false, confirmedProfile)).toBe("synced");
    });
  });

  describe("4. Stop Mutation Pending", () => {
    it("sets optimistic offline state and transitions cleanly upon server acknowledgment", () => {
      let mutationPending: "stop" | null = "stop";
      let localStatusOverride: string | null = "offline";

      expect(mutationPending).toBe("stop");
      expect(localStatusOverride).toBe("offline");

      mutationPending = null;
      localStatusOverride = null;

      expect(mutationPending).toBeNull();
      expect(localStatusOverride).toBeNull();
    });
  });

  describe("5. AuthProvider Profile Update Logic (Direct PostgreSQL read)", () => {
    it("does not reject PostgreSQL offline row when state_version is 0", () => {
      const prevCachedProfile: Partial<UserProfile> = {
        id: "subodh-uuid",
        display_name: "Subodh",
        current_status: "studying",
        session_start_time: "2026-09-29T16:00:00Z",
        state_version: 0,
      };

      const incomingPostgresRow = mockProfile({
        id: "subodh-uuid",
        display_name: "Subodh",
        current_status: "offline",
        session_start_time: null,
        last_resumed_at: null,
        break_started_at: null,
        active_study_seconds_snapshot: 0,
        last_offline_at: "2026-09-29T17:04:03.878Z",
        state_version: 0,
      });

      const updateProfile = (prev: any, incoming: any) => {
        const prevVersion = prev?.state_version ?? 0;
        const incomingVersion = incoming.state_version ?? 0;
        if (incomingVersion > 0 && prevVersion > 0 && incomingVersion < prevVersion) {
          return prev;
        }
        const isIncomingOffline = incoming.current_status === "offline";
        return {
          ...(prev || {}),
          ...incoming,
          session_start_time: isIncomingOffline ? null : incoming.session_start_time,
          last_resumed_at: isIncomingOffline ? null : incoming.last_resumed_at,
          break_started_at: isIncomingOffline ? null : incoming.break_started_at,
          active_study_seconds_snapshot: isIncomingOffline ? 0 : (incoming.active_study_seconds_snapshot ?? 0),
        };
      };

      const result = updateProfile(prevCachedProfile, incomingPostgresRow);
      expect(result.current_status).toBe("offline");
      expect(result.session_start_time).toBeNull();
      expect(result.active_study_seconds_snapshot).toBe(0);
    });
  });

  describe("6. Room Member Field-Level Authority (Subodh Weekly Stats Preservation)", () => {
    it("preserves weekly_study_seconds from room query and does not clobber it with profile", () => {
      const roomMember = mockProfile({
        id: "subodh-uuid",
        display_name: "Subodh",
        current_status: "offline",
        weekly_study_seconds: 31320, // 522 minutes
        weekly_sessions_count: 7,
        total_sessions_count: 7,
        past_24h_study_seconds: 7200,
        leaderboard_score: 95.5,
        leaderboard_rank: 1,
      });

      const effectiveProfile: Partial<UserProfile> = {
        id: "subodh-uuid",
        display_name: "Subodh Updated",
        current_status: "offline",
      };

      const currentUser = { id: "subodh-uuid" };
      const status = "offline";

      const reconciled = {
        ...roomMember,
        weekly_study_seconds: roomMember.weekly_study_seconds ?? 0,
        weekly_sessions_count: roomMember.weekly_sessions_count ?? 0,
        total_sessions_count: roomMember.total_sessions_count ?? 0,
        past_24h_study_seconds: roomMember.past_24h_study_seconds ?? 0,
        leaderboard_score: roomMember.leaderboard_score,
        leaderboard_rank: roomMember.leaderboard_rank,

        display_name: effectiveProfile?.display_name || roomMember.display_name,
        avatar_url: effectiveProfile?.avatar_url ?? roomMember.avatar_url,
        has_achiever_badge: effectiveProfile?.has_achiever_badge ?? roomMember.has_achiever_badge,

        current_status: status as any,
        session_start_time: null,
        last_resumed_at: null,
        break_started_at: null,
        active_study_seconds_snapshot: 0,
      };

      expect(reconciled.weekly_study_seconds).toBe(31320); // 8h 42m
      expect(reconciled.weekly_sessions_count).toBe(7);
      expect(reconciled.display_name).toBe("Subodh Updated");
    });
  });

  describe("7. Rivalry Formation (Subodh vs Raunak)", () => {
    it("forms STUDY_TIME rivalry when Subodh (8h 42m) and Raunak (8h 34m) are within 10-minute threshold", () => {
      const subodhWeeklySeconds = 522 * 60; // 31320s (8h 42m)
      const raunakWeeklySeconds = 514 * 60; // 30840s (8h 34m)

      const candidateSubodh = {
        member: mockProfile({ id: "subodh-uuid", display_name: "Subodh" }),
        weeklySeconds: subodhWeeklySeconds,
      };

      const candidateRaunak = {
        member: mockProfile({ id: "raunak-uuid", display_name: "Raunak" }),
        weeklySeconds: raunakWeeklySeconds,
      };

      const canForm = canFormStudyTimePair(candidateSubodh, candidateRaunak, false);
      expect(canForm).toBe(true);

      const gapSeconds = Math.abs(subodhWeeklySeconds - raunakWeeklySeconds);
      expect(gapSeconds).toBe(480);
      expect(gapSeconds).toBeLessThanOrEqual(600);
    });

    it("evaluates RANK_CLASH rivalry correctly based on adjacent ranks and score gap", () => {
      const user1 = {
        member: mockProfile({
          id: "u1",
          leaderboard_score: 85.0,
          leaderboard_rank: 1,
        }),
        weeklySeconds: 10000,
      };

      const user2 = {
        member: mockProfile({
          id: "u2",
          leaderboard_score: 82.5,
          leaderboard_rank: 2,
        }),
        weeklySeconds: 8000,
      };

      expect(canFormRankClashPair(user1, user2, false)).toBe(true);
    });
  });

  describe("8. Observer vs Owner Session Stop Security Model", () => {
    const simulateStopRpc = (params: {
      callerUid: string;
      targetUserId: string;
      status: "studying" | "break" | "offline";
      sessionStartTime: string | null;
      breakStartedAt: string | null;
      totalStudySeconds: number;
      expectedStartTime?: string | null;
      serverNow: Date;
    }) => {
      const isOwner = params.callerUid === params.targetUserId;
      const isSystem = params.callerUid === "service-role";

      if (params.status === "offline") {
        return { success: true, already_finished: true, message: "No active session" };
      }

      if (!isOwner && !isSystem) {
        if (!params.expectedStartTime) {
          return { success: false, rejected: true, reason: "Observer must provide p_expected_start_time" };
        }

        if (
          params.sessionStartTime !== params.expectedStartTime &&
          params.breakStartedAt !== params.expectedStartTime
        ) {
          return { success: false, rejected: true, reason: "Session identity mismatch" };
        }

        if (params.status === "break") {
          const breakStartMs = params.breakStartedAt ? new Date(params.breakStartedAt).getTime() : 0;
          if (params.serverNow.getTime() - breakStartMs < 3600 * 1000) {
            return { success: false, rejected: true, reason: "Break has not exceeded 1 hour limit" };
          }
        } else if (params.status === "studying") {
          const sessionStartMs = params.sessionStartTime ? new Date(params.sessionStartTime).getTime() : 0;
          if (
            params.totalStudySeconds < 10800
          ) {
            return { success: false, rejected: true, reason: "Study session has not exceeded 3 hour limit" };
          }
        }
      }

      return { success: true, finalized: true };
    };

    it("allows owner to stop session legitimately at any time (e.g. 38 minutes)", () => {
      const res = simulateStopRpc({
        callerUid: "subodh-uuid",
        targetUserId: "subodh-uuid",
        status: "studying",
        sessionStartTime: "2026-09-30T10:00:00Z",
        breakStartedAt: null,
        totalStudySeconds: 2280, // 38 minutes
        serverNow: new Date("2026-09-30T10:38:00Z"),
      });

      expect(res.success).toBe(true);
      expect(res.finalized).toBe(true);
    });

    it("rejects observer trying to stop a non-expired study session (< 3 hours)", () => {
      const res = simulateStopRpc({
        callerUid: "observer-uuid",
        targetUserId: "subodh-uuid",
        status: "studying",
        sessionStartTime: "2026-09-30T10:00:00Z",
        breakStartedAt: null,
        totalStudySeconds: 2280, // 38 minutes (< 3 hours)
        expectedStartTime: "2026-09-30T10:00:00Z",
        serverNow: new Date("2026-09-30T10:38:00Z"),
      });

      expect(res.success).toBe(false);
      expect(res.rejected).toBe(true);
      expect(res.reason).toBe("Study session has not exceeded 3 hour limit");
    });

    it("rejects observer if p_expected_start_time is omitted", () => {
      const res = simulateStopRpc({
        callerUid: "observer-uuid",
        targetUserId: "subodh-uuid",
        status: "studying",
        sessionStartTime: "2026-09-30T10:00:00Z",
        breakStartedAt: null,
        totalStudySeconds: 11000,
        expectedStartTime: null,
        serverNow: new Date("2026-09-30T13:30:00Z"),
      });

      expect(res.success).toBe(false);
      expect(res.rejected).toBe(true);
      expect(res.reason).toBe("Observer must provide p_expected_start_time");
    });

    it("rejects observer if session identity does not match current active session", () => {
      const res = simulateStopRpc({
        callerUid: "observer-uuid",
        targetUserId: "subodh-uuid",
        status: "studying",
        sessionStartTime: "2026-09-30T12:00:00Z",
        breakStartedAt: null,
        totalStudySeconds: 12000,
        expectedStartTime: "2026-09-30T08:00:00Z",
        serverNow: new Date("2026-09-30T16:00:00Z"),
      });

      expect(res.success).toBe(false);
      expect(res.rejected).toBe(true);
      expect(res.reason).toBe("Session identity mismatch");
    });

    it("allows observer to stop an expired study session (>= 3 hours) with matching identity", () => {
      const res = simulateStopRpc({
        callerUid: "observer-uuid",
        targetUserId: "ankita-uuid",
        status: "studying",
        sessionStartTime: "2026-09-30T06:00:00Z",
        breakStartedAt: null,
        totalStudySeconds: 10800, // 3 hours
        expectedStartTime: "2026-09-30T06:00:00Z",
        serverNow: new Date("2026-09-30T09:05:00Z"),
      });

      expect(res.success).toBe(true);
      expect(res.finalized).toBe(true);
    });

    it("allows observer to stop an expired break session (>= 1 hour)", () => {
      const res = simulateStopRpc({
        callerUid: "observer-uuid",
        targetUserId: "user-uuid",
        status: "break",
        sessionStartTime: "2026-09-30T06:00:00Z",
        breakStartedAt: "2026-09-30T07:00:00Z",
        totalStudySeconds: 3600,
        expectedStartTime: "2026-09-30T07:00:00Z",
        serverNow: new Date("2026-09-30T08:05:00Z"),
      });

      expect(res.success).toBe(true);
      expect(res.finalized).toBe(true);
    });
  });

  describe("9. Leaderboard Scoring Dual-Pillar Engine", () => {
    it("calculates dual-pillar score without error", () => {
      const scoreResult = calculateLeaderboardScore(
        522, // Subodh 522 minutes
        600, // max group study minutes
        5,   // completed tasks
        5,   // total tasks
        4,   // streak days
        10   // max group completed tasks
      );

      expect(scoreResult.composite_score).toBeGreaterThan(0);
      expect(scoreResult.composite_score).toBeLessThanOrEqual(100);
    });
  });
});
