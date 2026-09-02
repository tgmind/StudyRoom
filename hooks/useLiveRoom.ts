"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { UserProfile, UserStatus } from "@/lib/supabase/types";
import { getAdminUserId, isAdminUserId } from "@/hooks/useAdmin";
import { calculateMemberElapsedStudySeconds } from "@/lib/time/format";

export function sortMembers(members: UserProfile[], _currentUserId?: string): UserProfile[] {
  const statusPriority: Record<UserStatus, number> = {
    studying: 1,
    break: 2,
    offline: 3,
  };

  const now = new Date();

  return [...members].sort((a, b) => {
    // 1. Status priority: Active members (studying/break) > Offline
    const priorityA = statusPriority[a.current_status] ?? 99;
    const priorityB = statusPriority[b.current_status] ?? 99;
    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }

    // 2. Active members in Live Study: Decreasing order of study session time
    if (a.current_status !== "offline" && b.current_status !== "offline") {
      const elapsedA = calculateMemberElapsedStudySeconds(a, now);
      const elapsedB = calculateMemberElapsedStudySeconds(b, now);
      if (elapsedB !== elapsedA) {
        return elapsedB - elapsedA;
      }
    }

    // 3. Deterministic tie-breaker: alphabetical by display_name
    return a.display_name.localeCompare(b.display_name);
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

      if (data) {
        setMembers(sortMembers(filterAdmin(data as UserProfile[]), currentUserIdRef.current));
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
        next = prevMembers.map((m) => (m.id === updatedProfile.id ? { ...m, ...updatedProfile } : m));
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
      .channel(`room:live:${currentUserId || "guest"}`)
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
