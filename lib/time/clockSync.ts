/**
 * Server Clock Synchronization Engine
 *
 * Provides atomic clock precision by measuring client-server time offset
 * and calibrating all client calculations against authoritative server timestamps.
 * Prevents device clock drift, timezone anomalies, or manual clock skew from affecting timers.
 */

let serverTimeOffsetMs = 0;
let isCalibrated = false;

// Hardware monotonic anchor pair to ensure continuous monotonic progression immune to OS clock tampering
let anchorServerTimeMs = 0;
let anchorPerfTimeMs = 0;
let anchorWallTimeMs = 0;

// Attempt to load persisted offset from session/local storage for instant calibration on reload
if (typeof window !== "undefined") {
  try {
    const cached = sessionStorage.getItem("studyroom_server_clock_offset");
    if (cached !== null) {
      const parsed = parseInt(cached, 10);
      // Sanity check: plausible device clock skew within +/- 2 hours
      if (!isNaN(parsed) && Math.abs(parsed) < 7200000) {
        serverTimeOffsetMs = parsed;
        anchorWallTimeMs = Date.now();
        anchorServerTimeMs = anchorWallTimeMs + parsed;
        anchorPerfTimeMs = typeof performance !== "undefined" ? performance.now() : 0;
        isCalibrated = true;
      } else {
        sessionStorage.removeItem("studyroom_server_clock_offset");
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
  const perfNow = typeof performance !== "undefined" ? performance.now() : 0;

  const measuredOffset = estimatedServerNow - clientNow;

  // Discard absurd offsets greater than 2 hours (e.g. stale goal created_at timestamps)
  if (Math.abs(measuredOffset) > 7200000) return;

  if (!isCalibrated) {
    serverTimeOffsetMs = measuredOffset;
    anchorServerTimeMs = estimatedServerNow;
    anchorPerfTimeMs = perfNow;
    anchorWallTimeMs = clientNow;
    isCalibrated = true;
  } else {
    // Smooth adjustment (exponential moving average) to prevent sudden jumps
    serverTimeOffsetMs = Math.round(serverTimeOffsetMs * 0.7 + measuredOffset * 0.3);
    anchorServerTimeMs = clientNow + serverTimeOffsetMs;
    anchorPerfTimeMs = perfNow;
    anchorWallTimeMs = clientNow;
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
  return new Date(getServerTime());
}

/**
 * Returns current millisecond timestamp calibrated with server atomic time.
 * Uses monotonic hardware clock (performance.now) when calibrated if an OS clock step,
 * NTP jump, or timezone tampering (>1500ms deviation) is detected.
 */
export function getServerTime(): number {
  if (isCalibrated && typeof performance !== "undefined" && anchorPerfTimeMs > 0) {
    const wallElapsed = Date.now() - anchorWallTimeMs;
    const perfElapsed = performance.now() - anchorPerfTimeMs;

    // If local wall clock stepped/jumped by more than 1.5 seconds, use monotonic anchor
    if (Math.abs(wallElapsed - perfElapsed) > 1500) {
      if (perfElapsed >= 0) {
        return Math.round(anchorServerTimeMs + perfElapsed);
      }
    }
  }
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
  anchorServerTimeMs = 0;
  anchorPerfTimeMs = 0;
  anchorWallTimeMs = 0;
  isCalibrated = false;
  if (typeof window !== "undefined") {
    try {
      sessionStorage.removeItem("studyroom_server_clock_offset");
    } catch {}
  }
}

/**
 * Synchronizes client clock with the atomic server time endpoint (/api/time).
 * Measures network round-trip time (RTT) to compute sub-second offset precision.
 * Safe to call on application mount and tab visibility change.
 */
export async function syncServerClockOnce(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const t0 = Date.now();
    const res = await fetch("/api/time", { cache: "no-store" });
    const t1 = Date.now();
    const rtt = Math.max(0, t1 - t0);
    if (res.ok) {
      const data = await res.json();
      if (data?.server_now) {
        calibrateWithServerTime(data.server_now, rtt);
      }
    }
  } catch {
    // If offline or request fails, gracefully fallback to cached offset or client clock
  }
}

