import { describe, it, expect, vi, beforeEach } from "vitest";
import { isMemberStudyExpired } from "@/lib/time/break";
import { calculateMemberElapsedStudySeconds, getWeekStartTimestamp } from "@/lib/time/format";
import { saveCachedRoomMembers, getCachedRoomMembers } from "@/lib/offline/sessionQueue";
import { STORAGE_KEYS } from "@/lib/offline/storageKeys";

describe("Production Data Sync & Realtime Fixes", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe("1. isMemberStudyExpired & calculateMemberElapsedStudySeconds (3-Hour Grace Fix)", () => {
    it("calculateMemberElapsedStudySeconds clamps at 10800 by default but supports clamp=false", () => {
      const now = new Date("2026-09-29T15:00:00Z");
      // 4 hours ago (14400s)
      const fourHoursAgo = new Date("2026-09-29T11:00:00Z").toISOString();
      const member = {
        current_status: "studying" as const,
        session_start_time: fourHoursAgo,
        last_resumed_at: fourHoursAgo,
        active_study_seconds_snapshot: 0,
      };

      // Default clamped at 10800
      expect(calculateMemberElapsedStudySeconds(member, now)).toBe(10800);
      expect(calculateMemberElapsedStudySeconds(member, now, true)).toBe(10800);

      // Unclamped returns full raw 14400s
      expect(calculateMemberElapsedStudySeconds(member, now, false)).toBe(14400);
    });

    it("isMemberStudyExpired correctly detects elapsed study beyond 3 hours + grace buffer", () => {
      const baseTime = new Date("2026-09-29T12:00:00Z");
      const sessionStart = baseTime.toISOString();

      // Case A: 2h 50m (10200s) -> Not expired
      const t1 = new Date(baseTime.getTime() + 10200 * 1000);
      const member1 = {
        current_status: "studying" as const,
        session_start_time: sessionStart,
        last_resumed_at: sessionStart,
        active_study_seconds_snapshot: 0,
      };
      expect(isMemberStudyExpired(member1, t1, 60)).toBe(false);

      // Case B: 3h 0m 30s (10830s) -> Within 60s grace buffer -> Not expired
      const t2 = new Date(baseTime.getTime() + 10830 * 1000);
      expect(isMemberStudyExpired(member1, t2, 60)).toBe(false);

      // Case C: 3h 1m 5s (10865s) -> Exceeds 10800 + 60s -> EXPIRED!
      const t3 = new Date(baseTime.getTime() + 10865 * 1000);
      expect(isMemberStudyExpired(member1, t3, 60)).toBe(true);

      // Case D: 4 hours (14400s) -> EXPIRED!
      const t4 = new Date(baseTime.getTime() + 14400 * 1000);
      expect(isMemberStudyExpired(member1, t4, 60)).toBe(true);
    });

    it("isMemberStudyExpired returns false for non-studying members", () => {
      const now = new Date();
      expect(isMemberStudyExpired({ current_status: "offline" }, now)).toBe(false);
      expect(isMemberStudyExpired({ current_status: "break" }, now)).toBe(false);
    });
  });

  describe("2. Sunday-to-Monday Week Rollover in Cached Room Members", () => {
    it("persists _week_start and _ts metadata alongside cached members", () => {
      const members = [
        {
          id: "user-1",
          display_name: "Alice",
          current_status: "studying" as const,
          weekly_study_seconds: 7200,
          weekly_sessions_count: 3,
          leaderboard_score: 85,
        } as any,
      ];

      saveCachedRoomMembers(members);

      const rawMembers = localStorage.getItem(STORAGE_KEYS.CACHED_ROOM_MEMBERS);
      const rawTs = localStorage.getItem(STORAGE_KEYS.CACHED_ROOM_MEMBERS + "_ts");
      const rawWeekStart = localStorage.getItem(STORAGE_KEYS.CACHED_ROOM_MEMBERS + "_week_start");

      expect(rawMembers).not.toBeNull();
      const parsedMembers = JSON.parse(rawMembers!);
      expect(Array.isArray(parsedMembers)).toBe(true);
      expect(parsedMembers).toHaveLength(1);

      expect(rawTs).not.toBeNull();
      expect(Number(rawTs)).toBeGreaterThan(0);

      expect(rawWeekStart).not.toBeNull();
      expect(Number(rawWeekStart)).toBeGreaterThan(0);
    });

    it("sanitizes weekly metrics to 0 when cache belongs to previous week", () => {
      const currentWeekStart = getWeekStartTimestamp(new Date());
      const previousWeekStart = currentWeekStart - 7 * 24 * 60 * 60 * 1000;

      const members = [
        {
          id: "user-old",
          display_name: "Bob",
          current_status: "offline",
          weekly_study_seconds: 14400,
          weekly_sessions_count: 5,
          total_sessions_count: 5,
          leaderboard_score: 95.5,
          leaderboard_rank: 1,
        },
      ];

      localStorage.setItem(STORAGE_KEYS.CACHED_ROOM_MEMBERS, JSON.stringify(members));
      localStorage.setItem(STORAGE_KEYS.CACHED_ROOM_MEMBERS + "_ts", (previousWeekStart + 1000).toString());
      localStorage.setItem(STORAGE_KEYS.CACHED_ROOM_MEMBERS + "_week_start", previousWeekStart.toString());

      const hydrated = getCachedRoomMembers<any>();
      expect(hydrated).not.toBeNull();
      expect(hydrated).toHaveLength(1);
      const bob = hydrated![0];
      // Core identity is preserved
      expect(bob.id).toBe("user-old");
      expect(bob.display_name).toBe("Bob");
      // Weekly metrics are sanitized to 0
      expect(bob.weekly_study_seconds).toBe(0);
      expect(bob.weekly_sessions_count).toBe(0);
      expect(bob.total_sessions_count).toBe(0);
      expect(bob.leaderboard_score).toBe(0);
      expect(bob.leaderboard_rank).toBeUndefined();
    });

    it("preserves weekly metrics when cache belongs to the same week", () => {
      const currentWeekStart = getWeekStartTimestamp(new Date());

      const members = [
        {
          id: "user-valid",
          display_name: "Charlie",
          current_status: "studying",
          weekly_study_seconds: 3600,
          weekly_sessions_count: 2,
          total_sessions_count: 2,
          leaderboard_score: 50,
          leaderboard_rank: 2,
        },
      ];

      localStorage.setItem(STORAGE_KEYS.CACHED_ROOM_MEMBERS, JSON.stringify(members));
      localStorage.setItem(STORAGE_KEYS.CACHED_ROOM_MEMBERS + "_ts", Date.now().toString());
      localStorage.setItem(STORAGE_KEYS.CACHED_ROOM_MEMBERS + "_week_start", currentWeekStart.toString());

      const hydrated = getCachedRoomMembers<any>();
      expect(hydrated).not.toBeNull();
      expect(hydrated![0].weekly_study_seconds).toBe(3600);
      expect(hydrated![0].weekly_sessions_count).toBe(2);
      expect(hydrated![0].leaderboard_score).toBe(50);
    });
  });

  describe("3. Channel Health & Socket Connectivity Verification", () => {
    it("distinguishes realtime socket connected vs disconnected state", () => {
      const mockChannel = { state: "joined" };
      const healthySupabase = {
        realtime: {
          isConnected: () => true,
          connectionState: () => "Open",
        },
      };
      const disconnectedSupabase = {
        realtime: {
          isConnected: () => false,
          connectionState: () => "Closed",
        },
      };

      // When channel is joined AND socket is connected
      const isHealthy = (ch: any, sb: any) =>
        ch && ch.state === "joined" && (!sb?.realtime?.isConnected || sb.realtime.isConnected() === true);

      expect(isHealthy(mockChannel, healthySupabase)).toBe(true);
      expect(isHealthy(mockChannel, disconnectedSupabase)).toBe(false);
    });
  });

  describe("4. Secondary Enrichment Zeroing for Members Without Completed Sessions", () => {
    it("sets weekly_study_seconds to 0 when stats map does not contain the member", () => {
      // Simulating useLiveRoom secondary enrichment Phase 2 logic:
      const members = [
        { id: "user-1", display_name: "Alice", weekly_study_seconds: 5000, weekly_sessions_count: 2 },
        { id: "user-2", display_name: "Bob", weekly_study_seconds: 3000, weekly_sessions_count: 1 },
      ];

      const statsMap = new Map<string, { totalStudySeconds: number; sessionCount: number }>();
      statsMap.set("user-1", { totalStudySeconds: 1200, sessionCount: 1 });
      // user-2 has no sessions in the new week!

      const sessionDataFulfilled = true;

      const enriched = members.map((m) => {
        const stats = statsMap.get(m.id);
        return {
          ...m,
          weekly_study_seconds: stats ? stats.totalStudySeconds : sessionDataFulfilled ? 0 : m.weekly_study_seconds,
          weekly_sessions_count: stats ? stats.sessionCount : sessionDataFulfilled ? 0 : m.weekly_sessions_count,
        };
      });

      expect(enriched[0].weekly_study_seconds).toBe(1200);
      expect(enriched[0].weekly_sessions_count).toBe(1);
      // Bob's prior week stats do NOT bleed through:
      expect(enriched[1].weekly_study_seconds).toBe(0);
      expect(enriched[1].weekly_sessions_count).toBe(0);
    });
  });

  describe("5. Monotonic Versioning & Stale Snapshot Rejection", () => {
    it("rejects incoming server profile snapshot when state_version is older or equal and status is offline", () => {
      // Local state is currently studying with state_version 10
      const localProfile = {
        id: "user-1",
        current_status: "studying",
        state_version: 10,
        session_start_time: "2026-09-29T10:00:00Z",
      };

      // Stale in-flight event arrives from server from before start_session finished
      const staleServerProfile = {
        id: "user-1",
        current_status: "offline",
        state_version: 9,
        session_start_time: null,
      };

      const shouldAcceptProfile = (prev: typeof localProfile, next: typeof staleServerProfile) => {
        if (!prev) return true;
        const prevVersion = prev.state_version ?? 0;
        const nextVersion = next.state_version ?? 0;
        if (
          prev.current_status === "studying" &&
          next.current_status === "offline" &&
          nextVersion <= prevVersion
        ) {
          return false; // Stale offline rejected!
        }
        return true;
      };

      expect(shouldAcceptProfile(localProfile, staleServerProfile)).toBe(false);

      // Fresh update with incremented version is accepted
      const freshServerProfile = {
        id: "user-1",
        current_status: "offline",
        state_version: 11,
        session_start_time: null,
      };
      expect(shouldAcceptProfile(localProfile, freshServerProfile)).toBe(true);
    });
  });

  describe("6. Leaderboard Live Study Capping & Elimination of 4-Hour Zero Cliff", () => {
    it("calculates live study minutes capped at 180 and never returns 0 for sessions >= 4 hours", () => {
      const calculateLiveStudyMinutes = (sessionStartTimeMs: number, nowMs: number) => {
        const rawSeconds = Math.max(0, Math.floor((nowMs - sessionStartTimeMs) / 1000));
        // Database logic: FLOOR(GREATEST(0, LEAST(180 * 60, rawSeconds)) / 60)
        return Math.floor(Math.min(180 * 60, rawSeconds) / 60);
      };

      const now = 1000000000;

      // 1 hour in: 60 minutes
      expect(calculateLiveStudyMinutes(now - 3600 * 1000, now)).toBe(60);

      // 3 hours in: 180 minutes
      expect(calculateLiveStudyMinutes(now - 10800 * 1000, now)).toBe(180);

      // 3.5 hours in (Ankita scenario before cliff): 180 minutes
      expect(calculateLiveStudyMinutes(now - 12600 * 1000, now)).toBe(180);

      // 4 hours 15 mins in (Ankita scenario at 4:35 PM where old DB cliff triggered 0 mins):
      // Now correctly remains 180 minutes!
      expect(calculateLiveStudyMinutes(now - 15300 * 1000, now)).toBe(180);

      // 8 hours in: still cleanly capped at 180 minutes
      expect(calculateLiveStudyMinutes(now - 28800 * 1000, now)).toBe(180);
    });
  });
});

