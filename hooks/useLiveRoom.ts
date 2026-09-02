"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { UserProfile, UserStatus } from "@/lib/supabase/types";
import { getAdminUserId } from "@/hooks/useAdmin";

export function sortMembers(members: UserProfile[], currentUserId?: string): UserProfile[] {
  const statusPriority: Record<UserStatus, number> = {
    studying: 1,
    break: 2,
    offline: 3,
  };

  return [...members].sort((a, b) => {
    // 1. Current user always at the top
    if (currentUserId) {
      if (a.id === currentUserId) return -1;
      if (b.id === currentUserId) return 1;
    }

    // 2. Status priority: Studying > Break > Offline
    const priorityA = statusPriority[a.current_status] ?? 99;
    const priorityB = statusPriority[b.current_status] ?? 99;
    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }

    // 3. Deterministic alphabetical ordering by display_name
    return a.display_name.localeCompare(b.display_name);
  });
}

/** Filter out admin user from members list */
function filterAdmin(members: UserProfile[]): UserProfile[] {
  const adminId = getAdminUserId();
  return members.filter((m) => {
    if (m.is_admin === true) return false;
    if (adminId && m.id === adminId) return false;
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

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;

    fetchMembers();

    const adminId = getAdminUserId();

    // Set up Realtime postgres_changes subscription on public.users
    channel = supabase
      .channel("public:users")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "users" },
        (payload) => {
          setMembers((prevMembers) => {
            let updated = [...prevMembers];

            if (payload.eventType === "INSERT") {
              const newProfile = payload.new as UserProfile;
              if (newProfile.is_admin === true || (adminId && newProfile.id === adminId)) {
                return prevMembers;
              }
              if (!updated.some((m) => m.id === newProfile.id)) {
                updated.push(newProfile);
              }
            } else if (payload.eventType === "UPDATE") {
              const updatedProfile = payload.new as UserProfile;
              if (updatedProfile.is_admin === true || (adminId && updatedProfile.id === adminId)) {
                updated = updated.filter((m) => m.id !== updatedProfile.id);
              } else {
                updated = updated.map((m) =>
                  m.id === updatedProfile.id ? updatedProfile : m
                );
              }
            } else if (payload.eventType === "DELETE") {
              const deletedId = (payload.old as { id: string }).id;
              updated = updated.filter((m) => m.id !== deletedId);
            }

            return sortMembers(filterAdmin(updated), currentUserIdRef.current);
          });
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setIsRealtimeConnected(true);
        } else if (status === "CLOSED" || status === "CHANNEL_ERROR") {
          setIsRealtimeConnected(false);
        }
      });

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [supabase, fetchMembers]);

  return {
    members,
    loading,
    isRealtimeConnected,
    error,
    refreshMembers: fetchMembers,
  };
}
