// StudyRoom PWA Service Worker — Version 11 with Bounded Cache Eviction
const CACHE_NAME = "studyroom-v11";
const OFFLINE_URL = "/offline.html";

// Maximum number of Next.js static asset chunks to retain in cache
const MAX_STATIC_CHUNKS = 50;

// Precache static public assets guaranteed to return 200 OK without authentication
const PRECACHE_ASSETS = [
  "/offline.html",
  "/manifest.json",
  "/favicon.ico",
  "/icons/icon-192x192.png",
  "/icons/icon-512x512.png",
  "/icons/icon-maskable.png",
];

/**
 * Trims excess or obsolete Next.js static chunks to stay within budget.
 * Inviolable rule: Never evicts precache assets, icons, fonts, or HTML navigation routes.
 */
async function trimStaticCache(cache) {
  try {
    const requests = await cache.keys();
    const staticRequests = [];

    for (const req of requests) {
      const url = new URL(req.url);
      // Target only Next.js static chunks and css
      if (
        url.pathname.startsWith("/_next/static/") &&
        !PRECACHE_ASSETS.includes(url.pathname)
      ) {
        staticRequests.push(req);
      }
    }

    // Evict oldest static chunks when exceeding budget (FIFO)
    if (staticRequests.length > MAX_STATIC_CHUNKS) {
      const excessCount = staticRequests.length - MAX_STATIC_CHUNKS;
      const toEvict = staticRequests.slice(0, excessCount);
      await Promise.all(toEvict.map((r) => cache.delete(r)));
    }
  } catch (err) {
    // Non-blocking fail-safe
  }
}

// Install Event: Precache Static App Shell & Offline Page
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn("[SW] Precache asset fetch error:", err);
      });
    })
  );
  self.skipWaiting();
});

// Activate Event: Clean up legacy caches and enforce cache budget
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => caches.open(CACHE_NAME))
      .then((currentCache) => trimStaticCache(currentCache))
  );
  self.clients.claim();
});

// Message Event: Allow web client to trigger cache trimming during idle cleanup
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "TRIM_CACHE") {
    event.waitUntil(caches.open(CACHE_NAME).then((cache) => trimStaticCache(cache)));
  }
});

// Fetch Event: Serve cached static assets, SWR for app shell navigation, offline fallback for failures
let chunkPutCounter = 0;

self.addEventListener("fetch", (event) => {
  // Only handle GET requests
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  // Skip chrome-extension, internal schemes, and Next.js HMR
  if (!url.protocol.startsWith("http")) return;
  if (url.pathname.startsWith("/_next/webpack-hmr")) return;

  // Direct bypass for non-origin requests (e.g. Supabase API/Realtime) - handled by client offline queue
  if (url.origin !== self.location.origin || url.hostname.includes("supabase.co")) return;

  // Static Assets (Next.js static chunks, icons, fonts, images, manifest): Cache-first
  if (
    url.pathname.startsWith("/_next/static/") ||
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
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache).then(() => {
                // Periodically trim static cache after every 10 puts
                chunkPutCounter++;
                if (chunkPutCounter >= 10) {
                  chunkPutCounter = 0;
                  trimStaticCache(cache);
                }
              });
            });
          }
          return networkResponse;
        });
      })
    );
    return;
  }

  // HTML / App Navigation Routes: Stale-While-Revalidate with resilient offline fallback
  if (event.request.mode === "navigate" || event.request.headers.get("accept")?.includes("text/html")) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        const fetchPromise = fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const responseToCache = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
            }
            return networkResponse;
          })
          .catch(async () => {
            if (cachedResponse) return cachedResponse;
            const roomFallback = await caches.match("/room");
            if (roomFallback) return roomFallback;
            const rootFallback = await caches.match("/");
            if (rootFallback) return rootFallback;
            return caches.match(OFFLINE_URL);
          });

        // Instant startup: return cached app shell immediately (< 50ms) if present, revalidating in background
        return cachedResponse || fetchPromise;
      })
    );
    return;
  }
});

