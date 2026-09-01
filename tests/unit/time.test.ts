import { describe, it, expect } from "vitest";
import {
  formatDurationSeconds,
  formatMinutesToHours,
  calculateActiveStudySeconds,
  calculateMemberElapsedStudySeconds,
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
});
