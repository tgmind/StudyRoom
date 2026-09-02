// StudyRoom PWA Service Worker
const CACHE_NAME = "studyroom-v3";
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
  // Only handle GET requests
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  // Skip chrome-extension, internal schemes, and Next.js HMR
  if (!url.protocol.startsWith("http")) return;
  if (url.pathname.startsWith("/_next/webpack-hmr")) return;

  // Static Assets (icons, fonts, images, manifest): Cache-first
  if (
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/fonts/") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".svg") ||
    url.pathname === "/manifest.json"
  ) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;
        return fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
          }
          return networkResponse;
        });
      })
    );
    return;
  }

  // HTML / App Navigation Routes: Network-first, fallback to cache, fallback to offline page
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
    requireInteraction: payload.requireInteraction !== false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Notification Click Event: Handle Interactive Action Buttons ([YES] / [NO] / [Resume] / Body Click)
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const action = event.action;
  const data = event.notification.data || {};

  // Action: "NO" -> Stop the live session authoritatively on server
  if (action === "no") {
    const userId = data.userId;
    const actionToken = data.actionToken;
    event.waitUntil(
      fetch("/api/push/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "stop_session", userId, actionToken }),
      })
        .then(() => {
          // Provide instant visual confirmation to user on device
          return self.registration.showNotification("StudyRoom", {
            body: "Session ended. Your study time has been safely saved.",
            icon: "/icons/icon-192x192.png",
            badge: "/icons/icon-192x192.png",
            tag: "studyroom-session-stopped",
          });
        })
        .catch((err) => {
          console.warn("[SW] Failed to stop session via push action:", err);
        })
    );
    return;
  }

  // Action: "YES" -> Dismiss notification, session continues normally
  if (action === "yes") {
    return;
  }

  // Action: "resume" or default body click: Focus or open the StudyRoom Live Room
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
