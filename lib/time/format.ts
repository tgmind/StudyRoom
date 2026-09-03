import { SessionBlock, UserProfile } from "@/lib/supabase/types";
import { getServerNow } from "./clockSync";

export const MAX_SESSION_STUDY_SECONDS = 2 * 60 * 60; // 7200 seconds (2 hours)

/**
 * Format total seconds into HH:MM:SS string.
 */
export function formatDurationSeconds(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  const pad = (num: number) => String(num).padStart(2, "0");

  if (hours > 0) {
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${pad(minutes)}:${pad(seconds)}`;
}

/**
 * Format active study minutes to readable hours/minutes format (e.g., 12.4h or 45m).
 */
export function formatMinutesToHours(minutes: number): string {
  const safeMinutes = Math.max(0, minutes);
  if (safeMinutes < 60) {
    return `${safeMinutes}m`;
  }
  const hours = safeMinutes / 60;
  return `${hours.toFixed(1)}h`;
}

/**
 * Calculate exact active study duration in seconds from authoritative timestamps.
 * EXCLUDES all break periods completely.
 * Does NOT rely on JS tick counters.
 */
export function calculateActiveStudySeconds(
  blocks: SessionBlock[],
  now: Date = getServerNow()
): number {
  if (!blocks || blocks.length === 0) return 0;

  let totalSeconds = 0;

  for (const block of blocks) {
    if (block.block_type !== "study") continue;

    const start = new Date(block.start_time).getTime();
    const end = block.end_time ? new Date(block.end_time).getTime() : now.getTime();

    if (!isNaN(start) && !isNaN(end) && end >= start) {
      totalSeconds += (end - start) / 1000;
    }
  }

  return Math.min(MAX_SESSION_STUDY_SECONDS, Math.max(0, Math.floor(totalSeconds)));
}

/**
 * Authoritative realtime calculator for a user profile card:
 * - When offline: 0
 * - When on break: returns frozen active_study_seconds_snapshot (never increments)
 * - When studying: returns active_study_seconds_snapshot + (now - last_resumed_at)
 * - Strictly capped at 2 hours (7200s) maximum per session.
 */
export function calculateMemberElapsedStudySeconds(
  member: Partial<UserProfile> | UserProfile,
  now: Date = getServerNow()
): number {
  if (member.current_status === "offline") return 0;

  const baseSeconds = member.active_study_seconds_snapshot ?? 0;
  let rawSeconds = 0;

  if (member.current_status === "break") {
    // Strictly frozen at the accrued snapshot
    if (baseSeconds > 0) {
      rawSeconds = baseSeconds;
    } else if (member.break_started_at && member.session_start_time) {
      const breakMs = new Date(member.break_started_at).getTime();
      const startMs = new Date(member.session_start_time).getTime();
      if (!isNaN(breakMs) && !isNaN(startMs) && breakMs >= startMs) {
        rawSeconds = Math.floor((breakMs - startMs) / 1000);
      }
    } else {
      rawSeconds = baseSeconds;
    }
  } else if (member.current_status === "studying") {
    if (member.last_resumed_at) {
      const resumeMs = new Date(member.last_resumed_at).getTime();
      if (!isNaN(resumeMs)) {
        const addedSeconds = Math.max(0, Math.floor((now.getTime() - resumeMs) / 1000));
        rawSeconds = baseSeconds + addedSeconds;
      }
    } else if (member.session_start_time) {
      // Fallback for sessions without resume timestamp
      const startMs = new Date(member.session_start_time).getTime();
      if (!isNaN(startMs)) {
        rawSeconds = Math.max(0, Math.floor((now.getTime() - startMs) / 1000));
      }
    } else {
      rawSeconds = baseSeconds;
    }
  }

  return Math.min(MAX_SESSION_STUDY_SECONDS, Math.max(0, rawSeconds));
}

/**
 * Calculate active study minutes for database storage (floored integer minutes, max 120m).
 */
export function calculateActiveStudyMinutes(
  blocks: SessionBlock[],
  now: Date = getServerNow()
): number {
  const seconds = calculateActiveStudySeconds(blocks, now);
  return Math.min(120, Math.floor(seconds / 60));
}

/**
 * Format total study seconds into clean human duration string matching admin format (e.g. "2h 45m" or "45m" or "0m").
 */
export function formatSecondsToHuman(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const totalMinutes = Math.floor(safeSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

/**
 * Calculate live break seconds elapsed since break_started_at.
 */
export function calculateMemberLiveBreakSeconds(
  member: UserProfile,
  now: Date = getServerNow()
): number {
  if (member.current_status !== "break" || !member.break_started_at) {
    return 0;
  }
  const breakMs = new Date(member.break_started_at).getTime();
  if (isNaN(breakMs)) return 0;
  return Math.max(0, Math.floor((now.getTime() - breakMs) / 1000));
}

/**
 * Returns the exact UTC timestamp for Monday 00:00:00 of the current week in the specified timezone (default Asia/Kolkata).
 * Matches PostgreSQL DATE_TRUNC('week', NOW() AT TIME ZONE 'Asia/Kolkata').
 */
export function getWeekStartTimestamp(
  now: Date = getServerNow(),
  timezone = process.env.NEXT_PUBLIC_APP_TIMEZONE || "Asia/Kolkata"
): number {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
      hour12: false,
    });
    const parts = formatter.formatToParts(now);
    const getPart = (type: string) => parts.find((p) => p.type === type)?.value || "";

    const year = parseInt(getPart("year"), 10);
    const month = parseInt(getPart("month"), 10);
    const day = parseInt(getPart("day"), 10);
    const weekday = getPart("weekday"); // Mon, Tue, Wed, Thu, Fri, Sat, Sun

    const dayMap: Record<string, number> = {
      Mon: 0,
      Tue: 1,
      Wed: 2,
      Thu: 3,
      Fri: 4,
      Sat: 5,
      Sun: 6,
    };
    const daysSinceMonday = dayMap[weekday] ?? 0;

    const mondayDate = new Date(Date.UTC(year, month - 1, day));
    mondayDate.setUTCDate(mondayDate.getUTCDate() - daysSinceMonday);

    const pad = (n: number) => String(n).padStart(2, "0");
    const mondayIso = `${mondayDate.getUTCFullYear()}-${pad(mondayDate.getUTCMonth() + 1)}-${pad(mondayDate.getUTCDate())}T00:00:00`;

    // Compute timezone offset relative to UTC
    let tzOffsetMs = 5.5 * 3600 * 1000; // Default Asia/Kolkata (+05:30)
    try {
      const utcDate = new Date(now.toLocaleString("en-US", { timeZone: "UTC" }));
      const tzDate = new Date(now.toLocaleString("en-US", { timeZone: timezone }));
      tzOffsetMs = tzDate.getTime() - utcDate.getTime();
    } catch {}

    return new Date(`${mondayIso}Z`).getTime() - tzOffsetMs;
  } catch {
    // Fallback using local clock Monday
    const d = new Date(now);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }
}

/**
 * Formats an ISO timestamp into a 12-hour AM/PM time string strictly in the target timezone (default Asia/Kolkata).
 * Example: "3:03 PM" or "1:09 PM"
 */
export function formatSessionTime(
  isoString: string,
  timezone: string = process.env.NEXT_PUBLIC_APP_TIMEZONE || "Asia/Kolkata"
): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleTimeString("en-US", {
      timeZone: timezone,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return "";
  }
}

/**
 * Formats an ISO timestamp into "Today", "Yesterday", or a formatted date string strictly in the target timezone (default Asia/Kolkata).
 */
export function formatSessionDate(
  isoString: string,
  now: Date = getServerNow(),
  timezone: string = process.env.NEXT_PUBLIC_APP_TIMEZONE || "Asia/Kolkata"
): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return "Past Sessions";

    const getTzDateKey = (date: Date) => {
      const formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
      return formatter.format(date);
    };

    const sessionKey = getTzDateKey(d);
    const todayKey = getTzDateKey(now);

    const yesterdayDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const yesterdayKey = getTzDateKey(yesterdayDate);

    if (sessionKey === todayKey) return "Today";
    if (sessionKey === yesterdayKey) return "Yesterday";

    return d.toLocaleDateString("en-US", {
      timeZone: timezone,
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "Past Sessions";
  }
}

