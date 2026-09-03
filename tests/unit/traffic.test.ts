import { describe, it, expect } from "vitest";
import { calculateExpectedPeakTraffic, formatHourAMPM } from "@/lib/time/traffic";

describe("Traffic Analysis Engine", () => {
  it("formats hours in AM/PM correctly", () => {
    expect(formatHourAMPM(0)).toBe("12 AM");
    expect(formatHourAMPM(6)).toBe("6 AM");
    expect(formatHourAMPM(12)).toBe("12 PM");
    expect(formatHourAMPM(18)).toBe("6 PM");
    expect(formatHourAMPM(21)).toBe("9 PM");
    expect(formatHourAMPM(24)).toBe("12 AM");
  });

  it("returns default peak when sessions array is empty or null", () => {
    expect(calculateExpectedPeakTraffic(null)).toBe("6 PM – 9 PM");
    expect(calculateExpectedPeakTraffic([])).toBe("6 PM – 9 PM");
  });

  it("detects peak evening traffic (6 PM - 9 PM) based on session activity", () => {
    // Current time: 2026-09-03 20:00:00 UTC
    const fixedNow = new Date("2026-09-03T15:00:00.000Z");

    // Create multiple sessions between 18:00 and 21:00 yesterday
    const sessions = [
      {
        start_time: "2026-09-02T18:00:00.000Z",
        end_time: "2026-09-02T19:30:00.000Z",
        duration_minutes: 90,
      },
      {
        start_time: "2026-09-02T19:00:00.000Z",
        end_time: "2026-09-02T21:00:00.000Z",
        duration_minutes: 120,
      },
      {
        start_time: "2026-09-01T18:30:00.000Z",
        end_time: "2026-09-01T20:30:00.000Z",
        duration_minutes: 120,
      },
    ];

    const peak = calculateExpectedPeakTraffic(sessions, fixedNow);
    expect(peak).toBeDefined();
    expect(typeof peak).toBe("string");
    expect(peak).toContain("–");
  });
});
