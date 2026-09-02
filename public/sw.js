// StudyRoom PWA Service Worker
const CACHE_NAME = "studyroom-v2";
const OFFLINE_URL = "/offline.html";

const PRECACHE_ASSETS = [
  "/offline.html",
  "/manifest.json",
  "/icons/icon-192x192.png",
  "/icons/icon-512x512.png",
  "/icons/icon-maskable.png",
];

// Install Event: Cache Static App Shell & Offline Page
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate Event: Clean up legacy caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch Event: Serve cached static assets, network-first for pages, offline fallback for failures
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  // Bypass Supabase API, Auth, Admin routes & Next.js HMR to ensure real-time accuracy
  if (
    url.hostname.includes("supabase.co") ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/admin") ||
    url.pathname.includes("hmr") ||
    url.pathname.includes("_next/webpack-hmr")
  ) {
    return;
  }

  // Static Assets (JS, CSS, Images, Fonts): Cache First
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.match(/\.(png|jpg|jpeg|svg|gif|webp|woff2?|css|js)$/)
  ) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;
        return fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          }
          return networkResponse;
        });
      })
    );
    return;
  }

  // HTML Pages: Network First with Offline Fallback
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;
        return caches.match(OFFLINE_URL);
      });
    })
  );
});

// ============================================================
// Push Notification Handlers (Web Push & Action Buttons)
// ============================================================

// Push Event: Receive VAPID Web Push Payload
self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "StudyRoom", body: event.data.text() };
  }

  const title = payload.title || "StudyRoom";
  const options = {
    body: payload.body || "Live study notification",
    icon: payload.icon || "/icons/icon-192x192.png",
    badge: payload.badge || "/icons/icon-192x192.png",
    vibrate: [100, 50, 100],
    data: payload.data || {},
    actions: payload.actions || [],
    tag: payload.tag || "studyroom-notification",
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Notification Click Event: Handle Interactive Action Buttons ([YES] / [NO] / Body Click)
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const action = event.action;
  const data = event.notification.data || {};

  // Action: "NO" -> Stop the live session authoritatively on server
  if (action === "no") {
    const userId = data.userId;
    event.waitUntil(
      fetch("/api/push/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop_session", userId }),
      }).catch((err) => {
        console.warn("[SW] Failed to stop session via push action:", err);
      })
    );
    return;
  }

  // Action: "YES" -> Dismiss notification, session continues
  if (action === "yes") {
    return;
  }

  // Default click on notification body: Open / focus the StudyRoom Live Room window
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url && client.url.includes("/room") && "focus" in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow("/room");
      }
    })
  );
});

