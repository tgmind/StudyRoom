import { describe, it, expect } from "vitest";
import { calculateQualifyingStreak, DailyStudySummary, getDateInTimezone } from "@/lib/scoring/streak";

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
});
