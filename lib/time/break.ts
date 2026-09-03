import { getServerNow } from "./clockSync";
import { calculateMemberElapsedStudySeconds, MAX_SESSION_STUDY_SECONDS } from "./format";
import { UserProfile, UserStatus } from "@/lib/supabase/types";

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
  now: Date = getServerNow()
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

/**
 * Checks if a member profile's break has exceeded the 1-hour limit (>= 3600 seconds).
 */
export function isMemberBreakExpired(
  member: { current_status: string; break_started_at?: string | null },
  now: Date = getServerNow()
): boolean {
  if (member.current_status !== "break" || !member.break_started_at) {
    return false;
  }
  const breakMs = new Date(member.break_started_at).getTime();
  if (isNaN(breakMs)) return false;
  return now.getTime() - breakMs >= MAX_BREAK_SECONDS * 1000;
}

/**
 * Checks if a member profile's active study session has reached the 2-hour limit (>= 7200 seconds).
 */
export function isMemberStudyExpired(
  member: {
    current_status: UserStatus | string;
    session_start_time?: string | null;
    last_resumed_at?: string | null;
    active_study_seconds_snapshot?: number | null;
  },
  now: Date = getServerNow()
): boolean {
  if (member.current_status !== "studying") return false;
  return calculateMemberElapsedStudySeconds(member as Partial<UserProfile>, now) >= MAX_SESSION_STUDY_SECONDS;
}

/**
 * Returns the effective status of a member:
 * - If their break exceeded 1 hour, status is 'offline'.
 * - If their active study session reached 2 hours, status is 'offline'.
 */
export function getEffectiveMemberStatus(
  member: {
    current_status: string;
    break_started_at?: string | null;
    session_start_time?: string | null;
    last_resumed_at?: string | null;
    active_study_seconds_snapshot?: number | null;
  },
  now: Date = getServerNow()
): "studying" | "break" | "offline" {
  if (member.current_status === "break" && isMemberBreakExpired(member, now)) {
    return "offline";
  }
  if (member.current_status === "studying" && isMemberStudyExpired(member, now)) {
    return "offline";
  }
  if (member.current_status === "studying" || member.current_status === "break" || member.current_status === "offline") {
    return member.current_status;
  }
  return "offline";
}
