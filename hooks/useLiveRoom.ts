"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { UserProfile, UserStatus } from "@/lib/supabase/types";
import { getAdminUserId, isAdminUserId } from "@/hooks/useAdmin";
import { calculateMemberElapsedStudySeconds } from "@/lib/time/format";
import { getEffectiveMemberStatus, isMemberBreakExpired } from "@/lib/time/break";

type RpcCaller = {
  rpc: (name: string, params?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

export function sortMembers(members: UserProfile[], _currentUserId?: string): UserProfile[] {
  const statusPriority: Record<UserStatus, number> = {
    studying: 1,
    break: 2,
    offline: 3,
  };

  const now = new Date();

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

    // 3. Deterministic tie-breaker: alphabetical by display_name
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

export function useLiveRoom(currentUserId?: string) {
  const [members, setMembers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();
  const currentUserIdRef = useRef(currentUserId);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const recentlyStoppedBreakUserIdsRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    currentUserIdRef.current = currentUserId;
    setMembers((prev) => sortMembers(prev, currentUserId));
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

      // Fetch study sessions to compute rolling 24-hour study duration and completed session counts
      const cutoffTime = Date.now() - 24 * 60 * 60 * 1000;
      const { data: sessionData } = await supabase
        .from("study_sessions")
        .select("user_id, duration_minutes, end_time");

      type SessionRow = { user_id: string; duration_minutes: number; end_time: string };
      const rawSessions = sessionData as unknown as SessionRow[] | null;
      const statsMap = new Map<string, { past24hSeconds: number; totalSessions: number }>();
      if (rawSessions) {
        for (const s of rawSessions) {
          const entry = statsMap.get(s.user_id) || { past24hSeconds: 0, totalSessions: 0 };
          entry.totalSessions += 1;
          if (s.end_time && new Date(s.end_time).getTime() >= cutoffTime) {
            entry.past24hSeconds += (s.duration_minutes || 0) * 60;
          }
          statsMap.set(s.user_id, entry);
        }
      }

      if (data) {
        const now = new Date();
        const expiredBreakUsers = (data as UserProfile[]).filter(
          (u) => u.current_status === "break" && isMemberBreakExpired(u, now)
        );

        if (expiredBreakUsers.length > 0) {
          try {
            const nowMs = Date.now();
            if (recentlyStoppedBreakUserIdsRef.current.size > 200) {
              recentlyStoppedBreakUserIdsRef.current.clear();
            }
            expiredBreakUsers.forEach((expired) => {
              const lastAttempt = recentlyStoppedBreakUserIdsRef.current.get(expired.id) || 0;
              if (nowMs - lastAttempt > 15000) {
                recentlyStoppedBreakUserIdsRef.current.set(expired.id, nowMs);
                Promise.resolve(
                  (supabase as unknown as RpcCaller).rpc("rpc_stop_user_session", { p_user_id: expired.id })
                )
                  .then(({ error: rpcErr }) => {
                    if (rpcErr) {
                      console.warn("[LiveRoom] Auto-stop expired break RPC error:", rpcErr);
                    }
                  })
                  .catch((err: unknown) => {
                    console.warn("[LiveRoom] Auto-stop expired break failed:", err);
                  });
              }
            });
          } catch (autoStopErr) {
            console.warn("[LiveRoom] Error initiating auto-stop for expired breaks:", autoStopErr);
          }
        }

        const enriched = (data as UserProfile[]).map((u) => {
          const stat = statsMap.get(u.id) || { past24hSeconds: 0, totalSessions: 0 };
          return {
            ...u,
            past_24h_study_seconds: stat.past24hSeconds,
            total_sessions_count: stat.totalSessions,
          };
        });
        setMembers(sortMembers(filterAdmin(enriched), currentUserIdRef.current));
      }
    } catch (err) {
      console.error("Failed to fetch group members:", err);
      setError(err instanceof Error ? err.message : "Failed to load group members");
    } finally {
      setLoading(false);
    }
  }, [supabase]);

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

    setMembers((prevMembers) => {
      const exists = prevMembers.some((m) => m.id === updatedProfile.id);
      let next: UserProfile[];
      if (exists) {
        next = prevMembers.map((m) => {
          if (m.id === updatedProfile.id) {
            return {
              ...m,
              ...updatedProfile,
              past_24h_study_seconds: updatedProfile.past_24h_study_seconds ?? m.past_24h_study_seconds ?? 0,
              total_sessions_count: updatedProfile.total_sessions_count ?? m.total_sessions_count ?? 0,
            };
          }
          return m;
        });
      } else {
        // If it's a new member joining, fetch full list to ensure all columns present
        fetchMembers();
        return prevMembers;
      }
      return sortMembers(filterAdmin(next), currentUserIdRef.current);
    });
  }, [fetchMembers]);

  // Broadcast function to immediately notify all peers over WebSockets without DB lag
  const broadcastStatusChange = useCallback(async (payload: Partial<UserProfile> & { id: string }) => {
    // 1. Apply locally immediately for instant feedback
    applyProfileUpdate(payload);

    // 2. Broadcast to all peers
    if (channelRef.current) {
      try {
        await channelRef.current.send({
          type: "broadcast",
          event: "member_status_update",
          payload,
        });
      } catch (err) {
        console.warn("Realtime broadcast send failed:", err);
      }
    }
  }, [applyProfileUpdate]);

  useEffect(() => {
    // 1. Initial fetch
    fetchMembers();

    const adminId = getAdminUserId();

    // 2. Set up Realtime channel (postgres_changes + instant peer broadcast)
    const channel = supabase
      .channel("room:live:global")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "users" },
        (payload) => {
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
              return sortMembers(filterAdmin([...prev, newProfile]), currentUserIdRef.current);
            });
          } else if (payload.eventType === "UPDATE") {
            applyProfileUpdate(payload.new as UserProfile);
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
          if (msg.payload && (msg.payload as { id?: string }).id) {
            applyProfileUpdate(msg.payload as Partial<UserProfile> & { id: string });
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "study_sessions" },
        () => {
          fetchMembers();
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setIsRealtimeConnected(true);
        } else if (status === "CLOSED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setIsRealtimeConnected(false);
        }
      });

    channelRef.current = channel;

    // 3. Heartbeat polling (every 4 seconds) to guarantee synchronization across all users
    const pollInterval = setInterval(() => {
      fetchMembers();
    }, 4000);

    // 4. Immediate resync when tab is focused or returns from background
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        fetchMembers();
      }
    };
    const handleWindowFocus = () => {
      fetchMembers();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleWindowFocus);

    return () => {
      clearInterval(pollInterval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleWindowFocus);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [supabase, fetchMembers, currentUserId, applyProfileUpdate]);

  return {
    members,
    loading,
    isRealtimeConnected,
    error,
    refreshMembers: fetchMembers,
    broadcastStatusChange,
  };
}
