import { describe, it, expect } from "vitest";
import {
  formatDurationSeconds,
  formatMinutesToHours,
  formatSecondsToHuman,
  calculateActiveStudySeconds,
  calculateMemberElapsedStudySeconds,
  calculateMemberLiveBreakSeconds,
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
});
