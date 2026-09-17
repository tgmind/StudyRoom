"use client";

import { useEffect, useRef } from "react";

/**
 * Screen Wake Lock Hook
 *
 * Keeps device screens awake during active live study sessions to prevent
 * mobile and laptop displays from sleeping, which throttles JavaScript timers
 * and disconnects WebSockets.
 *
 * Silently falls back if Wake Lock API is unsupported or rejected (e.g. low battery).
 */
export function useScreenWakeLock(enabled: boolean): void {
  const sentinelRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("wakeLock" in navigator)) {
      return;
    }

    let isMounted = true;

    const requestLock = async () => {
      if (!enabled || sentinelRef.current) return;
      try {
        const lock = await navigator.wakeLock.request("screen");
        if (!isMounted) {
          await lock.release();
          return;
        }
        sentinelRef.current = lock;
        lock.addEventListener("release", () => {
          sentinelRef.current = null;
        });
      } catch {
        // Ignored: browser may reject if battery saver is active or tab is backgrounded
      }
    };

    const releaseLock = async () => {
      if (sentinelRef.current) {
        try {
          await sentinelRef.current.release();
        } catch {
          // Ignored
        } finally {
          sentinelRef.current = null;
        }
      }
    };

    if (enabled) {
      requestLock();
    } else {
      releaseLock();
    }

    // Re-acquire lock when user switches back to this tab if still enabled
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && enabled) {
        requestLock();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isMounted = false;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      releaseLock();
    };
  }, [enabled]);
}
