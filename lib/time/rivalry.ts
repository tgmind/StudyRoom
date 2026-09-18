import { UserProfile } from "@/lib/supabase/types";
import { calculateMemberLiveWeeklyStudySeconds, getWeekStartTimestamp } from "./format";
import { getEffectiveMemberStatus } from "./break";
import { getServerNow } from "./clockSync";
import { RIVALRY_CONFIG } from "./rivalryConfig";

// Re-export constants for backward compatibility
export const MAX_RIVALRY_GAP_SECONDS = RIVALRY_CONFIG.START_GAP_SECONDS; // 600s
export const MIN_RIVALRY_WEEKLY_SECONDS = RIVALRY_CONFIG.MIN_RIVALRY_WEEKLY_SECONDS; // 3,600s

export type RivalryResolutionType =
  | "WON"
  | "NO_CONTEST"
  | "MEMBER_LEFT"
  | "SESSION_STOPPED"
  | "DISCONNECTED"
  | "EXPIRED"
  | "WEEK_ROLLOVER";

export type RivalryMode = "STUDY_TIME" | "RANK_CLASH";

export interface RivalryStanding {
  userId: string;
  name: string;
  rank: number;
  weeklySeconds: number;
  score?: number;
  leaderboardRank?: number;
}

export interface RivalryWinEvent {
  id: string; // Authoritative Resolution ID (idempotency key)
  resolutionId?: string;
  rivalryId?: string;
  mode?: RivalryMode;
  winnerId?: string;
  winnerName: string;
  loserId?: string;
  loserName: string;
  participantIds?: string[];
  finalStandings?: RivalryStanding[];
  standings?: RivalryStanding[];
  occurredAt?: string;
  resolutionType?: RivalryResolutionType;
  timestamp: number; // Epoch milliseconds (occurred_at)
}

export interface RivalryState {
  id: string; // Stable ID: rivalry-pair-minId-maxId or rivalry-trio-id1-id2-id3
  participantIds: string[]; // Normalized lexicographically sorted participant IDs
  rivalMembers: UserProfile[]; // Sorted by mode ranking metric (index 0 is current leader)
  mode?: RivalryMode;
  primaryGapSeconds?: number; // Only for STUDY_TIME
  scoreGap?: number; // Only for RANK_CLASH
  formattedGap: string;
  isTrio: boolean;
  leaderWeeklySeconds?: number;
  leaderScore?: number;
  startedAt?: number;
}

/**
 * Generates a stable, deterministic rivalry ID that NEVER changes when the leader changes.
 * Sorted lexicographically by participant user IDs.
 */
export function generateStableRivalryId(memberIds: string[]): string {
  const sorted = [...memberIds].sort();
  if (sorted.length === 2) {
    return `rivalry-pair-${sorted[0]}-${sorted[1]}`;
  }
  return `rivalry-trio-${sorted.join("-")}`;
}

/**
 * Checks if the Monday Warm-up Protection period is active.
 * From Monday 00:00 to 01:00 in the target timezone (Asia/Kolkata),
 * no new rivalries should form to maintain a clean start to the week.
 */
export function isMondayWarmupActive(
  now: Date = getServerNow(),
  timezone = process.env.NEXT_PUBLIC_APP_TIMEZONE || "Asia/Kolkata"
): boolean {
  const weekStartMs = getWeekStartTimestamp(now, timezone);
  const elapsedSinceWeekStartMs = now.getTime() - weekStartMs;
  const warmupDurationMs = RIVALRY_CONFIG.WEEKLY_RIVALRY_WARMUP_MINUTES * 60 * 1000;
  return elapsedSinceWeekStartMs >= 0 && elapsedSinceWeekStartMs < warmupDurationMs;
}

/**
 * Computes a member's authoritative live weekly study time in seconds:
 * Past completed sessions this week + live elapsed study seconds of current active session,
 * strictly clamped to the ISO week start boundary.
 */
export function getLiveMemberWeeklySeconds(
  member: UserProfile,
  now: Date = getServerNow(),
  currentUserId?: string,
  currentUserElapsedSeconds?: number
): number {
  const customElapsed =
    member.id === currentUserId && currentUserElapsedSeconds !== undefined
      ? currentUserElapsedSeconds
      : undefined;
  return calculateMemberLiveWeeklyStudySeconds(member, now, customElapsed);
}

/**
 * Format a rivalry gap into clean, eye-friendly duration string (e.g. "14m 20s" or "45s" or "Tied (0s)").
 */
export function formatRivalryGap(gapSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(gapSeconds));
  if (safeSeconds === 0) {
    return "Tied (0s)";
  }

  const totalMinutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;

  if (totalMinutes >= 60) {
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    return `${hours}h ${mins}m`;
  }

  if (totalMinutes > 0) {
    return `${totalMinutes}m ${seconds}s`;
  }

  return `${seconds}s`;
}

/**
 * Format total weekly study seconds into concise format (e.g. "15h 10m" or "45m").
 */
export function formatWeeklyHours(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const totalMinutes = Math.floor(safeSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  return `${mins}m`;
}

interface CandidateMember {
  member: UserProfile;
  weeklySeconds: number;
}

/**
 * Evaluates whether two members satisfy Competitive Proximity for a STUDY_TIME pair rivalry.
 * Thresholds: START_GAP_SECONDS (600s = 10m) or CONTINUE_GAP_SECONDS (900s = 15m with hysteresis).
 */
export function canFormStudyTimePair(
  a: CandidateMember,
  b: CandidateMember,
  isAlreadyActive = false
): boolean {
  const gap = Math.abs(a.weeklySeconds - b.weeklySeconds);
  const maxGap = isAlreadyActive
    ? RIVALRY_CONFIG.STUDY_TIME.CONTINUE_GAP_SECONDS
    : RIVALRY_CONFIG.STUDY_TIME.START_GAP_SECONDS;

  return gap <= maxGap;
}

/**
 * Evaluates whether two members satisfy Competitive Proximity for a RANK_CLASH pair rivalry.
 * Thresholds based on leaderboard rank distance and composite score proximity:
 * - Rank distance = 1: score gap <= 10.0 pts (or 13.0 with continue hysteresis)
 * - Rank distance <= 2: score gap <= 8.0 pts (or 11.0 with continue hysteresis)
 * - Rank distance <= 3: score gap <= 6.0 pts (or 9.0 with continue hysteresis)
 *
 * NOTE: Weekly study-time difference does NOT disqualify this rivalry.
 */
export function canFormRankClashPair(
  a: CandidateMember,
  b: CandidateMember,
  isAlreadyActive = false
): boolean {
  const scoreA = a.member.leaderboard_score;
  const scoreB = b.member.leaderboard_score;
  const rankA = a.member.leaderboard_rank;
  const rankB = b.member.leaderboard_rank;

  if (scoreA === undefined || scoreB === undefined || rankA === undefined || rankB === undefined) {
    return false;
  }

  const rankDiff = Math.abs(rankA - rankB);
  const scoreGap = Math.abs(scoreA - scoreB);
  const buffer = isAlreadyActive ? RIVALRY_CONFIG.RANK_CLASH.CONTINUE_BUFFER_POINTS : 0;

  if (rankDiff <= 1 && scoreGap <= RIVALRY_CONFIG.RANK_CLASH.ADJACENT_RANKS_MAX_GAP + buffer) return true;
  if (rankDiff <= 2 && scoreGap <= RIVALRY_CONFIG.RANK_CLASH.DISTANCE_2_MAX_GAP + buffer) return true;
  if (rankDiff <= 3 && scoreGap <= RIVALRY_CONFIG.RANK_CLASH.DISTANCE_3_MAX_GAP + buffer) return true;

  return false;
}

/**
 * Backward-compatible wrapper: returns true if candidates satisfy either STUDY_TIME or RANK_CLASH proximity.
 */
export function canFormPair(
  a: CandidateMember,
  b: CandidateMember,
  isAlreadyActive = false
): boolean {
  return canFormStudyTimePair(a, b, isAlreadyActive) || canFormRankClashPair(a, b, isAlreadyActive);
}

/**
 * Determines whether three members satisfy Competitive Proximity to form or continue a Trio rivalry.
 * Trios are exclusively supported for STUDY_TIME duels.
 */
export function canFormTrio(
  top: CandidateMember,
  second: CandidateMember,
  third: CandidateMember,
  isAlreadyActive = false
): boolean {
  const span = top.weeklySeconds - third.weeklySeconds;
  const maxSpan = isAlreadyActive
    ? RIVALRY_CONFIG.STUDY_TIME.TRIO_CONTINUE_SPAN_SECONDS
    : RIVALRY_CONFIG.STUDY_TIME.TRIO_SPAN_SECONDS;

  return span <= maxSpan;
}

interface CandidateGroup {
  id: string;
  participantIds: string[];
  candidates: CandidateMember[];
  mode: RivalryMode;
  isTrio: boolean;
  weight: number;
}

/**
 * Real-time Multi-Mode Matchmaking Engine — Non-Greedy & Deterministic (Rivalry Arena 2.0 Option B)
 *
 * Rules:
 * 1. Warm-up Protection: First 60 mins of Monday (Asia/Kolkata) blocks new rivalry creation.
 * 2. Active status: Only studying or break members qualify (break < 1h, study < 3h).
 * 3. Minimum weekly activity: >= 60 minutes (3,600s).
 * 4. Dual Modes: Evaluates both STUDY_TIME (duration close) and RANK_CLASH (leaderboard close).
 * 5. Multi-dimensional Candidate Generation: Considers duration proximity and leaderboard proximity independently.
 * 6. Non-Greedy Partition: Optimizes disjoint grouping to maximize engaged members and minimize starvation.
 * 7. Stable Rivalry ID: Invariant under lead change.
 * 8. Hysteresis: Tolerates continue buffer for active rivalries (+500 affinity) to prevent flickering.
 */
export function detectLiveRivalries(
  members: UserProfile[],
  now: Date = getServerNow(),
  currentUserId?: string,
  currentUserElapsedSeconds?: number,
  previousRivalries?: RivalryState[]
): RivalryState[] {
  if (!members || members.length < 2) return [];

  // 1. Monday Warm-up Protection Check
  if (isMondayWarmupActive(now)) {
    return [];
  }

  // Previous active rivalries map for hysteresis lookup
  const activeRivalryMap = new Map<string, RivalryState>();
  if (previousRivalries && previousRivalries.length > 0) {
    for (const r of previousRivalries) {
      activeRivalryMap.set(r.id, r);
    }
  }

  // 2. Filter actively studying/break members with at least 60 minutes of weekly study time
  const qualifiedMembers: CandidateMember[] = members
    .filter((m) => {
      const status = getEffectiveMemberStatus(m, now);
      return status === "studying" || status === "break";
    })
    .map((m) => ({
      member: m,
      weeklySeconds: getLiveMemberWeeklySeconds(m, now, currentUserId, currentUserElapsedSeconds),
    }))
    .filter((m) => m.weeklySeconds >= RIVALRY_CONFIG.MIN_RIVALRY_WEEKLY_SECONDS);

  if (qualifiedMembers.length < 2) return [];

  // 3. Multi-Signal Candidate Generation
  const candidateGroups: CandidateGroup[] = [];
  const candidateGroupKeys = new Set<string>();

  // A. Generate STUDY_TIME candidates (sorted descending by live weekly study seconds)
  const sortedByTime = [...qualifiedMembers].sort((a, b) => b.weeklySeconds - a.weeklySeconds);
  const nTime = sortedByTime.length;

  for (let i = 0; i < nTime - 1; i++) {
    // Study-time pair candidate
    const m1 = sortedByTime[i];
    const m2 = sortedByTime[i + 1];
    const pairId = generateStableRivalryId([m1.member.id, m2.member.id]);
    const prevRivalry = activeRivalryMap.get(pairId);
    const isPairActive = prevRivalry !== undefined && (prevRivalry.mode === "STUDY_TIME" || !prevRivalry.mode);

    if (canFormStudyTimePair(m1, m2, isPairActive)) {
      const gap = Math.abs(m1.weeklySeconds - m2.weeklySeconds);
      const normalizedPenalty = Math.min(100, (gap / RIVALRY_CONFIG.STUDY_TIME.START_GAP_SECONDS) * 100);
      const affinity = isPairActive ? 500 : 0;
      const weight = 2000 + affinity + (100 - normalizedPenalty);

      candidateGroups.push({
        id: pairId,
        participantIds: [m1.member.id, m2.member.id].sort(),
        candidates: [m1, m2],
        mode: "STUDY_TIME",
        isTrio: false,
        weight,
      });
      candidateGroupKeys.add(pairId);
    }

    // Study-time trio candidate
    if (i < nTime - 2) {
      const m3 = sortedByTime[i + 2];
      const trioId = generateStableRivalryId([m1.member.id, m2.member.id, m3.member.id]);
      const prevTrio = activeRivalryMap.get(trioId);
      const isTrioActive = prevTrio !== undefined && prevTrio.isTrio && (prevTrio.mode === "STUDY_TIME" || !prevTrio.mode);

      if (canFormTrio(m1, m2, m3, isTrioActive)) {
        const span = m1.weeklySeconds - m3.weeklySeconds;
        const normalizedPenalty = Math.min(100, (span / RIVALRY_CONFIG.STUDY_TIME.TRIO_SPAN_SECONDS) * 100);
        const affinity = isTrioActive ? 500 : 0;
        const weight = 3000 + affinity + (100 - normalizedPenalty);

        candidateGroups.push({
          id: trioId,
          participantIds: [m1.member.id, m2.member.id, m3.member.id].sort(),
          candidates: [m1, m2, m3],
          mode: "STUDY_TIME",
          isTrio: true,
          weight,
        });
      }
    }
  }

  // B. Generate RANK_CLASH candidates (sorted ascending by leaderboard rank)
  const rankedMembers = qualifiedMembers.filter(
    (m) => m.member.leaderboard_rank !== undefined && m.member.leaderboard_score !== undefined
  );
  rankedMembers.sort((a, b) => (a.member.leaderboard_rank ?? 999) - (b.member.leaderboard_rank ?? 999));
  const nRank = rankedMembers.length;

  for (let i = 0; i < nRank; i++) {
    for (let j = i + 1; j < Math.min(i + 4, nRank); j++) {
      const m1 = rankedMembers[i];
      const m2 = rankedMembers[j];
      const pairId = generateStableRivalryId([m1.member.id, m2.member.id]);

      // If already added as a STUDY_TIME pair, don't duplicate
      if (candidateGroupKeys.has(pairId)) {
        continue;
      }

      const prevRivalry = activeRivalryMap.get(pairId);
      const isRankActive = prevRivalry !== undefined && prevRivalry.mode === "RANK_CLASH";

      if (canFormRankClashPair(m1, m2, isRankActive)) {
        const rankDiff = Math.abs((m1.member.leaderboard_rank ?? 999) - (m2.member.leaderboard_rank ?? 999));
        const scoreGap = Math.abs((m1.member.leaderboard_score ?? 0) - (m2.member.leaderboard_score ?? 0));
        const maxScoreGap =
          rankDiff <= 1
            ? RIVALRY_CONFIG.RANK_CLASH.ADJACENT_RANKS_MAX_GAP
            : rankDiff <= 2
            ? RIVALRY_CONFIG.RANK_CLASH.DISTANCE_2_MAX_GAP
            : RIVALRY_CONFIG.RANK_CLASH.DISTANCE_3_MAX_GAP;

        const normalizedPenalty = Math.min(100, (scoreGap / maxScoreGap) * 100);
        const affinity = isRankActive ? 500 : 0;
        const weight = 2000 + affinity + (100 - normalizedPenalty);

        candidateGroups.push({
          id: pairId,
          participantIds: [m1.member.id, m2.member.id].sort(),
          candidates: [m1, m2],
          mode: "RANK_CLASH",
          isTrio: false,
          weight,
        });
        candidateGroupKeys.add(pairId);
      }
    }
  }

  if (candidateGroups.length === 0) {
    return [];
  }

  // 4. Non-Greedy Deterministic Partitioning:
  // Maximizes total weight (which favors 2 pairs over 1 trio leaving 1 starved,
  // gives affinity bonus to keep existing active rivalries stable, and minimizes gap penalties).
  candidateGroups.sort((a, b) => b.weight - a.weight);

  let bestTotalScore = 0;
  let bestSelection: CandidateGroup[] = [];

  function search(index: number, currentWeight: number, selection: CandidateGroup[], usedIds: Set<string>) {
    if (currentWeight > bestTotalScore) {
      bestTotalScore = currentWeight;
      bestSelection = [...selection];
    }
    if (index >= candidateGroups.length) {
      return;
    }

    for (let i = index; i < candidateGroups.length; i++) {
      const cand = candidateGroups[i];
      const hasOverlap = cand.participantIds.some((id) => usedIds.has(id));
      if (!hasOverlap) {
        for (const id of cand.participantIds) usedIds.add(id);
        selection.push(cand);

        search(i + 1, currentWeight + cand.weight, selection, usedIds);

        selection.pop();
        for (const id of cand.participantIds) usedIds.delete(id);
      }
    }
  }

  search(0, 0, [], new Set());

  // 5. Reconstruct optimal grouping into authoritative RivalryState
  const rivalries: RivalryState[] = [];

  for (const group of bestSelection) {
    if (group.mode === "STUDY_TIME") {
      // Sort pair or trio descending by live weekly study seconds
      const sorted = [...group.candidates].sort((a, b) => b.weeklySeconds - a.weeklySeconds);
      const primaryGap = sorted[0].weeklySeconds - sorted[1].weeklySeconds;

      rivalries.push({
        id: group.id,
        participantIds: group.participantIds,
        rivalMembers: sorted.map((c) => c.member),
        mode: "STUDY_TIME",
        primaryGapSeconds: primaryGap,
        formattedGap: formatRivalryGap(primaryGap),
        isTrio: group.isTrio,
        leaderWeeklySeconds: sorted[0].weeklySeconds,
      });
    } else {
      // RANK_CLASH: Sort pair by leaderboard score descending (tie-breaker: rank ascending, then weekly seconds)
      const sorted = [...group.candidates].sort((a, b) => {
        const scoreA = a.member.leaderboard_score ?? 0;
        const scoreB = b.member.leaderboard_score ?? 0;
        if (scoreB !== scoreA) return scoreB - scoreA;
        const rankA = a.member.leaderboard_rank ?? 999;
        const rankB = b.member.leaderboard_rank ?? 999;
        if (rankA !== rankB) return rankA - rankB;
        return b.weeklySeconds - a.weeklySeconds;
      });

      const scoreGap = Math.abs(
        (sorted[0].member.leaderboard_score ?? 0) - (sorted[1].member.leaderboard_score ?? 0)
      );

      rivalries.push({
        id: group.id,
        participantIds: group.participantIds,
        rivalMembers: sorted.map((c) => c.member),
        mode: "RANK_CLASH",
        scoreGap,
        formattedGap: `${scoreGap.toFixed(1)} pts`,
        isTrio: false,
        leaderScore: sorted[0].member.leaderboard_score,
        leaderWeeklySeconds: sorted[0].weeklySeconds,
      });
    }
  }

  // Return sorted descending by leader weekly study seconds, then stable tie-breaker by id
  return rivalries.sort((a, b) => {
    const timeB = b.leaderWeeklySeconds ?? 0;
    const timeA = a.leaderWeeklySeconds ?? 0;
    if (timeB !== timeA) {
      return timeB - timeA;
    }
    return a.id.localeCompare(b.id);
  });
}

/**
 * Backward-compatible single rivalry detector.
 */
export function detectLiveRivalry(
  members: UserProfile[],
  now: Date = getServerNow(),
  currentUserId?: string,
  currentUserElapsedSeconds?: number
): RivalryState | null {
  const rivalries = detectLiveRivalries(members, now, currentUserId, currentUserElapsedSeconds);
  return rivalries.length > 0 ? rivalries[0] : null;
}

/**
 * Authoritative Rivalry Resolution Evaluator (Mode-Aware)
 *
 * Evaluates a dissolved rivalry to determine if a legitimate WON outcome occurred,
 * or if it dissolved due to a non-win state (member left, session stopped, expired, week rollover).
 *
 * ONLY 'WON' outcomes may trigger celebratory win events.
 */
export function evaluateRivalryResolution(
  prevRivalry: RivalryState,
  currentMembers: UserProfile[],
  now: Date = getServerNow()
): {
  shouldResolve: boolean;
  resolutionType: RivalryResolutionType;
  winner?: UserProfile;
  loser?: UserProfile;
  standings: RivalryStanding[];
  resolutionId: string;
} | null {
  if (!prevRivalry || prevRivalry.rivalMembers.length < 2) {
    return null;
  }

  const memberMap = new Map<string, UserProfile>();
  for (const m of currentMembers) {
    memberMap.set(m.id, m);
  }

  // Inspect current statuses of all participants
  const participantsWithStatus = prevRivalry.rivalMembers.map((m) => {
    const live = memberMap.get(m.id) || m;
    const effectiveStatus = getEffectiveMemberStatus(live, now);
    const weeklySec = getLiveMemberWeeklySeconds(live, now);
    return {
      member: live,
      effectiveStatus,
      weeklySec,
    };
  });

  const timeBucket = Math.floor(now.getTime() / RIVALRY_CONFIG.EVENT_TTL_MS);

  // Check 1: Weekly Rollover Check
  if (isMondayWarmupActive(now)) {
    return {
      shouldResolve: true,
      resolutionType: "WEEK_ROLLOVER",
      standings: [],
      resolutionId: `res-${prevRivalry.id}-rollover-${timeBucket}`,
    };
  }

  // Check 2: Did any participant go offline or stop their session?
  const anyOffline = participantsWithStatus.some((p) => p.effectiveStatus === "offline");
  if (anyOffline) {
    return {
      shouldResolve: true,
      resolutionType: "SESSION_STOPPED",
      standings: [],
      resolutionId: `res-${prevRivalry.id}-stopped-${timeBucket}`,
    };
  }

  // Check 3: Mode-Aware Win Evaluation
  if (prevRivalry.mode === "RANK_CLASH") {
    // Sort participants by leaderboard score descending, with rank ascending and weeklySec as tie-breakers
    participantsWithStatus.sort((a, b) => {
      const scoreA = a.member.leaderboard_score ?? 0;
      const scoreB = b.member.leaderboard_score ?? 0;
      if (scoreB !== scoreA) return scoreB - scoreA;
      const rankA = a.member.leaderboard_rank ?? 999;
      const rankB = b.member.leaderboard_rank ?? 999;
      if (rankA !== rankB) return rankA - rankB;
      return b.weeklySec - a.weeklySec;
    });

    const leader = participantsWithStatus[0];
    const runnerUp = participantsWithStatus[1];
    const decisiveScoreGap =
      (leader.member.leaderboard_score ?? 0) - (runnerUp.member.leaderboard_score ?? 0);

    const standings: RivalryStanding[] = participantsWithStatus.map((p, idx) => ({
      userId: p.member.id,
      name: p.member.display_name,
      rank: idx + 1,
      weeklySeconds: p.weeklySec,
      score: p.member.leaderboard_score,
      leaderboardRank: p.member.leaderboard_rank,
    }));

    // Decisive win in RANK_CLASH: leader pulled ahead by >= RESOLUTION_SCORE_GAP (15.0 pts)
    if (decisiveScoreGap >= RIVALRY_CONFIG.RANK_CLASH.RESOLUTION_SCORE_GAP) {
      const resolutionId = `res-${prevRivalry.id}-win-${timeBucket}`;
      return {
        shouldResolve: true,
        resolutionType: "WON",
        winner: leader.member,
        loser: runnerUp.member,
        standings,
        resolutionId,
      };
    }

    return {
      shouldResolve: true,
      resolutionType: "NO_CONTEST",
      standings,
      resolutionId: `res-${prevRivalry.id}-nocontest-${timeBucket}`,
    };
  }

  // STUDY_TIME: Sort participants by current live weekly seconds
  participantsWithStatus.sort((a, b) => b.weeklySec - a.weeklySec);
  const leader = participantsWithStatus[0];
  const runnerUp = participantsWithStatus[1];
  const decisiveGap = leader.weeklySec - runnerUp.weeklySec;

  const standings: RivalryStanding[] = participantsWithStatus.map((p, idx) => ({
    userId: p.member.id,
    name: p.member.display_name,
    rank: idx + 1,
    weeklySeconds: p.weeklySec,
    score: p.member.leaderboard_score,
    leaderboardRank: p.member.leaderboard_rank,
  }));

  // True Win Resolution in STUDY_TIME: leader pulled ahead >= RESOLUTION_GAP_SECONDS (15m = 900s)
  if (decisiveGap >= RIVALRY_CONFIG.STUDY_TIME.RESOLUTION_GAP_SECONDS) {
    const resolutionId = `res-${prevRivalry.id}-win-${timeBucket}`;
    return {
      shouldResolve: true,
      resolutionType: "WON",
      winner: leader.member,
      loser: runnerUp.member,
      standings,
      resolutionId,
    };
  }

  return {
    shouldResolve: true,
    resolutionType: "NO_CONTEST",
    standings,
    resolutionId: `res-${prevRivalry.id}-nocontest-${timeBucket}`,
  };
}
