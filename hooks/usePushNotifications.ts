"use client";

import { useState, useEffect, useCallback } from "react";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function usePushNotifications() {
  const [isSupported, setIsSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Check initial state on mount
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !("Notification" in window)
    ) {
      setIsSupported(false);
      setLoading(false);
      return;
    }

    setIsSupported(true);
    setPermission(Notification.permission);

    // Check existing registration and subscription without hanging
    navigator.serviceWorker
      .getRegistration()
      .then((reg) => (reg ? reg.pushManager.getSubscription() : null))
      .then((subscription) => {
        setIsSubscribed(Boolean(subscription));
      })
      .catch((err) => {
        console.warn("[Push] Error checking subscription:", err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  // Refresh current permission status (e.g. after user changes settings in browser)
  const refreshPermission = useCallback(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      const current = Notification.permission;
      setPermission(current);
      return current;
    }
    return "default";
  }, []);

  // Automatically detect when user returns to app from browser settings
  useEffect(() => {
    const handleCheck = () => {
      refreshPermission();
    };

    window.addEventListener("focus", handleCheck);
    document.addEventListener("visibilitychange", handleCheck);
    return () => {
      window.removeEventListener("focus", handleCheck);
      document.removeEventListener("visibilitychange", handleCheck);
    };
  }, [refreshPermission]);

  // Subscribe to push notifications
  const subscribe = useCallback(async () => {
    if (!isSupported) {
      setError("Push notifications are not supported on this browser/device.");
      return false;
    }

    setLoading(true);
    setError(null);

    try {
      // 1. Request notification permission
      let perm: NotificationPermission = "default";
      try {
        perm = await Notification.requestPermission();
      } catch {
        perm = Notification.permission;
      }
      setPermission(perm);

      if (perm !== "granted") {
        setError("Notification permission was denied.");
        return false;
      }

      // 2. Obtain public VAPID key
      let publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!publicKey) {
        const res = await fetch("/api/push/vapid-public-key");
        if (res.ok) {
          const data = await res.json();
          publicKey = data.publicKey;
        }
      }

      if (!publicKey) {
        throw new Error("VAPID public key could not be loaded.");
      }

      // 3. Ensure service worker is registered and ready
      let registration = await navigator.serviceWorker.getRegistration();
      if (!registration) {
        registration = await navigator.serviceWorker.register("/sw.js");
      }

      // Await ready state with a 3s safety timeout to prevent infinite hang
      await Promise.race([
        navigator.serviceWorker.ready,
        new Promise((resolve) => setTimeout(resolve, 3000)),
      ]);

      const activeReg = (await navigator.serviceWorker.getRegistration()) || registration;
      let subscription = await activeReg.pushManager.getSubscription();

      const convertedKey = urlBase64ToUint8Array(publicKey);
      if (!subscription) {
        try {
          subscription = await activeReg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: convertedKey as unknown as BufferSource,
          });
        } catch (subErr) {
          // If browser has an old/mismatched subscription key, clean it up and retry
          const oldSub = await activeReg.pushManager.getSubscription();
          if (oldSub) {
            await oldSub.unsubscribe().catch(() => {});
            subscription = await activeReg.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: convertedKey as unknown as BufferSource,
            });
          } else {
            throw subErr;
          }
        }
      }

      // 4. Send subscription to server
      const saveRes = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: subscription.toJSON() }),
      });

      if (!saveRes.ok) {
        throw new Error("Failed to save push subscription on server.");
      }

      setIsSubscribed(true);
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to subscribe to push notifications";
      console.error("[Push] Subscribe error:", err);
      setError(msg);
      return false;
    } finally {
      setLoading(false);
    }
  }, [isSupported]);

  // Unsubscribe from push notifications
  const unsubscribe = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        const subscription = await registration.pushManager.getSubscription();

        if (subscription) {
          const endpoint = subscription.endpoint;
          await subscription.unsubscribe();

          await fetch("/api/push/subscribe", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endpoint }),
          });
        }
      }

      setIsSubscribed(false);
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to unsubscribe";
      console.error("[Push] Unsubscribe error:", err);
      setError(msg);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    isSupported,
    permission,
    isSubscribed,
    loading,
    error,
    subscribe,
    unsubscribe,
    refreshPermission,
  };
}
