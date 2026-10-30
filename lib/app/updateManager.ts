import { isSessionProtected, pruneStaleSnapshots } from "@/lib/cache/cacheManager";
import { STORAGE_KEYS } from "@/lib/offline/storageKeys";

export interface VersionInfo {
  buildId: string;
  buildTime: string;
  version: string;
  timestamp?: number;
}

export interface UpdateCheckResult {
  hasUpdate: boolean;
  currentBuildId: string;
  latestBuildId: string;
  latestBuildTime?: string;
  version?: string;
  error?: string;
}

const DISMISS_KEY = "studyroom_update_dismissed_info";
const DISMISS_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes snooze for the same build

/**
 * Returns the currently running client's embedded build ID.
 */
export function getRunningBuildId(): string {
  return process.env.NEXT_PUBLIC_APP_BUILD_ID || "c466a15c";
}

/**
 * Returns the currently running client's build timestamp.
 */
export function getRunningBuildTime(): string {
  return process.env.NEXT_PUBLIC_APP_BUILD_TIME || "";
}

/**
 * Checks whether an update for a specific build ID has been temporarily snoozed by the user.
 */
export function isUpdateDismissed(buildId: string): boolean {
  if (typeof window === "undefined" || !window.sessionStorage) return false;
  try {
    const raw = sessionStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (data.buildId === buildId && Date.now() - (data.dismissedAt || 0) < DISMISS_COOLDOWN_MS) {
      return true;
    }
  } catch {}
  return false;
}

/**
 * Records that the user clicked 'Later' for a specific build ID.
 */
export function setUpdateDismissed(buildId: string): void {
  if (typeof window === "undefined" || !window.sessionStorage) return;
  try {
    sessionStorage.setItem(
      DISMISS_KEY,
      JSON.stringify({
        buildId,
        dismissedAt: Date.now(),
      })
    );
  } catch {}
}

/**
 * Clears dismissal so the update prompt can be reopened immediately.
 */
export function clearUpdateDismissal(): void {
  if (typeof window === "undefined" || !window.sessionStorage) return;
  try {
    sessionStorage.removeItem(DISMISS_KEY);
  } catch {}
}

/**
 * Queries both `/version.json` (static CDN) and `/api/version` (dynamic server route)
 * to determine if a newer build has been deployed to Netlify.
 */
export async function checkLatestDeployment(
  providedCurrentId?: string
): Promise<UpdateCheckResult> {
  const currentBuildId = providedCurrentId || getRunningBuildId();

  if (typeof window === "undefined") {
    return {
      hasUpdate: false,
      currentBuildId,
      latestBuildId: currentBuildId,
    };
  }

  // Skip auto-checking during local dev if running on localhost with default mock IDs
  const isLocalhost =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";

  try {
    let versionData: VersionInfo | null = null;
    const cacheBuster = `_t=${Date.now()}`;

    // Attempt 1: Fetch static /version.json directly from CDN edge with zero cache
    try {
      const res = await fetch(`/version.json?${cacheBuster}`, {
        cache: "no-store",
        headers: {
          Pragma: "no-cache",
          "Cache-Control": "no-cache, no-store, must-revalidate",
        },
      });
      if (res.ok) {
        versionData = (await res.json()) as VersionInfo;
      }
    } catch {
      // Fallback to Attempt 2
    }

    // Attempt 2: Fetch dynamic /api/version if static file missed
    if (!versionData || !versionData.buildId) {
      const resApi = await fetch(`/api/version?${cacheBuster}`, {
        cache: "no-store",
        headers: {
          Pragma: "no-cache",
          "Cache-Control": "no-cache, no-store, must-revalidate",
        },
      });
      if (resApi.ok) {
        versionData = (await resApi.json()) as VersionInfo;
      }
    }

    if (!versionData || !versionData.buildId) {
      return {
        hasUpdate: false,
        currentBuildId,
        latestBuildId: currentBuildId,
        error: "Unable to retrieve server deployment version",
      };
    }

    const latestBuildId = versionData.buildId.trim();
    const isDifferent =
      Boolean(latestBuildId) &&
      Boolean(currentBuildId) &&
      latestBuildId !== currentBuildId &&
      currentBuildId !== "development" &&
      currentBuildId !== "unknown";

    // In local development, avoid false positives unless explicitly testing
    const hasUpdate = isLocalhost ? false : isDifferent;

    return {
      hasUpdate,
      currentBuildId,
      latestBuildId,
      latestBuildTime: versionData.buildTime,
      version: versionData.version,
    };
  } catch (err) {
    return {
      hasUpdate: false,
      currentBuildId,
      latestBuildId: currentBuildId,
      error: err instanceof Error ? err.message : "Update check failed",
    };
  }
}

/**
 * Performs a comprehensive and 100% safe platform refresh:
 * 1. Purges obsolete Next.js static asset caches in CacheStorage (`window.caches`)
 * 2. Instructs the Service Worker to skipWaiting and claim clients
 * 3. Prunes non-essential UI snapshots without touching auth tokens or active study sessions
 * 4. Reloads the browser with a cache-busting query parameter
 */
export async function performPlatformRefresh(): Promise<void> {
  if (typeof window === "undefined") return;

  try {
    // 1. Clear all CacheStorage entries (contains only static chunks, icons, and offline HTML)
    if ("caches" in window) {
      try {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map((name) => caches.delete(name)));
        console.info("[UpdateManager] Purged CacheStorage caches:", cacheNames);
      } catch (err) {
        console.warn("[UpdateManager] CacheStorage purge error:", err);
      }
    }

    // 2. Signal Service Worker to skip waiting and activate the latest worker
    if ("serviceWorker" in navigator) {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) {
          if (reg.waiting) {
            reg.waiting.postMessage({ type: "SKIP_WAITING" });
          }
          if (reg.active) {
            reg.active.postMessage({ type: "CLEAR_CACHES" });
            reg.active.postMessage({ type: "SKIP_WAITING" });
          }
          await reg.update().catch(() => {});
        }
      } catch (err) {
        console.warn("[UpdateManager] Service Worker update error:", err);
      }
    }

    // 3. Prune disposable stale snapshots (ONLY when session is not protected)
    // CRITICAL INVIOLABLE SAFETY:
    // - Never deletes or modifies active study/break/session state
    // - Never deletes Supabase auth tokens (sb-*-auth-token)
    // - Never wipes offline sync queue
    if (!isSessionProtected()) {
      try {
        pruneStaleSnapshots(Date.now());
        localStorage.removeItem(STORAGE_KEYS.CACHED_ROOM_MEMBERS);
        localStorage.removeItem(STORAGE_KEYS.CACHED_SESSIONS);
      } catch {}
    }

    // Clear snooze key
    clearUpdateDismissal();

    // 4. Force browser to reload with cache-busting timestamp
    const targetUrl = new URL(window.location.href);
    targetUrl.searchParams.set("_updated", Date.now().toString());
    window.location.replace(targetUrl.toString());
  } catch (err) {
    console.error("[UpdateManager] Error during platform refresh:", err);
    // Hard fallback reload
    window.location.reload();
  }
}
