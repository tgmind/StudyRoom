export const QUALIFYING_MINUTES_THRESHOLD = 30;

export interface DailyStudySummary {
  dateISO: string; // YYYY-MM-DD
  activeStudyMinutes: number;
}

/**
 * Calculates current streak of consecutive qualifying study days.
 * A day qualifies if activeStudyMinutes >= QUALIFYING_MINUTES_THRESHOLD (30 mins).
 * @param dailySummaries List of daily study summaries sorted by date.
 * @param referenceDate Current reference date.
 */
export function calculateQualifyingStreak(
  dailySummaries: DailyStudySummary[],
  referenceDate: Date = new Date()
): number {
  if (!dailySummaries || dailySummaries.length === 0) return 0;

  // Build map of YYYY-MM-DD -> activeStudyMinutes
  const studyMap = new Map<string, number>();
  for (const item of dailySummaries) {
    studyMap.set(item.dateISO, (studyMap.get(item.dateISO) || 0) + item.activeStudyMinutes);
  }

  const toISODate = (d: Date) => d.toISOString().split("T")[0];

  const todayStr = toISODate(referenceDate);
  const yesterday = new Date(referenceDate);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayStr = toISODate(yesterday);

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
    const dateStr = toISODate(curr);
    const mins = studyMap.get(dateStr) || 0;

    if (mins >= QUALIFYING_MINUTES_THRESHOLD) {
      streak++;
      curr.setUTCDate(curr.getUTCDate() - 1);
    } else {
      break;
    }
  }

  return streak;
}
