/**
 * Server Clock Synchronization Engine
 *
 * Provides atomic clock precision by measuring client-server time offset
 * and calibrating all client calculations against authoritative server timestamps.
 * Prevents device clock drift, timezone anomalies, or manual clock skew from affecting timers.
 */

let serverTimeOffsetMs = 0;
let isCalibrated = false;

// Attempt to load persisted offset from session/local storage for instant calibration on reload
if (typeof window !== "undefined") {
  try {
    const cached = sessionStorage.getItem("studyroom_server_clock_offset");
    if (cached !== null) {
      const parsed = parseInt(cached, 10);
      if (!isNaN(parsed) && Math.abs(parsed) < 86400000 * 7) {
        // Sanity check: within 7 days
        serverTimeOffsetMs = parsed;
        isCalibrated = true;
      }
    }
  } catch {
    // Storage access restricted or disabled
  }
}

/**
 * Calibrate the clock offset using an authoritative server timestamp.
 * Incorporates estimated round-trip time (RTT) when available to achieve high accuracy.
 *
 * @param serverTimestamp ISO string, millisecond timestamp, or Date from server
 * @param roundTripTimeMs Optional network round-trip time in milliseconds
 */
export function calibrateWithServerTime(
  serverTimestamp: string | number | Date | null | undefined,
  roundTripTimeMs = 0
): void {
  if (!serverTimestamp) return;

  const serverMs =
    typeof serverTimestamp === "string"
      ? new Date(serverTimestamp).getTime()
      : typeof serverTimestamp === "number"
      ? serverTimestamp
      : serverTimestamp.getTime();

  if (isNaN(serverMs)) return;

  // Account for half the network latency (one-way trip)
  const oneWayLatency = Math.max(0, Math.floor(roundTripTimeMs / 2));
  const estimatedServerNow = serverMs + oneWayLatency;
  const clientNow = Date.now();

  const measuredOffset = estimatedServerNow - clientNow;

  if (!isCalibrated) {
    serverTimeOffsetMs = measuredOffset;
    isCalibrated = true;
  } else {
    // Smooth adjustment (exponential moving average) to prevent sudden jumps
    serverTimeOffsetMs = Math.round(serverTimeOffsetMs * 0.7 + measuredOffset * 0.3);
  }

  if (typeof window !== "undefined") {
    try {
      sessionStorage.setItem("studyroom_server_clock_offset", String(serverTimeOffsetMs));
    } catch {
      // Storage unavailable
    }
  }
}

/**
 * Calibrates clock offset directly from an HTTP Response's "date" header.
 */
export function calibrateFromResponseHeaders(headers?: Headers | null): void {
  if (!headers) return;
  const dateHeader = headers.get("date");
  if (dateHeader) {
    calibrateWithServerTime(dateHeader);
  }
}

/**
 * Returns current timestamp calibrated with server atomic time.
 * Replaces uncalibrated `new Date()` throughout timer-critical flows.
 */
export function getServerNow(): Date {
  return new Date(Date.now() + serverTimeOffsetMs);
}

/**
 * Returns current millisecond timestamp calibrated with server atomic time.
 */
export function getServerTime(): number {
  return Date.now() + serverTimeOffsetMs;
}

/**
 * Returns the current measured offset between server and client in milliseconds.
 * Positive means client clock is behind server; negative means client clock is ahead.
 */
export function getServerTimeOffset(): number {
  return serverTimeOffsetMs;
}

/**
 * Returns whether at least one successful server calibration has occurred.
 */
export function isServerTimeCalibrated(): boolean {
  return isCalibrated;
}

/**
 * Resets calibration state (useful for unit testing).
 */
export function resetClockCalibration(): void {
  serverTimeOffsetMs = 0;
  isCalibrated = false;
  if (typeof window !== "undefined") {
    try {
      sessionStorage.removeItem("studyroom_server_clock_offset");
    } catch {}
  }
}
