import { UserProfile } from "@/lib/supabase/types";
import { calculateMemberElapsedStudySeconds } from "./format";
import { getEffectiveMemberStatus } from "./break";
import { getServerNow } from "./clockSync";

export const MAX_RIVALRY_GAP_SECONDS = 3600; // 1 hour threshold (3600 seconds)

export interface RivalryState {
  rivalMembers: UserProfile[];
  primaryGapSeconds: number;
  formattedGap: string;
  isTrio: boolean;
}

/**
 * Computes a member's authoritative live weekly study time in seconds:
 * Past completed sessions this week + live elapsed study seconds of current active session.
 */
export function getLiveMemberWeeklySeconds(
  member: UserProfile,
  now: Date = getServerNow(),
  currentUserId?: string,
  currentUserElapsedSeconds?: number
): number {
  const pastWeekly = member.weekly_study_seconds ?? 0;
  const status = getEffectiveMemberStatus(member, now);

  // If active in a session (studying or on break), add current session elapsed seconds
  if (status === "studying" || status === "break") {
    const elapsed =
      member.id === currentUserId && currentUserElapsedSeconds !== undefined
        ? currentUserElapsedSeconds
        : calculateMemberElapsedStudySeconds(member, now);
    return pastWeekly + elapsed;
  }

  return pastWeekly;
}

/**
 * Format a rivalry gap into clean, eye-friendly duration string (e.g. "14m 20s" or "45s" or "Tied").
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

/**
 * Real-time Rivalry Detection Engine
 *
 * Checks if actively studying members come within <= 1 hour (3600s) of each other
 * in respect of their total weekly study time.
 *
 * Rules:
 * 1. Only active studying / break members qualify.
 * 2. Rivalry group is strictly 2 or 3 members maximum (never more than 3).
 * 3. As soon as any member exceeds the 1-hour gap (> 3600s), they are immediately removed.
 * 4. If a trio member falls behind > 1h, it drops to a 2-member duel.
 * 5. If the only rival in a pair exceeds 1h, returns null (rivalry dissolves immediately).
 */
export function detectLiveRivalry(
  members: UserProfile[],
  now: Date = getServerNow(),
  currentUserId?: string,
  currentUserElapsedSeconds?: number
): RivalryState | null {
  if (!members || members.length < 2) return null;

  // 1. Filter actively studying/active members only
  const activeMembers = members.filter((m) => {
    const status = getEffectiveMemberStatus(m, now);
    return status === "studying" || status === "break";
  });

  if (activeMembers.length < 2) return null;

  // 2. Compute live weekly study seconds and sort descending
  const withWeekly = activeMembers.map((m) => ({
    member: m,
    weeklySeconds: getLiveMemberWeeklySeconds(m, now, currentUserId, currentUserElapsedSeconds),
  }));

  withWeekly.sort((a, b) => b.weeklySeconds - a.weeklySeconds);

  // 3. Check for a qualified Trio (3 members all within 1 hour span: max - min <= 3600s)
  for (let i = 0; i <= withWeekly.length - 3; i++) {
    const top = withWeekly[i];
    const third = withWeekly[i + 2];
    const span = top.weeklySeconds - third.weeklySeconds;

    if (span <= MAX_RIVALRY_GAP_SECONDS) {
      const second = withWeekly[i + 1];
      const gap = top.weeklySeconds - second.weeklySeconds;

      return {
        rivalMembers: [top.member, second.member, third.member],
        primaryGapSeconds: gap,
        formattedGap: formatRivalryGap(gap),
        isTrio: true,
      };
    }
  }

  // 4. Check for a qualified Pair (2 members within <= 1 hour: top - second <= 3600s)
  let bestPair: { members: [UserProfile, UserProfile]; gap: number } | null = null;

  for (let i = 0; i < withWeekly.length - 1; i++) {
    const current = withWeekly[i];
    const next = withWeekly[i + 1];
    const gap = current.weeklySeconds - next.weeklySeconds;

    if (gap <= MAX_RIVALRY_GAP_SECONDS) {
      if (!bestPair || gap < bestPair.gap) {
        bestPair = { members: [current.member, next.member], gap };
      }
    }
  }

  if (bestPair) {
    return {
      rivalMembers: bestPair.members,
      primaryGapSeconds: bestPair.gap,
      formattedGap: formatRivalryGap(bestPair.gap),
      isTrio: false,
    };
  }

  // No active members within 1 hour: rivalry dissolved / inactive
  return null;
}
