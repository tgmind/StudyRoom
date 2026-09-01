// StudyRoom PWA Service Worker
const CACHE_NAME = "studyroom-v1";
const OFFLINE_URL = "/offline.html";

const PRECACHE_ASSETS = [
  "/",
  "/offline.html",
  "/manifest.json",
  "/icons/icon-192x192.png",
  "/icons/icon-512x512.png",
  "/icons/icon-maskable.png",
];

// Install Event: Cache App Shell & Offline Page
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

  // Bypass Supabase API & Auth requests to ensure real-time accuracy
  if (url.hostname.includes("supabase.co") || url.pathname.startsWith("/api/")) {
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
