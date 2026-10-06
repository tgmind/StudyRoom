import { ConsistencyEntry } from "@/lib/supabase/types";

export interface ConsistencyCandidate {
  user_id: string;
  display_name: string;
  avatar_url?: string | null;
  active_study_days: number;
  total_study_minutes: number;
  score?: number;
  daily_average_minutes?: number;
  rank?: number;
  is_admin?: boolean;
}

/**
 * Compares two consistency candidates using the canonical StudyRoom Consistency Ranking contract:
 * 1. Primary:   active_study_days DESC (e.g. 7 / 7 > 6 / 7 > 5 / 7 > 3 / 7)
 * 2. Secondary: total_study_minutes DESC (more study minutes ranks higher among equal active days)
 * 3. Tertiary:  canonical leaderboard score DESC (if present)
 * 4. Quaternary: display_name ASC (case-insensitive alphabetical order)
 * 5. Final:     user_id ASC (deterministic, stable tie-breaker)
 */
export function compareConsistencyCandidates(
  a: ConsistencyCandidate,
  b: ConsistencyCandidate
): number {
  // 1. Primary: active_study_days DESC
  const daysA = Number(a.active_study_days) || 0;
  const daysB = Number(b.active_study_days) || 0;
  if (daysB !== daysA) {
    return daysB - daysA;
  }

  // 2. Secondary: total_study_minutes DESC
  const minsA = Number(a.total_study_minutes) || 0;
  const minsB = Number(b.total_study_minutes) || 0;
  if (minsB !== minsA) {
    return minsB - minsA;
  }

  // 3. Tertiary: canonical score DESC (if available)
  const scoreA = Number(a.score) || 0;
  const scoreB = Number(b.score) || 0;
  if (scoreB !== scoreA) {
    return scoreB - scoreA;
  }

  // 4. Quaternary: display_name ASC
  const nameA = a.display_name || "";
  const nameB = b.display_name || "";
  const nameCmp = nameA.localeCompare(nameB);
  if (nameCmp !== 0) {
    return nameCmp;
  }

  // 5. Final: user_id ASC (deterministic tie-breaker)
  return (a.user_id || "").localeCompare(b.user_id || "");
}

/**
 * Calculates the canonical Consistency Ranking for the Top 5 Consistent Students:
 * - Filters out admin users (if is_admin is flagged)
 * - Sorts the ENTIRE candidate set BEFORE top-5 slicing using compareConsistencyCandidates
 * - Slices the top limit (default: 5)
 * - Assigns rank 1..N AFTER sorting
 * - Calculates accurate daily_average_minutes (total_study_minutes / 7.0)
 * - Clamps active_study_days to [0, 7]
 * - Guarantees immutability (does not mutate the input array)
 */
export function calculateConsistencyRanking<T extends ConsistencyCandidate>(
  candidates: T[],
  limit = 5
): ConsistencyEntry[] {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return [];
  }

  // Shallow copy to prevent mutating shared arrays or references
  const filtered = candidates.filter((c) => !c.is_admin);

  // Full sort across entire candidate population BEFORE pagination/slicing
  filtered.sort(compareConsistencyCandidates);

  return filtered.slice(0, limit).map((c, index) => {
    const totalMinutes = Number(c.total_study_minutes) || 0;
    const activeDays = Math.min(7, Math.max(0, Number(c.active_study_days) || 0));
    const dailyAvg =
      c.daily_average_minutes !== undefined && !Number.isNaN(c.daily_average_minutes)
        ? Number(c.daily_average_minutes)
        : Math.round((totalMinutes / 7.0) * 10) / 10;

    return {
      rank: index + 1,
      user_id: c.user_id,
      display_name: c.display_name,
      avatar_url: c.avatar_url ?? null,
      total_study_minutes: totalMinutes,
      daily_average_minutes: dailyAvg,
      active_study_days: activeDays,
      score: Number(c.score) || 0,
    };
  });
}
