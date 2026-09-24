import {
  STORAGE_KEYS,
  STORAGE_KEY_PREFIX,
  OfflineActiveSession,
  CompletedOfflineSessionRecord,
  QueuedSessionAction,
  QueuedActionType,
  OfflineSessionBlock,
} from "./storageKeys";
import { getDateInTimezone, getTimeUntilMidnight } from "../scoring/streak";

export type {
  OfflineActiveSession,
  CompletedOfflineSessionRecord,
  OfflineSessionBlock,
  QueuedSessionAction,
  QueuedActionType,
};

/**
 * Wraps any promise with a strict 10-second safety timeout.
 * Prevents hanging UI spinners and stuck states when mobile connections drop.
 */
export async function with10sTimeout<T = any>(
  promise: Promise<T> | PromiseLike<T> | any,
  label: string = "Operation"
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${label} timed out after 10 seconds`));
    }, 10000);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// -------------------------------------------------------------------------
// OFFLINE ACTIVE SESSION STORAGE
// -------------------------------------------------------------------------

export function saveOfflineActiveSession(session: OfflineActiveSession): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEYS.OFFLINE_ACTIVE_SESSION, JSON.stringify(session));
  } catch (err) {
    console.warn("Failed to persist offline active session:", err);
  }
}

export function getOfflineActiveSession(expectedUserId?: string): OfflineActiveSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.OFFLINE_ACTIVE_SESSION);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OfflineActiveSession;
    if (!parsed || typeof parsed !== "object") {
      localStorage.removeItem(STORAGE_KEYS.OFFLINE_ACTIVE_SESSION);
      return null;
    }
    if (expectedUserId && parsed.userId && parsed.userId !== expectedUserId) {
      try {
        localStorage.removeItem(STORAGE_KEYS.OFFLINE_ACTIVE_SESSION);
      } catch {}
      return null;
    }
    return parsed;
  } catch {
    try {
      localStorage.removeItem(STORAGE_KEYS.OFFLINE_ACTIVE_SESSION);
    } catch {}
    return null;
  }
}

export function clearOfflineActiveSession(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEYS.OFFLINE_ACTIVE_SESSION);
  } catch {}
}

export function purgeStaleActiveSession(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEYS.OFFLINE_ACTIVE_SESSION);
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_STUDY);
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_BREAK);
  } catch {}
}

export function saveActiveStudyState(data: {
  userId?: string;
  sessionStartTime?: string;
  lastResumedAt?: string;
  snapshotSeconds?: number;
  focus?: string;
}): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEYS.ACTIVE_STUDY, JSON.stringify(data));
  } catch {}
}

export function getActiveStudyState(): {
  userId?: string;
  sessionStartTime?: string;
  lastResumedAt?: string;
  snapshotSeconds?: number;
  focus?: string;
} | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ACTIVE_STUDY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearActiveStudyState(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_STUDY);
  } catch {}
}

export function updateOfflineActiveSession(
  updater: (prev: OfflineActiveSession) => OfflineActiveSession
): OfflineActiveSession | null {
  const current = getOfflineActiveSession();
  if (!current) return null;
  const updated = updater(current);
  saveOfflineActiveSession(updated);
  return updated;
}

// -------------------------------------------------------------------------
// OFFLINE COMPLETED SESSIONS (For instant History viewing while offline)
// -------------------------------------------------------------------------

export function getOfflineCompletedSessions(expectedUserId?: string): CompletedOfflineSessionRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.OFFLINE_COMPLETED_SESSIONS);
    if (!raw) return [];
    const list = JSON.parse(raw) as CompletedOfflineSessionRecord[];
    if (!Array.isArray(list)) {
      localStorage.removeItem(STORAGE_KEYS.OFFLINE_COMPLETED_SESSIONS);
      return [];
    }

    // 1. Filter out 0-minute ghost records (0 min, 0 break, 0 tasks) or corrupt timestamps
    const valid = list.filter((s) => {
      if (!s || !s.start_time) return false;
      const startMs = new Date(s.start_time).getTime();
      if (isNaN(startMs)) return false;
      const hasTasks = Array.isArray(s.completed_tasks) && s.completed_tasks.length > 0;
      const hasBreak = (s.break_minutes ?? 0) > 0;
      const isZero = (s.duration_minutes ?? 0) === 0;
      if (isZero && !hasTasks && !hasBreak) return false;
      return true;
    });

    // 2. Deduplicate overlapping sessions (start_time within 60s for the same user)
    const deduped: CompletedOfflineSessionRecord[] = [];
    for (const item of valid) {
      const itemStartMs = new Date(item.start_time).getTime();
      const existing = deduped.find(
        (x) =>
          x.user_id === item.user_id &&
          Math.abs(new Date(x.start_time).getTime() - itemStartMs) <= 60000
      );
      if (!existing) {
        deduped.push({ ...item });
      } else {
        // Keep the one with larger duration
        if ((item.duration_minutes ?? 0) > (existing.duration_minutes ?? 0)) {
          existing.duration_minutes = item.duration_minutes;
          existing.end_time = item.end_time;
          existing.id = item.id;
        }
        // Keep larger break minutes
        existing.break_minutes = Math.max(existing.break_minutes ?? 0, item.break_minutes ?? 0);
        // Merge completed tasks
        const existingTaskIds = new Set((existing.completed_tasks || []).map((t) => t.id));
        for (const t of item.completed_tasks || []) {
          if (t && t.id && !existingTaskIds.has(t.id)) {
            existing.completed_tasks = [...(existing.completed_tasks || []), t];
            existingTaskIds.add(t.id);
          }
        }
      }
    }

    if (deduped.length !== list.length) {
      localStorage.setItem(STORAGE_KEYS.OFFLINE_COMPLETED_SESSIONS, JSON.stringify(deduped));
    }

    return expectedUserId ? deduped.filter((s) => s.user_id === expectedUserId) : deduped;
  } catch {
    try {
      localStorage.removeItem(STORAGE_KEYS.OFFLINE_COMPLETED_SESSIONS);
    } catch {}
    return [];
  }
}

export function saveOfflineCompletedSession(session: CompletedOfflineSessionRecord): void {
  if (typeof window === "undefined") return;
  // Ignore 0-minute ghost sessions with no tasks and no break
  if (
    (session.duration_minutes ?? 0) === 0 &&
    (session.break_minutes ?? 0) === 0 &&
    (!session.completed_tasks || session.completed_tasks.length === 0)
  ) {
    return;
  }
  try {
    const list = getOfflineCompletedSessions();
    // Prepend new session
    const filtered = list.filter((s) => s.id !== session.id);
    filtered.unshift(session);
    localStorage.setItem(STORAGE_KEYS.OFFLINE_COMPLETED_SESSIONS, JSON.stringify(filtered));
  } catch (err) {
    console.warn("Failed to save offline completed session:", err);
  }
}

export function removeOfflineCompletedSession(id: string): void {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.OFFLINE_COMPLETED_SESSIONS);
    if (!raw) return;
    const list = JSON.parse(raw) as CompletedOfflineSessionRecord[];
    if (!Array.isArray(list)) return;
    const remaining = list.filter((s) => s.id !== id);
    localStorage.setItem(STORAGE_KEYS.OFFLINE_COMPLETED_SESSIONS, JSON.stringify(remaining));
  } catch {}
}

// -------------------------------------------------------------------------
// PERSISTENT ACTION QUEUE
// -------------------------------------------------------------------------

export function getPendingSessionActions(expectedUserId?: string): QueuedSessionAction[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.OFFLINE_SESSION_QUEUE);
    if (!raw) return [];
    const list = JSON.parse(raw) as QueuedSessionAction[];
    if (!Array.isArray(list)) {
      localStorage.removeItem(STORAGE_KEYS.OFFLINE_SESSION_QUEUE);
      return [];
    }
    return expectedUserId ? list.filter((item) => !item.userId || item.userId === expectedUserId) : list;
  } catch {
    try {
      localStorage.removeItem(STORAGE_KEYS.OFFLINE_SESSION_QUEUE);
    } catch {}
    return [];
  }
}

export function enqueueSessionAction(
  action: QueuedActionType,
  options?: {
    userId?: string;
    elapsedStudySeconds?: number;
    completedTaskIds?: string[];
    payload?: Record<string, unknown>;
    deduplicate?: boolean;
  }
): QueuedSessionAction {
  const newAction: QueuedSessionAction = {
    id: "act_" + Date.now() + "_" + Math.random().toString(36).substring(2, 9),
    action,
    userId: options?.userId,
    createdAtIso: new Date().toISOString(),
    elapsedStudySeconds: options?.elapsedStudySeconds,
    completedTaskIds: options?.completedTaskIds,
    payload: options?.payload,
    attempts: 0,
  };

  if (typeof window !== "undefined") {
    try {
      let queue = getPendingSessionActions();
      if (options?.deduplicate) {
        queue = queue.filter(
          (item) =>
            item.action !== "start_session" &&
            item.action !== "pause_session" &&
            item.action !== "resume_session"
        );
      }
      queue.push(newAction);
      localStorage.setItem(STORAGE_KEYS.OFFLINE_SESSION_QUEUE, JSON.stringify(queue));
    } catch (err) {
      console.warn("Failed to enqueue session action to disk:", err);
    }
  }

  return newAction;
}

export function removeSessionAction(id: string): void {
  if (typeof window === "undefined") return;
  try {
    const queue = getPendingSessionActions();
    const remaining = queue.filter((item) => item.id !== id);
    localStorage.setItem(STORAGE_KEYS.OFFLINE_SESSION_QUEUE, JSON.stringify(remaining));
  } catch {}
}

/**
 * Removes any pending start/pause/resume transition actions once an operation succeeds online.
 */
export function removeActiveTransitionActions(): void {
  if (typeof window === "undefined") return;
  try {
    const queue = getPendingSessionActions();
    const remaining = queue.filter(
      (item) =>
        item.action !== "start_session" &&
        item.action !== "pause_session" &&
        item.action !== "resume_session"
    );
    localStorage.setItem(STORAGE_KEYS.OFFLINE_SESSION_QUEUE, JSON.stringify(remaining));
  } catch {}
}

/**
 * Sanitizes existing disk queue on startup to purge any stale, contradictory transition backlog.
 */
export function sanitizeSessionQueue(): void {
  if (typeof window === "undefined") return;
  try {
    const queue = getPendingSessionActions();
    const activeTransitions = queue.filter(
      (item) =>
        item.action === "start_session" ||
        item.action === "pause_session" ||
        item.action === "resume_session"
    );
    const nonTransitions = queue.filter(
      (item) =>
        item.action !== "start_session" &&
        item.action !== "pause_session" &&
        item.action !== "resume_session"
    );
    // Keep at most the single latest transition
    const latestTransition =
      activeTransitions.length > 0 ? [activeTransitions[activeTransitions.length - 1]] : [];
    const sanitized = [...nonTransitions, ...latestTransition];
    localStorage.setItem(STORAGE_KEYS.OFFLINE_SESSION_QUEUE, JSON.stringify(sanitized));
  } catch {}
}

export function clearPendingSessionActions(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEYS.OFFLINE_SESSION_QUEUE);
  } catch {}
}

// -------------------------------------------------------------------------
// CACHED DATA HELPERS
// -------------------------------------------------------------------------

export function getCachedUserProfile<T = unknown>(expectedUserId?: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CACHED_USER_PROFILE);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as any;
    if (!parsed || typeof parsed !== "object") {
      localStorage.removeItem(STORAGE_KEYS.CACHED_USER_PROFILE);
      return null;
    }
    if (expectedUserId && parsed.id && parsed.id !== expectedUserId) {
      try {
        localStorage.removeItem(STORAGE_KEYS.CACHED_USER_PROFILE);
      } catch {}
      return null;
    }
    return parsed as T;
  } catch {
    try {
      localStorage.removeItem(STORAGE_KEYS.CACHED_USER_PROFILE);
    } catch {}
    return null;
  }
}

export function saveCachedUserProfile(profile: unknown): void {
  if (typeof window === "undefined" || !profile) return;
  try {
    localStorage.setItem(STORAGE_KEYS.CACHED_USER_PROFILE, JSON.stringify(profile));
    localStorage.setItem(STORAGE_KEYS.CACHED_USER_PROFILE + "_ts", Date.now().toString());
  } catch {}
}

function sanitizeGoalTasksArray<T extends { id?: string; completed?: boolean }>(tasks: T[]): T[] {
  if (!Array.isArray(tasks) || tasks.length <= 1) return tasks || [];
  const seen = new Set<string>();
  const result: T[] = [];
  for (const t of tasks) {
    if (!t || !t.id) continue;
    if (seen.has(t.id)) {
      const existing = result.find((x) => x.id === t.id);
      if (existing && t.completed) {
        existing.completed = true;
      }
      continue;
    }
    seen.add(t.id);
    result.push({ ...t });
  }
  return result;
}

export function getCachedActiveGoal<T = unknown>(expectedUserId?: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CACHED_ACTIVE_GOAL);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as any;
    if (!parsed || typeof parsed !== "object") {
      localStorage.removeItem(STORAGE_KEYS.CACHED_ACTIVE_GOAL);
      return null;
    }
    if (expectedUserId && parsed.user_id && parsed.user_id !== expectedUserId) {
      try {
        localStorage.removeItem(STORAGE_KEYS.CACHED_ACTIVE_GOAL);
      } catch {}
      return null;
    }
    if (parsed && Array.isArray(parsed.tasks)) {
      const cleaned = sanitizeGoalTasksArray(parsed.tasks);
      if (cleaned.length !== parsed.tasks.length) {
        parsed.tasks = cleaned;
        localStorage.setItem(STORAGE_KEYS.CACHED_ACTIVE_GOAL, JSON.stringify(parsed));
      }
    }
    return parsed as T;
  } catch {
    try {
      localStorage.removeItem(STORAGE_KEYS.CACHED_ACTIVE_GOAL);
    } catch {}
    return null;
  }
}

export function saveCachedActiveGoal(goal: unknown): void {
  if (typeof window === "undefined") return;
  try {
    if (!goal) {
      localStorage.removeItem(STORAGE_KEYS.CACHED_ACTIVE_GOAL);
      localStorage.removeItem(STORAGE_KEYS.CACHED_ACTIVE_GOAL + "_ts");
    } else {
      const copy = { ...(goal as any) };
      if (Array.isArray(copy.tasks)) {
        copy.tasks = sanitizeGoalTasksArray(copy.tasks);
      }
      localStorage.setItem(STORAGE_KEYS.CACHED_ACTIVE_GOAL, JSON.stringify(copy));
      localStorage.setItem(STORAGE_KEYS.CACHED_ACTIVE_GOAL + "_ts", Date.now().toString());
    }
  } catch {}
}

export function getCachedSessions<T = unknown>(expectedUserId?: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CACHED_SESSIONS);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as any;
    if (!parsed) {
      localStorage.removeItem(STORAGE_KEYS.CACHED_SESSIONS);
      return null;
    }
    if (expectedUserId && Array.isArray(parsed)) {
      const filtered = parsed.filter((s: any) => s && s.user_id === expectedUserId);
      if (filtered.length === 0 && parsed.length > 0) {
        try {
          localStorage.removeItem(STORAGE_KEYS.CACHED_SESSIONS);
        } catch {}
        return null;
      }
      return filtered as T;
    }
    return parsed as T;
  } catch {
    try {
      localStorage.removeItem(STORAGE_KEYS.CACHED_SESSIONS);
    } catch {}
    return null;
  }
}

export function saveCachedSessions(sessions: unknown): void {
  if (typeof window === "undefined" || !sessions) return;
  try {
    localStorage.setItem(STORAGE_KEYS.CACHED_SESSIONS, JSON.stringify(sessions));
    localStorage.setItem(STORAGE_KEYS.CACHED_SESSIONS + "_ts", Date.now().toString());
  } catch {}
}

export function getCachedRoomMembers<T = unknown>(): T[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CACHED_ROOM_MEMBERS);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      localStorage.removeItem(STORAGE_KEYS.CACHED_ROOM_MEMBERS);
      return null;
    }
    return parsed as T[];
  } catch {
    try {
      localStorage.removeItem(STORAGE_KEYS.CACHED_ROOM_MEMBERS);
    } catch {}
    return null;
  }
}

export function saveCachedRoomMembers(members: unknown): void {
  if (typeof window === "undefined" || !members || !Array.isArray(members)) return;
  try {
    localStorage.setItem(STORAGE_KEYS.CACHED_ROOM_MEMBERS, JSON.stringify(members));
    localStorage.setItem(STORAGE_KEYS.CACHED_ROOM_MEMBERS + "_ts", Date.now().toString());
  } catch {}
}

export function clearUserHistoryCache(userId?: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEYS.CACHED_SESSIONS);
    localStorage.removeItem(STORAGE_KEYS.CACHED_SESSIONS + "_ts");
    if (userId) {
      const completed = getOfflineCompletedSessions();
      const remaining = completed.filter((s) => s.user_id !== userId);
      if (remaining.length === 0) {
        localStorage.removeItem(STORAGE_KEYS.OFFLINE_COMPLETED_SESSIONS);
      } else {
        localStorage.setItem(STORAGE_KEYS.OFFLINE_COMPLETED_SESSIONS, JSON.stringify(remaining));
      }
    } else {
      localStorage.removeItem(STORAGE_KEYS.OFFLINE_COMPLETED_SESSIONS);
    }
  } catch {}
}

export function clearAllUserStorageAndCache(userId?: string): void {
  if (typeof window === "undefined") return;
  try {
    if (userId) {
      const cachedProf = getCachedUserProfile<{ id?: string }>();
      if (cachedProf && cachedProf.id === userId) {
        localStorage.removeItem(STORAGE_KEYS.CACHED_USER_PROFILE);
        localStorage.removeItem(STORAGE_KEYS.CACHED_USER_PROFILE + "_ts");
      }

      const cachedGoal = getCachedActiveGoal<{ user_id?: string }>();
      if (cachedGoal && cachedGoal.user_id === userId) {
        localStorage.removeItem(STORAGE_KEYS.CACHED_ACTIVE_GOAL);
        localStorage.removeItem(STORAGE_KEYS.CACHED_ACTIVE_GOAL + "_ts");
      }

      const activeSess = getOfflineActiveSession();
      if (activeSess && activeSess.userId === userId) {
        localStorage.removeItem(STORAGE_KEYS.OFFLINE_ACTIVE_SESSION);
        localStorage.removeItem(STORAGE_KEYS.ACTIVE_STUDY);
        localStorage.removeItem(STORAGE_KEYS.ACTIVE_BREAK);
      }

      const completed = getOfflineCompletedSessions();
      const remainingCompleted = completed.filter((s) => s.user_id !== userId);
      if (remainingCompleted.length === 0) {
        localStorage.removeItem(STORAGE_KEYS.OFFLINE_COMPLETED_SESSIONS);
      } else {
        localStorage.setItem(STORAGE_KEYS.OFFLINE_COMPLETED_SESSIONS, JSON.stringify(remainingCompleted));
      }

      const queue = getPendingSessionActions();
      const remainingQueue = queue.filter((a) => a.userId !== userId);
      if (remainingQueue.length === 0) {
        localStorage.removeItem(STORAGE_KEYS.OFFLINE_SESSION_QUEUE);
      } else {
        localStorage.setItem(STORAGE_KEYS.OFFLINE_SESSION_QUEUE, JSON.stringify(remainingQueue));
      }

      localStorage.removeItem(`studyroom_launch_update_seen_${userId}`);
      localStorage.removeItem(`studyroom_stable_app_v1_0_3_announcement_${userId}`);

      const adminUid = localStorage.getItem(STORAGE_KEYS.ADMIN_UID);
      if (adminUid === userId) {
        localStorage.removeItem(STORAGE_KEYS.ADMIN_UID);
      }
    } else {
      Object.values(STORAGE_KEYS).forEach((key) => {
        localStorage.removeItem(key);
      });

      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.startsWith(STORAGE_KEY_PREFIX) || k === STORAGE_KEYS.PWA_BANNER_DISMISSED)) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));

      if (typeof sessionStorage !== "undefined") {
        const sessionKeysToRemove: string[] = [];
        for (let i = 0; i < sessionStorage.length; i++) {
          const k = sessionStorage.key(i);
          if (k && k.startsWith(STORAGE_KEY_PREFIX)) {
            sessionKeysToRemove.push(k);
          }
        }
        sessionKeysToRemove.forEach((k) => sessionStorage.removeItem(k));
      }
    }
  } catch (err) {
    console.warn("clearAllUserStorageAndCache error:", err);
  }
}

// -------------------------------------------------------------------------
// BACKGROUND QUEUE FLUSH / SYNC WORKER
// -------------------------------------------------------------------------

let isFlushingQueue = false;

type RpcCaller = {
  rpc: (name: string, params?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
};

/**
 * Replays all pending disk-queued actions against Supabase.
 * Atomically handles offline-completed sessions, finish, pause, and resume.
 */
export async function flushSessionActionQueue(
  supabase: any,
  currentUserId?: string
): Promise<{ flushed: number; failed: number }> {
  if (isFlushingQueue) return { flushed: 0, failed: 0 };
  if (typeof window === "undefined" || !navigator.onLine) {
    return { flushed: 0, failed: 0 };
  }

  isFlushingQueue = true;
  let flushedCount = 0;
  let failedCount = 0;

  try {
    const queue = getPendingSessionActions();
    if (queue.length === 0) {
      return { flushed: 0, failed: 0 };
    }

    for (const item of queue) {
      try {
        const itemUserId = item.userId || (item.payload?.session as CompletedOfflineSessionRecord | undefined)?.user_id;
        if (currentUserId && itemUserId && itemUserId !== currentUserId) {
          // Skip actions queued by a different user to prevent cross-account pollution
          continue;
        }

        if (item.action === "offline_session_sync") {
          // Entire session was completed offline
          const sessionPayload = item.payload?.session as CompletedOfflineSessionRecord | undefined;
          if (!sessionPayload) {
            removeSessionAction(item.id);
            continue;
          }

          const tz = process.env.NEXT_PUBLIC_APP_TIMEZONE || "Asia/Kolkata";
          const startDateKey = getDateInTimezone(new Date(sessionPayload.start_time), tz);
          const endDateKey = getDateInTimezone(new Date(sessionPayload.end_time), tz);

          if (startDateKey !== endDateKey) {
            const { hours: untilHours, minutes: untilMins } = getTimeUntilMidnight(new Date(sessionPayload.start_time), tz);
            const minsBeforeMidnight = Math.max(0, untilHours * 60 + untilMins);
            const minsBefore = Math.min(sessionPayload.duration_minutes || 0, minsBeforeMidnight);
            const minsAfter = Math.max(0, (sessionPayload.duration_minutes || 0) - minsBefore);
            const midnightDate = new Date(new Date(sessionPayload.start_time).getTime() + minsBeforeMidnight * 60000);
            const midnightIso = midnightDate.toISOString();

            let part1Id: string | null = null;
            if (minsBefore > 0 || minsAfter === 0) {
              const insertRes1: any = await with10sTimeout(
                supabase
                  .from("study_sessions")
                  .insert({
                    user_id: sessionPayload.user_id,
                    start_time: sessionPayload.start_time,
                    end_time: midnightIso,
                    duration_minutes: minsBefore,
                    break_minutes: 0,
                    completed_tasks: sessionPayload.completed_tasks,
                    split_part: 1,
                  })
                  .select("id")
                  .single(),
                "Upload offline study session part 1"
              );
              if (insertRes1?.error) throw insertRes1.error;
              part1Id = insertRes1.data?.id || null;
            }

            if (minsAfter > 0) {
              const insertRes2: any = await with10sTimeout(
                supabase
                  .from("study_sessions")
                  .insert({
                    user_id: sessionPayload.user_id,
                    start_time: midnightIso,
                    end_time: sessionPayload.end_time,
                    duration_minutes: minsAfter,
                    break_minutes: sessionPayload.break_minutes ?? 0,
                    completed_tasks: sessionPayload.completed_tasks,
                    split_part: 2,
                    sibling_session_id: part1Id,
                  })
                  .select("id")
                  .single(),
                "Upload offline study session part 2"
              );
              if (insertRes2?.error) throw insertRes2.error;
              const part2Id = insertRes2.data?.id || null;

              if (part1Id && part2Id) {
                await with10sTimeout(
                  supabase
                    .from("study_sessions")
                    .update({ sibling_session_id: part2Id })
                    .eq("id", part1Id),
                  "Link offline split session sibling part 1"
                ).catch(() => {});
              }
            }
          } else {
            // 1. Insert into public.study_sessions
            const insertRes: any = await with10sTimeout(
              supabase
                .from("study_sessions")
                .insert({
                  user_id: sessionPayload.user_id,
                  start_time: sessionPayload.start_time,
                  end_time: sessionPayload.end_time,
                  duration_minutes: sessionPayload.duration_minutes,
                  break_minutes: sessionPayload.break_minutes ?? 0,
                  completed_tasks: sessionPayload.completed_tasks,
                })
                .select("id")
                .single(),
              "Upload offline study session"
            );
            const insertedSession = insertRes?.data;
            const sessionErr = insertRes?.error;

            if (sessionErr) throw sessionErr;

            const createdSessionId = insertedSession?.id;

            // 2. Insert blocks linked to this session if blocks exist
            if (sessionPayload.blocks && sessionPayload.blocks.length > 0 && createdSessionId) {
              const blocksToInsert = sessionPayload.blocks.map((b) => ({
                user_id: sessionPayload.user_id,
                block_type: b.block_type,
                start_time: b.start_time,
                end_time: b.end_time || sessionPayload.end_time,
                session_id: createdSessionId,
              }));

              await with10sTimeout(
                supabase.from("session_blocks").insert(blocksToInsert),
                "Upload offline session blocks"
              );
            }
          }

          // 3. If tasks were completed, update daily_goals
          if (item.completedTaskIds && item.completedTaskIds.length > 0) {
            try {
              const { data: activeGoal } = await supabase
                .from("daily_goals")
                .select("id, tasks")
                .eq("user_id", sessionPayload.user_id)
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle();

              if (activeGoal && Array.isArray(activeGoal.tasks)) {
                const updatedTasks = activeGoal.tasks.map((t: { id: string; completed?: boolean; task: string }) => {
                  if (item.completedTaskIds?.includes(t.id)) {
                    return { ...t, completed: true };
                  }
                  return t;
                });

                await supabase
                  .from("daily_goals")
                  .update({ tasks: updatedTasks })
                  .eq("id", activeGoal.id);
              }
            } catch (goalErr) {
              console.warn("Could not sync goal tasks for offline session:", goalErr);
            }
          }

          // 4. Ensure user status is set to offline
          await supabase
            .from("users")
            .update({
              current_status: "offline",
              current_focus: null,
              session_start_time: null,
              last_resumed_at: null,
              break_started_at: null,
              active_study_seconds_snapshot: 0,
              last_offline_at: sessionPayload.end_time,
            })
            .eq("id", sessionPayload.user_id);

          removeOfflineCompletedSession(sessionPayload.id);
          removeSessionAction(item.id);
          flushedCount++;
        } else if (item.action === "finish_session") {
          const { error: rpcErr } = await with10sTimeout(
            (supabase as unknown as RpcCaller).rpc("rpc_finish_session", {
              p_completed_task_ids: item.completedTaskIds || [],
              p_reason: (item.payload?.reason as string) || "manual_stop",
            }),
            "Finish session RPC"
          );

          if (rpcErr) {
            const msg = (rpcErr.message || "").toLowerCase();
            // If session already finished or user is offline, treat as complete
            if (msg.includes("no active session") || msg.includes("not currently on break")) {
              const sessionPayload = item.payload?.session as CompletedOfflineSessionRecord | undefined;
              if (sessionPayload?.id) {
                removeOfflineCompletedSession(sessionPayload.id);
                removeOfflineCompletedSession(sessionPayload.id + "_1");
                removeOfflineCompletedSession(sessionPayload.id + "_2");
              }
              removeSessionAction(item.id);
              flushedCount++;
              continue;
            }
            throw rpcErr;
          }

          const sessionPayload = item.payload?.session as CompletedOfflineSessionRecord | undefined;
          if (sessionPayload?.id) {
            removeOfflineCompletedSession(sessionPayload.id);
            removeOfflineCompletedSession(sessionPayload.id + "_1");
            removeOfflineCompletedSession(sessionPayload.id + "_2");
          }

          removeSessionAction(item.id);
          flushedCount++;
        } else if (item.action === "complete_session_goals" && item.payload?.sessionId) {
          const { error: rpcErr } = await with10sTimeout(
            (supabase as unknown as RpcCaller).rpc("rpc_complete_session_goals", {
              p_session_id: item.payload.sessionId,
              p_completed_task_ids: item.completedTaskIds || [],
            }),
            "Complete session goals RPC"
          );

          if (rpcErr) {
            const msg = (rpcErr.message || "").toLowerCase();
            if (msg.includes("not authenticated")) {
              throw rpcErr;
            }
          }

          removeSessionAction(item.id);
          flushedCount++;
        } else if (item.action === "pause_session") {
          const pausedAtIso = item.createdAtIso || new Date().toISOString();
          const { error: rpcErr } = await with10sTimeout(
            (supabase as unknown as RpcCaller).rpc("rpc_pause_session", {
              p_paused_at: pausedAtIso,
              p_elapsed_study_seconds: item.elapsedStudySeconds,
            }),
            "Pause session RPC"
          );

          if (rpcErr) {
            const msg = (rpcErr.message || "").toLowerCase();
            if (msg.includes("not currently studying") || msg.includes("already on break")) {
              removeSessionAction(item.id);
              flushedCount++;
              continue;
            }
            throw rpcErr;
          }

          removeSessionAction(item.id);
          flushedCount++;
        } else if (item.action === "resume_session") {
          const resumedAtIso = item.createdAtIso || new Date().toISOString();
          const { error: rpcErr } = await with10sTimeout(
            (supabase as unknown as RpcCaller).rpc("rpc_resume_session", {
              p_resumed_at: resumedAtIso,
            }),
            "Resume session RPC"
          );

          if (rpcErr) {
            const msg = (rpcErr.message || "").toLowerCase();
            if (msg.includes("not currently on break") || msg.includes("already studying")) {
              removeSessionAction(item.id);
              flushedCount++;
              continue;
            }
            throw rpcErr;
          }

          removeSessionAction(item.id);
          flushedCount++;
        } else if (item.action === "start_session") {
          const { error: rpcErr } = await with10sTimeout(
            (supabase as unknown as RpcCaller).rpc("rpc_start_session", { p_focus: null }),
            "Start session RPC"
          );

          if (rpcErr) {
            const msg = (rpcErr.message || "").toLowerCase();
            if (msg.includes("already") || msg.includes("active session")) {
              removeSessionAction(item.id);
              flushedCount++;
              continue;
            }
            throw rpcErr;
          }

          removeSessionAction(item.id);
          flushedCount++;
        } else if (item.action === "create_goal" && item.payload?.tasks) {
          const { data, error: rpcErr } = await with10sTimeout(
            (supabase as unknown as RpcCaller).rpc("rpc_create_daily_goal", {
              p_tasks: item.payload.tasks,
            }),
            "Create goal RPC"
          );
          if (rpcErr) {
            const msg = (rpcErr.message || "").toLowerCase();
            if (msg.includes("already exists")) {
              removeSessionAction(item.id);
              flushedCount++;
              continue;
            }
            throw rpcErr;
          }
          removeSessionAction(item.id);
          flushedCount++;
        } else if (item.action === "add_goal_tasks" && item.payload?.tasks) {
          const { error: rpcErr } = await with10sTimeout(
            (supabase as unknown as RpcCaller).rpc("rpc_add_goal_tasks", {
              p_new_tasks: item.payload.tasks,
            }),
            "Add goal tasks RPC"
          );
          if (rpcErr) {
            const msg = (rpcErr.message || "").toLowerCase();
            if (
              msg.includes("no active 20-hour goal set") ||
              msg.includes("no active 24-hour goal set") ||
              (msg.includes("no active") && msg.includes("goal set"))
            ) {
              removeSessionAction(item.id);
              flushedCount++;
              continue;
            }
            throw rpcErr;
          }
          removeSessionAction(item.id);
          flushedCount++;
        }
      } catch (actionErr) {
        failedCount++;
        console.warn(`Sync worker action ${item.action} failed:`, actionErr);
        item.attempts = (item.attempts || 0) + 1;
        item.lastAttemptAt = Date.now();
        // If an item has failed 10+ times and is an RPC with permanent conflict, prevent blocking queue
        if (item.attempts >= 10) {
          removeSessionAction(item.id);
        }
      }
    }

    if (flushedCount > 0 && typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("studyroom_queue_flushed", {
          detail: { flushed: flushedCount },
        })
      );
    }
  } finally {
    isFlushingQueue = false;
  }

  return { flushed: flushedCount, failed: failedCount };
}
