export const QUALIFYING_MINUTES_THRESHOLD = 30;

export interface DailyStudySummary {
  dateISO: string; // YYYY-MM-DD
  activeStudyMinutes: number;
}

/**
 * Returns YYYY-MM-DD string for a given Date in the specified timezone.
 */
export function getDateInTimezone(
  d: Date,
  timezone: string = process.env.NEXT_PUBLIC_APP_TIMEZONE || "Asia/Kolkata"
): string {
  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return formatter.format(d);
  } catch {
    return d.toISOString().split("T")[0];
  }
}

/**
 * Calculates current streak of consecutive qualifying study days.
 * A day qualifies if activeStudyMinutes >= QUALIFYING_MINUTES_THRESHOLD (30 mins).
 * @param dailySummaries List of daily study summaries sorted by date.
 * @param referenceDate Current reference date.
 * @param timezone Timezone for day boundary evaluation (defaults to Asia/Kolkata).
 */
export function calculateQualifyingStreak(
  dailySummaries: DailyStudySummary[],
  referenceDate: Date = new Date(),
  timezone: string = process.env.NEXT_PUBLIC_APP_TIMEZONE || "Asia/Kolkata"
): number {
  if (!dailySummaries || dailySummaries.length === 0) return 0;

  // Build map of YYYY-MM-DD -> activeStudyMinutes
  const studyMap = new Map<string, number>();
  for (const item of dailySummaries) {
    studyMap.set(item.dateISO, (studyMap.get(item.dateISO) || 0) + item.activeStudyMinutes);
  }

  const todayStr = getDateInTimezone(referenceDate, timezone);

  const yesterday = new Date(referenceDate);
  yesterday.setTime(yesterday.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayStr = getDateInTimezone(yesterday, timezone);

  const todayMins = studyMap.get(todayStr) || 0;
  const yesterdayMins = studyMap.get(yesterdayStr) || 0;

  // Determine starting date for streak check
  let checkDate: Date;
  if (todayMins >= QUALIFYING_MINUTES_THRESHOLD) {
    checkDate = new Date(referenceDate);
  } else if (yesterdayMins >= QUALIFYING_MINUTES_THRESHOLD) {
    checkDate = yesterday;
  } else {
    return 0;
  }

  let streak = 0;
  const curr = new Date(checkDate);

  while (true) {
    const dateStr = getDateInTimezone(curr, timezone);
    const mins = studyMap.get(dateStr) || 0;

    if (mins >= QUALIFYING_MINUTES_THRESHOLD) {
      streak++;
      curr.setTime(curr.getTime() - 24 * 60 * 60 * 1000);
    } else {
      break;
    }
  }

  return streak;
}
