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

export interface RivalryStanding {
  userId: string;
  name: string;
  rank: number;
  weeklySeconds: number;
}

export interface RivalryWinEvent {
  id: string; // Authoritative Resolution ID (idempotency key)
  resolutionId?: string;
  rivalryId?: string;
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
  rivalMembers: UserProfile[]; // Sorted descending by live study time (index 0 is current leader)
  primaryGapSeconds: number;
  formattedGap: string;
  isTrio: boolean;
  leaderWeeklySeconds: number;
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
 * Determines whether two members satisfy Competitive Proximity to form or continue a Pair rivalry.
 * Incorporates:
 * 1. Live weekly study time difference (START_GAP_SECONDS or CONTINUE_GAP_SECONDS with hysteresis).
 * 2. Auxiliary Leaderboard score and rank proximity (when available).
 */
export function canFormPair(
  a: CandidateMember,
  b: CandidateMember,
  isAlreadyActive = false
): boolean {
  const gap = Math.abs(a.weeklySeconds - b.weeklySeconds);
  const maxGap = isAlreadyActive
    ? RIVALRY_CONFIG.CONTINUE_GAP_SECONDS
    : RIVALRY_CONFIG.START_GAP_SECONDS;

  // Primary signal: Raw live weekly active study seconds proximity
  if (gap <= maxGap) {
    return true;
  }

  // Auxiliary signal: Leaderboard score & rank proximity (only if gap is within continue tolerance)
  if (gap <= RIVALRY_CONFIG.CONTINUE_GAP_SECONDS) {
    const scoreA = a.member.leaderboard_score;
    const scoreB = b.member.leaderboard_score;
    const rankA = a.member.leaderboard_rank;
    const rankB = b.member.leaderboard_rank;

    if (scoreA !== undefined && scoreB !== undefined && rankA !== undefined && rankB !== undefined) {
      const rankDiff = Math.abs(rankA - rankB);
      const scoreGap = Math.abs(scoreA - scoreB);

      if (rankDiff <= 1 && scoreGap <= RIVALRY_CONFIG.SCORE_PROXIMITY.ADJACENT_RANKS_MAX_GAP) return true;
      if (rankDiff <= 2 && scoreGap <= RIVALRY_CONFIG.SCORE_PROXIMITY.DISTANCE_2_MAX_GAP) return true;
      if (rankDiff <= 3 && scoreGap <= RIVALRY_CONFIG.SCORE_PROXIMITY.DISTANCE_3_MAX_GAP) return true;
    }
  }

  return false;
}

/**
 * Determines whether three members satisfy Competitive Proximity to form or continue a Trio rivalry.
 */
export function canFormTrio(
  top: CandidateMember,
  second: CandidateMember,
  third: CandidateMember,
  isAlreadyActive = false
): boolean {
  const span = top.weeklySeconds - third.weeklySeconds;
  const maxSpan = isAlreadyActive
    ? RIVALRY_CONFIG.TRIO_CONTINUE_SPAN_SECONDS
    : RIVALRY_CONFIG.TRIO_SPAN_SECONDS;

  return span <= maxSpan;
}

/**
 * Real-time Matchmaking Engine — Non-Greedy & Deterministic (Rivalry Arena 2.0)
 *
 * Rules:
 * 1. Warm-up Protection: First 60 mins of Monday blocks new rivalry creation.
 * 2. Active status: Only studying or break members qualify (break < 1h, study < 3h).
 * 3. Minimum weekly activity: >= 60 minutes (3,600s).
 * 4. Stable Rivalry ID: Invariant under lead change.
 * 5. Non-Greedy Grouping: Optimizes partition to maximize total engaged members
 *    and prevent starvation (e.g. 4 members forming 2 pairs instead of 1 trio leaving 1 starved).
 * 6. Hysteresis: Tolerates up to 15 minutes gap for ongoing active rivalries to prevent flickering.
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

  // Set of active stable rivalry IDs from previous tick for hysteresis lookup
  const activeRivalryIdSet = new Set<string>();
  if (previousRivalries && previousRivalries.length > 0) {
    for (const r of previousRivalries) {
      activeRivalryIdSet.add(r.id);
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

  // 3. Sort descending by live weekly study seconds
  qualifiedMembers.sort((a, b) => b.weeklySeconds - a.weeklySeconds);

  const n = qualifiedMembers.length;

  // 4. Non-Greedy Dynamic Matching:
  // We want to partition candidates into valid Pairs (size 2) and Trios (size 3)
  // to maximize total members engaged while minimizing total gap distance.
  // Weight: each matched member adds +2000 points; gap subtracted.
  // This mathematically prefers 2 pairs (4 members = ~4000 pts) over 1 trio (3 members = ~3000 pts).

  interface MemoResult {
    score: number;
    choice: "skip" | "pair" | "trio";
  }

  const memo = new Map<number, MemoResult>();

  function solve(idx: number): MemoResult {
    if (idx >= n - 1) {
      return { score: 0, choice: "skip" };
    }
    if (memo.has(idx)) {
      return memo.get(idx)!;
    }

    // Option 1: Skip current member
    let bestScore = solve(idx + 1).score;
    let bestChoice: "skip" | "pair" | "trio" = "skip";

    // Option 2: Form Pair with idx + 1
    const pairA = qualifiedMembers[idx];
    const pairB = qualifiedMembers[idx + 1];
    const pairId = generateStableRivalryId([pairA.member.id, pairB.member.id]);
    const isPairActive = activeRivalryIdSet.has(pairId);

    if (canFormPair(pairA, pairB, isPairActive)) {
      const gap = Math.abs(pairA.weeklySeconds - pairB.weeklySeconds);
      const pairScore = 2000 - gap + solve(idx + 2).score;
      if (pairScore > bestScore) {
        bestScore = pairScore;
        bestChoice = "pair";
      }
    }

    // Option 3: Form Trio with idx + 1 and idx + 2
    if (idx + 2 < n) {
      const trioA = qualifiedMembers[idx];
      const trioB = qualifiedMembers[idx + 1];
      const trioC = qualifiedMembers[idx + 2];
      const trioId = generateStableRivalryId([trioA.member.id, trioB.member.id, trioC.member.id]);
      const isTrioActive = activeRivalryIdSet.has(trioId);

      if (canFormTrio(trioA, trioB, trioC, isTrioActive)) {
        const span = trioA.weeklySeconds - trioC.weeklySeconds;
        const trioScore = 3000 - span + solve(idx + 3).score;
        // Prioritize trio only if it yields strictly better overall engagement
        if (trioScore > bestScore) {
          bestScore = trioScore;
          bestChoice = "trio";
        }
      }
    }

    const result: MemoResult = { score: bestScore, choice: bestChoice };
    memo.set(idx, result);
    return result;
  }

  solve(0);

  // Reconstruct optimal grouping
  const rivalries: RivalryState[] = [];
  let curr = 0;
  while (curr < n) {
    const res = memo.get(curr) || solve(curr);
    if (res.choice === "pair") {
      const m1 = qualifiedMembers[curr];
      const m2 = qualifiedMembers[curr + 1];
      // Sort pair members descending by live weekly seconds
      const sortedPair = [m1, m2].sort((a, b) => b.weeklySeconds - a.weeklySeconds);
      const gap = sortedPair[0].weeklySeconds - sortedPair[1].weeklySeconds;
      const stableId = generateStableRivalryId([m1.member.id, m2.member.id]);

      rivalries.push({
        id: stableId,
        participantIds: [m1.member.id, m2.member.id].sort(),
        rivalMembers: [sortedPair[0].member, sortedPair[1].member],
        primaryGapSeconds: gap,
        formattedGap: formatRivalryGap(gap),
        isTrio: false,
        leaderWeeklySeconds: sortedPair[0].weeklySeconds,
      });

      curr += 2;
    } else if (res.choice === "trio") {
      const m1 = qualifiedMembers[curr];
      const m2 = qualifiedMembers[curr + 1];
      const m3 = qualifiedMembers[curr + 2];
      const sortedTrio = [m1, m2, m3].sort((a, b) => b.weeklySeconds - a.weeklySeconds);
      const primaryGap = sortedTrio[0].weeklySeconds - sortedTrio[1].weeklySeconds;
      const stableId = generateStableRivalryId([m1.member.id, m2.member.id, m3.member.id]);

      rivalries.push({
        id: stableId,
        participantIds: [m1.member.id, m2.member.id, m3.member.id].sort(),
        rivalMembers: [sortedTrio[0].member, sortedTrio[1].member, sortedTrio[2].member],
        primaryGapSeconds: primaryGap,
        formattedGap: formatRivalryGap(primaryGap),
        isTrio: true,
        leaderWeeklySeconds: sortedTrio[0].weeklySeconds,
      });

      curr += 3;
    } else {
      curr += 1;
    }
  }

  return rivalries;
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
 * Authoritative Rivalry Resolution Evaluator
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

  // Check 1: Weekly Rollover Check
  if (isMondayWarmupActive(now)) {
    return {
      shouldResolve: true,
      resolutionType: "WEEK_ROLLOVER",
      standings: [],
      resolutionId: `res-${prevRivalry.id}-rollover-${Math.floor(now.getTime() / 1000)}`,
    };
  }

  // Check 2: Did any participant go offline or stop their session?
  const anyOffline = participantsWithStatus.some((p) => p.effectiveStatus === "offline");
  if (anyOffline) {
    // Member stopped or left: NOT a win!
    return {
      shouldResolve: true,
      resolutionType: "SESSION_STOPPED",
      standings: [],
      resolutionId: `res-${prevRivalry.id}-stopped-${Math.floor(now.getTime() / 1000)}`,
    };
  }

  // Check 3: Sort participants by current live weekly seconds
  participantsWithStatus.sort((a, b) => b.weeklySec - a.weeklySec);
  const leader = participantsWithStatus[0];
  const runnerUp = participantsWithStatus[1];
  const decisiveGap = leader.weeklySec - runnerUp.weeklySec;

  // Build full final standings for all participants (preserving Trio context)
  const standings: RivalryStanding[] = participantsWithStatus.map((p, idx) => ({
    userId: p.member.id,
    name: p.member.display_name,
    rank: idx + 1,
    weeklySeconds: p.weeklySec,
  }));

  // Check 4: True Win Resolution
  // If all participants are still active in the room and the leader pulled ahead >= RESOLUTION_GAP_SECONDS (15m = 900s)
  if (decisiveGap >= RIVALRY_CONFIG.RESOLUTION_GAP_SECONDS) {
    const resolutionId = `res-${prevRivalry.id}-win-${Math.floor(now.getTime() / 1000)}`;
    return {
      shouldResolve: true,
      resolutionType: "WON",
      winner: leader.member,
      loser: runnerUp.member,
      standings,
      resolutionId,
    };
  }

  // Otherwise: Dissolved without a decisive win (e.g. slight fluctuation or split)
  return {
    shouldResolve: true,
    resolutionType: "NO_CONTEST",
    standings,
    resolutionId: `res-${prevRivalry.id}-nocontest-${Math.floor(now.getTime() / 1000)}`,
  };
}
