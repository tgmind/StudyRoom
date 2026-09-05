"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { UserProfile } from "@/lib/supabase/types";
import { User } from "@supabase/supabase-js";
import { isAdminEmail } from "@/hooks/useAdmin";

export interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  error: string | null;
  refreshProfile: () => Promise<void>;
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
    try {
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("id", userId)
        .single();

      if (error && error.code !== "PGRST116") {
        console.error("Error fetching profile:", error);
      }
      setProfile(data as UserProfile | null);
    } catch (err) {
      console.error("Profile fetch error:", err);
    }
  }, [supabase]);

  useEffect(() => {
    let isMounted = true;
    let lastFetchedUid = "";

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
      signOut,
    }),
    [user, profile, loading, error, refreshProfile, signOut]
  );

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}

export function useAuthContext(): AuthContextValue | null {
  return useContext(AuthContext);
}
