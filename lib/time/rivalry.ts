import { UserProfile } from "@/lib/supabase/types";
import { calculateMemberElapsedStudySeconds } from "./format";
import { getEffectiveMemberStatus } from "./break";
import { getServerNow } from "./clockSync";

export const MAX_RIVALRY_GAP_SECONDS = 10 * 60; // 10 minutes threshold (600 seconds)
export const MIN_RIVALRY_WEEKLY_SECONDS = 3 * 3600; // 3 hours threshold (10,800 seconds)

export interface RivalryState {
  id: string;
  rivalMembers: UserProfile[];
  primaryGapSeconds: number;
  formattedGap: string;
  isTrio: boolean;
  leaderWeeklySeconds: number;
}

export interface RivalryWinEvent {
  id: string;
  winnerName: string;
  loserName: string;
  timestamp: number;
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

/**
 * Real-time Multi-Rivalry Detection Engine
 *
 * Scans all active members (studying/break) and detects all valid non-overlapping rivalries.
 * Ordered in descending order of the participating members' total weekly study time.
 *
 * Rules:
 * 1. Only active studying / break members qualify.
 * 2. Rivalry groups are strictly 2 or 3 members maximum (never more than 3).
 * 3. Mutual Exclusivity: If any member is already in an ongoing rivalry, they cannot join another.
 * 4. Within a rivalry, all members must be within <= 1 hour (3600s) span of each other.
 * 5. Multiple rivalries are ordered strictly descending by leader's weekly study time.
 */
export function detectLiveRivalries(
  members: UserProfile[],
  now: Date = getServerNow(),
  currentUserId?: string,
  currentUserElapsedSeconds?: number
): RivalryState[] {
  if (!members || members.length < 2) return [];

  // 1. Filter actively studying/active members with at least 3 hours (10,800s) of total weekly study time
  const activeMembersWithWeekly = members
    .filter((m) => {
      const status = getEffectiveMemberStatus(m, now);
      return status === "studying" || status === "break";
    })
    .map((m) => ({
      member: m,
      weeklySeconds: getLiveMemberWeeklySeconds(m, now, currentUserId, currentUserElapsedSeconds),
    }))
    .filter((m) => m.weeklySeconds >= MIN_RIVALRY_WEEKLY_SECONDS);

  if (activeMembersWithWeekly.length < 2) return [];

  // 2. Sort descending by weekly study time
  activeMembersWithWeekly.sort((a, b) => b.weeklySeconds - a.weeklySeconds);

  const withWeekly = activeMembersWithWeekly;

  const rivalries: RivalryState[] = [];
  const assignedIds = new Set<string>();

  // 3. Scan through unassigned members in descending order of weekly study time
  for (let i = 0; i < withWeekly.length; i++) {
    const top = withWeekly[i];
    if (assignedIds.has(top.member.id)) continue;

    // Collect remaining unassigned members below `top`
    const available = [];
    for (let j = i + 1; j < withWeekly.length; j++) {
      if (!assignedIds.has(withWeekly[j].member.id)) {
        available.push(withWeekly[j]);
      }
    }

    if (available.length === 0) break;

    // Priority A: Check if a 3-member rivalry (Trio) can be formed
    // Top + available[0] + available[1] all within 1 hour span (top.weeklySeconds - available[1].weeklySeconds <= 3600)
    if (available.length >= 2) {
      const second = available[0];
      const third = available[1];
      const span = top.weeklySeconds - third.weeklySeconds;

      if (span <= MAX_RIVALRY_GAP_SECONDS) {
        const gap = top.weeklySeconds - second.weeklySeconds;
        rivalries.push({
          id: `rivalry-${top.member.id}`,
          rivalMembers: [top.member, second.member, third.member],
          primaryGapSeconds: gap,
          formattedGap: formatRivalryGap(gap),
          isTrio: true,
          leaderWeeklySeconds: top.weeklySeconds,
        });

        assignedIds.add(top.member.id);
        assignedIds.add(second.member.id);
        assignedIds.add(third.member.id);
        continue;
      }
    }

    // Priority B: Check if a 2-member rivalry (Pair) can be formed with the next available member
    const second = available[0];
    const gap = top.weeklySeconds - second.weeklySeconds;

    if (gap <= MAX_RIVALRY_GAP_SECONDS) {
      rivalries.push({
        id: `rivalry-${top.member.id}`,
        rivalMembers: [top.member, second.member],
        primaryGapSeconds: gap,
        formattedGap: formatRivalryGap(gap),
        isTrio: false,
        leaderWeeklySeconds: top.weeklySeconds,
      });

      assignedIds.add(top.member.id);
      assignedIds.add(second.member.id);
      continue;
    }

    // Otherwise, `top` cannot form a rivalry with anyone available. They remain unassigned.
  }

  return rivalries;
}

/**
 * Backward-compatible single rivalry detector (returns the highest-ranked rivalry if any).
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
