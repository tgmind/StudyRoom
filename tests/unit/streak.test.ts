import { describe, it, expect } from "vitest";
import { calculateQualifyingStreak, DailyStudySummary } from "@/lib/scoring/streak";

describe("Streak Calculation (30-Minute Threshold)", () => {
  it("calculates consecutive qualifying study days (>= 30 active study mins)", () => {
    const refDate = new Date("2026-09-03T12:00:00Z");

    const summaries: DailyStudySummary[] = [
      { dateISO: "2026-09-01", activeStudyMinutes: 45 },
      { dateISO: "2026-09-02", activeStudyMinutes: 60 },
      { dateISO: "2026-09-03", activeStudyMinutes: 30 },
    ];

    const streak = calculateQualifyingStreak(summaries, refDate);
    expect(streak).toBe(3);
  });

  it("handles days below 30 minutes threshold as non-qualifying", () => {
    const refDate = new Date("2026-09-03T12:00:00Z");

    const summaries: DailyStudySummary[] = [
      { dateISO: "2026-09-01", activeStudyMinutes: 45 },
      { dateISO: "2026-09-02", activeStudyMinutes: 15 }, // Below 30 mins! Breaks streak
      { dateISO: "2026-09-03", activeStudyMinutes: 30 },
    ];

    const streak = calculateQualifyingStreak(summaries, refDate);
    expect(streak).toBe(1);
  });
});
