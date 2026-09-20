"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { UserProfile, UserStatus } from "@/lib/supabase/types";
import { getAdminUserId, isAdminUserId } from "@/hooks/useAdmin";
import {
  calculateMemberElapsedStudySeconds,
  calculateMemberOfflineTimestampMs,
  getWeekStartTimestamp,
} from "@/lib/time/format";
import { getEffectiveMemberStatus, isMemberBreakExpired, isMemberStudyExpired } from "@/lib/time/break";
import { getServerNow } from "@/lib/time/clockSync";
import { calculateExpectedPeakTraffic } from "@/lib/time/traffic";
import { RivalryWinEvent } from "@/lib/time/rivalry";

type RpcCaller = {
  rpc: (name: string, params?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

export function sortMembers(members: UserProfile[], _currentUserId?: string): UserProfile[] {
  const statusPriority: Record<UserStatus, number> = {
    studying: 1,
    break: 2,
    offline: 3,
  };

  const now = getServerNow();

  return [...members].sort((a, b) => {
    const statusA = getEffectiveMemberStatus(a, now);
    const statusB = getEffectiveMemberStatus(b, now);

    // 1. Status priority: Active members (studying/break) > Offline
    const priorityA = statusPriority[statusA] ?? 99;
    const priorityB = statusPriority[statusB] ?? 99;
    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }

    // 2. Active members in Live Study: Decreasing order of study session time
    if (statusA !== "offline" && statusB !== "offline") {
      const elapsedA = calculateMemberElapsedStudySeconds(a, now);
      const elapsedB = calculateMemberElapsedStudySeconds(b, now);
      if (elapsedB !== elapsedA) {
        return elapsedB - elapsedA;
      }
    }

    // 3. Offline members: Increasing order of offline duration in realtime (most recently active first)
    if (statusA === "offline" && statusB === "offline") {
      const offlineA = calculateMemberOfflineTimestampMs(a, now);
      const offlineB = calculateMemberOfflineTimestampMs(b, now);
      if (offlineB !== offlineA) {
        return offlineB - offlineA;
      }
    }

    // 4. Deterministic tie-breaker: alphabetical by display_name
    return (a.display_name || "").localeCompare(b.display_name || "");
  });
}

/** Filter out admin user from members list */
function filterAdmin(members: UserProfile[]): UserProfile[] {
  const adminId = getAdminUserId();
  return members.filter((m) => {
    if (m.is_admin === true) return false;
    if (adminId && m.id === adminId) return false;
    if (isAdminUserId(m.id)) return false;
    return true;
  });
}

function isWinEventDismissed(id: string, winnerName?: string, loserName?: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (localStorage.getItem(`studyroom_win_dismissed_${id}`)) return true;
    if (winnerName && loserName) {
      const pairVal = localStorage.getItem(`studyroom_win_dismissed_pair_${winnerName}_${loserName}`);
      if (pairVal) {
        const dismissedAt = parseInt(pairVal, 10);
        if (Date.now() - dismissedAt < 15 * 60 * 1000) {
          return true;
        }
      }
    }
  } catch {}
  return false;
}

export function getMemberMutationEpoch(p: Partial<UserProfile>): number {
  if (typeof (p as any).mutation_epoch === "number" && (p as any).mutation_epoch > 0) {
    return (p as any).mutation_epoch;
  }
  if ((p as any).updated_at) {
    const ms = new Date((p as any).updated_at).getTime();
    if (!isNaN(ms) && ms > 0) return ms;
  }
  const timestamps = [
    p.last_resumed_at,
    p.break_started_at,
    p.session_start_time,
    p.last_offline_at,
    p.created_at,
  ]
    .filter(Boolean)
    .map((t) => new Date(t!).getTime())
    .filter((ms) => !isNaN(ms));

  return timestamps.length > 0 ? Math.max(...timestamps) : 0;
}

export type RealtimeConnectionState = "connecting" | "connected" | "reconnecting" | "offline";
export type ChannelLifecycleState = "idle" | "creating" | "subscribed" | "reconnecting" | "closing" | "disposed";

export function isChannelHealthy(channel: any): boolean {
  if (!channel) return false;
  if (channel._isDisposed || channel._isClosed) return false;
  const state = channel.state || channel.channelAdapter?.state;
  if (state !== undefined) {
    return state === "joined";
  }
  return true;
}

export function markChannelClosed(channel: any) {
  if (channel && typeof channel === "object") {
    channel._isClosed = true;
    channel._isDisposed = true;
  }
}

export function useLiveRoom(currentUserId?: string) {
  const [members, setMembers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false);
  const [connectionState, setConnectionState] = useState<RealtimeConnectionState>("connecting");
  const [presentUserIds, setPresentUserIds] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const [expectedPeakHours, setExpectedPeakHours] = useState<string>("6 PM – 9 PM");
  const [activeWinEvents, setActiveWinEvents] = useState<RivalryWinEvent[]>([]);
  const [activeWinEvent, setActiveWinEvent] = useState<RivalryWinEvent | null>(null);

  const supabase = createClient();
  const currentUserIdRef = useRef(currentUserId);
  currentUserIdRef.current = currentUserId;
  const membersRef = useRef<UserProfile[]>(members);
  membersRef.current = members;
  const presentUserIdsRef = useRef<Set<string>>(presentUserIds);
  presentUserIdsRef.current = presentUserIds;
  const memberEpochMapRef = useRef<Map<string, number>>(new Map());
  const memberVersionMapRef = useRef<Map<string, number>>(new Map());
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const channelGenRef = useRef<number>(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backoffDelayRef = useRef<number>(1000);
  const lifecycleRef = useRef<ChannelLifecycleState>("idle");
  const createAndSubscribeChannelRef = useRef<(force?: boolean) => void>(() => {});
  const ensureRoomChannelRef = useRef<(forceRecreate?: boolean) => void>(() => {});
  const recentlyStoppedBreakUserIdsRef = useRef<Map<string, number>>(new Map());
  const fetchMembersRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const applyProfileUpdateRef = useRef<(updatedProfile: Partial<UserProfile> & { id: string }) => void>(() => {});
  const updateActiveWinEventRef = useRef<(newEvent: RivalryWinEvent | null) => void>(() => {});

  // Deduplicate and stabilize activeWinEvent across broadcasts, postgres changes, polling, and local triggers
  const updateActiveWinEvent = useCallback((newEvent: RivalryWinEvent | null) => {
    if (!newEvent) {
      setActiveWinEvent(null);
      return;
    }
    const resId = newEvent.resolutionId || newEvent.id;
    if (isWinEventDismissed(resId, newEvent.winnerName, newEvent.loserName)) {
      return;
    }
    setActiveWinEvent((prev) => {
      if (
        prev &&
        ((prev.resolutionId && prev.resolutionId === resId) ||
          prev.id === newEvent.id ||
          (prev.winnerName === newEvent.winnerName &&
            prev.loserName === newEvent.loserName &&
            Math.abs(prev.timestamp - newEvent.timestamp) < 15 * 60 * 1000))
      ) {
        return prev; // Maintain stable reference; do not re-trigger celebrations or re-renders
      }
      return newEvent;
    });
  }, []);

  // Restore active rivalry win banner from localStorage on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = localStorage.getItem("studyroom_active_rivalry_win");
      if (stored) {
        const parsed = JSON.parse(stored) as RivalryWinEvent;
        if (
          parsed.timestamp &&
          Date.now() - parsed.timestamp < 15 * 60 * 1000 &&
          !isWinEventDismissed(parsed.id, parsed.winnerName, parsed.loserName)
        ) {
          setActiveWinEvent(parsed);
        } else {
          localStorage.removeItem("studyroom_active_rivalry_win");
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    currentUserIdRef.current = currentUserId;
    setMembers((prev) => sortMembers(prev, currentUserId));
    // If channel is already active and healthy, re-announce presence
    if (channelRef.current && currentUserId) {
      channelRef.current
        .track({
          user_id: currentUserId,
          online_at: new Date().toISOString(),
        })
        .catch(() => {});
    }
  }, [currentUserId]);

  const fetchMembers = useCallback(async () => {
    try {
      setError(null);
      let query = supabase.from("users").select("*");
      const adminId = getAdminUserId();
      if (adminId) {
        query = query.neq("id", adminId);
      }
      const { data, error: fetchErr } = await query;

      if (fetchErr) {
        throw fetchErr;
      }

      // Fetch study sessions to compute rolling 24-hour study duration, weekly study duration, and completed session counts
      const serverNow = getServerNow();
      const cutoffTime = serverNow.getTime() - 24 * 60 * 60 * 1000;
      const weekStartTime = getWeekStartTimestamp(serverNow);
      // Bound query to oldest required timestamp (past 24h, current week, and 3-day peak traffic window with buffer)
      const oldestRequiredTime = new Date(
        Math.min(cutoffTime, weekStartTime, serverNow.getTime() - 4 * 86400000)
      ).toISOString();

      // Fetch study sessions and leaderboard concurrently (graceful fallback if RPC fails)
      let rpcPromise: PromiseLike<{ data: unknown; error: { message: string } | null }> | null = null;
      try {
        const res = (supabase as unknown as RpcCaller).rpc("rpc_get_leaderboard", {});
        if (res && typeof res.then === "function") {
          rpcPromise = res;
        }
      } catch {
        // Graceful fallback
      }

      const [sessionDataResult, leaderboardResult] = await Promise.allSettled([
        supabase
          .from("study_sessions")
          .select("user_id, duration_minutes, end_time, start_time")
          .gte("start_time", oldestRequiredTime),
        rpcPromise ? Promise.resolve(rpcPromise) : Promise.resolve({ data: null, error: null }),
      ]);

      type SessionRow = { user_id: string; duration_minutes: number; end_time: string; start_time?: string };
      const rawSessions =
        sessionDataResult.status === "fulfilled"
          ? (sessionDataResult.value.data as unknown as SessionRow[] | null)
          : null;

      const leaderboardMap = new Map<string, { score: number; rank: number }>();
      if (
        leaderboardResult.status === "fulfilled" &&
        leaderboardResult.value &&
        !leaderboardResult.value.error &&
        Array.isArray(leaderboardResult.value.data)
      ) {
        leaderboardResult.value.data.forEach((entry: { user_id?: string; score?: number }, idx: number) => {
          if (entry && entry.user_id) {
            leaderboardMap.set(entry.user_id, {
              score: typeof entry.score === "number" ? entry.score : 0,
              rank: idx + 1,
            });
          }
        });
      }

      const statsMap = new Map<string, { past24hSeconds: number; weeklySeconds: number; weeklySessions: number; totalSessions: number; latestSessionEndMs: number }>();
      if (rawSessions) {
        for (const s of rawSessions) {
          const entry = statsMap.get(s.user_id) || { past24hSeconds: 0, weeklySeconds: 0, weeklySessions: 0, totalSessions: 0, latestSessionEndMs: 0 };
          entry.totalSessions += 1;
          const sessionStartTime = s.start_time ? new Date(s.start_time).getTime() : (s.end_time ? new Date(s.end_time).getTime() : 0);
          const sessionEndTime = s.end_time ? new Date(s.end_time).getTime() : sessionStartTime;
          if (sessionEndTime >= cutoffTime) {
            entry.past24hSeconds += (s.duration_minutes || 0) * 60;
          }
          if (sessionStartTime >= weekStartTime) {
            entry.weeklySeconds += (s.duration_minutes || 0) * 60;
            entry.weeklySessions += 1;
          } else if (sessionEndTime > weekStartTime) {
            // Session started before the week cutoff (e.g. Sunday late night) but ended inside current week
            const minsInWeek = Math.max(0, Math.floor((sessionEndTime - weekStartTime) / 60000));
            entry.weeklySeconds += Math.min(s.duration_minutes || 0, minsInWeek) * 60;
            entry.weeklySessions += 1;
          }
          if (sessionEndTime > entry.latestSessionEndMs) {
            entry.latestSessionEndMs = sessionEndTime;
          }
          statsMap.set(s.user_id, entry);
        }
      }

      // Compute expected peak traffic range from past 3 days sessions
      const peakHours = calculateExpectedPeakTraffic(rawSessions, serverNow);
      setExpectedPeakHours(peakHours);

      if (data) {
        const now = getServerNow();
        const expiredUsers = (data as UserProfile[]).filter(
          (u) =>
            u.id !== currentUserIdRef.current &&
            ((u.current_status === "break" && isMemberBreakExpired(u, now, 60)) ||
              (u.current_status === "studying" && isMemberStudyExpired(u, now, 60)))
        );

        if (expiredUsers.length > 0) {
          try {
            const nowMs = now.getTime();
            if (recentlyStoppedBreakUserIdsRef.current.size > 200) {
              recentlyStoppedBreakUserIdsRef.current.clear();
            }
            expiredUsers.forEach((expired) => {
              const lastAttempt = recentlyStoppedBreakUserIdsRef.current.get(expired.id) || 0;
              if (nowMs - lastAttempt > 15000) {
                recentlyStoppedBreakUserIdsRef.current.set(expired.id, nowMs);
                Promise.resolve(
                  (supabase as unknown as RpcCaller).rpc("rpc_stop_user_session", { p_user_id: expired.id })
                )
                  .then(({ error: rpcErr }) => {
                    if (rpcErr) {
                      console.warn("[LiveRoom] Auto-stop expired session RPC error:", rpcErr);
                    }
                  })
                  .catch((err: unknown) => {
                    console.warn("[LiveRoom] Auto-stop expired session failed:", err);
                  });
              }
            });
          } catch (autoStopErr) {
            console.warn("[LiveRoom] Error initiating auto-stop for expired sessions:", autoStopErr);
          }
        }

        const enriched = (data as UserProfile[]).map((u) => {
          const stat = statsMap.get(u.id) || { past24hSeconds: 0, weeklySeconds: 0, weeklySessions: 0, totalSessions: 0, latestSessionEndMs: 0 };
          const uLastOfflineMs = u.last_offline_at ? new Date(u.last_offline_at).getTime() : 0;
          const bestOfflineMs = Math.max(
            isNaN(uLastOfflineMs) ? 0 : uLastOfflineMs,
            stat.latestSessionEndMs
          );
          const resolvedOfflineMs = bestOfflineMs > 0
            ? bestOfflineMs
            : u.created_at
            ? new Date(u.created_at).getTime()
            : 0;

          const lb = leaderboardMap.get(u.id);
          const isPresent = presentUserIdsRef.current.has(u.id) || (currentUserIdRef.current === u.id);

          const existing = membersRef.current.find((m) => m.id === u.id);
          const lastVersion = memberVersionMapRef.current.get(u.id) || (existing?.state_version ?? 0);
          const restVersion = typeof u.state_version === "number" ? u.state_version : 0;
          const lastEpoch = memberEpochMapRef.current.get(u.id) || 0;
          const restEpoch = getMemberMutationEpoch(u);

          // MONOTONIC VERSIONING / REST RACE PROTECTION:
          // If local state has a newer realtime broadcast/version event than this REST response:
          // Preserve the newer live status fields from existing local member!
          const isLocalNewer = (lastVersion > 0 && restVersion > 0 && lastVersion > restVersion) ||
                               (lastVersion === restVersion && lastEpoch > restEpoch);

          if (existing && isLocalNewer) {
            return {
              ...u,
              current_status: existing.current_status,
              session_start_time: existing.session_start_time,
              last_resumed_at: existing.last_resumed_at,
              break_started_at: existing.break_started_at,
              active_study_seconds_snapshot: existing.active_study_seconds_snapshot,
              last_offline_at: existing.last_offline_at ?? (resolvedOfflineMs > 0 ? new Date(resolvedOfflineMs).toISOString() : u.created_at),
              past_24h_study_seconds: stat.past24hSeconds,
              weekly_study_seconds: Math.max(stat.weeklySeconds, existing.weekly_study_seconds ?? 0),
              total_sessions_count: stat.weeklySessions,
              weekly_sessions_count: stat.weeklySessions,
              leaderboard_score: lb ? lb.score : u.leaderboard_score,
              leaderboard_rank: lb ? lb.rank : u.leaderboard_rank,
              is_present: isPresent,
              state_version: Math.max(lastVersion, restVersion),
            };
          }

          if (restVersion > 0) {
            memberVersionMapRef.current.set(u.id, Math.max(lastVersion, restVersion));
          }
          if (restEpoch > 0) {
            memberEpochMapRef.current.set(u.id, Math.max(lastEpoch, restEpoch));
          }

          return {
            ...u,
            last_offline_at: resolvedOfflineMs > 0 ? new Date(resolvedOfflineMs).toISOString() : u.created_at,
            past_24h_study_seconds: stat.past24hSeconds,
            weekly_study_seconds: stat.weeklySeconds,
            total_sessions_count: stat.weeklySessions,
            weekly_sessions_count: stat.weeklySessions,
            leaderboard_score: lb ? lb.score : u.leaderboard_score,
            leaderboard_rank: lb ? lb.rank : u.leaderboard_rank,
            is_present: isPresent,
            state_version: Math.max(lastVersion, restVersion),
          };
        });
        setMembers(sortMembers(filterAdmin(enriched), currentUserIdRef.current));
      }

      // 5. Authoritative sync of global active rivalry win announcements across all devices
      try {
        const fifteenMinsAgoIso = new Date(serverNow.getTime() - 15 * 60 * 1000).toISOString();
        const { data: winData, error: winErr } = await (supabase.from("rivalry_events") as any)
          .select("id, resolution_id, rivalry_id, winner_id, winner_name, loser_id, loser_name, resolution_type, final_standings, occurred_at, created_at, rivalry_mode")
          .gte("created_at", fifteenMinsAgoIso)
          .order("created_at", { ascending: false })
          .limit(10);

        if (!winErr && winData && Array.isArray(winData) && winData.length > 0) {
          const validWinEvents: RivalryWinEvent[] = [];
          for (const row of winData) {
            if (row.resolution_type && row.resolution_type !== "WON") {
              continue;
            }
            const resId = row.resolution_id || row.id;
            if (isWinEventDismissed(resId, row.winner_name, row.loser_name)) {
              continue;
            }
            const eventTimestamp = row.occurred_at
              ? new Date(row.occurred_at).getTime()
              : (row.created_at ? new Date(row.created_at).getTime() : Date.now());

            validWinEvents.push({
              id: row.id,
              resolutionId: resId,
              rivalryId: row.rivalry_id,
              winnerId: row.winner_id,
              winnerName: row.winner_name,
              loserId: row.loser_id,
              loserName: row.loser_name,
              timestamp: eventTimestamp,
              occurredAt: row.occurred_at || row.created_at,
              resolutionType: "WON",
              standings: row.final_standings,
              mode: (row.rivalry_mode as any) || "STUDY_TIME",
            });
          }

          if (validWinEvents.length > 0) {
            setActiveWinEvents(validWinEvents);
            updateActiveWinEvent(validWinEvents[0]);
            try {
              localStorage.setItem("studyroom_active_rivalry_win", JSON.stringify(validWinEvents[0]));
            } catch {}
          }
        }
      } catch {
        // Non-blocking if rivalry_events table is not yet created
      }
    } catch (err) {
      console.error("Failed to fetch group members:", err);
      setError(err instanceof Error ? err.message : "Failed to load group members");
    } finally {
      setLoading(false);
    }
  }, [supabase, updateActiveWinEvent]);

  // Handle in-place profile update from Realtime (either postgres_changes or broadcast)
  const applyProfileUpdate = useCallback((updatedProfile: Partial<UserProfile> & { id: string }) => {
    const adminId = getAdminUserId();
    if (
      updatedProfile.is_admin === true ||
      (adminId && updatedProfile.id === adminId) ||
      isAdminUserId(updatedProfile.id)
    ) {
      setMembers((prev) => sortMembers(prev.filter((m) => m.id !== updatedProfile.id), currentUserIdRef.current));
      return;
    }

    // Monotonic Version & Epoch Check: Reject stale / out-of-order realtime updates
    const incomingVersion = typeof updatedProfile.state_version === "number" ? updatedProfile.state_version : 0;
    const currentKnownVersion = memberVersionMapRef.current.get(updatedProfile.id) || 0;
    if (incomingVersion > 0 && incomingVersion < currentKnownVersion) {
      // Stale out-of-order broadcast/change with older version: drop
      return;
    }
    if (incomingVersion > 0) {
      memberVersionMapRef.current.set(updatedProfile.id, Math.max(currentKnownVersion, incomingVersion));
    }

    const incomingEpoch = getMemberMutationEpoch(updatedProfile);
    const currentKnownEpoch = memberEpochMapRef.current.get(updatedProfile.id) || 0;
    if (incomingVersion === 0 && incomingEpoch > 0 && incomingEpoch < currentKnownEpoch) {
      // Stale out-of-order broadcast/change without version: ignore
      return;
    }
    if (incomingEpoch > 0) {
      memberEpochMapRef.current.set(updatedProfile.id, Math.max(currentKnownEpoch, incomingEpoch));
    }

    const cleanUpdates = Object.fromEntries(
      Object.entries(updatedProfile).filter(([_, v]) => v !== undefined)
    ) as Partial<UserProfile> & { id: string };

    setMembers((prevMembers) => {
      const exists = prevMembers.some((m) => m.id === updatedProfile.id);
      let next: UserProfile[];
      if (exists) {
        next = prevMembers.map((m) => {
          if (m.id === updatedProfile.id) {
            const isTransitioningToOffline =
              cleanUpdates.current_status === "offline" && m.current_status !== "offline";
            const newOfflineAt = isTransitioningToOffline
              ? getServerNow().toISOString()
              : cleanUpdates.last_offline_at ?? m.last_offline_at;
            const isPresent =
              cleanUpdates.is_present !== undefined
                ? cleanUpdates.is_present
                : presentUserIdsRef.current.has(m.id) || m.id === currentUserIdRef.current;
            return {
              ...m,
              ...cleanUpdates,
              is_present: isPresent,
              active_study_seconds_snapshot:
                cleanUpdates.active_study_seconds_snapshot !== undefined
                  ? cleanUpdates.active_study_seconds_snapshot
                  : m.active_study_seconds_snapshot ?? 0,
              last_offline_at: newOfflineAt,
              past_24h_study_seconds: cleanUpdates.past_24h_study_seconds ?? m.past_24h_study_seconds ?? 0,
              weekly_study_seconds: cleanUpdates.weekly_study_seconds ?? m.weekly_study_seconds ?? 0,
              total_sessions_count: cleanUpdates.total_sessions_count ?? m.total_sessions_count ?? 0,
              weekly_sessions_count: cleanUpdates.weekly_sessions_count ?? m.weekly_sessions_count ?? 0,
            };
          }
          return m;
        });
      } else {
        // If it's a new member joining, fetch full list to ensure all columns present
        fetchMembersRef.current();
        return prevMembers;
      }
      return sortMembers(filterAdmin(next), currentUserIdRef.current);
    });
  }, []);

  fetchMembersRef.current = fetchMembers;
  applyProfileUpdateRef.current = applyProfileUpdate;
  updateActiveWinEventRef.current = updateActiveWinEvent;

  // Broadcast function to immediately notify all peers over WebSockets without DB lag
  const broadcastStatusChange = useCallback(async (payload: Partial<UserProfile> & { id: string }) => {
    // 1. Update mutation version and epoch for current user
    const payloadEpoch = (payload as any).mutation_epoch || getMemberMutationEpoch(payload) || Date.now();
    const currentVer = memberVersionMapRef.current.get(payload.id) || (payload.state_version ?? 0);
    const nextVer = (payload.state_version && payload.state_version > currentVer)
      ? payload.state_version
      : currentVer + 1;
    memberVersionMapRef.current.set(payload.id, nextVer);
    memberEpochMapRef.current.set(payload.id, Math.max(memberEpochMapRef.current.get(payload.id) || 0, payloadEpoch));

    const enrichedPayload = {
      ...payload,
      state_version: nextVer,
      mutation_epoch: payloadEpoch,
    };

    // 2. Apply locally immediately for instant feedback
    applyProfileUpdate(enrichedPayload);

    // 3. Broadcast to all peers & re-track presence
    if (channelRef.current && isChannelHealthy(channelRef.current)) {
      try {
        await channelRef.current.send({
          type: "broadcast",
          event: "member_status_update",
          payload: enrichedPayload,
        });
        if (payload.id) {
          channelRef.current.track({
            user_id: payload.id,
            online_at: new Date().toISOString(),
            status: payload.current_status,
          }).catch(() => {});
        }
      } catch (err) {
        console.warn("Realtime broadcast send failed:", err);
      }
    } else {
      ensureRoomChannelRef.current(true);
    }
  }, [applyProfileUpdate]);

  // Helper to aggregate present unique user IDs across all connected tabs/clients
  const syncPresence = useCallback((presenceState: Record<string, any[]>) => {
    const userIds = new Set<string>();
    for (const key in presenceState) {
      const presences = presenceState[key];
      if (Array.isArray(presences)) {
        for (const p of presences) {
          if (p && p.user_id) {
            userIds.add(p.user_id);
          }
        }
      }
    }
    setPresentUserIds(userIds);
    presentUserIdsRef.current = userIds;
    const myId = currentUserIdRef.current;
    setMembers((prev) =>
      prev.map((m) => {
        const isPresent = userIds.has(m.id) || (myId ? m.id === myId : false);
        if (m.is_present === isPresent) return m;
        return {
          ...m,
          is_present: isPresent,
        };
      })
    );
  }, []);

  // Idempotent channel teardown that prevents Phoenix synchronous leave/close re-entrancy
  const destroyChannel = useCallback((channelToDestroy: any, isIntentional: boolean = false) => {
    if (!channelToDestroy) return;

    if (channelToDestroy._isCleaningUp || channelToDestroy._isDisposed) {
      if (channelRef.current === channelToDestroy) {
        channelRef.current = null;
      }
      if (isIntentional) {
        lifecycleRef.current = "disposed";
        if (reconnectTimerRef.current) {
          clearTimeout(reconnectTimerRef.current);
          reconnectTimerRef.current = null;
        }
      }
      return;
    }

    // Mark cleaning up BEFORE calling Supabase teardown to break any synchronous Phoenix re-entrancy
    channelToDestroy._isCleaningUp = true;
    channelToDestroy._isClosed = true;

    if (channelRef.current === channelToDestroy) {
      channelRef.current = null;
    }

    if (isIntentional) {
      lifecycleRef.current = "disposed";
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    }

    try {
      supabase.removeChannel(channelToDestroy);
    } catch (err) {
      console.warn("Error removing channel:", err);
    } finally {
      channelToDestroy._isCleaningUp = false;
      channelToDestroy._isDisposed = true;
    }
  }, [supabase]);

  // Serialized reconnect scheduler: treats reconnection as data/scheduling, not recursive control flow
  const requestReconnect = useCallback((reason: string, immediate: boolean = false) => {
    if (lifecycleRef.current === "disposed") {
      return;
    }

    const isInitial = lifecycleRef.current === "idle";
    const shouldBeImmediate = immediate || isInitial;

    if (reconnectTimerRef.current) {
      if (!shouldBeImmediate) {
        return;
      }
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    lifecycleRef.current = "reconnecting";
    setConnectionState((prev) => (prev === "connected" ? "reconnecting" : prev));

    const delay = shouldBeImmediate ? 0 : backoffDelayRef.current;
    if (!shouldBeImmediate) {
      backoffDelayRef.current = Math.min(10000, backoffDelayRef.current * 2);
    } else {
      backoffDelayRef.current = 1000;
    }

    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      if (lifecycleRef.current === "disposed") return;
      createAndSubscribeChannelRef.current();
    }, delay);
  }, []);

  // Channel Creation: single-flight creation of room channel with generation guard
  const createAndSubscribeChannel = useCallback((force: boolean = false) => {
    if (lifecycleRef.current === "disposed") {
      return;
    }

    if (!force && lifecycleRef.current === "creating") {
      return;
    }

    lifecycleRef.current = "creating";
    setConnectionState((prev) => (prev === "connected" ? "reconnecting" : "connecting"));
    setIsRealtimeConnected(false);

    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    // Teardown previous channel cleanly if still referenced
    if (channelRef.current) {
      const prevChannel = channelRef.current;
      channelRef.current = null;
      destroyChannel(prevChannel, false);
    }

    // Advance generation count
    const thisGen = ++channelGenRef.current;

    const adminId = getAdminUserId();
    const channel = supabase.channel("room:live:global");
    channelRef.current = channel;

    channel
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "users" },
        (payload) => {
          if (channelGenRef.current !== thisGen) return;
          if (payload.eventType === "INSERT") {
            const newProfile = payload.new as UserProfile;
            if (
              newProfile.is_admin === true ||
              (adminId && newProfile.id === adminId) ||
              isAdminUserId(newProfile.id)
            ) {
              return;
            }
            setMembers((prev) => {
              if (prev.some((m) => m.id === newProfile.id)) return prev;
              const isPresent =
                presentUserIdsRef.current.has(newProfile.id) ||
                (currentUserIdRef.current ? newProfile.id === currentUserIdRef.current : false);
              return sortMembers(
                filterAdmin([
                  ...prev,
                  {
                    ...newProfile,
                    is_present: isPresent,
                  },
                ]),
                currentUserIdRef.current
              );
            });
          } else if (payload.eventType === "UPDATE") {
            applyProfileUpdateRef.current(payload.new as UserProfile);
          } else if (payload.eventType === "DELETE") {
            const deletedId = (payload.old as { id: string })?.id;
            if (deletedId) {
              setMembers((prev) => sortMembers(prev.filter((m) => m.id !== deletedId), currentUserIdRef.current));
            }
          }
        }
      )
      .on(
        "broadcast",
        { event: "member_status_update" },
        (msg) => {
          if (channelGenRef.current !== thisGen) return;
          if (msg.payload && (msg.payload as { id?: string }).id) {
            applyProfileUpdateRef.current(msg.payload as Partial<UserProfile> & { id: string });
          }
        }
      )
      .on(
        "broadcast",
        { event: "rivalry_won" },
        (msg) => {
          if (channelGenRef.current !== thisGen) return;
          if (msg.payload && (msg.payload as RivalryWinEvent).id) {
            const win = msg.payload as RivalryWinEvent;
            if (win.resolutionType && win.resolutionType !== "WON") {
              return;
            }
            const resId = win.resolutionId || win.id;
            if (isWinEventDismissed(resId, win.winnerName, win.loserName)) {
              return;
            }
            try {
              localStorage.setItem("studyroom_active_rivalry_win", JSON.stringify(win));
            } catch {}
            updateActiveWinEventRef.current(win);
            setActiveWinEvents((prev) => {
              const filtered = prev.filter((e) => (e.resolutionId || e.id) !== resId);
              return [win, ...filtered].slice(0, 10);
            });
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "study_sessions" },
        () => {
          if (channelGenRef.current !== thisGen) return;
          fetchMembersRef.current();
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "rivalry_events" },
        (payload) => {
          if (channelGenRef.current !== thisGen) return;
          const row = payload.new as {
            id?: string;
            resolution_id?: string;
            rivalry_id?: string;
            winner_id?: string;
            winner_name?: string;
            loser_id?: string;
            loser_name?: string;
            resolution_type?: string;
            final_standings?: any;
            occurred_at?: string;
            created_at?: string;
            rivalry_mode?: string;
          };
          if (row && row.id && row.winner_name && row.loser_name) {
            if (row.resolution_type && row.resolution_type !== "WON") {
              return;
            }
            const resId = row.resolution_id || row.id;
            if (isWinEventDismissed(resId, row.winner_name, row.loser_name)) {
              return;
            }
            const win: RivalryWinEvent = {
              id: row.id,
              resolutionId: resId,
              rivalryId: row.rivalry_id,
              winnerId: row.winner_id,
              winnerName: row.winner_name,
              loserId: row.loser_id,
              loserName: row.loser_name,
              timestamp: row.occurred_at
                ? new Date(row.occurred_at).getTime()
                : (row.created_at ? new Date(row.created_at).getTime() : Date.now()),
              occurredAt: row.occurred_at || row.created_at,
              resolutionType: "WON",
              standings: row.final_standings,
              mode: (row.rivalry_mode as any) || "STUDY_TIME",
            };
            try {
              localStorage.setItem("studyroom_active_rivalry_win", JSON.stringify(win));
            } catch {}
            updateActiveWinEventRef.current(win);
            setActiveWinEvents((prev) => {
              const filtered = prev.filter((e) => (e.resolutionId || e.id) !== resId);
              return [win, ...filtered].slice(0, 10);
            });
          }
        }
      )
      .on("presence", { event: "sync" }, () => {
        if (channelGenRef.current !== thisGen) return;
        syncPresence(channel.presenceState());
      })
      .on("presence", { event: "join" }, () => {
        if (channelGenRef.current !== thisGen) return;
        syncPresence(channel.presenceState());
      })
      .on("presence", { event: "leave" }, () => {
        if (channelGenRef.current !== thisGen) return;
        syncPresence(channel.presenceState());
      })
      .subscribe(async (status) => {
        // Drop any callbacks from channels currently in teardown, stale generations, or unmounted hook
        if (
          (channel as any)._isCleaningUp ||
          channelGenRef.current !== thisGen ||
          lifecycleRef.current === "disposed"
        ) {
          return;
        }

        if (status === "SUBSCRIBED") {
          lifecycleRef.current = "subscribed";
          backoffDelayRef.current = 1000;
          if (reconnectTimerRef.current) {
            clearTimeout(reconnectTimerRef.current);
            reconnectTimerRef.current = null;
          }

          if (channelGenRef.current === thisGen) {
            setIsRealtimeConnected(true);
            setConnectionState("connected");
          }

          if (currentUserIdRef.current) {
            channel
              .track({
                user_id: currentUserIdRef.current,
                online_at: new Date().toISOString(),
              })
              .catch((trackErr) => {
                console.warn("Channel track failed on subscribe:", trackErr);
              });
          }

          fetchMembersRef.current();
        } else if (status === "CLOSED") {
          lifecycleRef.current = "reconnecting";
          setIsRealtimeConnected(false);
          setConnectionState("offline");

          destroyChannel(channel, false);
          requestReconnect("channel_closed", false);
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          lifecycleRef.current = "reconnecting";
          setIsRealtimeConnected(false);
          setConnectionState("reconnecting");

          destroyChannel(channel, false);
          requestReconnect("channel_error", false);
        }
      });
  }, [supabase, syncPresence, destroyChannel, requestReconnect]);

  createAndSubscribeChannelRef.current = createAndSubscribeChannel;

  const ensureRoomChannel = useCallback((forceRecreate: boolean = false) => {
    if (lifecycleRef.current === "disposed") {
      return;
    }

    const currentChannel = channelRef.current;
    const isHealthy = currentChannel && isChannelHealthy(currentChannel) && lifecycleRef.current === "subscribed";

    if (!forceRecreate && isHealthy && currentChannel) {
      setIsRealtimeConnected(true);
      setConnectionState("connected");
      if (currentUserIdRef.current) {
        currentChannel
          .track({
            user_id: currentUserIdRef.current,
            online_at: new Date().toISOString(),
          })
          .catch(() => {});
      }
      fetchMembersRef.current();
      return;
    }

    // Reset backoff delay when actively ensuring/recovering channel
    backoffDelayRef.current = 1000;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    createAndSubscribeChannelRef.current(forceRecreate);
  }, []);

  ensureRoomChannelRef.current = ensureRoomChannel;

  useEffect(() => {
    // Reset lifecycle on mount so StrictMode / Fast Refresh re-mount does not lock out channel creation
    lifecycleRef.current = "idle";

    // 1. Initial fetch
    fetchMembersRef.current();

    // 2. Setup initial realtime channel
    ensureRoomChannelRef.current(false);

    // 3. Event-driven resync on visibility change, focus, and network online/offline
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        ensureRoomChannelRef.current(false);
      }
    };
    const handleWindowFocus = () => {
      ensureRoomChannelRef.current(false);
    };
    const handleOnline = () => {
      ensureRoomChannelRef.current(false);
    };
    const handleOffline = () => {
      setConnectionState("offline");
      setIsRealtimeConnected(false);
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleWindowFocus);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // 4. Supabase Auth token refresh listener
    let authSubscription: { unsubscribe: () => void } | null = null;
    try {
      const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
        if (event === "TOKEN_REFRESHED" || event === "SIGNED_IN") {
          if (session?.access_token) {
            try {
              (supabase.realtime as any)?.setAuth(session.access_token);
            } catch {}
          }
          if (!channelRef.current || !isChannelHealthy(channelRef.current)) {
            ensureRoomChannelRef.current(true);
          }
        }
      });
      authSubscription = authListener?.subscription ?? null;
    } catch {}

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleWindowFocus);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      authSubscription?.unsubscribe();
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (channelRef.current) {
        const ch = channelRef.current;
        channelRef.current = null;
        destroyChannel(ch, true);
      }
      lifecycleRef.current = "disposed";
    };
  }, [supabase, destroyChannel]);

  // Broadcast and persist rivalry win announcement to all connected peers and devices
  const broadcastRivalryWin = useCallback(async (winEvent: RivalryWinEvent) => {
    // Strict safeguard: NEVER broadcast or persist non-won resolutions
    if (winEvent.resolutionType && winEvent.resolutionType !== "WON") {
      return;
    }

    updateActiveWinEvent(winEvent);
    setActiveWinEvents((prev) => {
      const resId = winEvent.resolutionId || winEvent.id;
      const filtered = prev.filter((e) => (e.resolutionId || e.id) !== resId);
      return [winEvent, ...filtered].slice(0, 10);
    });

    try {
      localStorage.setItem("studyroom_active_rivalry_win", JSON.stringify(winEvent));
    } catch {}

    // 1. Fast broadcast over active realtime channel for zero-latency in-memory push
    if (channelRef.current) {
      try {
        await channelRef.current.send({
          type: "broadcast",
          event: "rivalry_won",
          payload: winEvent,
        });
      } catch (err) {
        console.warn("Realtime broadcast rivalry_won send failed:", err);
      }
    }

    // 2. Persist to public.rivalry_events for global multi-device sync (e.g. tablet, late connections)
    try {
      const participantIds = winEvent.standings && winEvent.standings.length > 0
        ? winEvent.standings.map((s) => s.userId)
        : [winEvent.winnerId, winEvent.loserId].filter(Boolean);

      await (supabase.from("rivalry_events") as any).upsert(
        {
          id: winEvent.id,
          resolution_id: winEvent.resolutionId || winEvent.id,
          rivalry_id: winEvent.rivalryId,
          winner_id: winEvent.winnerId,
          winner_name: winEvent.winnerName,
          loser_id: winEvent.loserId,
          loser_name: winEvent.loserName,
          participant_ids: participantIds,
          final_standings: winEvent.standings || [],
          resolution_type: "WON",
          rivalry_mode: winEvent.mode || "STUDY_TIME",
          occurred_at: winEvent.occurredAt || new Date(winEvent.timestamp).toISOString(),
          created_at: new Date(winEvent.timestamp).toISOString(),
        },
        { onConflict: "resolution_id", ignoreDuplicates: true }
      );
    } catch (dbErr) {
      console.warn("Failed to persist rivalry event to database:", dbErr);
    }
  }, [supabase, updateActiveWinEvent]);

  const dismissWinEvent = useCallback((eventId?: string) => {
    if (eventId) {
      try {
        localStorage.setItem(`studyroom_win_dismissed_${eventId}`, "true");
      } catch {}
      setActiveWinEvents((prev) => prev.filter((e) => (e.resolutionId || e.id) !== eventId));
      setActiveWinEvent((prev) => {
        if (prev && (prev.resolutionId === eventId || prev.id === eventId)) {
          return null;
        }
        return prev;
      });
      return;
    }

    if (activeWinEvent) {
      try {
        const id = activeWinEvent.resolutionId || activeWinEvent.id;
        localStorage.setItem(`studyroom_win_dismissed_${id}`, "true");
        const pairKey = `studyroom_win_dismissed_pair_${activeWinEvent.winnerName}_${activeWinEvent.loserName}`;
        localStorage.setItem(pairKey, Date.now().toString());
        localStorage.removeItem("studyroom_active_rivalry_win");
      } catch {}
    }
    setActiveWinEvent(null);
    setActiveWinEvents([]);
  }, [activeWinEvent]);

  const isRoomPresent = isRealtimeConnected && Boolean(currentUserIdRef.current);

  return {
    members,
    loading,
    isRealtimeConnected,
    connectionState,
    isRoomPresent,
    presentUserIds,
    error,
    expectedPeakHours,
    activeWinEvent,
    activeWinEvents,
    broadcastRivalryWin,
    dismissWinEvent,
    refreshMembers: fetchMembers,
    broadcastStatusChange,
  };
}
