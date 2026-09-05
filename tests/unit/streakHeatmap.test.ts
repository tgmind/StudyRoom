import { describe, it, expect } from "vitest";
import {
  calculateWeeklyHeatmap,
  calculateConsistencyStats,
  calculateBestStreak,
  getHeatmapIntensityLevel,
  getTimeUntilMidnight,
  getDayOfWeekInTimezone,
  DailyStudySummary,
} from "@/lib/scoring/streak";
import { StudySession } from "@/lib/supabase/types";

describe("Streak Heatmap & Consistency Calculations", () => {
  const refWednesday = new Date("2026-09-02T12:00:00Z"); // Wednesday noon UTC (5:30 PM IST)

  it("identifies day of week correctly (0=Mon, 2=Wed, 6=Sun)", () => {
    // 2026-09-02 is a Wednesday
    const dayIndex = getDayOfWeekInTimezone(refWednesday, "Asia/Kolkata");
    expect(dayIndex).toBe(2); // Wednesday (0: Mon, 1: Tue, 2: Wed)
  });

  it("maps intensity levels correctly based on minutes", () => {
    expect(getHeatmapIntensityLevel(0)).toBe(0);
    expect(getHeatmapIntensityLevel(-5)).toBe(0);
    expect(getHeatmapIntensityLevel(15)).toBe(1); // 1-29 mins
    expect(getHeatmapIntensityLevel(29)).toBe(1);
    expect(getHeatmapIntensityLevel(30)).toBe(2); // 30-89 mins (qualified)
    expect(getHeatmapIntensityLevel(60)).toBe(2);
    expect(getHeatmapIntensityLevel(90)).toBe(3); // 90-179 mins
    expect(getHeatmapIntensityLevel(179)).toBe(3);
    expect(getHeatmapIntensityLevel(180)).toBe(4); // 180+ mins
    expect(getHeatmapIntensityLevel(300)).toBe(4);
  });

  it("generates exact 7-day Monday to Sunday heatmap for the current week", () => {
    const mockSessions: StudySession[] = [
      // Monday (2026-08-31)
      {
        id: "s1",
        user_id: "u1",
        start_time: "2026-08-31T04:00:00Z", // 9:30 AM IST
        end_time: "2026-08-31T05:00:00Z",
        duration_minutes: 60,
      },
      // Tuesday (2026-09-01)
      {
        id: "s2",
        user_id: "u1",
        start_time: "2026-09-01T10:00:00Z", // 3:30 PM IST
        end_time: "2026-09-01T10:45:00Z",
        duration_minutes: 45,
      },
      // Wednesday (2026-09-02)
      {
        id: "s3",
        user_id: "u1",
        start_time: "2026-09-02T02:00:00Z", // 7:30 AM IST
        end_time: "2026-09-02T02:20:00Z",
        duration_minutes: 20,
      },
    ];

    // User is currently studying live with 15 minutes elapsed
    const heatmap = calculateWeeklyHeatmap(mockSessions, refWednesday, 15, "Asia/Kolkata");

    expect(heatmap).toHaveLength(7);
    expect(heatmap[0].dayName).toBe("Mon");
    expect(heatmap[1].dayName).toBe("Tue");
    expect(heatmap[2].dayName).toBe("Wed");
    expect(heatmap[6].dayName).toBe("Sun");

    // Past days: Monday & Tuesday
    expect(heatmap[0].isPast).toBe(true);
    expect(heatmap[0].isToday).toBe(false);
    expect(heatmap[0].activeStudyMinutes).toBe(60);
    expect(heatmap[0].isQualified).toBe(true);
    expect(heatmap[0].intensityLevel).toBe(2);

    expect(heatmap[1].isPast).toBe(true);
    expect(heatmap[1].isToday).toBe(false);
    expect(heatmap[1].activeStudyMinutes).toBe(45);
    expect(heatmap[1].isQualified).toBe(true);

    // Today: Wednesday (20m completed + 15m live = 35m -> Qualified!)
    expect(heatmap[2].isToday).toBe(true);
    expect(heatmap[2].isPast).toBe(false);
    expect(heatmap[2].activeStudyMinutes).toBe(35);
    expect(heatmap[2].isQualified).toBe(true);

    // Future days: Thursday through Sunday
    expect(heatmap[3].isFuture).toBe(true);
    expect(heatmap[3].activeStudyMinutes).toBe(0);
    expect(heatmap[6].isFuture).toBe(true);
  });

  it("calculates best streak across historical summaries", () => {
    const summaries: DailyStudySummary[] = [
      { dateISO: "2026-08-10", activeStudyMinutes: 40 },
      { dateISO: "2026-08-11", activeStudyMinutes: 50 },
      { dateISO: "2026-08-12", activeStudyMinutes: 30 },
      { dateISO: "2026-08-13", activeStudyMinutes: 60 },
      { dateISO: "2026-08-14", activeStudyMinutes: 10 }, // Break!
      { dateISO: "2026-08-15", activeStudyMinutes: 90 },
      { dateISO: "2026-08-16", activeStudyMinutes: 45 },
    ];

    const best = calculateBestStreak(summaries, refWednesday, "Asia/Kolkata");
    expect(best).toBe(4); // 4 days (Aug 10-13)
  });

  it("calculates countdown to midnight accurately", () => {
    // Wednesday 21:30:00 IST -> 2 hours 30 mins remaining until midnight
    const testDate = new Date("2026-09-02T16:00:00Z"); // 21:30 IST (+05:30)
    const countdown = getTimeUntilMidnight(testDate, "Asia/Kolkata");
    expect(countdown.hours).toBe(2);
    expect(countdown.minutes).toBe(30);
    expect(countdown.formatted).toBe("2h 30m");
  });

  it("computes comprehensive consistency stats including primary subject and peak window", () => {
    const mockSessions: StudySession[] = [
      {
        id: "s1",
        user_id: "u1",
        start_time: "2026-08-31T15:00:00Z", // 8:30 PM IST -> Evening Flow
        end_time: "2026-08-31T16:00:00Z",
        duration_minutes: 60,
      },
      {
        id: "s2",
        user_id: "u1",
        start_time: "2026-09-01T15:30:00Z", // 9:00 PM IST -> Evening Flow / Night Owl
        end_time: "2026-09-01T17:00:00Z",
        duration_minutes: 90,
      },
    ];

    const heatmap = calculateWeeklyHeatmap(mockSessions, refWednesday, 0, "Asia/Kolkata");
    const summaries: DailyStudySummary[] = [
      { dateISO: "2026-08-31", activeStudyMinutes: 60 },
      { dateISO: "2026-09-01", activeStudyMinutes: 90 },
    ];

    const stats = calculateConsistencyStats(heatmap, summaries, refWednesday, "Asia/Kolkata", mockSessions);

    expect(stats.weeklyTotalMinutes).toBe(150);
    expect(stats.weeklyQualifiedDays).toBe(2);
    expect(stats.weeklyConsistencyRate).toBe(29); // Math.round((2 / 7) * 100) = 29%
    expect(stats.dailyAverageMinutes).toBe(75); // 150 / 2 = 75 mins
    expect(stats.totalSessionsCount).toBe(2);
    expect(stats.activeDaysCount).toBe(2);

    // With 1 live session in progress (e.g. 25 mins)
    const statsWithLive = calculateConsistencyStats(heatmap, summaries, refWednesday, "Asia/Kolkata", mockSessions, 25);
    expect(statsWithLive.totalSessionsCount).toBe(3); // 2 completed + 1 live in-progress
  });
});
