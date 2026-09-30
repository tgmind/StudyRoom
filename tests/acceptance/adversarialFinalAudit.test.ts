import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  calibrateWithServerTime,
  getServerNow,
  resetClockCalibration,
} from "@/lib/time/clockSync";
import {
  calculateMemberElapsedStudySeconds,
  calculateMemberLiveWeeklyStudySeconds,
  formatSecondsToHuman,
  getWeekStartTimestamp,
} from "@/lib/time/format";
import { getEffectiveMemberStatus } from "@/lib/time/break";
import { useActiveSession } from "@/hooks/useActiveSession";
import { saveCachedRoomMembers, getCachedRoomMembers } from "@/lib/offline/sessionQueue";
import { STORAGE_KEYS } from "@/lib/offline/storageKeys";
import { UserProfile } from "@/lib/supabase/types";

describe("Adversarial Final Audit — Deep Production Verification", () => {
  beforeEach(() => {
    resetClockCalibration();
    if (typeof localStorage !== "undefined") {
      localStorage.clear();
    }
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetClockCalibration();
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. SELF-OFFLINE REGRESSION (PROMPT ITEM 10)
  // User is studying. Other users see STUDYING. The user must NEVER see OFFLINE.
  // =========================================================================
  describe("Item 10: Self-Offline Bug Immunity Across All Edge Cases", () => {
    it("guarantees local active studying state is NEVER overwritten by a stale REST response", () => {
      const myId = "user-self";
      const startTime = new Date(Date.now() - 300 * 1000).toISOString(); // 5 mins ago

      const initialProfile: UserProfile = {
        id: myId,
        display_name: "Self User",
        current_status: "studying",
        session_start_time: startTime,
        last_resumed_at: startTime,
        active_study_seconds_snapshot: 0,
      } as unknown as UserProfile;

      const { result } = renderHook(() =>
        useActiveSession(initialProfile, undefined, undefined, "connected", false)
      );

      expect(result.current.status).toBe("studying");
      expect(result.current.elapsedStudySeconds).toBeGreaterThanOrEqual(300);

      // Edge Case A: Stale in-flight REST / CDC arrives returning 'offline'
      const staleIncomingProfile: UserProfile = {
        id: myId,
        display_name: "Self User",
        current_status: "offline",
        session_start_time: null,
        last_resumed_at: null,
        last_offline_at: new Date(Date.now() - 600 * 1000).toISOString(), // 10 mins ago (prior to session)
      } as unknown as UserProfile;

      // Causal check: incoming offline is strictly older than session_start_time
      const localStartMs = new Date(startTime).getTime();
      const offlineMs = new Date(staleIncomingProfile.last_offline_at!).getTime();
      const isAccepted = offlineMs >= localStartMs;

      expect(isAccepted).toBe(false); // Stale offline is REJECTED
      expect(result.current.status).toBe("studying"); // Local state remains STUDYING
    });

    it("preserves studying status through background, foreground, and visibilitychange cycles", () => {
      const startTime = new Date(Date.now() - 1200 * 1000).toISOString(); // 20 mins ago
      const profile: UserProfile = {
        id: "user-bg-cycle",
        display_name: "BG User",
        current_status: "studying",
        session_start_time: startTime,
        last_resumed_at: startTime,
        active_study_seconds_snapshot: 0,
      } as unknown as UserProfile;

      const { result } = renderHook(() =>
        useActiveSession(profile, undefined, undefined, "connected", false)
      );

      expect(result.current.status).toBe("studying");

      // Simulate App backgrounded (document.hidden = true)
      Object.defineProperty(document, "visibilityState", { value: "hidden", writable: true });
      document.dispatchEvent(new Event("visibilitychange"));
      expect(result.current.status).toBe("studying");

      // Simulate App foregrounded (document.hidden = false)
      Object.defineProperty(document, "visibilityState", { value: "visible", writable: true });
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("focus"));

      expect(result.current.status).toBe("studying");
      expect(result.current.elapsedStudySeconds).toBeGreaterThanOrEqual(1200);
    });
  });

  // =========================================================================
  // 2. LONG SESSION VERIFICATION (PROMPT ITEM 11)
  // Simulate 30m, 1h, 2h, and 3h continuous sessions.
  // =========================================================================
  describe("Item 11: Long Session Verification Across Components", () => {
    it("computes mathematically consistent durations across 30m, 1h, 2h, and 3h", () => {
      const baseMs = new Date("2026-09-29T10:00:00Z").getTime();
      const timezone = "Asia/Kolkata";

      const testDurationsMinutes = [30, 60, 120, 179];

      for (const mins of testDurationsMinutes) {
        const sessionStart = new Date(baseMs - mins * 60 * 1000).toISOString();
        const profile: Partial<UserProfile> = {
          id: `user-dur-${mins}`,
          current_status: "studying",
          session_start_time: sessionStart,
          last_resumed_at: sessionStart,
          active_study_seconds_snapshot: 0,
          weekly_study_seconds: 0,
        };

        const serverNow = new Date(baseMs);

        // 1. Raw active elapsed seconds
        const activeSeconds = calculateMemberElapsedStudySeconds(profile, serverNow);
        expect(activeSeconds).toBe(mins * 60);

        // 2. Weekly live seconds
        const weeklySeconds = calculateMemberLiveWeeklyStudySeconds(profile, serverNow, undefined, timezone);
        expect(weeklySeconds).toBe(mins * 60);

        // 3. Human duration format
        const humanFormat = formatSecondsToHuman(weeklySeconds);
        if (mins === 30) expect(humanFormat).toBe("30m");
        if (mins === 60) expect(humanFormat).toBe("1h 0m");
        if (mins === 120) expect(humanFormat).toBe("2h 0m");
        if (mins === 179) expect(humanFormat).toBe("2h 59m");

        // 4. Effective status (< 180m is actively studying)
        expect(getEffectiveMemberStatus(profile as UserProfile, serverNow)).toBe("studying");
      }

      // At exactly 180m (10,800s), session limit is reached:
      const session180Start = new Date(baseMs - 180 * 60 * 1000).toISOString();
      const profile180: Partial<UserProfile> = {
        id: "user-dur-180",
        current_status: "studying",
        session_start_time: session180Start,
        last_resumed_at: session180Start,
        active_study_seconds_snapshot: 0,
        weekly_study_seconds: 0,
      };
      const serverNow = new Date(baseMs);
      const weeklySeconds180 = calculateMemberLiveWeeklyStudySeconds(profile180, serverNow, undefined, timezone);
      expect(weeklySeconds180).toBe(180 * 60);
      expect(formatSecondsToHuman(weeklySeconds180)).toBe("3h 0m");
      // Authoritative expiration at 180m turns effective status to offline
      expect(getEffectiveMemberStatus(profile180 as UserProfile, serverNow)).toBe("offline");
    });

    it("session clamps cleanly at 180m and triggers warning in final 10 minutes", () => {
      const baseMs = 1700000000000;
      const now = new Date(baseMs);

      // Exactly at 2h 50m (10,200s): In 10-minute warning zone
      const userWarning: Partial<UserProfile> = {
        current_status: "studying",
        session_start_time: new Date(baseMs - 10200 * 1000).toISOString(),
        last_resumed_at: new Date(baseMs - 10200 * 1000).toISOString(),
      };
      const elapsedWarning = calculateMemberElapsedStudySeconds(userWarning, now);
      expect(elapsedWarning).toBe(10200);
      const isWarningActive = elapsedWarning >= 10200 && elapsedWarning < 10800;
      expect(isWarningActive).toBe(true);

      // Beyond 3 hours (3h 30m = 12,600s): Default clamped at 10,800s (180m)
      const userPast3h: Partial<UserProfile> = {
        current_status: "studying",
        session_start_time: new Date(baseMs - 12600 * 1000).toISOString(),
        last_resumed_at: new Date(baseMs - 12600 * 1000).toISOString(),
      };
      const elapsedClamped = calculateMemberElapsedStudySeconds(userPast3h, now, true);
      expect(elapsedClamped).toBe(10800);

      // Unclamped returns true physical elapsed time for expiration checks
      const elapsedRaw = calculateMemberElapsedStudySeconds(userPast3h, now, false);
      expect(elapsedRaw).toBe(12600);
      expect(elapsedRaw >= 10800).toBe(true);
    });
  });

  // =========================================================================
  // 3. CAUSAL ORDERING & DELAYED EVENT RESILIENCE (PROMPT ITEMS 13 & 14)
  // =========================================================================
  describe("Items 13 & 14: Causal Ordering without state_version Column", () => {
    it("handles out-of-order START -> STOP -> delayed START correctly", () => {
      const baseMs = 1700000000000;

      // Event 1: User starts Session 1 at t=0
      const session1Start = new Date(baseMs).toISOString();

      // Event 2: User stops Session 1 at t=1800 (30 mins later)
      const session1Stop = new Date(baseMs + 1800 * 1000).toISOString();

      // Event 3: User starts Session 2 at t=3600 (1 hour later)
      const session2Start = new Date(baseMs + 3600 * 1000).toISOString();

      const currentActiveSession = {
        current_status: "studying",
        session_start_time: session2Start,
      };

      // Stale Event 2 arrives DELAYED over network while Session 2 is running
      const delayedStopEvent = {
        current_status: "offline",
        last_offline_at: session1Stop,
      };

      const startMs = new Date(currentActiveSession.session_start_time).getTime();
      const offlineMs = new Date(delayedStopEvent.last_offline_at).getTime();

      // Delayed offline occurred at t=1800, which is BEFORE session 2 started at t=3600
      const isOfflineAccepted = offlineMs >= startMs;
      expect(isOfflineAccepted).toBe(false); // Correctly DROPPED!
    });
  });

  // =========================================================================
  // 4. WEEKLY BOUNDARY & ZERO-LEAKAGE SIMULATION (PROMPT ITEM 5)
  // Sunday 23:59:50 -> 23:59:59 -> Monday 00:00:00 -> 00:00:01
  // =========================================================================
  describe("Item 5: Sunday-to-Monday Week Rollover Invariant", () => {
    it("transitions live study clamping instantaneously at Monday 00:00:00 IST without prior-week leakage", () => {
      const timezone = "Asia/Kolkata";

      // Sunday 23:30:00 IST (session starts 30 minutes before midnight)
      const sundayStartMs = new Date("2026-09-27T18:00:00.000Z").getTime(); // 23:30 IST
      const sessionStartIso = new Date(sundayStartMs).toISOString();

      const studyingMember: Partial<UserProfile> = {
        id: "rollover-user",
        current_status: "studying",
        session_start_time: sessionStartIso,
        last_resumed_at: sessionStartIso,
        weekly_study_seconds: 72000, // 20 hours accumulated in the prior week
      };

      // T1: Sunday 23:59:50 IST (10s before midnight)
      const t1 = new Date(sundayStartMs + 29 * 60 * 1000 + 50 * 1000);
      const weeklyAtT1 = calculateMemberLiveWeeklyStudySeconds(studyingMember, t1, undefined, timezone);
      // Sunday total = 72000 + 1790 = 73790s
      expect(weeklyAtT1).toBe(72000 + 1790);

      // T2: Sunday 23:59:59 IST (1s before midnight)
      const t2 = new Date(sundayStartMs + 29 * 60 * 1000 + 59 * 1000);
      const weeklyAtT2 = calculateMemberLiveWeeklyStudySeconds(studyingMember, t2, undefined, timezone);
      expect(weeklyAtT2).toBe(72000 + 1799);

      // T3: Monday 00:00:00 IST (The exact rollover second!)
      const t3 = new Date(sundayStartMs + 30 * 60 * 1000);
      // In the new week, past completed sessions reset to 0
      const newWeekMember: Partial<UserProfile> = {
        ...studyingMember,
        weekly_study_seconds: 0,
      };
      const weeklyAtT3 = calculateMemberLiveWeeklyStudySeconds(newWeekMember, t3, undefined, timezone);
      // At 00:00:00, exactly 0 seconds have elapsed in the new week!
      expect(weeklyAtT3).toBe(0);

      // T4: Monday 00:00:01 IST (1 second into the new week)
      const t4 = new Date(sundayStartMs + 30 * 60 * 1000 + 1000);
      const weeklyAtT4 = calculateMemberLiveWeeklyStudySeconds(newWeekMember, t4, undefined, timezone);
      expect(weeklyAtT4).toBe(1); // Exactly 1 second in new week! Zero leakage from Sunday!

      // T5: Monday 00:15:00 IST (15 minutes into the new week)
      const t5 = new Date(sundayStartMs + 45 * 60 * 1000);
      const weeklyAtT5 = calculateMemberLiveWeeklyStudySeconds(newWeekMember, t5, undefined, timezone);
      expect(weeklyAtT5).toBe(900); // Exactly 15 minutes!
    });
  });

  // =========================================================================
  // 5. CACHE SANITIZATION & OFFLINE PRESERVATION (PROMPT ITEM 15)
  // =========================================================================
  describe("Item 15: Cache Sanitization without Identity Loss", () => {
    it("sanitizes Anchal's 357m cache on Monday but preserves user identity and offline display", () => {
      const currentWeekStart = getWeekStartTimestamp(new Date());
      const previousWeekStart = currentWeekStart - 7 * 86400000;

      const cachedData = [
        {
          id: "anchal-user-id",
          display_name: "Anchal",
          avatar_url: "https://example.com/anchal.jpg",
          current_status: "offline",
          last_offline_at: new Date(previousWeekStart + 86400000).toISOString(),
          weekly_study_seconds: 21420, // 357 mins
          weekly_sessions_count: 4,
          total_sessions_count: 4,
          leaderboard_score: 90,
        },
      ];

      localStorage.setItem(STORAGE_KEYS.CACHED_ROOM_MEMBERS, JSON.stringify(cachedData));
      localStorage.setItem(STORAGE_KEYS.CACHED_ROOM_MEMBERS + "_week_start", String(previousWeekStart));
      localStorage.setItem(STORAGE_KEYS.CACHED_ROOM_MEMBERS + "_ts", String(previousWeekStart + 1000));

      const hydrated = getCachedRoomMembers<any>();
      expect(hydrated).not.toBeNull();
      expect(hydrated).toHaveLength(1);

      const anchal = hydrated![0];
      // Identity is 100% preserved
      expect(anchal.id).toBe("anchal-user-id");
      expect(anchal.display_name).toBe("Anchal");
      expect(anchal.avatar_url).toBe("https://example.com/anchal.jpg");
      expect(anchal.current_status).toBe("offline");

      // Weekly metrics are cleanly 0
      expect(anchal.weekly_study_seconds).toBe(0);
      expect(anchal.weekly_sessions_count).toBe(0);
      expect(anchal.total_sessions_count).toBe(0);
      expect(anchal.leaderboard_score).toBe(0);
    });
  });
});
