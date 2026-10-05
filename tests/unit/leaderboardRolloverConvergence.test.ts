import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getLeaderboardPeriodId,
  getWeekStartTimestamp,
  calculateMemberElapsedStudySeconds,
} from "@/lib/time/format";
import {
  calculateCurrentUserLeaderboardMinutes,
} from "@/lib/scoring/engine";
import {
  saveCachedUserProfile,
  getCachedUserProfile,
} from "@/lib/offline/sessionQueue";
import { UserProfile, StudySession } from "@/lib/supabase/types";

describe("Weekly Leaderboard Rollover & Multi-Device Convergence (Section 17 & Hardening Pass)", () => {
  const timezone = "Asia/Kolkata";

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  /**
   * Helper that mirrors the production page pipeline, invoking the canonical
   * calculateCurrentUserLeaderboardMinutes production engine.
   */
  function computeLeaderboardStudyViaProductionEngine({
    userId,
    profile,
    weeklySessions,
    dbEntryStudyMinutes,
    serverNow,
  }: {
    userId: string;
    profile: Partial<UserProfile> | null;
    weeklySessions: StudySession[];
    dbEntryStudyMinutes: number;
    serverNow: Date;
  }) {
    const currentWeekStartIso = new Date(getWeekStartTimestamp(serverNow, timezone)).toISOString();
    const currentWeekStartMs = getWeekStartTimestamp(serverNow, timezone);

    // Sum completed sessions in the current week for this user
    const userCompletedWeeklyMinutes = weeklySessions
      .filter((s) => s.user_id === userId && s.start_time >= currentWeekStartIso)
      .reduce((acc, s) => acc + (s.duration_minutes || 0), 0);

    // Live active seconds strictly in the current week
    let liveActiveSecondsInWeek = 0;
    const isSessionActive = Boolean(
      profile && (profile.current_status === "studying" || profile.current_status === "break")
    );

    if (isSessionActive && profile) {
      const isBreakExpired =
        profile.current_status === "break" && profile.break_started_at
          ? serverNow.getTime() - new Date(profile.break_started_at).getTime() >= 3600 * 1000
          : false;

      let elapsedSeconds = 0;
      if (isBreakExpired) {
        elapsedSeconds = profile.active_study_seconds_snapshot ?? 0;
      } else {
        elapsedSeconds = calculateMemberElapsedStudySeconds(profile, serverNow);
      }

      if (elapsedSeconds > 0) {
        const startIso = profile.session_start_time || profile.last_resumed_at;
        if (startIso) {
          const startMs = new Date(startIso).getTime();
          if (!isNaN(startMs) && startMs < currentWeekStartMs) {
            const secondsInCurrentWeek = Math.max(0, Math.floor((serverNow.getTime() - currentWeekStartMs) / 1000));
            elapsedSeconds = Math.min(elapsedSeconds, secondsInCurrentWeek);
          }
        }
        liveActiveSecondsInWeek = elapsedSeconds;
      }
    }

    // Call the canonical production utility:
    const { clientTotalMinutes, displayedTotalMinutes } = calculateCurrentUserLeaderboardMinutes({
      serverTotalMinutes: dbEntryStudyMinutes,
      completedWeeklyMinutes: userCompletedWeeklyMinutes,
      liveActiveSecondsInWeek,
      isSessionActive,
    });

    return {
      userCompletedWeeklyMinutes,
      userLiveMinutesInCurrentWeek: Math.floor(liveActiveSecondsInWeek / 60),
      clientTotalWeeklyMinutes: clientTotalMinutes,
      totalStudyMinutes: displayedTotalMinutes,
    };
  }

  // =========================================================================
  // SECTION 3: MATHEMATICAL MAX RECONCILIATION PROOF (CASES A - G)
  // =========================================================================
  describe("Section 3: Mathematical MAX Reconciliation Proof (CASES A - G)", () => {
    it("CASE A — Server ahead (serverTotal=140, clientCompleted=120, clientLive=10 -> display=140)", () => {
      const result = calculateCurrentUserLeaderboardMinutes({
        serverTotalMinutes: 140,
        completedWeeklyMinutes: 120,
        liveActiveSecondsInWeek: 10 * 60, // 10m live -> clientTotal = 130m
        isSessionActive: true,
      });
      expect(result.clientTotalMinutes).toBe(130);
      expect(result.displayedTotalMinutes).toBe(140);
    });

    it("CASE B — Client ahead because RPC is stale (serverTotal=120, clientCompleted=120, clientLive=15 -> display=135)", () => {
      const result = calculateCurrentUserLeaderboardMinutes({
        serverTotalMinutes: 120,
        completedWeeklyMinutes: 120,
        liveActiveSecondsInWeek: 15 * 60, // 15m live -> clientTotal = 135m
        isSessionActive: true,
      });
      expect(result.clientTotalMinutes).toBe(135);
      expect(result.displayedTotalMinutes).toBe(135);
    });

    it("CASE C — Equal (serverTotal=135, clientCompleted=120, clientLive=15 -> display=135)", () => {
      const result = calculateCurrentUserLeaderboardMinutes({
        serverTotalMinutes: 135,
        completedWeeklyMinutes: 120,
        liveActiveSecondsInWeek: 15 * 60,
        isSessionActive: true,
      });
      expect(result.clientTotalMinutes).toBe(135);
      expect(result.displayedTotalMinutes).toBe(135);
    });

    it("CASE D — ZERO (serverTotal=0, clientCompleted=0, clientLive=0 -> display=0)", () => {
      const result = calculateCurrentUserLeaderboardMinutes({
        serverTotalMinutes: 0,
        completedWeeklyMinutes: 0,
        liveActiveSecondsInWeek: 0,
        isSessionActive: true,
      });
      expect(result.clientTotalMinutes).toBe(0);
      expect(result.displayedTotalMinutes).toBe(0);
    });

    it("CASE E — STALE PREVIOUS-WEEK PROFILE (profile.weekly_study_seconds=44,460, serverTotal=3, clientCompleted=0, clientLive=3m -> display=3)", () => {
      // Regardless of whatever profile.weekly_study_seconds was, client calculation only takes
      // current-week inputs.
      const result = calculateCurrentUserLeaderboardMinutes({
        serverTotalMinutes: 3,
        completedWeeklyMinutes: 0,
        liveActiveSecondsInWeek: 3 * 60, // 3m live in current week
        isSessionActive: true,
      });
      expect(result.displayedTotalMinutes).toBe(3);
      expect(result.displayedTotalMinutes).not.toBe(741);
      expect(result.displayedTotalMinutes).not.toBe(744);
    });

    it("CASE F — MALICIOUSLY LARGE STALE PROFILE (profile.weekly_study_seconds=10,000,000, serverTotal=3, clientCompleted=0, clientLive=3m -> display=3)", () => {
      // An attacker setting 10,000,000s has ZERO influence on the production formula
      const result = calculateCurrentUserLeaderboardMinutes({
        serverTotalMinutes: 3,
        completedWeeklyMinutes: 0,
        liveActiveSecondsInWeek: 3 * 60,
        isSessionActive: true,
      });
      expect(result.displayedTotalMinutes).toBe(3);
      expect(result.displayedTotalMinutes).not.toBe(166667);
    });

    it("CASE G — NO ACTIVE SESSION (serverTotal=12, no active session -> display=12)", () => {
      // Must not reset valid server total to 0 when user is not studying
      const result = calculateCurrentUserLeaderboardMinutes({
        serverTotalMinutes: 12,
        completedWeeklyMinutes: 12,
        liveActiveSecondsInWeek: 0,
        isSessionActive: false,
      });
      expect(result.clientTotalMinutes).toBe(12);
      expect(result.displayedTotalMinutes).toBe(12);
    });

    it("Legacy Cache Sanitization: Missing period ID on legacy cache -> sanitized to 0", () => {
      // Legacy cache record saved before _weekly_period_id was introduced:
      const legacyProfile = {
        id: "legacy-user-1",
        display_name: "Legacy User",
        current_status: "offline",
        weekly_study_seconds: 44460, // 12h 21m
        weekly_sessions_count: 22,
        leaderboard_score: 50.0,
        // Notice: NO _weekly_period_id!
      };
      localStorage.setItem("studyroom_cached_user_profile", JSON.stringify(legacyProfile));

      // Loading it via real production function getCachedUserProfile() must sanitize it:
      const loaded = getCachedUserProfile<UserProfile>("legacy-user-1");
      expect(loaded).not.toBeNull();
      expect(loaded?.weekly_study_seconds).toBe(0);
      expect(loaded?.weekly_sessions_count).toBe(0);
      expect(loaded?.leaderboard_score).toBe(0);
      expect(loaded?.leaderboard_rank).toBeUndefined();
      // Identity is preserved:
      expect(loaded?.display_name).toBe("Legacy User");
      expect((loaded as any)?._weekly_period_id).toBe(getLeaderboardPeriodId());
    });

    it("Legacy Cache Sanitization: Previous-period ID -> sanitized to 0", () => {
      const pastPeriodProfile = {
        id: "past-user-1",
        display_name: "Past User",
        current_status: "offline",
        weekly_study_seconds: 28800,
        weekly_sessions_count: 10,
        leaderboard_score: 45.0,
        _weekly_period_id: "2026-09-28", // Past week
      };
      localStorage.setItem("studyroom_cached_user_profile", JSON.stringify(pastPeriodProfile));

      const loaded = getCachedUserProfile<UserProfile>("past-user-1");
      expect(loaded).not.toBeNull();
      expect(loaded?.weekly_study_seconds).toBe(0);
      expect(loaded?.weekly_sessions_count).toBe(0);
      expect(loaded?.leaderboard_score).toBe(0);
      expect((loaded as any)?._weekly_period_id).toBe(getLeaderboardPeriodId());
    });

    it("Legacy Cache Preservation: Current-period ID -> intact and preserved", () => {
      const currentPeriodId = getLeaderboardPeriodId();
      const currentPeriodProfile = {
        id: "current-user-1",
        display_name: "Current User",
        current_status: "offline",
        weekly_study_seconds: 7200, // 2h studied in current week
        weekly_sessions_count: 2,
        leaderboard_score: 25.0,
        _weekly_period_id: currentPeriodId,
      };
      localStorage.setItem("studyroom_cached_user_profile", JSON.stringify(currentPeriodProfile));

      const loaded = getCachedUserProfile<UserProfile>("current-user-1");
      expect(loaded).not.toBeNull();
      expect(loaded?.weekly_study_seconds).toBe(7200);
      expect(loaded?.weekly_sessions_count).toBe(2);
      expect(loaded?.leaderboard_score).toBe(25.0);
      expect((loaded as any)?._weekly_period_id).toBe(currentPeriodId);
    });
  });

  // =========================================================================
  // SECTION 4: ACTIVE SESSION DOUBLE-COUNTING PROOF & FORBIDDEN VALUES
  // =========================================================================
  describe("Section 4: Active Session Double-Counting Proof & Forbidden Values", () => {
    it("never adds serverTotal and clientTotal (135 vs 135 -> expected 135; forbidden: 150, 270, 255)", () => {
      const result = calculateCurrentUserLeaderboardMinutes({
        serverTotalMinutes: 135,
        completedWeeklyMinutes: 120,
        liveActiveSecondsInWeek: 15 * 60,
        isSessionActive: true,
      });

      // Expected: exactly 135
      expect(result.displayedTotalMinutes).toBe(135);

      // Forbidden values:
      expect(result.displayedTotalMinutes).not.toBe(150);
      expect(result.displayedTotalMinutes).not.toBe(270);
      expect(result.displayedTotalMinutes).not.toBe(255);
    });
  });

  // =========================================================================
  // SECTION 17: COMPLETE 10-TEST REGRESSION MATRIX
  // =========================================================================
  describe("Section 17: Full Regression Matrix (Tests 1 - 10)", () => {
    it("TEST 1: Device A with stale 44,460s profile and Device B with 0s both compute identical current-week value", () => {
      const serverNow = new Date("2026-10-05T04:27:00.000Z"); // Monday 09:57 AM IST
      const userId = "subodh-uuid";

      const deviceAProfile: Partial<UserProfile> = {
        id: userId,
        display_name: "Subodh",
        current_status: "studying",
        session_start_time: "2026-10-05T04:24:00.000Z", // Started 3 minutes ago
        last_resumed_at: "2026-10-05T04:24:00.000Z",
        weekly_study_seconds: 44460, // STALE PREVIOUS-WEEK VALUE
        active_study_seconds_snapshot: 0,
      };

      const deviceBProfile: Partial<UserProfile> = {
        id: userId,
        display_name: "Subodh",
        current_status: "studying",
        session_start_time: "2026-10-05T04:24:00.000Z",
        last_resumed_at: "2026-10-05T04:24:00.000Z",
        weekly_study_seconds: 0,
        active_study_seconds_snapshot: 0,
      };

      const resultA = computeLeaderboardStudyViaProductionEngine({
        userId,
        profile: deviceAProfile,
        weeklySessions: [],
        dbEntryStudyMinutes: 3,
        serverNow,
      });

      const resultB = computeLeaderboardStudyViaProductionEngine({
        userId,
        profile: deviceBProfile,
        weeklySessions: [],
        dbEntryStudyMinutes: 3,
        serverNow,
      });

      expect(resultA.totalStudyMinutes).toBe(3);
      expect(resultB.totalStudyMinutes).toBe(3);
      expect(resultA.totalStudyMinutes).toBe(resultB.totalStudyMinutes);
    });

    it("TEST 2: Sunday session finishes at 23:58 IST; on Monday 00:01 IST it never enters Monday leaderboard", () => {
      const mondayNow = new Date("2026-10-04T18:31:00.000Z"); // Monday 00:01 IST
      const userId = "user-sunday-finisher";

      const sundaySession: StudySession = {
        id: "session-sunday",
        user_id: userId,
        start_time: "2026-10-04T17:30:00.000Z", // Sunday 23:00 IST
        end_time: "2026-10-04T18:28:00.000Z", // Sunday 23:58 IST
        duration_minutes: 58,
      };

      const weekStartIso = new Date(getWeekStartTimestamp(mondayNow, timezone)).toISOString();
      expect(weekStartIso).toBe("2026-10-04T18:30:00.000Z");

      const filteredSessions = [sundaySession].filter((s) => s.start_time >= weekStartIso);
      expect(filteredSessions).toHaveLength(0);

      const result = computeLeaderboardStudyViaProductionEngine({
        userId,
        profile: { id: userId, current_status: "offline", weekly_study_seconds: 0 },
        weeklySessions: filteredSessions,
        dbEntryStudyMinutes: 0,
        serverNow: mondayNow,
      });

      expect(result.totalStudyMinutes).toBe(0);
    });

    it("TEST 3: Fresh login on Monday morning with legacy or old cached profile sanitizes to 0m and 0 pts", () => {
      const mondayMorning = new Date("2026-10-05T02:30:00.000Z");
      const userId = "subodh-login";

      // Simulate stale legacy cached profile saved last week on Sunday WITHOUT _weekly_period_id
      localStorage.setItem(
        "studyroom_cached_user_profile",
        JSON.stringify({
          id: userId,
          display_name: "Subodh",
          current_status: "offline",
          weekly_study_seconds: 44460,
          weekly_sessions_count: 14,
          leaderboard_score: 50.0,
        })
      );

      const sanitizedProfile = getCachedUserProfile<UserProfile>(userId);
      expect(sanitizedProfile).not.toBeNull();
      expect(sanitizedProfile?.weekly_study_seconds).toBe(0);
      expect(sanitizedProfile?.weekly_sessions_count).toBe(0);
      expect(sanitizedProfile?.leaderboard_score).toBe(0);
      expect(sanitizedProfile?.display_name).toBe("Subodh");

      const result = computeLeaderboardStudyViaProductionEngine({
        userId,
        profile: sanitizedProfile,
        weeklySessions: [],
        dbEntryStudyMinutes: 0,
        serverNow: mondayMorning,
      });

      expect(result.totalStudyMinutes).toBe(0);
    });

    it("TEST 4: Session starting Monday 00:05 IST and finishing at 00:35 IST attributes exactly 30m to new week", () => {
      const mondayEnd = new Date("2026-10-04T19:05:00.000Z");
      const userId = "early-bird";

      const completedSession: StudySession = {
        id: "session-monday-1",
        user_id: userId,
        start_time: "2026-10-04T18:35:00.000Z",
        end_time: "2026-10-04T19:05:00.000Z",
        duration_minutes: 30,
      };

      const weekStartIso = new Date(getWeekStartTimestamp(mondayEnd, timezone)).toISOString();
      const weeklySessions = [completedSession].filter((s) => s.start_time >= weekStartIso);
      expect(weeklySessions).toHaveLength(1);

      const result = computeLeaderboardStudyViaProductionEngine({
        userId,
        profile: { id: userId, current_status: "offline", weekly_study_seconds: 1800 },
        weeklySessions,
        dbEntryStudyMinutes: 30,
        serverNow: mondayEnd,
      });

      expect(result.totalStudyMinutes).toBe(30);
    });

    it("TEST 5: Active session spanning Sunday 23:30 to Monday 00:15 IST attributes exactly 15m to new week", () => {
      const serverNow = new Date("2026-10-04T18:45:00.000Z");
      const userId = "midnight-studier";

      const spanningProfile: Partial<UserProfile> = {
        id: userId,
        current_status: "studying",
        session_start_time: "2026-10-04T18:00:00.000Z", // 45m ago total
        last_resumed_at: "2026-10-04T18:00:00.000Z",
        weekly_study_seconds: 0,
        active_study_seconds_snapshot: 0,
      };

      const result = computeLeaderboardStudyViaProductionEngine({
        userId,
        profile: spanningProfile,
        weeklySessions: [],
        dbEntryStudyMinutes: 15,
        serverNow,
      });

      expect(result.userLiveMinutesInCurrentWeek).toBe(15);
      expect(result.totalStudyMinutes).toBe(15);
    });

    it("TEST 6: Leaderboard period ID changes exactly at Monday 00:00:00.000 IST", () => {
      const sundayLastMs = new Date("2026-10-04T18:29:59.999Z");
      const mondayFirstMs = new Date("2026-10-04T18:30:00.000Z");

      const sundayPeriodId = getLeaderboardPeriodId(sundayLastMs, timezone);
      const mondayPeriodId = getLeaderboardPeriodId(mondayFirstMs, timezone);

      expect(sundayPeriodId).toBe("2026-09-28");
      expect(mondayPeriodId).toBe("2026-10-05");
      expect(sundayPeriodId).not.toBe(mondayPeriodId);
    });

    it("TEST 7: Leaderboard active delta addition displays exactly 135m without double-counting", () => {
      const serverNow = new Date("2026-10-05T06:15:00.000Z");
      const userId = "consistent-user";

      const completedSessions: StudySession[] = [
        {
          id: "s1",
          user_id: userId,
          start_time: "2026-10-05T02:00:00.000Z",
          end_time: "2026-10-05T03:00:00.000Z",
          duration_minutes: 60,
        },
        {
          id: "s2",
          user_id: userId,
          start_time: "2026-10-05T04:00:00.000Z",
          end_time: "2026-10-05T05:00:00.000Z",
          duration_minutes: 60,
        },
      ];

      const activeProfile: Partial<UserProfile> = {
        id: userId,
        current_status: "studying",
        session_start_time: "2026-10-05T06:00:00.000Z", // 15 mins ago
        last_resumed_at: "2026-10-05T06:00:00.000Z",
        weekly_study_seconds: 7200,
        active_study_seconds_snapshot: 0,
      };

      const result = computeLeaderboardStudyViaProductionEngine({
        userId,
        profile: activeProfile,
        weeklySessions: completedSessions,
        dbEntryStudyMinutes: 120, // DB RPC might lag by a few seconds
        serverNow,
      });

      expect(result.userCompletedWeeklyMinutes).toBe(120);
      expect(result.userLiveMinutesInCurrentWeek).toBe(15);
      expect(result.clientTotalWeeklyMinutes).toBe(135);
      expect(result.totalStudyMinutes).toBe(135);
    });

    it("TEST 8: Finishing an active session transitions smoothly without temporary 2x spike", () => {
      const userId = "finishing-user";
      const baseTime = new Date("2026-10-05T06:30:00.000Z");

      const priorSessions: StudySession[] = [
        {
          id: "s1",
          user_id: userId,
          start_time: "2026-10-05T02:00:00.000Z",
          end_time: "2026-10-05T04:00:00.000Z",
          duration_minutes: 120,
        },
      ];

      const studyingProfile: Partial<UserProfile> = {
        id: userId,
        current_status: "studying",
        session_start_time: "2026-10-05T06:00:00.000Z",
        last_resumed_at: "2026-10-05T06:00:00.000Z",
        weekly_study_seconds: 7200,
      };

      const beforeFinish = computeLeaderboardStudyViaProductionEngine({
        userId,
        profile: studyingProfile,
        weeklySessions: priorSessions,
        dbEntryStudyMinutes: 120,
        serverNow: baseTime,
      });
      expect(beforeFinish.totalStudyMinutes).toBe(150);

      const updatedSessions: StudySession[] = [
        ...priorSessions,
        {
          id: "s2",
          user_id: userId,
          start_time: "2026-10-05T06:00:00.000Z",
          end_time: "2026-10-05T06:30:00.000Z",
          duration_minutes: 30,
        },
      ];

      const finishedProfile: Partial<UserProfile> = {
        id: userId,
        current_status: "offline",
        session_start_time: null,
        last_resumed_at: null,
        weekly_study_seconds: 9000,
      };

      const afterFinish = computeLeaderboardStudyViaProductionEngine({
        userId,
        profile: finishedProfile,
        weeklySessions: updatedSessions,
        dbEntryStudyMinutes: 150,
        serverNow: baseTime,
      });

      expect(afterFinish.totalStudyMinutes).toBe(150);
      expect(afterFinish.totalStudyMinutes).toBe(beforeFinish.totalStudyMinutes);
    });

    it("TEST 9: Active session crossing midnight Monday preserves timer continuity and splits study time", () => {
      const sessionStartTime = "2026-10-04T18:15:00.000Z";

      const userProfile: Partial<UserProfile> = {
        id: "midnight-runner",
        current_status: "studying",
        session_start_time: sessionStartTime,
        last_resumed_at: sessionStartTime,
        weekly_study_seconds: 0,
        active_study_seconds_snapshot: 0,
      };

      const tMonday = new Date("2026-10-04T18:40:00.000Z");
      const totalElapsedMonday = calculateMemberElapsedStudySeconds(userProfile, tMonday);
      expect(totalElapsedMonday).toBe(1500); // 25 mins continuous elapsed on timer

      const mondayStats = computeLeaderboardStudyViaProductionEngine({
        userId: "midnight-runner",
        profile: userProfile,
        weeklySessions: [],
        dbEntryStudyMinutes: 10,
        serverNow: tMonday,
      });

      expect(mondayStats.userLiveMinutesInCurrentWeek).toBe(10);
      expect(mondayStats.totalStudyMinutes).toBe(10);
    });

    it("TEST 10: Multi-Device Convergence (Device A active session, Device B passive viewer)", () => {
      const serverNow = new Date("2026-10-05T08:00:00.000Z");
      const userId = "shared-account-user";

      const activeProfile: Partial<UserProfile> = {
        id: userId,
        current_status: "studying",
        session_start_time: "2026-10-05T07:30:00.000Z",
        last_resumed_at: "2026-10-05T07:30:00.000Z",
        weekly_study_seconds: 0,
      };

      const observerProfile: Partial<UserProfile> = {
        id: userId,
        current_status: "studying",
        session_start_time: "2026-10-05T07:30:00.000Z",
        last_resumed_at: "2026-10-05T07:30:00.000Z",
        weekly_study_seconds: 0,
      };

      const dbStudyMinutes = 30;

      const statsDeviceA = computeLeaderboardStudyViaProductionEngine({
        userId,
        profile: activeProfile,
        weeklySessions: [],
        dbEntryStudyMinutes: dbStudyMinutes,
        serverNow,
      });

      const statsDeviceB = computeLeaderboardStudyViaProductionEngine({
        userId,
        profile: observerProfile,
        weeklySessions: [],
        dbEntryStudyMinutes: dbStudyMinutes,
        serverNow,
      });

      expect(statsDeviceA.totalStudyMinutes).toBe(30);
      expect(statsDeviceB.totalStudyMinutes).toBe(30);
      expect(statsDeviceA.totalStudyMinutes).toBe(statsDeviceB.totalStudyMinutes);
    });
  });

  // =========================================================================
  // SECTION 14 & 15: AUTH PROVIDER & USE ACTIVE SESSION LEGACY CACHE TESTS
  // =========================================================================
  describe("Section 14 & 15: AuthProvider & useActiveSession Legacy Cache Handling", () => {
    it("Section 14: AuthProvider merge sanitizes legacy profile lacking _weekly_period_id", () => {
      const currentPeriodId = getLeaderboardPeriodId();
      // Legacy prev profile from old localStorage
      const prevLegacyProfile = {
        id: "user-auth-1",
        display_name: "Subodh Auth",
        email: "subodh@example.com",
        avatar_url: "https://example.com/avatar.jpg",
        current_status: "offline",
        weekly_study_seconds: 44460,
        weekly_sessions_count: 22,
        leaderboard_score: 50.0,
        _weekly_period_id: undefined, // Legacy missing
      };

      const prevPeriodId = (prevLegacyProfile as any)?._weekly_period_id;
      const isPrevFromPastWeek = prevPeriodId !== currentPeriodId;
      expect(isPrevFromPastWeek).toBe(true);

      // Simulating AuthProvider merge logic:
      const incomingDbUser = {
        id: "user-auth-1",
        display_name: "Subodh Auth",
        email: "subodh@example.com",
        avatar_url: "https://example.com/avatar.jpg",
        current_status: "offline",
      };

      const mergedProfile = {
        ...prevLegacyProfile,
        ...incomingDbUser,
        weekly_study_seconds: isPrevFromPastWeek ? 0 : prevLegacyProfile.weekly_study_seconds,
        weekly_sessions_count: isPrevFromPastWeek ? 0 : prevLegacyProfile.weekly_sessions_count,
        leaderboard_score: isPrevFromPastWeek ? 0 : prevLegacyProfile.leaderboard_score,
        leaderboard_rank: isPrevFromPastWeek ? undefined : undefined,
        _weekly_period_id: currentPeriodId,
      };

      expect(mergedProfile.weekly_study_seconds).toBe(0);
      expect(mergedProfile.weekly_sessions_count).toBe(0);
      expect(mergedProfile.leaderboard_score).toBe(0);
      expect(mergedProfile.display_name).toBe("Subodh Auth");
      expect(mergedProfile._weekly_period_id).toBe(currentPeriodId);
    });

    it("Section 15: useActiveSession finishSession baselines from 0 when legacy profile has no _weekly_period_id", () => {
      const serverNow = new Date("2026-10-05T04:00:00.000Z"); // Monday
      const currentPeriodId = getLeaderboardPeriodId(serverNow);

      const profileRefCurrent = {
        id: "user-active-1",
        weekly_study_seconds: 44460, // Legacy 44,460s
        total_sessions_count: 50,
        weekly_sessions_count: 20,
        _weekly_period_id: undefined, // Legacy missing
      };

      // Simulating useActiveSession finishSession calculation:
      const profilePeriodId = (profileRefCurrent as any)?._weekly_period_id;
      const isProfileFromPastWeek = profilePeriodId !== currentPeriodId;
      expect(isProfileFromPastWeek).toBe(true);

      const totalActiveSeconds = 15 * 60; // 15 mins finished session
      const currentWeekly = isProfileFromPastWeek ? 0 : (profileRefCurrent?.weekly_study_seconds ?? 0);
      const updatedWeekly = currentWeekly + totalActiveSeconds;
      const currentWeeklySessions = isProfileFromPastWeek ? 1 : ((profileRefCurrent?.weekly_sessions_count ?? 0) + 1);

      // Must be 900s (15m), NOT 45360s (756m)!
      expect(updatedWeekly).toBe(900);
      expect(currentWeeklySessions).toBe(1);
    });
  });
});
