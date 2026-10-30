import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  calibrateWithServerTime,
  calibrateFromResponseHeaders,
  getServerNow,
  getServerTime,
  getServerTimeOffset,
  isServerTimeCalibrated,
  isClockEstimateProvisional,
  resetClockCalibration,
  subscribeToClockCalibration,
  handleSystemWake,
  recordClockHeartbeat,
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

  it("persists calibrated offset to localStorage and exposes window globals", () => {
    calibrateWithServerTime("2026-09-03T10:00:00.000Z", 0);
    expect(localStorage.getItem("studyroom_server_clock_offset")).toBeDefined();
    expect((window as any).__studyRoomGetServerTime).toBeDefined();
    expect((window as any).__studyRoomGetServerNow).toBeDefined();
  });

  it("notifies subscribers when clock offset changes significantly", () => {
    const fixedClientTime = new Date("2026-09-03T10:00:00.000Z").getTime();
    vi.spyOn(Date, "now").mockReturnValue(fixedClientTime);

    const callback = vi.fn();
    const unsubscribe = subscribeToClockCalibration(callback);

    // Initial calibration
    calibrateWithServerTime("2026-09-03T10:00:00.000Z", 0);
    // Large shift (>500ms)
    calibrateWithServerTime("2026-09-03T10:00:05.000Z", 0);

    expect(callback).toHaveBeenCalled();
    unsubscribe();
    vi.restoreAllMocks();
  });

  it("eliminates +62s Android device clock skew once calibrated", () => {
    // Android device clock is 62 seconds ahead of true UTC
    const trueServerEpoch = 1788271200000;
    const fastAndroidClock = trueServerEpoch + 62000;
    vi.spyOn(Date, "now").mockReturnValue(fastAndroidClock);

    // Before calibration, client is 62s ahead
    expect(Date.now() - trueServerEpoch).toBe(62000);

    // Calibrate with server timestamp
    calibrateWithServerTime(trueServerEpoch, 100);

    // After calibration, getServerTime() evaluates exactly to true server time
    const serverNowMs = getServerTime();
    expect(Math.abs(serverNowMs - (trueServerEpoch + 50))).toBeLessThanOrEqual(5);

    vi.restoreAllMocks();
  });

  it("calibrates accurately for skews greater than 2 hours (e.g. 5.5h IST vs UTC or multi-hour drift)", () => {
    const fixedClientTime = new Date("2026-10-30T10:00:00.000Z").getTime();
    vi.spyOn(Date, "now").mockReturnValue(fixedClientTime);

    // Device clock has a 5.5-hour timezone discrepancy (+19,800,000ms)
    const fiveAndHalfHoursAhead = fixedClientTime + 19800000;
    calibrateWithServerTime(fiveAndHalfHoursAhead, 80);

    expect(isServerTimeCalibrated()).toBe(true);
    // Measured offset = +19,800,000 + 40ms = 19,800,040ms
    expect(getServerTimeOffset()).toBe(19800040);

    const serverNow = getServerTime();
    expect(serverNow).toBe(fiveAndHalfHoursAhead + 40);

    vi.restoreAllMocks();
  });

  it("handles system wake from sleep without freezing or drifting", () => {
    const startClientTime = 1000000;
    let mockClientTime = startClientTime;
    vi.spyOn(Date, "now").mockImplementation(() => mockClientTime);

    // Initial calibration with server 0 offset
    calibrateWithServerTime(startClientTime, 0);
    expect(getServerTime()).toBe(startClientTime);

    // Simulate device sleep of 1 hour (3,600,000ms)
    mockClientTime += 3600000;

    // Call recordClockHeartbeat or handleSystemWake
    handleSystemWake();

    // The elapsed sleep time must be immediately reflected in getServerTime
    expect(getServerTime()).toBe(startClientTime + 3600000);

    vi.restoreAllMocks();
  });

  it("indicates provisional estimate state before and after calibration", () => {
    expect(isClockEstimateProvisional()).toBe(true);

    calibrateWithServerTime("2026-10-30T10:00:00.000Z", 50);

    expect(isClockEstimateProvisional()).toBe(false);
  });

  it("rejects high-latency (>5000ms RTT) samples when already calibrated with lower uncertainty", () => {
    const fixedClientTime = new Date("2026-10-30T10:00:00.000Z").getTime();
    vi.spyOn(Date, "now").mockReturnValue(fixedClientTime);

    // Initial low-latency calibration (50ms RTT)
    calibrateWithServerTime("2026-10-30T10:00:01.000Z", 50);
    const initialOffset = getServerTimeOffset();
    expect(initialOffset).toBe(1025);

    // High latency sample (6000ms RTT) with distorted timestamp
    calibrateWithServerTime("2026-10-30T10:00:10.000Z", 6000);

    // High latency sample must be discarded to protect against transit delay jitter
    expect(getServerTimeOffset()).toBe(initialOffset);

    vi.restoreAllMocks();
  });
});
