"use client";

import { useSyncExternalStore } from "react";

export type DeviceLayoutType = "mobile" | "desktop";

/**
 * Checks if the current environment is the native StudyRoom Android application / WebView.
 * The Android app injects `window.AndroidBridge` and appends `StudyRoom-Android/<version>` to userAgent.
 */
export function isAndroidApp(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if ((window as unknown as { AndroidBridge?: unknown }).AndroidBridge) {
      return true;
    }
    if (typeof navigator !== "undefined" && navigator.userAgent) {
      return navigator.userAgent.includes("StudyRoom-Android");
    }
  } catch {
    // ignore
  }
  return false;
}

/**
 * Checks if the user agent is a mobile or tablet handheld device (phones, iPads, Android tablets).
 */
export function isHandheldDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  // Check common handheld device signatures
  const isMobileUa = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  // iPad on iOS 13+ reports as Macintosh but has touch points
  const isIPadOS = ua.includes("Macintosh") && typeof navigator.maxTouchPoints === "number" && navigator.maxTouchPoints > 1;
  return isMobileUa || isIPadOS;
}

/**
 * Determines whether to display the Mobile/Tablet layout or Laptop/Desktop layout.
 *
 * Rules:
 * 1. Native Android App: ALWAYS "mobile" (never activates laptop UI, even on tablets or in landscape).
 * 2. Mobile/Tablet devices: ALWAYS "mobile".
 * 3. General browser/PWA on viewport < 1024px: "mobile".
 * 4. General browser/PWA on viewport >= 1024px on non-handheld desktop/laptop: "desktop".
 */
export function resolveDeviceLayout(): DeviceLayoutType {
  if (typeof window === "undefined") return "mobile";

  // 1. Native Android App isolation: 100% guarantee mobile UI
  if (isAndroidApp()) {
    return "mobile";
  }

  // 2. Handheld phones and tablets: 100% guarantee mobile UI
  if (isHandheldDevice()) {
    return "mobile";
  }

  // 3. Viewport check for desktop/laptop
  if (window.innerWidth >= 1024) {
    return "desktop";
  }

  return "mobile";
}

function subscribe(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  let mql: MediaQueryList | null = null;
  let handleMediaChange: (() => void) | null = null;

  if (typeof window.matchMedia === "function") {
    try {
      mql = window.matchMedia("(min-width: 1024px)");
      handleMediaChange = () => callback();

      if (mql.addEventListener) {
        mql.addEventListener("change", handleMediaChange);
      } else if (mql.addListener) {
        mql.addListener(handleMediaChange);
      }
    } catch {
      // Safe fallback in unsupported environments
    }
  }

  window.addEventListener("resize", callback, { passive: true });
  window.addEventListener("orientationchange", callback, { passive: true });

  return () => {
    if (mql && handleMediaChange) {
      try {
        if (mql.removeEventListener) {
          mql.removeEventListener("change", handleMediaChange);
        } else if (mql.removeListener) {
          mql.removeListener(handleMediaChange);
        }
      } catch {
        // Ignore cleanup errors
      }
    }
    window.removeEventListener("resize", callback);
    window.removeEventListener("orientationchange", callback);
  };
}

function getServerSnapshot(): DeviceLayoutType {
  return "mobile";
}

/**
 * React hook to reactively subscribe to device layout changes.
 * Uses useSyncExternalStore for instantaneous client synchronization without 1-frame layout shifts,
 * while safely defaulting to "mobile" during SSR to prevent hydration mismatches.
 */
export function useDeviceLayout(): DeviceLayoutType {
  return useSyncExternalStore(subscribe, resolveDeviceLayout, getServerSnapshot);
}
