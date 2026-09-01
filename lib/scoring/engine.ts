import { ScoringResult } from "@/lib/supabase/types";

/**
 * Calculates normalized 50/30/20 composite leaderboard score.
 * @param userStudyMinutes Total active study minutes recorded by user during the weekly period.
 * @param maxGroupStudyMinutes Peak active study minutes achieved by any group member during the weekly period.
 * @param completedTasks Total tasks completed in weekly goal sets.
 * @param totalTasks Total tasks created in weekly goal sets.
 * @param streakDays Current consecutive qualifying study days (>= 30 active study minutes).
 */
export function calculateLeaderboardScore(
  userStudyMinutes: number,
  maxGroupStudyMinutes: number,
  completedTasks: number,
  totalTasks: number,
  streakDays: number
): ScoringResult {
  const safeUserMins = Math.max(0, userStudyMinutes);
  const safeMaxMins = Math.max(1, maxGroupStudyMinutes);

  // 1. 50% Study Hours Component (0 to 100 scale)
  const study_hours_score = Math.min(100, (safeUserMins / safeMaxMins) * 100);

  // 2. 30% Goal Completion Component (0 to 100 scale)
  let goal_completion_score = 0;
  if (totalTasks > 0) {
    goal_completion_score = Math.min(
      100,
      Math.max(0, (completedTasks / totalTasks) * 100)
    );
  }

  // 3. 20% Consistency / Streak Component (0 to 100 scale, capped at 7 days)
  const consistency_score = Math.min(100, Math.max(0, (streakDays / 7.0) * 100));

  // 4. Weighted Composite Score
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
  };
}
