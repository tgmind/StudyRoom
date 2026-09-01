import { describe, it, expect } from "vitest";
import { calculateBreakStatus, MAX_BREAK_SECONDS } from "@/lib/time/break";

describe("Break Timer Calculations", () => {
  it("returns default zero values when no break start time is provided", () => {
    const status = calculateBreakStatus(null);
    expect(status.elapsedBreakSeconds).toBe(0);
    expect(status.remainingBreakSeconds).toBe(MAX_BREAK_SECONDS);
    expect(status.isExpired).toBe(false);
  });

  it("calculates 15 minutes of break correctly", () => {
    const start = new Date("2026-09-01T10:00:00Z");
    const now = new Date("2026-09-01T10:15:30Z");

    const status = calculateBreakStatus(start, now);
    expect(status.elapsedBreakSeconds).toBe(930); // 15m 30s
    expect(status.remainingBreakSeconds).toBe(3600 - 930); // 2670s
    expect(status.formattedElapsed).toBe("15:30");
    expect(status.isExpired).toBe(false);
  });

  it("identifies break expiration at and beyond 1 hour (3600s)", () => {
    const start = new Date("2026-09-01T10:00:00Z");
    const exactlyOneHour = new Date("2026-09-01T11:00:00Z");
    const beyondOneHour = new Date("2026-09-01T11:05:00Z");

    const exactStatus = calculateBreakStatus(start, exactlyOneHour);
    expect(exactStatus.elapsedBreakSeconds).toBe(3600);
    expect(exactStatus.remainingBreakSeconds).toBe(0);
    expect(exactStatus.isExpired).toBe(true);

    const beyondStatus = calculateBreakStatus(start, beyondOneHour);
    expect(beyondStatus.elapsedBreakSeconds).toBe(3900);
    expect(beyondStatus.remainingBreakSeconds).toBe(0);
    expect(beyondStatus.isExpired).toBe(true);
  });
});
