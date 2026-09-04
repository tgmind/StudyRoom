import { describe, it, expect } from "vitest";
import {
  formatDurationSeconds,
  formatMinutesToHours,
  formatSecondsToHuman,
  calculateActiveStudySeconds,
  calculateMemberElapsedStudySeconds,
  calculateMemberLiveBreakSeconds,
  calculateMemberOfflineHours,
  calculateMemberOfflineSeconds,
} from "@/lib/time/format";
import { SessionBlock, UserProfile } from "@/lib/supabase/types";

describe("Time Formatting & Active Study Calculation", () => {
  it("formats seconds into HH:MM:SS or MM:SS correctly", () => {
    expect(formatDurationSeconds(0)).toBe("00:00");
    expect(formatDurationSeconds(45)).toBe("00:45");
    expect(formatDurationSeconds(125)).toBe("02:05");
    expect(formatDurationSeconds(3665)).toBe("01:01:05");
  });

  it("formats minutes into hours string correctly", () => {
    expect(formatMinutesToHours(30)).toBe("30m");
    expect(formatMinutesToHours(60)).toBe("1.0h");
    expect(formatMinutesToHours(145)).toBe("2.4h");
  });

  it("calculates active study time from timestamps while STRICTLY EXCLUDING breaks", () => {
    const baseTime = new Date("2026-09-01T10:00:00Z").getTime();

    const blocks: SessionBlock[] = [
      {
        id: "1",
        user_id: "u1",
        session_id: null,
        block_type: "study",
        start_time: new Date(baseTime).toISOString(), // 10:00
        end_time: new Date(baseTime + 30 * 60 * 1000).toISOString(), // 10:30 (30 mins study)
      },
      {
        id: "2",
        user_id: "u1",
        session_id: null,
        block_type: "break",
        start_time: new Date(baseTime + 30 * 60 * 1000).toISOString(), // 10:30
        end_time: new Date(baseTime + 45 * 60 * 1000).toISOString(), // 10:45 (15 mins break - EXCLUDED!)
      },
      {
        id: "3",
        user_id: "u1",
        session_id: null,
        block_type: "study",
        start_time: new Date(baseTime + 45 * 60 * 1000).toISOString(), // 10:45
        end_time: new Date(baseTime + 75 * 60 * 1000).toISOString(), // 11:15 (30 mins study)
      },
    ];

    const totalActiveSeconds = calculateActiveStudySeconds(blocks);
    // 30 mins + 30 mins = 60 mins = 3600 seconds
    expect(totalActiveSeconds).toBe(3600);
  });

  it("correctly freezes time during break and accurately resumes without counting break duration", () => {
    const t0 = new Date("2026-09-01T10:00:00Z");

    // Case 1: Studying for 10 seconds (0 -> 10s)
    const studyingMember: UserProfile = {
      id: "u1",
      display_name: "Test User",
      avatar_url: null,
      current_status: "studying",
      current_focus: "Math",
      session_start_time: t0.toISOString(),
      last_resumed_at: t0.toISOString(),
      active_study_seconds_snapshot: 0,
      has_achiever_badge: false,
      created_at: t0.toISOString(),
    };

    const at10s = new Date(t0.getTime() + 10 * 1000);
    expect(calculateMemberElapsedStudySeconds(studyingMember, at10s)).toBe(10);

    // Case 2: On break (paused at 10s). User stays on break for 11 seconds (now is t0 + 21s)
    const breakMember: UserProfile = {
      ...studyingMember,
      current_status: "break",
      last_resumed_at: null,
      active_study_seconds_snapshot: 10,
    };

    const at21s = new Date(t0.getTime() + 21 * 1000);
    // Timer MUST stay frozen at exactly 10s during break!
    expect(calculateMemberElapsedStudySeconds(breakMember, at21s)).toBe(10);

    // Case 3: Resumed studying at t0 + 21s. Now evaluates at t0 + 22s (1s after resume)
    const resumedMember: UserProfile = {
      ...studyingMember,
      current_status: "studying",
      last_resumed_at: at21s.toISOString(),
      active_study_seconds_snapshot: 10,
    };

    const at22s = new Date(t0.getTime() + 22 * 1000);
    // Timer MUST be 11s (10s base + 1s since resume) - the 11s break is 100% EXCLUDED!
    expect(calculateMemberElapsedStudySeconds(resumedMember, at22s)).toBe(11);
  });

  it("uses start and break timestamp fallback if snapshot is 0 on break", () => {
    const t0 = new Date("2026-09-01T10:00:00Z");
    const tBreak = new Date("2026-09-01T10:25:00Z"); // 25 mins later
    const tNow = new Date("2026-09-01T10:30:00Z"); // 30 mins later (5m on break)

    const legacyBreakMember: UserProfile = {
      id: "u-legacy",
      display_name: "Legacy User",
      avatar_url: null,
      current_status: "break",
      current_focus: null,
      session_start_time: t0.toISOString(),
      break_started_at: tBreak.toISOString(),
      active_study_seconds_snapshot: 0,
      has_achiever_badge: false,
      created_at: t0.toISOString(),
    };

    expect(calculateMemberElapsedStudySeconds(legacyBreakMember, tNow)).toBe(25 * 60);
  });

  it("formats seconds into human duration strings matching admin format (e.g. 2h 27m or 49m)", () => {
    expect(formatSecondsToHuman(0)).toBe("0m");
    expect(formatSecondsToHuman(59)).toBe("0m");
    expect(formatSecondsToHuman(60)).toBe("1m");
    expect(formatSecondsToHuman(2940)).toBe("49m"); // 49 mins
    expect(formatSecondsToHuman(8820)).toBe("2h 27m"); // 2h 27m
  });

  it("calculates live break timer seconds correctly when on break and 0 when not on break", () => {
    const t0 = new Date("2026-09-01T12:00:00Z");

    const breakUser: UserProfile = {
      id: "u-break",
      display_name: "Break User",
      avatar_url: null,
      current_status: "break",
      current_focus: null,
      session_start_time: t0.toISOString(),
      break_started_at: t0.toISOString(),
      has_achiever_badge: false,
      created_at: t0.toISOString(),
    };

    const at5m = new Date(t0.getTime() + 300 * 1000); // 5 mins later
    expect(calculateMemberLiveBreakSeconds(breakUser, at5m)).toBe(300);

    const offlineUser: UserProfile = {
      ...breakUser,
      current_status: "offline",
    };
    expect(calculateMemberLiveBreakSeconds(offlineUser, at5m)).toBe(0);
  });

  it("strictly caps active study duration at 3 hours (10800 seconds)", () => {
    const t0 = new Date("2026-09-01T10:00:00Z");
    const studyingMember: UserProfile = {
      id: "u-long",
      display_name: "Long Study",
      avatar_url: null,
      current_status: "studying",
      current_focus: "Physics",
      session_start_time: t0.toISOString(),
      last_resumed_at: t0.toISOString(),
      active_study_seconds_snapshot: 0,
      has_achiever_badge: false,
      created_at: t0.toISOString(),
    };

    // 5 hours later (18,000s) -> strictly capped at 10800s (3 hours)
    const at5h = new Date(t0.getTime() + 5 * 3600 * 1000);
    expect(calculateMemberElapsedStudySeconds(studyingMember, at5h)).toBe(10800);
  });

  describe("calculateMemberOfflineHours", () => {
    const baseNow = new Date("2026-09-03T20:00:00Z");

    it("formats less than 1 hour offline as exact minutes like 'Offline 25m'", () => {
      const member = {
        last_offline_at: new Date(baseNow.getTime() - 25 * 60 * 1000).toISOString(), // 25 mins ago
      };
      const result = calculateMemberOfflineHours(member, baseNow);
      expect(result.offlineHours).toBe(0);
      expect(result.formattedPill).toBe("Offline 25m");
      expect(result.formattedDetailed).toBe("Offline for 25 minutes");
    });

    it("formats 0 minutes offline as 'Offline 0m'", () => {
      const member = {
        last_offline_at: new Date(baseNow.getTime() - 30 * 1000).toISOString(), // 30 secs ago
      };
      const result = calculateMemberOfflineHours(member, baseNow);
      expect(result.offlineHours).toBe(0);
      expect(result.formattedPill).toBe("Offline 0m");
    });

    it("formats 59 minutes offline as 'Offline 59m'", () => {
      const member = {
        last_offline_at: new Date(baseNow.getTime() - 59 * 60 * 1000).toISOString(), // 59 mins ago
      };
      const result = calculateMemberOfflineHours(member, baseNow);
      expect(result.offlineHours).toBe(0);
      expect(result.formattedPill).toBe("Offline 59m");
    });

    it("formats 4 hours offline as 'Offline 4h'", () => {
      const member = {
        last_offline_at: new Date(baseNow.getTime() - 4 * 3600 * 1000).toISOString(),
      };
      const result = calculateMemberOfflineHours(member, baseNow);
      expect(result.offlineHours).toBe(4);
      expect(result.formattedPill).toBe("Offline 4h");
      expect(result.formattedDetailed).toBe("Offline for 4 hours");
    });

    it("formats 24 hours offline as 'Offline 24h'", () => {
      const member = {
        last_offline_at: new Date(baseNow.getTime() - 24 * 3600 * 1000).toISOString(),
      };
      const result = calculateMemberOfflineHours(member, baseNow);
      expect(result.offlineHours).toBe(24);
      expect(result.formattedPill).toBe("Offline 24h");
      expect(result.formattedDetailed).toBe("Offline for 24 hours (~1 day)");
    });

    it("formats 72 hours (3 days) offline as 'Offline 72h'", () => {
      const member = {
        last_offline_at: new Date(baseNow.getTime() - 72 * 3600 * 1000).toISOString(),
      };
      const result = calculateMemberOfflineHours(member, baseNow);
      expect(result.offlineHours).toBe(72);
      expect(result.formattedPill).toBe("Offline 72h");
      expect(result.formattedDetailed).toBe("Offline for 72 hours (~3 days)");
    });

    it("falls back to created_at when last_offline_at is missing", () => {
      const member = {
        created_at: new Date(baseNow.getTime() - 10 * 3600 * 1000).toISOString(),
      };
      const result = calculateMemberOfflineHours(member, baseNow);
      expect(result.offlineHours).toBe(10);
      expect(result.formattedPill).toBe("Offline 10h");
    });

    it("returns safe default when no timestamps exist", () => {
      const result = calculateMemberOfflineHours({}, baseNow);
      expect(result.offlineHours).toBe(0);
      expect(result.formattedPill).toBe("Offline");
    });
  });

  describe("calculateMemberOfflineSeconds", () => {
    const baseNow = new Date("2026-09-03T20:00:00Z");

    it("calculates exact seconds elapsed since last_offline_at", () => {
      const member = {
        last_offline_at: new Date(baseNow.getTime() - 1500 * 1000).toISOString(), // 25 mins = 1500s
      };
      expect(calculateMemberOfflineSeconds(member, baseNow)).toBe(1500);
    });

    it("calculates seconds for expired breaks correctly", () => {
      // Break started 70 minutes ago (4200s). Max break is 60 minutes (3600s).
      // So member has been offline for 70 - 60 = 10 minutes = 600 seconds.
      const breakStartedAt = new Date(baseNow.getTime() - 70 * 60 * 1000).toISOString();
      const member = {
        current_status: "break" as const,
        break_started_at: breakStartedAt,
      };
      expect(calculateMemberOfflineSeconds(member, baseNow)).toBe(600);
    });

    it("calculates seconds for expired 3-hour study sessions correctly", () => {
      // Started studying 185 mins ago (11100s). Max study is 180 mins (10800s).
      // So member has been offline for 11100 - 10800 = 300 seconds (5 mins).
      const startTime = new Date(baseNow.getTime() - 185 * 60 * 1000).toISOString();
      const member = {
        current_status: "studying" as const,
        session_start_time: startTime,
        last_resumed_at: startTime,
        active_study_seconds_snapshot: 0,
      };
      expect(calculateMemberOfflineSeconds(member, baseNow)).toBe(300);
    });

    it("falls back to created_at when last_offline_at is missing", () => {
      const member = {
        created_at: new Date(baseNow.getTime() - 3600 * 1000).toISOString(), // 1 hour = 3600s
      };
      expect(calculateMemberOfflineSeconds(member, baseNow)).toBe(3600);
    });

    it("returns Number.MAX_SAFE_INTEGER when no timestamps exist", () => {
      expect(calculateMemberOfflineSeconds({}, baseNow)).toBe(Number.MAX_SAFE_INTEGER);
    });
  });
});
