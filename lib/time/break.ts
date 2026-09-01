/**
 * Break duration and 1-hour expiry constants & calculations.
 */

export const MAX_BREAK_SECONDS = 3600; // 1 hour max break limit (3600 seconds)

export interface BreakStatusResult {
  elapsedBreakSeconds: number;
  remainingBreakSeconds: number;
  isExpired: boolean;
  formattedElapsed: string;
  formattedRemaining: string;
  progressPercent: number;
}

/**
 * Calculates strict realtime elapsed and remaining time for an active break from authoritative timestamps.
 */
export function calculateBreakStatus(
  breakStartedAt: string | Date | null | undefined,
  now: Date = new Date()
): BreakStatusResult {
  if (!breakStartedAt) {
    return {
      elapsedBreakSeconds: 0,
      remainingBreakSeconds: MAX_BREAK_SECONDS,
      isExpired: false,
      formattedElapsed: "00:00",
      formattedRemaining: "60:00",
      progressPercent: 0,
    };
  }

  const startMs = typeof breakStartedAt === "string" ? new Date(breakStartedAt).getTime() : breakStartedAt.getTime();
  if (isNaN(startMs)) {
    return {
      elapsedBreakSeconds: 0,
      remainingBreakSeconds: MAX_BREAK_SECONDS,
      isExpired: false,
      formattedElapsed: "00:00",
      formattedRemaining: "60:00",
      progressPercent: 0,
    };
  }

  const elapsedMs = Math.max(0, now.getTime() - startMs);
  const elapsedBreakSeconds = Math.floor(elapsedMs / 1000);
  const remainingBreakSeconds = Math.max(0, MAX_BREAK_SECONDS - elapsedBreakSeconds);
  const isExpired = elapsedBreakSeconds >= MAX_BREAK_SECONDS;
  const progressPercent = Math.min(100, Math.round((elapsedBreakSeconds / MAX_BREAK_SECONDS) * 100));

  const pad = (n: number) => String(n).padStart(2, "0");

  const elapsedMin = Math.floor(elapsedBreakSeconds / 60);
  const elapsedSec = elapsedBreakSeconds % 60;
  const formattedElapsed = `${pad(elapsedMin)}:${pad(elapsedSec)}`;

  const remainingMin = Math.floor(remainingBreakSeconds / 60);
  const remainingSec = remainingBreakSeconds % 60;
  const formattedRemaining = `${pad(remainingMin)}:${pad(remainingSec)}`;

  return {
    elapsedBreakSeconds,
    remainingBreakSeconds,
    isExpired,
    formattedElapsed,
    formattedRemaining,
    progressPercent,
  };
}
