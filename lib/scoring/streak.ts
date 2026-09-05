import { StudySession } from "@/lib/supabase/types";

export const QUALIFYING_MINUTES_THRESHOLD = 30;

export interface DailyStudySummary {
  dateISO: string; // YYYY-MM-DD
  activeStudyMinutes: number;
}

export interface HeatmapDay {
  dateISO: string; // YYYY-MM-DD
  dayName: string; // "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"
  dayNumber: number; // 1 - 31
  monthName: string; // "Sep", etc.
  activeStudyMinutes: number;
  sessionCount: number;
  isToday: boolean;
  isPast: boolean;
  isFuture: boolean;
  isQualified: boolean; // >= 30 mins
  intensityLevel: 0 | 1 | 2 | 3 | 4;
  sessions: StudySession[];
}

export interface ConsistencyStats {
  currentStreak: number;
  bestStreak: number;
  weeklyTotalMinutes: number;
  weeklyQualifiedDays: number;
  weeklyConsistencyRate: number; // 0 - 100%
  dailyAverageMinutes: number; // Average across days with study time > 0
  totalSessionsCount: number;
  activeDaysCount: number;
  todayMinutes: number;
  todayQualified: boolean;
  todayMinutesRemaining: number;
  timeUntilMidnight: string;
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
 * Returns index of day in week (0 for Mon, 1 for Tue, ..., 6 for Sun) in target timezone.
 */
export function getDayOfWeekInTimezone(
  d: Date,
  timezone: string = process.env.NEXT_PUBLIC_APP_TIMEZONE || "Asia/Kolkata"
): number {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
    });
    const weekday = formatter.format(d);
    const dayMap: Record<string, number> = {
      Mon: 0,
      Tue: 1,
      Wed: 2,
      Thu: 3,
      Fri: 4,
      Sat: 5,
      Sun: 6,
    };
    return dayMap[weekday] ?? 0;
  } catch {
    const day = d.getDay();
    return day === 0 ? 6 : day - 1;
  }
}

/**
 * Calculates current streak of consecutive qualifying study days.
 * A day qualifies if activeStudyMinutes >= QUALIFYING_MINUTES_THRESHOLD (30 mins).
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

/**
 * Maps study minutes to 5 distinct heatmap intensity levels:
 * 0: 0 mins (Rest/unstudied)
 * 1: 1-29 mins (Warming up)
 * 2: 30-89 mins (Streak qualified! 🔥)
 * 3: 90-179 mins (Deep Focus Flame)
 * 4: 180+ mins (Master Inferno)
 */
export function getHeatmapIntensityLevel(minutes: number): 0 | 1 | 2 | 3 | 4 {
  if (minutes <= 0) return 0;
  if (minutes < QUALIFYING_MINUTES_THRESHOLD) return 1;
  if (minutes < 90) return 2;
  if (minutes < 180) return 3;
  return 4;
}

/**
 * Computes remaining time until the upcoming local midnight.
 */
export function getTimeUntilMidnight(
  referenceDate: Date = new Date(),
  timezone: string = process.env.NEXT_PUBLIC_APP_TIMEZONE || "Asia/Kolkata"
): { hours: number; minutes: number; formatted: string } {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hour12: false,
    });
    const parts = formatter.formatToParts(referenceDate);
    const getPart = (t: string) => parseInt(parts.find((p) => p.type === t)?.value || "0", 10);
    const h = getPart("hour") % 24;
    const m = getPart("minute");
    const s = getPart("second");

    const elapsedSecondsToday = h * 3600 + m * 60 + s;
    const secondsUntilMidnight = Math.max(0, 86400 - elapsedSecondsToday);
    const hours = Math.floor(secondsUntilMidnight / 3600);
    const minutes = Math.floor((secondsUntilMidnight % 3600) / 60);

    return {
      hours,
      minutes,
      formatted: `${hours}h ${minutes}m`,
    };
  } catch {
    const hours = 23 - referenceDate.getHours();
    const minutes = 59 - referenceDate.getMinutes();
    return {
      hours,
      minutes,
      formatted: `${hours}h ${minutes}m`,
    };
  }
}

/**
 * Generates the 7-day Monday-to-Sunday weekly study heatmap for the current week.
 * Seamlessly integrates live in-progress session minutes into today's cell.
 */
export function calculateWeeklyHeatmap(
  sessions: StudySession[],
  referenceDate: Date = new Date(),
  liveActiveMinutes = 0,
  timezone: string = process.env.NEXT_PUBLIC_APP_TIMEZONE || "Asia/Kolkata"
): HeatmapDay[] {
  const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const daysSinceMonday = getDayOfWeekInTimezone(referenceDate, timezone);

  // Group sessions by YYYY-MM-DD
  const sessionsByDate = new Map<string, StudySession[]>();
  for (const session of sessions) {
    if (!session.start_time) continue;
    const sDate = new Date(session.start_time);
    if (isNaN(sDate.getTime())) continue;
    const dateKey = getDateInTimezone(sDate, timezone);
    const list = sessionsByDate.get(dateKey) || [];
    list.push(session);
    sessionsByDate.set(dateKey, list);
  }

  const refIso = getDateInTimezone(referenceDate, timezone);
  const [refY, refM, refD] = refIso.split("-").map(Number);
  const anchorDate = new Date(Date.UTC(refY, refM - 1, refD, 12, 0, 0));

  const result: HeatmapDay[] = [];

  for (let i = 0; i < 7; i++) {
    const dayOffset = i - daysSinceMonday;
    const dayDate = new Date(anchorDate.getTime() + dayOffset * 86400000);
    const dateISO = getDateInTimezone(dayDate, "UTC");

    // Format day number and month in target timezone
    let dayNumber = 1;
    let monthName = "";
    try {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        month: "short",
        day: "numeric",
      }).formatToParts(dayDate);
      dayNumber = parseInt(parts.find((p) => p.type === "day")?.value || "1", 10);
      monthName = parts.find((p) => p.type === "month")?.value || "";
    } catch {
      dayNumber = dayDate.getDate();
      monthName = dayDate.toLocaleString("en-US", { month: "short" });
    }

    const daySessions = sessionsByDate.get(dateISO) || [];
    let activeMinutes = daySessions.reduce((sum, s) => sum + (s.duration_minutes || 0), 0);

    const isToday = i === daysSinceMonday;
    const isPast = i < daysSinceMonday;
    const isFuture = i > daysSinceMonday;

    // Add in-progress live minutes to today's active study time
    if (isToday && liveActiveMinutes > 0) {
      activeMinutes += liveActiveMinutes;
    }

    const isQualified = activeMinutes >= QUALIFYING_MINUTES_THRESHOLD;
    const intensityLevel = isFuture && activeMinutes === 0 ? 0 : getHeatmapIntensityLevel(activeMinutes);

    result.push({
      dateISO,
      dayName: dayNames[i],
      dayNumber,
      monthName,
      activeStudyMinutes: activeMinutes,
      sessionCount: daySessions.length + (isToday && liveActiveMinutes > 0 ? 1 : 0),
      isToday,
      isPast,
      isFuture,
      isQualified,
      intensityLevel,
      sessions: daySessions,
    });
  }

  return result;
}

/**
 * Calculates historical all-time or 90-day best streak record.
 */
export function calculateBestStreak(
  dailySummaries: DailyStudySummary[],
  referenceDate: Date = new Date(),
  timezone: string = process.env.NEXT_PUBLIC_APP_TIMEZONE || "Asia/Kolkata"
): number {
  if (!dailySummaries || dailySummaries.length === 0) return 0;

  const qualifyingDates = new Set<string>();
  for (const item of dailySummaries) {
    if (item.activeStudyMinutes >= QUALIFYING_MINUTES_THRESHOLD) {
      qualifyingDates.add(item.dateISO);
    }
  }

  if (qualifyingDates.size === 0) return 0;

  const sortedDates = Array.from(qualifyingDates).sort();
  let maxStreak = 0;
  let currentStreakRun = 0;
  let prevDateMs: number | null = null;

  for (const dateStr of sortedDates) {
    const dateParts = dateStr.split("-").map(Number);
    // Construct UTC timestamp at noon to avoid DST edge jumps
    const currentMs = Date.UTC(dateParts[0], dateParts[1] - 1, dateParts[2], 12, 0, 0);

    if (prevDateMs !== null) {
      const diffDays = Math.round((currentMs - prevDateMs) / (24 * 60 * 60 * 1000));
      if (diffDays === 1) {
        currentStreakRun++;
      } else if (diffDays > 1) {
        currentStreakRun = 1;
      }
    } else {
      currentStreakRun = 1;
    }

    prevDateMs = currentMs;
    if (currentStreakRun > maxStreak) {
      maxStreak = currentStreakRun;
    }
  }

  // Also verify against active live streak
  const activeStreak = calculateQualifyingStreak(dailySummaries, referenceDate, timezone);
  return Math.max(maxStreak, activeStreak);
}


/**
 * Calculates comprehensive consistency reports and statistics.
 */
export function calculateConsistencyStats(
  heatmapDays: HeatmapDay[],
  allSummaries: DailyStudySummary[],
  referenceDate: Date = new Date(),
  timezone: string = process.env.NEXT_PUBLIC_APP_TIMEZONE || "Asia/Kolkata",
  allWeekSessions: StudySession[] = [],
  liveActiveMinutes = 0
): ConsistencyStats {
  const currentStreak = calculateQualifyingStreak(allSummaries, referenceDate, timezone);
  const bestStreak = calculateBestStreak(allSummaries, referenceDate, timezone);

  let weeklyTotalMinutes = 0;
  let weeklyQualifiedDays = 0;
  let activeDaysCount = 0;
  let todayMinutes = 0;

  for (const day of heatmapDays) {
    if (day.isPast || day.isToday) {
      weeklyTotalMinutes += day.activeStudyMinutes;
      if (day.isQualified) weeklyQualifiedDays++;
      if (day.activeStudyMinutes > 0) activeDaysCount++;
    }
    if (day.isToday) {
      todayMinutes = day.activeStudyMinutes;
    }
  }

  const weeklyConsistencyRate = Math.round((weeklyQualifiedDays / 7) * 100);
  const dailyAverageMinutes = activeDaysCount > 0 ? Math.round(weeklyTotalMinutes / activeDaysCount) : 0;
  const todayQualified = todayMinutes >= QUALIFYING_MINUTES_THRESHOLD;
  const todayMinutesRemaining = Math.max(0, QUALIFYING_MINUTES_THRESHOLD - todayMinutes);
  const midnightInfo = getTimeUntilMidnight(referenceDate, timezone);

  const totalSessionsCount = allWeekSessions.length + (liveActiveMinutes > 0 ? 1 : 0);

  return {
    currentStreak,
    bestStreak,
    weeklyTotalMinutes,
    weeklyQualifiedDays,
    weeklyConsistencyRate,
    dailyAverageMinutes,
    totalSessionsCount,
    activeDaysCount,
    todayMinutes,
    todayQualified,
    todayMinutesRemaining,
    timeUntilMidnight: midnightInfo.formatted,
  };
}

