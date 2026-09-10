import { describe, it, expect } from "vitest";
import {
  calculateQualifyingStreak,
  calculateWeeklyStreak,
  DailyStudySummary,
  getDateInTimezone,
} from "@/lib/scoring/streak";
import { StudySession } from "@/lib/supabase/types";

describe("Streak Calculation (30-Minute Threshold & Timezones)", () => {
  it("calculates consecutive qualifying study days (>= 30 active study mins)", () => {
    const refDate = new Date("2026-09-03T12:00:00Z");

    const summaries: DailyStudySummary[] = [
      { dateISO: "2026-09-01", activeStudyMinutes: 45 },
      { dateISO: "2026-09-02", activeStudyMinutes: 60 },
      { dateISO: "2026-09-03", activeStudyMinutes: 30 },
    ];

    const streak = calculateQualifyingStreak(summaries, refDate, "Asia/Kolkata");
    expect(streak).toBe(3);
  });

  it("handles days below 30 minutes threshold as non-qualifying", () => {
    const refDate = new Date("2026-09-03T12:00:00Z");

    const summaries: DailyStudySummary[] = [
      { dateISO: "2026-09-01", activeStudyMinutes: 45 },
      { dateISO: "2026-09-02", activeStudyMinutes: 15 }, // Below 30 mins! Breaks streak
      { dateISO: "2026-09-03", activeStudyMinutes: 30 },
    ];

    const streak = calculateQualifyingStreak(summaries, refDate, "Asia/Kolkata");
    expect(streak).toBe(1);
  });

  it("correctly formats local date for India (Asia/Kolkata)", () => {
    // 2026-09-01T20:00:00Z is 2026-09-02 01:30:00 IST in India
    const midnightUtc = new Date("2026-09-01T20:00:00Z");
    expect(getDateInTimezone(midnightUtc, "Asia/Kolkata")).toBe("2026-09-02");
    expect(getDateInTimezone(midnightUtc, "UTC")).toBe("2026-09-01");
  });

  describe("calculateWeeklyStreak (Weekly Study Heatmap Alignment & Monday Reset)", () => {
    // 2026-09-10 is Thursday in week Sep 7 (Mon) to Sep 13 (Sun)
    const thursdayDate = new Date("2026-09-10T12:00:00+05:30");

    it("returns 0 on weekly reset (Monday before any sessions)", () => {
      const mondayReset = new Date("2026-09-07T00:00:01+05:30");
      const sessions: StudySession[] = [];
      const streak = calculateWeeklyStreak(sessions, mondayReset, 0, "Asia/Kolkata");
      expect(streak).toBe(0);
    });

    it("returns exact count of qualifying days in the current week matching the heatmap", () => {
      // User studied Mon (Sep 7), Tue (Sep 8), Wed (Sep 9), Thu (Sep 10)
      const sessions: StudySession[] = [
        {
          id: "s1",
          user_id: "u1",
          start_time: "2026-09-07T10:00:00+05:30",
          end_time: "2026-09-07T12:00:00+05:30",
          duration_minutes: 120,
        },
        {
          id: "s2",
          user_id: "u1",
          start_time: "2026-09-08T10:00:00+05:30",
          end_time: "2026-09-08T11:00:00+05:30",
          duration_minutes: 60,
        },
        {
          id: "s3",
          user_id: "u1",
          start_time: "2026-09-09T14:00:00+05:30",
          end_time: "2026-09-09T16:00:00+05:30",
          duration_minutes: 120,
        },
        {
          id: "s4",
          user_id: "u1",
          start_time: "2026-09-10T09:00:00+05:30",
          end_time: "2026-09-10T10:00:00+05:30",
          duration_minutes: 60,
        },
      ];

      const streak = calculateWeeklyStreak(sessions, thursdayDate, 0, "Asia/Kolkata");
      // All 4 days qualify (Mon, Tue, Wed, Thu) -> 4 days streak
      expect(streak).toBe(4);
    });

    it("resets to 0 when last week had sessions but current week has none", () => {
      // Sessions occurred on Sunday of previous week (Sep 6)
      const sessions: StudySession[] = [
        {
          id: "prev-s1",
          user_id: "u1",
          start_time: "2026-09-06T10:00:00+05:30",
          end_time: "2026-09-06T12:00:00+05:30",
          duration_minutes: 120,
        },
      ];

      const mondayMorning = new Date("2026-09-07T08:00:00+05:30");
      const streak = calculateWeeklyStreak(sessions, mondayMorning, 0, "Asia/Kolkata");
      expect(streak).toBe(0);
    });

    it("includes live in-progress active minutes to qualify today", () => {
      // User has 10m logged session today, plus 25m live active minutes (total 35m >= 30m threshold)
      const sessions: StudySession[] = [
        {
          id: "s1",
          user_id: "u1",
          start_time: "2026-09-10T08:00:00+05:30",
          end_time: "2026-09-10T08:10:00+05:30",
          duration_minutes: 10,
        },
      ];

      // With 0 live minutes: 10m < 30m -> 0 qualifying days
      expect(calculateWeeklyStreak(sessions, thursdayDate, 0, "Asia/Kolkata")).toBe(0);

      // With 25 live minutes: 10m + 25m = 35m >= 30m -> 1 qualifying day (today!)
      expect(calculateWeeklyStreak(sessions, thursdayDate, 25, "Asia/Kolkata")).toBe(1);
    });
  });
});

