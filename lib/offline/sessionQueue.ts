import { SupabaseClient } from "@supabase/supabase-js";
import {
  STORAGE_KEYS,
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

export function getOfflineActiveSession(): OfflineActiveSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.OFFLINE_ACTIVE_SESSION);
    if (!raw) return null;
    return JSON.parse(raw) as OfflineActiveSession;
  } catch {
    return null;
  }
}

export function clearOfflineActiveSession(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEYS.OFFLINE_ACTIVE_SESSION);
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

export function getOfflineCompletedSessions(): CompletedOfflineSessionRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.OFFLINE_COMPLETED_SESSIONS);
    if (!raw) return [];
    return JSON.parse(raw) as CompletedOfflineSessionRecord[];
  } catch {
    return [];
  }
}

export function saveOfflineCompletedSession(session: CompletedOfflineSessionRecord): void {
  if (typeof window === "undefined") return;
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
    const list = getOfflineCompletedSessions();
    const remaining = list.filter((s) => s.id !== id);
    localStorage.setItem(STORAGE_KEYS.OFFLINE_COMPLETED_SESSIONS, JSON.stringify(remaining));
  } catch {}
}

// -------------------------------------------------------------------------
// PERSISTENT ACTION QUEUE
// -------------------------------------------------------------------------

export function getPendingSessionActions(): QueuedSessionAction[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.OFFLINE_SESSION_QUEUE);
    if (!raw) return [];
    return JSON.parse(raw) as QueuedSessionAction[];
  } catch {
    return [];
  }
}

export function enqueueSessionAction(
  action: QueuedActionType,
  options?: {
    elapsedStudySeconds?: number;
    completedTaskIds?: string[];
    payload?: Record<string, unknown>;
    deduplicate?: boolean;
  }
): QueuedSessionAction {
  const newAction: QueuedSessionAction = {
    id: "act_" + Date.now() + "_" + Math.random().toString(36).substring(2, 9),
    action,
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

export function getCachedUserProfile<T = unknown>(): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CACHED_USER_PROFILE);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function saveCachedUserProfile(profile: unknown): void {
  if (typeof window === "undefined" || !profile) return;
  try {
    localStorage.setItem(STORAGE_KEYS.CACHED_USER_PROFILE, JSON.stringify(profile));
  } catch {}
}

export function getCachedActiveGoal<T = unknown>(): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CACHED_ACTIVE_GOAL);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function saveCachedActiveGoal(goal: unknown): void {
  if (typeof window === "undefined") return;
  try {
    if (!goal) {
      localStorage.removeItem(STORAGE_KEYS.CACHED_ACTIVE_GOAL);
    } else {
      localStorage.setItem(STORAGE_KEYS.CACHED_ACTIVE_GOAL, JSON.stringify(goal));
    }
  } catch {}
}

export function getCachedSessions<T = unknown>(): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CACHED_SESSIONS);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function saveCachedSessions(sessions: unknown): void {
  if (typeof window === "undefined" || !sessions) return;
  try {
    localStorage.setItem(STORAGE_KEYS.CACHED_SESSIONS, JSON.stringify(sessions));
  } catch {}
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
  supabase: any
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

            if (minsBefore > 0 || minsAfter === 0) {
              const insertRes1: any = await with10sTimeout(
                supabase
                  .from("study_sessions")
                  .insert({
                    user_id: sessionPayload.user_id,
                    start_time: sessionPayload.start_time,
                    end_time: midnightIso,
                    duration_minutes: minsBefore,
                    completed_tasks: minsAfter === 0 ? sessionPayload.completed_tasks : [],
                  })
                  .select("id")
                  .single(),
                "Upload offline study session part 1"
              );
              if (insertRes1?.error) throw insertRes1.error;
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
                    completed_tasks: sessionPayload.completed_tasks,
                  })
                  .select("id")
                  .single(),
                "Upload offline study session part 2"
              );
              if (insertRes2?.error) throw insertRes2.error;
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
          // Session was started online and finished offline or during network hang
          const { error: rpcErr } = await with10sTimeout(
            (supabase as unknown as RpcCaller).rpc("rpc_finish_session", {
              p_completed_task_ids: item.completedTaskIds || [],
            }),
            "Finish session RPC"
          );

          if (rpcErr) {
            const msg = (rpcErr.message || "").toLowerCase();
            // If session already finished or user is offline, treat as complete
            if (msg.includes("no active session") || msg.includes("not currently on break")) {
              removeSessionAction(item.id);
              flushedCount++;
              continue;
            }
            throw rpcErr;
          }

          removeSessionAction(item.id);
          flushedCount++;
        } else if (item.action === "pause_session") {
          const { error: rpcErr } = await with10sTimeout(
            (supabase as unknown as RpcCaller).rpc("rpc_pause_session"),
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
          const { error: rpcErr } = await with10sTimeout(
            (supabase as unknown as RpcCaller).rpc("rpc_resume_session"),
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
          await with10sTimeout(
            (supabase as unknown as RpcCaller).rpc("rpc_create_daily_goal", {
              p_tasks: item.payload.tasks,
            }),
            "Create goal RPC"
          );
          removeSessionAction(item.id);
          flushedCount++;
        } else if (item.action === "add_goal_tasks" && item.payload?.tasks) {
          await with10sTimeout(
            (supabase as unknown as RpcCaller).rpc("rpc_add_goal_tasks", {
              p_new_tasks: item.payload.tasks,
            }),
            "Add goal tasks RPC"
          );
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
