"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  checkLatestDeployment,
  performPlatformRefresh,
  getRunningBuildId,
  isUpdateDismissed,
  setUpdateDismissed,
  clearUpdateDismissal,
} from "@/lib/app/updateManager";

export interface UseAppUpdateReturn {
  hasUpdate: boolean;
  isChecking: boolean;
  isRefreshing: boolean;
  currentBuildId: string;
  latestBuildId: string | null;
  latestBuildTime: string | null;
  isDismissed: boolean;
  checkForUpdate: (force?: boolean) => Promise<boolean>;
  refreshPlatform: () => Promise<void>;
  dismissUpdate: () => void;
  reopenUpdateModal: () => void;
}

const CHECK_INTERVAL_MS = 4 * 60 * 1000; // 4 minutes

export function useAppUpdate(): UseAppUpdateReturn {
  const currentBuildId = getRunningBuildId();
  const [hasUpdate, setHasUpdate] = useState<boolean>(false);
  const [isChecking, setIsChecking] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [latestBuildId, setLatestBuildId] = useState<string | null>(null);
  const [latestBuildTime, setLatestBuildTime] = useState<string | null>(null);
  const [isDismissed, setIsDismissed] = useState<boolean>(false);

  const lastCheckTimeRef = useRef<number>(0);
  const isMountedRef = useRef<boolean>(true);

  const checkForUpdate = useCallback(
    async (force = false): Promise<boolean> => {
      if (typeof window === "undefined") return false;

      // Rate limit checks to at most once every 15 seconds unless forced
      const now = Date.now();
      if (!force && now - lastCheckTimeRef.current < 15000) {
        return hasUpdate;
      }
      lastCheckTimeRef.current = now;

      setIsChecking(true);
      try {
        const result = await checkLatestDeployment(currentBuildId);
        if (!isMountedRef.current) return false;

        if (result.hasUpdate) {
          setHasUpdate(true);
          setLatestBuildId(result.latestBuildId);
          if (result.latestBuildTime) {
            setLatestBuildTime(result.latestBuildTime);
          }

          // Check if previously dismissed by the user for this specific build
          if (isUpdateDismissed(result.latestBuildId)) {
            setIsDismissed(true);
          } else {
            setIsDismissed(false);
          }
          return true;
        } else {
          // If server matches current, no update needed
          setHasUpdate(false);
          return false;
        }
      } catch (err) {
        console.warn("[useAppUpdate] Check failed:", err);
        return false;
      } finally {
        if (isMountedRef.current) {
          setIsChecking(false);
        }
      }
    },
    [currentBuildId, hasUpdate]
  );

  const refreshPlatform = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await performPlatformRefresh();
    } catch (err) {
      console.error("[useAppUpdate] Refresh error:", err);
      setIsRefreshing(false);
    }
  }, []);

  const dismissUpdate = useCallback(() => {
    if (latestBuildId) {
      setUpdateDismissed(latestBuildId);
    }
    setIsDismissed(true);
  }, [latestBuildId]);

  const reopenUpdateModal = useCallback(() => {
    clearUpdateDismissal();
    setIsDismissed(false);
  }, []);

  useEffect(() => {
    isMountedRef.current = true;

    // 1. Initial delayed check 3s after mount
    const initialTimer = setTimeout(() => {
      checkForUpdate(false).catch(() => {});
    }, 3000);

    // 2. Listen to custom SW update event from PwaRegister
    const handleSwUpdate = () => {
      console.info("[useAppUpdate] Service Worker notified new update available.");
      setHasUpdate(true);
      setIsDismissed(false);
    };
    window.addEventListener("studyroom:update-available", handleSwUpdate);

    // 3. Tab visibility changes (e.g. user returns to tab)
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        checkForUpdate(false).catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    // 4. Window focus
    const handleFocus = () => {
      checkForUpdate(false).catch(() => {});
    };
    window.addEventListener("focus", handleFocus);

    // 5. Online event
    const handleOnline = () => {
      checkForUpdate(true).catch(() => {});
    };
    window.addEventListener("online", handleOnline);

    // 6. Periodic interval (every 4 minutes)
    const intervalId = setInterval(() => {
      checkForUpdate(false).catch(() => {});
    }, CHECK_INTERVAL_MS);

    return () => {
      isMountedRef.current = false;
      clearTimeout(initialTimer);
      clearInterval(intervalId);
      window.removeEventListener("studyroom:update-available", handleSwUpdate);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("online", handleOnline);
    };
  }, [checkForUpdate]);

  return {
    hasUpdate,
    isChecking,
    isRefreshing,
    currentBuildId,
    latestBuildId,
    latestBuildTime,
    isDismissed,
    checkForUpdate,
    refreshPlatform,
    dismissUpdate,
    reopenUpdateModal,
  };
}
