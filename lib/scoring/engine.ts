import { ScoringResult, UserProfile } from "@/lib/supabase/types";
import { calculateMemberLiveWeeklyStudySeconds } from "@/lib/time/format";
import { getServerNow } from "@/lib/time/clockSync";

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

export interface LiveScoreMetadata {
  liveScore: number;
  liveRank: number;
  liveStudyMinutes: number;
  studyHoursScore: number;
  goalScore: number;
  consistencyScore: number;
}

/**
 * Computes live real-time scores and ranks across all members using the authoritative
 * 50/30/20 Dual-Pillar Goal Index engine.
 *
 * Runs synchronously in <0.1ms with zero database calls.
 */
export function computeLiveLeaderboardMap(
  members: UserProfile[],
  now: Date = getServerNow(),
  currentUserId?: string,
  currentUserElapsedSeconds?: number,
  timezone: string = process.env.NEXT_PUBLIC_APP_TIMEZONE || "Asia/Kolkata"
): Map<string, LiveScoreMetadata> {
  if (!members || members.length === 0) {
    return new Map();
  }

  // 1. Calculate live study minutes for each member
  const memberLiveStats = members.map((m) => {
    const customElapsed =
      m.id === currentUserId && currentUserElapsedSeconds !== undefined
        ? currentUserElapsedSeconds
        : undefined;

    const liveSeconds = calculateMemberLiveWeeklyStudySeconds(m, now, customElapsed, timezone);
    const liveMins = Math.max(0, Math.floor(liveSeconds / 60));
    const totalMins = Math.max(liveMins, m.total_study_minutes ?? 0);

    return {
      member: m,
      liveStudyMinutes: totalMins,
      completedTasks: m.completed_tasks ?? 0,
      totalTasks: m.total_tasks ?? 0,
      streakDays: m.streak_days ?? 0,
    };
  });

  // 2. Identify weekly benchmarks across active group competitors
  const maxGroupStudyMinutes = Math.max(
    1,
    ...memberLiveStats.map((s) => s.liveStudyMinutes)
  );
  const maxGroupCompletedTasks = Math.max(
    1,
    ...memberLiveStats.map((s) => s.completedTasks)
  );

  // 3. Compute 50/30/20 composite score for every member
  const scoredMembers = memberLiveStats.map((s) => {
    // If the member has no task or streak metadata at all (e.g. in some isolated mock test),
    // and already has a pre-existing leaderboard_score, preserve it.
    const hasMetadata =
      s.member.completed_tasks !== undefined ||
      s.member.total_tasks !== undefined ||
      s.member.streak_days !== undefined;

    if (!hasMetadata && s.member.leaderboard_score === undefined) {
      return {
        member: s.member,
        liveStudyMinutes: s.liveStudyMinutes,
        liveScore: undefined,
        studyHoursScore: 0,
        goalScore: 0,
        consistencyScore: 0,
      };
    }

    if (!hasMetadata && s.member.leaderboard_score !== undefined) {
      return {
        member: s.member,
        liveStudyMinutes: s.liveStudyMinutes,
        liveScore: s.member.leaderboard_score,
        studyHoursScore: 0,
        goalScore: 0,
        consistencyScore: 0,
      };
    }

    const result = calculateLeaderboardScore(
      s.liveStudyMinutes,
      maxGroupStudyMinutes,
      s.completedTasks,
      s.totalTasks,
      s.streakDays,
      maxGroupCompletedTasks
    );

    return {
      member: s.member,
      liveStudyMinutes: s.liveStudyMinutes,
      liveScore: result.composite_score,
      studyHoursScore: result.study_hours_score,
      goalScore: result.goal_completion_score,
      consistencyScore: result.consistency_score,
    };
  });

  // 4. Sort scorable members using authoritative leaderboard tie-breaking rules:
  // 1) score DESC, 2) total_study_minutes DESC, 3) display_name ASC
  const scorableMembers = scoredMembers.filter(
    (s): s is typeof s & { liveScore: number } => typeof s.liveScore === "number"
  );

  const sorted = [...scorableMembers].sort((a, b) => {
    if (b.liveScore !== a.liveScore) {
      return b.liveScore - a.liveScore;
    }
    if (b.liveStudyMinutes !== a.liveStudyMinutes) {
      return b.liveStudyMinutes - a.liveStudyMinutes;
    }
    return (a.member.display_name || "").localeCompare(b.member.display_name || "");
  });

  // 5. Construct map with 1-based ranks
  const resultMap = new Map<string, LiveScoreMetadata>();
  sorted.forEach((item, idx) => {
    resultMap.set(item.member.id, {
      liveScore: item.liveScore,
      liveRank: idx + 1,
      liveStudyMinutes: item.liveStudyMinutes,
      studyHoursScore: item.studyHoursScore,
      goalScore: item.goalScore,
      consistencyScore: item.consistencyScore,
    });
  });

  return resultMap;
}

