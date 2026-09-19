"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { UserProfile } from "@/lib/supabase/types";
import { User } from "@supabase/supabase-js";
import { isAdminEmail } from "@/hooks/useAdmin";

import { getCachedUserProfile, saveCachedUserProfile, with10sTimeout } from "@/lib/offline/sessionQueue";
import { syncServerClockOnce } from "@/lib/time/clockSync";

export interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  error: string | null;
  refreshProfile: () => Promise<void>;
  updateProfileOptimistic: (partial: Partial<UserProfile>) => void;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const supabase = useMemo(() => createClient(), []);

  const fetchProfile = useCallback(async (userId: string) => {
    const cached = getCachedUserProfile<UserProfile>();
    if (cached && cached.id === userId) {
      setProfile(cached);
    }

    try {
      const { data, error } = await with10sTimeout(
        supabase
          .from("users")
          .select("*")
          .eq("id", userId)
          .single(),
        "Fetch profile"
      );

      if (error && error.code !== "PGRST116") {
        console.error("Error fetching profile:", error);
      }
      if (data) {
        setProfile(data as UserProfile);
        saveCachedUserProfile(data);
      }
    } catch (err) {
      console.warn("Profile fetch error (using cached profile):", err);
    }
  }, [supabase]);

  useEffect(() => {
    let isMounted = true;
    let lastFetchedUid = "";

    // Hydrate cached profile immediately on mount to prevent SSR hydration mismatch while preserving instant offline UX
    const cached = getCachedUserProfile<UserProfile>();
    if (cached && isMounted) {
      setProfile(cached);
    }

    async function initAuth() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (isMounted) {
          const currentUser = session?.user ?? null;
          setUser(currentUser);
          if (currentUser) {
            if (isAdminEmail(currentUser.email)) {
              try {
                localStorage.setItem("studyroom_admin_uid", currentUser.id);
              } catch {
                // ignore storage error
              }
            }
            lastFetchedUid = currentUser.id;
            await fetchProfile(currentUser.id);
          }
          setLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          console.error("Auth initialization error:", err);
          setLoading(false);
        }
      }
    }

    initAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      if (currentUser) {
        if (isAdminEmail(currentUser.email)) {
          try {
            localStorage.setItem("studyroom_admin_uid", currentUser.id);
          } catch {
            // ignore storage error
          }
        }
        if (currentUser.id !== lastFetchedUid || event === "USER_UPDATED" || event === "SIGNED_IN") {
          lastFetchedUid = currentUser.id;
          await fetchProfile(currentUser.id);
        }
      } else {
        lastFetchedUid = "";
        setProfile(null);
      }
      setLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [supabase, fetchProfile]);

  const refreshProfile = useCallback(async () => {
    if (user) {
      await fetchProfile(user.id);
    }
  }, [user, fetchProfile]);

  // Live-sync own profile from Supabase Realtime.
  // This is intentionally separate from useLiveRoom's global users subscription:
  // - Fires only on changes to THIS user's row (targeted filter)
  // - Keeps AuthProvider's `profile` state authoritative and realtime
  // - Allows useActiveSession's localStatusOverride to clear correctly once
  //   the server confirms a session action (start/pause/resume/stop)
  // - Ensures cross-device sync: if another device stops/expires the session,
  //   the profile update propagates here and triggers the goal update popup
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`auth:profile:${user.id}`)
      .on(
        "postgres_changes" as Parameters<ReturnType<typeof supabase.channel>["on"]>[0],
        {
          event: "UPDATE",
          schema: "public",
          table: "users",
          filter: `id=eq.${user.id}`,
        },
        (payload: { new: Record<string, unknown> }) => {
          setProfile((prev) => {
            if (!prev) return payload.new as unknown as UserProfile;
            const updated = { ...prev, ...(payload.new as Partial<UserProfile>) };
            saveCachedUserProfile(updated);
            return updated;
          });
        }
      )
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch {
        // ignore cleanup errors
      }
    };
  }, [supabase, user?.id]);

  // Resync own profile & clock immediately when returning from background, unlocking device, or reconnecting to network
  useEffect(() => {
    syncServerClockOnce();

    if (!user?.id) return;

    const handleWakeup = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        fetchProfile(user.id);
        syncServerClockOnce();
      }
    };

    const handleOnline = () => {
      fetchProfile(user.id);
      syncServerClockOnce();
    };

    document.addEventListener("visibilitychange", handleWakeup);
    window.addEventListener("focus", handleWakeup);
    window.addEventListener("online", handleOnline);

    return () => {
      document.removeEventListener("visibilitychange", handleWakeup);
      window.removeEventListener("focus", handleWakeup);
      window.removeEventListener("online", handleOnline);
    };
  }, [user?.id, fetchProfile]);

  const updateProfileOptimistic = useCallback((partial: Partial<UserProfile>) => {
    setProfile((prev) => {
      if (!prev) return null;
      const updated = { ...prev, ...partial };
      saveCachedUserProfile(updated);
      return updated;
    });
  }, []);

  const signOut = useCallback(async () => {
    try {
      setLoading(true);
      await supabase.auth.signOut();
    } catch (err) {
      console.error("Sign out error:", err);
      setError(err instanceof Error ? err.message : "Failed to sign out");
    } finally {
      try {
        localStorage.removeItem("studyroom_admin_uid");
        localStorage.removeItem("pwa_banner_dismissed");
        localStorage.removeItem("studyroom_cached_user_profile");
        localStorage.removeItem("studyroom_cached_active_goal");
        localStorage.removeItem("studyroom_cached_sessions");
        if (typeof document !== "undefined") {
          document.cookie = "studyroom_onboarded=; path=/; max-age=0";
        }
      } catch {
        // ignore
      }
      setUser(null);
      setProfile(null);
      setLoading(false);
    }
  }, [supabase]);

  const contextValue = useMemo<AuthContextValue>(
    () => ({
      user,
      profile,
      loading,
      error,
      refreshProfile,
      updateProfileOptimistic,
      signOut,
    }),
    [user, profile, loading, error, refreshProfile, updateProfileOptimistic, signOut]
  );

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}

export function useAuthContext(): AuthContextValue | null {
  return useContext(AuthContext);
}
