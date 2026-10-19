"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";

export const UPCOMING_EXAM_CARD_PREF_EVENT = "studyroom:room-exam-card-pref-changed";

export function getStorageKey(userId?: string): string {
  return `studyroom_show_room_upcoming_card_${userId || "default"}`;
}

export function resolvePreferenceValue(
  metadataValue: unknown,
  storageValue: string | null
): boolean {
  if (metadataValue !== undefined && metadataValue !== null) {
    return metadataValue !== false && metadataValue !== "false";
  }
  if (storageValue !== null && storageValue !== undefined) {
    return storageValue !== "false";
  }
  // Default is ON (true)
  return true;
}

export function useUpcomingExamCardPreference() {
  const { user } = useAuth();
  const supabase = createClient();
  const userId = user?.id;
  const metadataVal = user?.user_metadata?.show_room_upcoming_card;

  const [showRoomUpcomingCard, setShowRoomUpcomingCardState] = useState<boolean>(() => {
    let localVal: string | null = null;
    if (typeof window !== "undefined") {
      try {
        localVal = localStorage.getItem(getStorageKey(userId));
      } catch {
        // LocalStorage unavailable
      }
    }
    return resolvePreferenceValue(metadataVal, localVal);
  });

  const [isUpdating, setIsUpdating] = useState<boolean>(false);
  const isMountedRef = useRef<boolean>(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Sync state whenever auth user_metadata changes or user switches
  useEffect(() => {
    let localVal: string | null = null;
    if (typeof window !== "undefined") {
      try {
        localVal = localStorage.getItem(getStorageKey(userId));
      } catch {
        // ignore
      }
    }
    const resolved = resolvePreferenceValue(metadataVal, localVal);
    setShowRoomUpcomingCardState(resolved);

    // Keep localStorage in sync with authoritative cloud metadata
    if (typeof window !== "undefined" && metadataVal !== undefined && metadataVal !== null) {
      try {
        localStorage.setItem(getStorageKey(userId), String(resolved));
      } catch {
        // ignore
      }
    }
  }, [userId, metadataVal]);

  // Listen for custom broadcast events across components and storage events across tabs
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleCustomEvent = (e: Event) => {
      const customEvent = e as CustomEvent<boolean>;
      if (typeof customEvent.detail === "boolean") {
        setShowRoomUpcomingCardState(customEvent.detail);
      }
    };

    const handleStorageEvent = (e: StorageEvent) => {
      if (e.key === getStorageKey(userId) && e.newValue !== null) {
        setShowRoomUpcomingCardState(e.newValue !== "false");
      }
    };

    window.addEventListener(UPCOMING_EXAM_CARD_PREF_EVENT, handleCustomEvent);
    window.addEventListener("storage", handleStorageEvent);

    return () => {
      window.removeEventListener(UPCOMING_EXAM_CARD_PREF_EVENT, handleCustomEvent);
      window.removeEventListener("storage", handleStorageEvent);
    };
  }, [userId]);

  const setPreference = useCallback(
    async (nextVal: boolean) => {
      setIsUpdating(true);

      // 1. Optimistic local state update
      setShowRoomUpcomingCardState(nextVal);

      // 2. Persist to local cache for 0ms offline/subsequent reloads
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem(getStorageKey(userId), String(nextVal));
          window.dispatchEvent(
            new CustomEvent<boolean>(UPCOMING_EXAM_CARD_PREF_EVENT, { detail: nextVal })
          );
        } catch {
          // ignore
        }
      }

      // 3. Persist universally to Supabase Auth user_metadata for cross-device synchronization
      if (!userId) {
        if (isMountedRef.current) {
          setIsUpdating(false);
        }
        return;
      }

      try {
        if (typeof supabase.auth.getSession === "function") {
          const { data } = await supabase.auth.getSession();
          if (!data?.session) {
            return;
          }
        }

        const { error } = await supabase.auth.updateUser({
          data: { show_room_upcoming_card: nextVal },
        });

        if (error) {
          console.error("Failed to sync room exam card preference to Supabase Auth:", error);
        }
      } catch (err) {
        console.error("Error updating user metadata preference:", err);
      } finally {
        if (isMountedRef.current) {
          setIsUpdating(false);
        }
      }
    },
    [userId, supabase]
  );

  const togglePreference = useCallback(async () => {
    await setPreference(!showRoomUpcomingCard);
  }, [setPreference, showRoomUpcomingCard]);

  return {
    showRoomUpcomingCard,
    setShowRoomUpcomingCard: setPreference,
    toggleShowRoomUpcomingCard: togglePreference,
    isUpdating,
  };
}
