/**
 * lib/analytics/cohort.ts
 *
 * Canonical Period-Aware Historical Cohort Isolation Module
 *
 * Product Rule:
 * For any finalized/historical week (Monday 00:00:00 to Sunday 23:59:59.999 in target timezone),
 * the eligible member population MUST represent students who were present in StudyRoom
 * on the LAST DAY OF THAT WEEK (Sunday).
 *
 * Users joining after that Sunday MUST NOT:
 * - Enter historical Study, Goal, Consistency, or Achiever rankings
 * - Affect normalization maximums (e.g. max_study_minutes, target_completed_tasks)
 * - Affect cohort size or percentile denominators
 * - Affect community summary averages or totals
 * - Alter the historical Top 5
 */

export interface CohortMember {
  id: string;
  display_name: string;
  avatar_url?: string | null;
  created_at: string | Date;
  is_admin?: boolean;
}

export interface UserWeeklyRawMetrics extends CohortMember {
  total_study_minutes: number;
  completed_tasks: number;
  total_tasks: number;
  active_study_days: number;
  /** Optional pre-computed score, or computed dynamically with cohort normalizers */
  score?: number;
}

export interface HistoricalCohortBounds {
  weekStart: Date;
  weekEnd: Date;
  sundayCutoff: Date;
  timezone: string;
}

const DEFAULT_ADMIN_ID = "8076296e-134a-4036-b8ed-1a9c6ff26ec1";

/**
 * Parses and returns the canonical boundaries for a weekly analytics period in local timezone.
 * Week starts Monday 00:00:00 and ends Sunday 23:59:59.999.
 * The historical Sunday cutoff is identical to the week boundary cutoff (start of following Monday).
 */
export function getHistoricalPeriodBounds(
  periodStart: string | Date,
  timezone = "Asia/Kolkata"
): HistoricalCohortBounds {
  let dateObj: Date;
  if (typeof periodStart === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(periodStart)) {
      const [year, month, day] = periodStart.split("-").map(Number);
      if (timezone === "Asia/Kolkata") {
        dateObj = new Date(Date.UTC(year, month - 1, day, 0, 0, 0) - 5.5 * 3600 * 1000);
      } else {
        dateObj = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
      }
    } else {
      dateObj = new Date(periodStart);
    }
  } else {
    dateObj = new Date(periodStart);
  }

  const weekStart = new Date(dateObj);
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
  const sundayCutoff = new Date(weekEnd.getTime() - 1);

  return {
    weekStart,
    weekEnd,
    sundayCutoff,
    timezone,
  };
}

/**
 * Checks if a member existed in StudyRoom by the historical Sunday cutoff
 * and satisfies student eligibility rules (non-admin).
 */
export function isEligibleHistoricalMember(
  member: CohortMember,
  bounds: HistoricalCohortBounds
): boolean {
  if (member.is_admin || member.id === DEFAULT_ADMIN_ID) {
    return false;
  }

  const memberCreated = new Date(member.created_at);
  if (Number.isNaN(memberCreated.getTime())) {
    return false;
  }

  return memberCreated.getTime() < bounds.weekEnd.getTime();
}

/**
 * Authoritative Period-Aware Cohort Selector:
 * Filters a member list to only valid eligible students present by the historical period Sunday cutoff.
 * If isHistorical is false, includes current eligible members.
 */
export function getEligibleMembersForAnalyticsPeriod<T extends CohortMember>(
  members: T[],
  periodStart: string | Date,
  timezone = "Asia/Kolkata",
  options?: { isHistorical?: boolean }
): T[] {
  if (!Array.isArray(members) || members.length === 0) {
    return [];
  }

  const bounds = getHistoricalPeriodBounds(periodStart, timezone);
  const now = new Date();
  const isHistorical = options?.isHistorical ?? (bounds.weekEnd.getTime() <= now.getTime());

  return members.filter((member) => {
    if (member.is_admin || member.id === DEFAULT_ADMIN_ID) {
      return false;
    }

    if (isHistorical) {
      const memberCreated = new Date(member.created_at);
      if (Number.isNaN(memberCreated.getTime())) {
        return false;
      }
      return memberCreated.getTime() < bounds.weekEnd.getTime();
    }

    return true;
  });
}

/**
 * Canonical Leaderboard 50/30/20 Score Normalizers computed strictly from the cohort.
 */
export interface CohortNormalizers {
  maxStudyMinutes: number;
  targetCompletedTasks: number;
}

export function computeCohortNormalizers(cohort: UserWeeklyRawMetrics[]): CohortNormalizers {
  let maxStudy = 1;
  let maxTasks = 3;

  for (const m of cohort) {
    if (m.total_study_minutes > maxStudy) {
      maxStudy = m.total_study_minutes;
    }
    if (m.completed_tasks > maxTasks) {
      maxTasks = m.completed_tasks;
    }
  }

  return {
    maxStudyMinutes: Math.max(1, maxStudy),
    targetCompletedTasks: Math.max(3, Math.min(15, maxTasks)),
  };
}

/**
 * Calculates the canonical 50/30/20 composite score using cohort-isolated normalizers.
 */
export function calculateCompositeScore(
  user: UserWeeklyRawMetrics,
  normalizers: CohortNormalizers
): number {
  const { maxStudyMinutes, targetCompletedTasks } = normalizers;

  const studyScore = 0.5 * Math.min(100, (user.total_study_minutes / maxStudyMinutes) * 100);

  const volumePillar = 0.6 * Math.min(100, (user.completed_tasks / targetCompletedTasks) * 100);
  const disciplinePillar =
    user.total_tasks > 0
      ? 0.4 * Math.min(100, (user.completed_tasks / Math.max(3, user.total_tasks)) * 100)
      : 0;
  const goalScore = 0.3 * (volumePillar + disciplinePillar);

  const consistencyScore = 0.2 * Math.min(100, (Math.min(7, Math.max(0, user.active_study_days)) / 7) * 100);

  return Math.round((studyScore + goalScore + consistencyScore) * 10) / 10;
}

/**
 * Community summary statistics computed strictly over the historical cohort.
 */
export interface CommunitySummaryStats {
  total_eligible_students: number;
  global_avg_study_minutes: number;
  global_avg_daily_minutes: number;
  global_avg_goal_pct: number;
  total_community_hours: number;
  total_completed_goals: number;
}

export function calculateHistoricalCommunityStats(cohort: UserWeeklyRawMetrics[]): CommunitySummaryStats {
  const n = cohort.length;
  if (n === 0) {
    return {
      total_eligible_students: 0,
      global_avg_study_minutes: 0,
      global_avg_daily_minutes: 0,
      global_avg_goal_pct: 0,
      total_community_hours: 0,
      total_completed_goals: 0,
    };
  }

  let totalMins = 0;
  let totalGoalPctSum = 0;
  let totalCompletedGoals = 0;

  for (const m of cohort) {
    totalMins += m.total_study_minutes;
    totalCompletedGoals += m.completed_tasks;
    const goalPct = m.total_tasks > 0 ? (m.completed_tasks / m.total_tasks) * 100 : 0;
    totalGoalPctSum += goalPct;
  }

  const avgMins = Math.round((totalMins / n) * 10) / 10;
  const avgDailyMins = Math.round((avgMins / 7.0) * 10) / 10;
  const avgGoalPct = Math.round((totalGoalPctSum / n) * 10) / 10;
  const totalHours = Math.round((totalMins / 60.0) * 10) / 10;

  return {
    total_eligible_students: n,
    global_avg_study_minutes: avgMins,
    global_avg_daily_minutes: avgDailyMins,
    global_avg_goal_pct: avgGoalPct,
    total_community_hours: totalHours,
    total_completed_goals: totalCompletedGoals,
  };
}

import { compareConsistencyCandidates } from "./consistency";

export interface StudyRankingEntry {
  rank: number;
  user_id: string;
  display_name: string;
  avatar_url?: string | null;
  total_study_minutes: number;
  daily_average_minutes: number;
  active_study_days: number;
  score: number;
}

export function calculateHistoricalStudyRanking(
  cohort: UserWeeklyRawMetrics[],
  limit = 5
): StudyRankingEntry[] {
  const sorted = [...cohort].sort((a, b) => {
    const dailyA = a.total_study_minutes / 7.0;
    const dailyB = b.total_study_minutes / 7.0;
    if (dailyB !== dailyA) return dailyB - dailyA;
    if (b.total_study_minutes !== a.total_study_minutes) return b.total_study_minutes - a.total_study_minutes;
    const nameCmp = a.display_name.localeCompare(b.display_name);
    if (nameCmp !== 0) return nameCmp;
    return a.id.localeCompare(b.id);
  });

  return sorted.slice(0, limit).map((u, i) => ({
    rank: i + 1,
    user_id: u.id,
    display_name: u.display_name,
    avatar_url: u.avatar_url ?? null,
    total_study_minutes: u.total_study_minutes,
    daily_average_minutes: Math.round((u.total_study_minutes / 7.0) * 10) / 10,
    active_study_days: Math.min(7, Math.max(0, u.active_study_days)),
    score: u.score ?? 0,
  }));
}

export interface GoalRankingEntry {
  rank: number;
  user_id: string;
  display_name: string;
  avatar_url?: string | null;
  completed_tasks: number;
  total_tasks: number;
  goal_completion_pct: number;
  total_study_minutes: number;
}

export function calculateHistoricalGoalRanking(
  cohort: UserWeeklyRawMetrics[],
  limit = 5
): GoalRankingEntry[] {
  const eligible = cohort.filter((u) => u.total_tasks > 0);
  const sorted = eligible.sort((a, b) => {
    const pctA = (a.completed_tasks / a.total_tasks) * 100;
    const pctB = (b.completed_tasks / b.total_tasks) * 100;
    if (pctB !== pctA) return pctB - pctA;
    if (b.completed_tasks !== a.completed_tasks) return b.completed_tasks - a.completed_tasks;
    if (b.total_tasks !== a.total_tasks) return b.total_tasks - a.total_tasks;
    if (b.total_study_minutes !== a.total_study_minutes) return b.total_study_minutes - a.total_study_minutes;
    const nameCmp = a.display_name.localeCompare(b.display_name);
    if (nameCmp !== 0) return nameCmp;
    return a.id.localeCompare(b.id);
  });

  return sorted.slice(0, limit).map((u, i) => ({
    rank: i + 1,
    user_id: u.id,
    display_name: u.display_name,
    avatar_url: u.avatar_url ?? null,
    completed_tasks: u.completed_tasks,
    total_tasks: u.total_tasks,
    goal_completion_pct: Math.round(((u.completed_tasks / u.total_tasks) * 100) * 10) / 10,
    total_study_minutes: u.total_study_minutes,
  }));
}

export interface AchieverRankingEntry {
  rank: number;
  user_id: string;
  display_name: string;
  avatar_url?: string | null;
  score: number;
  total_study_minutes: number;
  goal_completion_pct: number;
}

export function calculateHistoricalAchieverRanking(
  cohort: UserWeeklyRawMetrics[],
  limit = 5
): AchieverRankingEntry[] {
  const normalizers = computeCohortNormalizers(cohort);
  const withScores = cohort.map((u) => ({
    ...u,
    computedScore: calculateCompositeScore(u, normalizers),
  }));

  const sorted = withScores.sort((a, b) => {
    if (b.computedScore !== a.computedScore) return b.computedScore - a.computedScore;
    if (b.total_study_minutes !== a.total_study_minutes) return b.total_study_minutes - a.total_study_minutes;
    const nameCmp = a.display_name.localeCompare(b.display_name);
    if (nameCmp !== 0) return nameCmp;
    return a.id.localeCompare(b.id);
  });

  return sorted.slice(0, limit).map((u, i) => ({
    rank: i + 1,
    user_id: u.id,
    display_name: u.display_name,
    avatar_url: u.avatar_url ?? null,
    score: u.computedScore,
    total_study_minutes: u.total_study_minutes,
    goal_completion_pct:
      u.total_tasks > 0
        ? Math.round(((u.completed_tasks / u.total_tasks) * 100) * 10) / 10
        : 0,
  }));
}
