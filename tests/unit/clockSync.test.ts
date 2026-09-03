import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  calibrateWithServerTime,
  calibrateFromResponseHeaders,
  getServerNow,
  getServerTime,
  getServerTimeOffset,
  isServerTimeCalibrated,
  resetClockCalibration,
} from "@/lib/time/clockSync";

describe("Server Clock Synchronization Engine", () => {
  beforeEach(() => {
    resetClockCalibration();
  });

  it("defaults to zero offset when uncalibrated", () => {
    expect(isServerTimeCalibrated()).toBe(false);
    expect(getServerTimeOffset()).toBe(0);

    const clientNow = Date.now();
    const serverNow = getServerTime();
    expect(Math.abs(serverNow - clientNow)).toBeLessThanOrEqual(50);
  });

  it("calibrates accurately when client clock is behind server (positive skew)", () => {
    const fixedClientTime = new Date("2026-09-03T10:00:00.000Z").getTime();
    vi.spyOn(Date, "now").mockReturnValue(fixedClientTime);

    // Server is 5 minutes ahead (10:05:00)
    const serverTimestamp = "2026-09-03T10:05:00.000Z";
    calibrateWithServerTime(serverTimestamp, 100); // 100ms RTT -> +50ms one-way

    expect(isServerTimeCalibrated()).toBe(true);
    // 5 minutes (300,000ms) + 50ms = 300,050ms
    expect(getServerTimeOffset()).toBe(300050);

    const now = getServerNow();
    expect(now.toISOString()).toBe("2026-09-03T10:05:00.050Z");

    vi.restoreAllMocks();
  });

  it("calibrates accurately when client clock is ahead of server (negative skew)", () => {
    const fixedClientTime = new Date("2026-09-03T10:10:00.000Z").getTime();
    vi.spyOn(Date, "now").mockReturnValue(fixedClientTime);

    // Server is 10 minutes behind (10:00:00)
    const serverTimestamp = "2026-09-03T10:00:00.000Z";
    calibrateWithServerTime(serverTimestamp, 0);

    expect(isServerTimeCalibrated()).toBe(true);
    // -10 minutes = -600,000ms
    expect(getServerTimeOffset()).toBe(-600000);

    const now = getServerNow();
    expect(now.toISOString()).toBe("2026-09-03T10:00:00.000Z");

    vi.restoreAllMocks();
  });

  it("smooths consecutive calibrations with exponential moving average", () => {
    const fixedClientTime = new Date("2026-09-03T10:00:00.000Z").getTime();
    vi.spyOn(Date, "now").mockReturnValue(fixedClientTime);

    // First calibration: offset = 1000ms
    calibrateWithServerTime("2026-09-03T10:00:01.000Z", 0);
    expect(getServerTimeOffset()).toBe(1000);

    // Second calibration: measured offset = 2000ms
    // New offset = round(1000 * 0.7 + 2000 * 0.3) = 700 + 600 = 1300ms
    calibrateWithServerTime("2026-09-03T10:00:02.000Z", 0);
    expect(getServerTimeOffset()).toBe(1300);

    vi.restoreAllMocks();
  });

  it("calibrates from HTTP Response headers", () => {
    const fixedClientTime = new Date("2026-09-03T10:00:00.000Z").getTime();
    vi.spyOn(Date, "now").mockReturnValue(fixedClientTime);

    const headers = new Headers();
    headers.set("date", "Thu, 03 Sep 2026 10:02:00 GMT");

    calibrateFromResponseHeaders(headers);

    expect(isServerTimeCalibrated()).toBe(true);
    // 2 minutes ahead = 120,000ms
    expect(getServerTimeOffset()).toBe(120000);

    vi.restoreAllMocks();
  });

  it("handles null or invalid timestamps gracefully without altering offset", () => {
    calibrateWithServerTime(null);
    expect(isServerTimeCalibrated()).toBe(false);

    calibrateWithServerTime("not-a-date");
    expect(isServerTimeCalibrated()).toBe(false);
  });
});
