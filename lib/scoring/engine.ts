import { ScoringResult } from "@/lib/supabase/types";

/**
 * Calculates normalized 50/30/20 composite leaderboard score using Proposal 1
 * ("Dual-Pillar Goal Index": 60% Volume Output + 40% Discipline Follow-Through).
 *
 * @param userStudyMinutes Total active study minutes recorded by user during the weekly period.
 * @param maxGroupStudyMinutes Peak active study minutes achieved by any group member during the weekly period.
 * @param completedTasks Total tasks completed in weekly goal sets.
 * @param totalTasks Total tasks created in weekly goal sets.
 * @param streakDays Current consecutive qualifying study days (>= 30 active study minutes).
 * @param maxGroupCompletedTasks Peak completed tasks achieved by any group member (defaults to 15).
 */
export function calculateLeaderboardScore(
  userStudyMinutes: number,
  maxGroupStudyMinutes: number,
  completedTasks: number,
  totalTasks: number,
  streakDays: number,
  maxGroupCompletedTasks: number = 15
): ScoringResult {
  const safeUserMins = Math.max(0, userStudyMinutes);
  const safeMaxMins = Math.max(1, maxGroupStudyMinutes);

  // 1. 50% Study Hours Component (0 to 100 scale)
  const study_hours_score = Math.min(100, (safeUserMins / safeMaxMins) * 100);

  // 2. 30% Dual-Pillar Goal Index Component (0 to 100 scale)
  const safeCompleted = Math.max(0, completedTasks);
  const safeTotal = Math.max(0, totalTasks);

  // Dynamic Weekly Target scaled from 3 to 15 based on group achievement
  const targetCompleted = Math.max(
    3,
    Math.min(Math.max(safeCompleted, maxGroupCompletedTasks), 15)
  );

  // Volume Pillar (60% Weight): Rewards real task output, capped at target (100%)
  const volume_score = Math.min(100, (safeCompleted / targetCompleted) * 100);

  // Discipline Pillar (40% Weight): Rewards accurate planning and follow-through with a 3-task minimum baseline
  const effectiveTotal = Math.max(3, safeTotal);
  const discipline_score =
    safeTotal > 0 ? Math.min(100, (safeCompleted / effectiveTotal) * 100) : 0;

  const rawGoalScore = 0.6 * volume_score + 0.4 * discipline_score;
  const goal_completion_score = Math.min(100, Math.max(0, rawGoalScore));

  // 3. 20% Consistency / Streak Component (0 to 100 scale, capped at 7 days)
  const consistency_score = Math.min(100, Math.max(0, (streakDays / 7.0) * 100));

  // 4. Weighted Composite Score (0 to 100 scale)
  const rawComposite =
    0.5 * study_hours_score +
    0.3 * goal_completion_score +
    0.2 * consistency_score;

  const composite_score = Math.round(rawComposite * 10) / 10;

  return {
    study_hours_score: Math.round(study_hours_score * 10) / 10,
    goal_completion_score: Math.round(goal_completion_score * 10) / 10,
    consistency_score: Math.round(consistency_score * 10) / 10,
    composite_score,
    volume_score: Math.round(volume_score * 10) / 10,
    discipline_score: Math.round(discipline_score * 10) / 10,
  };
}
