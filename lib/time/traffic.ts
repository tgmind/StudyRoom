import { getServerNow } from "./clockSync";

export interface SessionTrafficRecord {
  start_time?: string | null;
  end_time?: string | null;
  duration_minutes?: number | null;
}

/**
 * Helper to format a 24-hour hour index (0..23) into readable 12-hour AM/PM string.
 * e.g., 0 -> "12 AM", 9 -> "9 AM", 12 -> "12 PM", 18 -> "6 PM", 24 -> "12 AM"
 */
export function formatHourAMPM(hour24: number): string {
  const normalized = ((hour24 % 24) + 24) % 24;
  if (normalized === 0) return "12 AM";
  if (normalized === 12) return "12 PM";
  if (normalized > 12) return `${normalized - 12} PM`;
  return `${normalized} AM`;
}

/**
 * Calculates the expected peak range of study traffic in the app.
 * Analyzes sessions from the past 3 days (evaluated at midnight for the upcoming day)
 * and identifies the 3-hour contiguous window with the highest student study activity.
 *
 * Returns a clean string like "6 PM – 9 PM" or null if no data.
 */
export function calculateExpectedPeakTraffic(
  sessions: SessionTrafficRecord[] | null | undefined,
  now: Date = getServerNow()
): string {
  const DEFAULT_PEAK = "6 PM – 9 PM";

  if (!sessions || sessions.length === 0) {
    return DEFAULT_PEAK;
  }

  // 1. Determine midnight (00:00:00) of current day
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const threeDaysPrior = new Date(todayMidnight.getTime() - 3 * 24 * 60 * 60 * 1000);

  // 2. Tally hourly traffic distribution across 24 hourly buckets (0..23)
  const hourlyTraffic = new Array(24).fill(0);
  let qualifiedSessionsCount = 0;

  for (const session of sessions) {
    if (!session.start_time) continue;
    const startMs = new Date(session.start_time).getTime();
    if (isNaN(startMs)) continue;

    // Use end_time or derive from duration_minutes, falling back to 30 mins
    const durationMs = (session.duration_minutes || 30) * 60 * 1000;
    const endMs = session.end_time ? new Date(session.end_time).getTime() : startMs + durationMs;

    // Filter to sessions that overlap with the 3-day window up to today midnight (or current time)
    if (endMs < threeDaysPrior.getTime() || startMs > now.getTime()) {
      continue;
    }

    qualifiedSessionsCount++;

    // Calculate hours covered by session
    const startDate = new Date(startMs);
    const endDate = new Date(endMs);

    const startHour = startDate.getHours();
    const endHour = endDate.getHours();

    if (startHour === endHour) {
      hourlyTraffic[startHour] += 1;
    } else {
      // Span across hours
      let h = startHour;
      while (true) {
        hourlyTraffic[h] += 1;
        if (h === endHour) break;
        h = (h + 1) % 24;
        // Safety bound to avoid infinite loop across multi-day anomalies
        if (h === startHour) break;
      }
    }
  }

  if (qualifiedSessionsCount === 0) {
    return DEFAULT_PEAK;
  }

  // 3. Find 3-hour contiguous window with maximum aggregate traffic
  const WINDOW_HOURS = 3;
  let maxTraffic = -1;
  let bestStartHour = 18; // Default 6 PM

  for (let h = 0; h < 24; h++) {
    let windowSum = 0;
    for (let w = 0; w < WINDOW_HOURS; w++) {
      windowSum += hourlyTraffic[(h + w) % 24];
    }

    if (windowSum > maxTraffic) {
      maxTraffic = windowSum;
      bestStartHour = h;
    }
  }

  const bestEndHour = (bestStartHour + WINDOW_HOURS) % 24;
  return `${formatHourAMPM(bestStartHour)} – ${formatHourAMPM(bestEndHour)}`;
}
