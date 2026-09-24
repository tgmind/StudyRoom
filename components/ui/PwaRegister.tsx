"use client";

import { useEffect } from "react";
import { scheduleStartupCleanup } from "@/lib/cache/cacheManager";

export function PwaRegister() {
  useEffect(() => {
    // Schedule asynchronous idle cache maintenance (with 24h cooldown)
    const cancelCleanup = scheduleStartupCleanup();

    const handleVisibility = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        scheduleStartupCleanup();
      }
    };

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibility);
    }

    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return () => {
        cancelCleanup();
        if (typeof document !== "undefined") {
          document.removeEventListener("visibilitychange", handleVisibility);
        }
      };
    }

    // In development or localhost, unregister any active service workers to prevent
    // stale cached HTML/chunks from causing SSR/client hydration mismatches.
    const isLocalhost =
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1";

    if (process.env.NODE_ENV === "development" || isLocalhost) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) {
          registration.unregister();
        }
      });
      if ("caches" in window) {
        caches.keys().then((keys) => {
          for (const key of keys) {
            caches.delete(key);
          }
        });
      }
      return () => {
        cancelCleanup();
        if (typeof document !== "undefined") {
          document.removeEventListener("visibilitychange", handleVisibility);
        }
      };
    }

    const registerSw = () => {
      navigator.serviceWorker
        .register("/sw.js")
        .then((registration) => {
          registration.addEventListener("updatefound", () => {
            const installingWorker = registration.installing;
            if (installingWorker) {
              installingWorker.addEventListener("statechange", () => {
                if (
                  installingWorker.state === "installed" &&
                  navigator.serviceWorker.controller
                ) {
                  console.log("[PWA] New content is available; please refresh.");
                }
              });
            }
          });
        })
        .catch((error) => {
          console.warn("[PWA] Service worker registration failed:", error);
        });
    };

    if (document.readyState === "complete") {
      registerSw();
    } else {
      window.addEventListener("load", registerSw);
      return () => {
        cancelCleanup();
        window.removeEventListener("load", registerSw);
        if (typeof document !== "undefined") {
          document.removeEventListener("visibilitychange", handleVisibility);
        }
      };
    }

    return () => {
      cancelCleanup();
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibility);
      }
    };
  }, []);

  return null;
}

