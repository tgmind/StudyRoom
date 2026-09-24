import { STORAGE_KEYS } from "@/lib/offline/storageKeys";

/**
 * Storage Cleanup & Cache Budget Management System for StudyRoom
 *
 * Designed according to forensic storage audit specifications:
 * - Never deletes or modifies active study/break/session state
 * - Never affects authentication tokens or cookies
 * - Idempotent and safe to run repeatedly
 * - Non-blocking execution scheduled during browser idle periods
 */

export const CLEANUP_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours
export const DISMISSAL_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const PAIR_DISMISSAL_TTL_MS = 15 * 60 * 1000; // 15 minutes
export const ROOM_MEMBERS_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
export const SESSIONS_CACHE_TTL_MS = 3 * 24 * 60 * 60 * 1000; // 3 days
export const USER_PROFILE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const ACTIVE_GOAL_LAPSED_GRACE_MS = 12 * 60 * 60 * 1000; // 12 hours after goal expiration

export const KEY_LAST_CLEANUP = "studyroom_last_cache_cleanup";
export const KEY_LEGACY_DISMISSAL_INDEX = "studyroom_legacy_dismissals_index";

/**
 * Determines whether StudyRoom is currently in an active or protected session state.
 * If true, all session-related snapshot cleaning is strictly bypassed.
 */
export function isSessionProtected(): boolean {
  if (typeof window === "undefined" || !window.localStorage) {
    return false;
  }

  try {
    // 1. Active study session state
    const activeStudy = localStorage.getItem(STORAGE_KEYS.ACTIVE_STUDY);
    if (activeStudy) {
      try {
        const parsed = JSON.parse(activeStudy);
        if (parsed && (parsed.sessionStartTime || parsed.lastResumedAt)) {
          return true;
        }
      } catch {
        return true; // Fail-safe: malformed active study state is protected
      }
    }

    // 2. Active break state
    const activeBreak = localStorage.getItem(STORAGE_KEYS.ACTIVE_BREAK);
    if (activeBreak) {
      try {
        const parsed = JSON.parse(activeBreak);
        if (parsed && (parsed.breakStartedAt || parsed.localBreakStartMs)) {
          return true;
        }
      } catch {
        return true; // Fail-safe: malformed break state is protected
      }
    }

    // 3. Authoritative offline active session
    const offlineActive = localStorage.getItem(STORAGE_KEYS.OFFLINE_ACTIVE_SESSION);
    if (offlineActive) {
      try {
        const parsed = JSON.parse(offlineActive);
        if (parsed && parsed.sessionId && parsed.status) {
          return true;
        }
      } catch {
        return true;
      }
    }

    // 4. Offline session action queue
    const queue = localStorage.getItem(STORAGE_KEYS.OFFLINE_SESSION_QUEUE);
    if (queue) {
      try {
        const parsed = JSON.parse(queue);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return true;
        }
      } catch {
        return true;
      }
    }
  } catch {
    // If accessing localStorage throws (e.g. SecurityError), err on the side of caution
    return true;
  }

  return false;
}

/**
 * Returns the index of legacy dismissal keys tracking when they were first observed.
 */
function getLegacyDismissalIndex(): Record<string, number> {
  if (typeof window === "undefined" || !window.localStorage) return {};
  try {
    const raw = localStorage.getItem(KEY_LEGACY_DISMISSAL_INDEX);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return parsed;
    }
  } catch {}
  return {};
}

function saveLegacyDismissalIndex(index: Record<string, number>): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    localStorage.setItem(KEY_LEGACY_DISMISSAL_INDEX, JSON.stringify(index));
  } catch {}
}

/**
 * Prunes expired rivalry win dismissal suppression keys from localStorage:
 * - studyroom_win_dismissed_pair_*: expired after 15 minutes
 * - studyroom_win_dismissed_*: expired after 7 days
 */
export function pruneExpiredDismissalKeys(now = Date.now()): number {
  if (typeof window === "undefined" || !window.localStorage) return 0;

  let evictedCount = 0;
  const legacyIndex = getLegacyDismissalIndex();
  let legacyIndexChanged = false;

  try {
    const keysToInspect: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (
        k &&
        (k.startsWith("studyroom_win_dismissed_") || k.startsWith("studyroom_win_dismissed_pair_"))
      ) {
        keysToInspect.push(k);
      }
    }

    for (const key of keysToInspect) {
      const val = localStorage.getItem(key);
      if (val === null) continue;

      if (key.startsWith("studyroom_win_dismissed_pair_")) {
        const ts = parseInt(val, 10);
        if (!isNaN(ts)) {
          if (now - ts > PAIR_DISMISSAL_TTL_MS) {
            localStorage.removeItem(key);
            evictedCount++;
          }
        } else {
          // Non-numeric pair value is corrupted
          localStorage.removeItem(key);
          evictedCount++;
        }
      } else if (key.startsWith("studyroom_win_dismissed_")) {
        const ts = parseInt(val, 10);
        if (!isNaN(ts)) {
          // Timestamp string written by updated dismissal handler
          if (now - ts > DISMISSAL_TTL_MS) {
            localStorage.removeItem(key);
            evictedCount++;
            if (legacyIndex[key]) {
              delete legacyIndex[key];
              legacyIndexChanged = true;
            }
          }
        } else {
          // Legacy "true" string value: track first seen timestamp to avoid premature deletion
          if (!legacyIndex[key]) {
            legacyIndex[key] = now;
            legacyIndexChanged = true;
          } else if (now - legacyIndex[key] > DISMISSAL_TTL_MS) {
            localStorage.removeItem(key);
            delete legacyIndex[key];
            legacyIndexChanged = true;
            evictedCount++;
          }
        }
      }
    }

    if (legacyIndexChanged) {
      saveLegacyDismissalIndex(legacyIndex);
    }
  } catch (err) {
    console.warn("[CacheManager] Error pruning dismissal keys:", err);
  }

  return evictedCount;
}

/**
 * Prunes disposable UI snapshots that have exceeded their age limits:
 * - cached_room_members: > 24 hours
 * - cached_sessions: > 3 days
 * - cached_user_profile: > 7 days
 * - cached_active_goal: expired > 12 hours ago
 */
export function pruneStaleSnapshots(now = Date.now()): number {
  if (typeof window === "undefined" || !window.localStorage) return 0;

  // Inviolable rule: If active study/break is ongoing, do NOT touch snapshots
  if (isSessionProtected()) {
    return 0;
  }

  let evictedCount = 0;

  try {
    // 1. Room members cache (> 24 hours)
    const membersRaw = localStorage.getItem(STORAGE_KEYS.CACHED_ROOM_MEMBERS);
    if (membersRaw) {
      const tsRaw = localStorage.getItem(STORAGE_KEYS.CACHED_ROOM_MEMBERS + "_ts");
      let ts = tsRaw ? parseInt(tsRaw, 10) : NaN;

      if (isNaN(ts)) {
        // Fallback: examine member status change timestamps
        try {
          const members = JSON.parse(membersRaw);
          if (Array.isArray(members) && members.length > 0) {
            const newestTime = members.reduce((max: number, m: any) => {
              const t = m?.last_status_change_at ? new Date(m.last_status_change_at).getTime() : 0;
              return Math.max(max, isNaN(t) ? 0 : t);
            }, 0);
            if (newestTime > 0) ts = newestTime;
          }
        } catch {}
      }

      if (!isNaN(ts) && now - ts > ROOM_MEMBERS_CACHE_TTL_MS) {
        localStorage.removeItem(STORAGE_KEYS.CACHED_ROOM_MEMBERS);
        localStorage.removeItem(STORAGE_KEYS.CACHED_ROOM_MEMBERS + "_ts");
        evictedCount++;
      }
    }

    // 2. Study sessions cache (> 3 days)
    const sessionsRaw = localStorage.getItem(STORAGE_KEYS.CACHED_SESSIONS);
    if (sessionsRaw) {
      const tsRaw = localStorage.getItem(STORAGE_KEYS.CACHED_SESSIONS + "_ts");
      let ts = tsRaw ? parseInt(tsRaw, 10) : NaN;

      if (isNaN(ts)) {
        try {
          const sessions = JSON.parse(sessionsRaw);
          if (Array.isArray(sessions) && sessions.length > 0) {
            const newestTime = sessions.reduce((max: number, s: any) => {
              const t = s?.start_time ? new Date(s.start_time).getTime() : 0;
              return Math.max(max, isNaN(t) ? 0 : t);
            }, 0);
            if (newestTime > 0) ts = newestTime;
          }
        } catch {}
      }

      if (!isNaN(ts) && now - ts > SESSIONS_CACHE_TTL_MS) {
        localStorage.removeItem(STORAGE_KEYS.CACHED_SESSIONS);
        localStorage.removeItem(STORAGE_KEYS.CACHED_SESSIONS + "_ts");
        evictedCount++;
      }
    }

    // 3. User profile cache (> 7 days)
    const profileRaw = localStorage.getItem(STORAGE_KEYS.CACHED_USER_PROFILE);
    if (profileRaw) {
      const tsRaw = localStorage.getItem(STORAGE_KEYS.CACHED_USER_PROFILE + "_ts");
      const ts = tsRaw ? parseInt(tsRaw, 10) : NaN;
      if (!isNaN(ts) && now - ts > USER_PROFILE_CACHE_TTL_MS) {
        localStorage.removeItem(STORAGE_KEYS.CACHED_USER_PROFILE);
        localStorage.removeItem(STORAGE_KEYS.CACHED_USER_PROFILE + "_ts");
        evictedCount++;
      }
    }

    // 4. Daily goal cache (expired > 12 hours ago)
    const goalRaw = localStorage.getItem(STORAGE_KEYS.CACHED_ACTIVE_GOAL);
    if (goalRaw) {
      try {
        const goal = JSON.parse(goalRaw);
        if (goal && goal.expires_at) {
          const expiryMs = new Date(goal.expires_at).getTime();
          if (!isNaN(expiryMs) && now - expiryMs > ACTIVE_GOAL_LAPSED_GRACE_MS) {
            localStorage.removeItem(STORAGE_KEYS.CACHED_ACTIVE_GOAL);
            localStorage.removeItem(STORAGE_KEYS.CACHED_ACTIVE_GOAL + "_ts");
            evictedCount++;
          }
        }
      } catch {
        localStorage.removeItem(STORAGE_KEYS.CACHED_ACTIVE_GOAL);
        localStorage.removeItem(STORAGE_KEYS.CACHED_ACTIVE_GOAL + "_ts");
        evictedCount++;
      }
    }

    // 5. Active rivalry win banner (> 15 minutes old)
    const winBannerRaw = localStorage.getItem(STORAGE_KEYS.ACTIVE_RIVALRY_WIN);
    if (winBannerRaw) {
      try {
        const parsed = JSON.parse(winBannerRaw);
        if (parsed?.timestamp && now - parsed.timestamp > PAIR_DISMISSAL_TTL_MS) {
          localStorage.removeItem(STORAGE_KEYS.ACTIVE_RIVALRY_WIN);
          evictedCount++;
        }
      } catch {
        localStorage.removeItem(STORAGE_KEYS.ACTIVE_RIVALRY_WIN);
        evictedCount++;
      }
    }
  } catch (err) {
    console.warn("[CacheManager] Error pruning stale snapshots:", err);
  }

  return evictedCount;
}

/**
 * Prunes 0-minute ghost sessions from offline completed sessions list.
 * Legitimate user sessions awaiting sync are strictly preserved.
 */
export function pruneGhostOfflineSessions(): number {
  if (typeof window === "undefined" || !window.localStorage) return 0;

  try {
    const raw = localStorage.getItem(STORAGE_KEYS.OFFLINE_COMPLETED_SESSIONS);
    if (!raw) return 0;
    const list = JSON.parse(raw);
    if (!Array.isArray(list) || list.length === 0) return 0;

    const valid = list.filter((s: any) => {
      if (!s || !s.start_time) return false;
      const hasTasks = Array.isArray(s.completed_tasks) && s.completed_tasks.length > 0;
      const hasBreak = (s.break_minutes ?? 0) > 0;
      const isZero = (s.duration_minutes ?? 0) === 0;
      // Ghost entry: 0 duration, 0 break, 0 tasks
      if (isZero && !hasTasks && !hasBreak) return false;
      return true;
    });

    if (valid.length !== list.length) {
      localStorage.setItem(STORAGE_KEYS.OFFLINE_COMPLETED_SESSIONS, JSON.stringify(valid));
      return list.length - valid.length;
    }
  } catch {}

  return 0;
}

/**
 * Triggers Service Worker cache trimming via PostMessage if available.
 */
export function requestServiceWorkerCacheTrim(): void {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: "TRIM_CACHE" });
    }
  } catch {}
}

/**
 * Executes startup maintenance routine with a 24-hour cooldown.
 *
 * @param force If true, bypasses the 24-hour cooldown (used for testing or explicit diagnostics)
 */
export async function runStartupCleanup(force = false): Promise<{
  executed: boolean;
  reason?: string;
  evictedCount: number;
  isProtected: boolean;
}> {
  if (typeof window === "undefined" || !window.localStorage) {
    return { executed: false, reason: "no_storage", evictedCount: 0, isProtected: false };
  }

  const now = Date.now();
  const lastCleanupRaw = localStorage.getItem(KEY_LAST_CLEANUP);
  const lastCleanup = lastCleanupRaw ? parseInt(lastCleanupRaw, 10) : 0;

  if (!force && lastCleanup > 0 && now - lastCleanup < CLEANUP_COOLDOWN_MS) {
    return {
      executed: false,
      reason: "cooldown_active",
      evictedCount: 0,
      isProtected: isSessionProtected(),
    };
  }

  const protectedStatus = isSessionProtected();
  let totalEvicted = 0;

  // 1. Always safe: Prune expired rivalry dismissal keys
  totalEvicted += pruneExpiredDismissalKeys(now);

  // 2. Safe only when no active session is running
  if (!protectedStatus) {
    totalEvicted += pruneStaleSnapshots(now);
    totalEvicted += pruneGhostOfflineSessions();

    // Clean up obsolete launch announcement keys
    try {
      localStorage.removeItem("studyroom_stable_app_v1_0_3_announcement");
    } catch {}
  }

  // 3. Request Service Worker to trim static asset cache
  requestServiceWorkerCacheTrim();

  // 4. Update cleanup timestamp
  try {
    localStorage.setItem(KEY_LAST_CLEANUP, now.toString());
  } catch {}

  // Update diagnostics if enabled
  updateCacheDiagnostics(totalEvicted);

  return {
    executed: true,
    evictedCount: totalEvicted,
    isProtected: protectedStatus,
  };
}

/**
 * Schedules startup cleanup during idle time approximately 5 seconds after page load.
 * Returns a cancel function.
 */
export function scheduleStartupCleanup(): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  let idleHandle: number | undefined;
  const timeoutId = setTimeout(() => {
    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      idleHandle = (window as any).requestIdleCallback(
        () => {
          runStartupCleanup().catch(() => {});
        },
        { timeout: 10000 }
      );
    } else {
      runStartupCleanup().catch(() => {});
    }
  }, 5000);

  return () => {
    clearTimeout(timeoutId);
    if (
      idleHandle &&
      typeof window !== "undefined" &&
      "cancelIdleCallback" in window
    ) {
      (window as any).cancelIdleCallback(idleHandle);
    }
  };
}

/**
 * Development & diagnostic observability.
 * Does not expose any user credentials, IDs, or sensitive data.
 */
function updateCacheDiagnostics(evictedLast = 0): void {
  if (typeof window === "undefined" || process.env.NODE_ENV === "production") return;

  try {
    let dismissedCount = 0;
    let studyRoomKeys = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k) {
        if (k.startsWith("studyroom_")) studyRoomKeys++;
        if (k.startsWith("studyroom_win_dismissed_")) dismissedCount++;
      }
    }

    const lastCleanupRaw = localStorage.getItem(KEY_LAST_CLEANUP);

    (window as any).__STUDYROOM_CACHE_DIAGNOSTICS = {
      localStorageKeyCount: localStorage.length,
      studyRoomKeysCount: studyRoomKeys,
      dismissedWinKeysCount: dismissedCount,
      isSessionProtected: isSessionProtected(),
      lastCleanupTimestamp: lastCleanupRaw ? parseInt(lastCleanupRaw, 10) : 0,
      lastEvictedCount: evictedLast,
    };
  } catch {}
}
