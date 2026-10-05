import { describe, it, expect } from "vitest";
import { getLeaderboardPeriodId, getWeekStartTimestamp } from "@/lib/time/format";

describe("getLeaderboardPeriodId & Weekly Period Boundary (Asia/Kolkata)", () => {
  it("computes exact Monday period ID for Sunday 23:59:59.999 IST vs Monday 00:00:00.000 IST", () => {
    // Sunday 2026-10-04 at 23:59:59.999 IST (UTC: 2026-10-04T18:29:59.999Z)
    const sundayNight = new Date("2026-10-04T18:29:59.999Z");
    // Monday 2026-10-05 at 00:00:00.000 IST (UTC: 2026-10-04T18:30:00.000Z)
    const mondayMidnight = new Date("2026-10-04T18:30:00.000Z");
    // Monday 2026-10-05 at 10:00:00.000 IST (UTC: 2026-10-05T04:30:00.000Z)
    const mondayMorning = new Date("2026-10-05T04:30:00.000Z");

    const sundayPeriod = getLeaderboardPeriodId(sundayNight, "Asia/Kolkata");
    const mondayMidnightPeriod = getLeaderboardPeriodId(mondayMidnight, "Asia/Kolkata");
    const mondayMorningPeriod = getLeaderboardPeriodId(mondayMorning, "Asia/Kolkata");

    expect(sundayPeriod).toBe("2026-09-28");
    expect(mondayMidnightPeriod).toBe("2026-10-05");
    expect(mondayMorningPeriod).toBe("2026-10-05");

    // The boundary transition is instantaneous:
    expect(sundayPeriod).not.toBe(mondayMidnightPeriod);
    expect(mondayMidnightPeriod).toBe(mondayMorningPeriod);
  });

  it("getWeekStartTimestamp aligns with Monday 00:00:00 IST across boundaries", () => {
    const sundayNight = new Date("2026-10-04T18:29:59.999Z");
    const mondayMidnight = new Date("2026-10-04T18:30:00.000Z");

    const sundayWeekStart = getWeekStartTimestamp(sundayNight, "Asia/Kolkata");
    const mondayWeekStart = getWeekStartTimestamp(mondayMidnight, "Asia/Kolkata");

    // Sunday week start was Sep 28, 2026 00:00:00 IST -> Sep 27, 2026 18:30:00 UTC
    expect(new Date(sundayWeekStart).toISOString()).toBe("2026-09-27T18:30:00.000Z");

    // Monday week start is Oct 5, 2026 00:00:00 IST -> Oct 4, 2026 18:30:00 UTC
    expect(new Date(mondayWeekStart).toISOString()).toBe("2026-10-04T18:30:00.000Z");

    // Exactly 7 days (604,800,000 ms) apart
    expect(mondayWeekStart - sundayWeekStart).toBe(7 * 24 * 60 * 60 * 1000);
  });
});
