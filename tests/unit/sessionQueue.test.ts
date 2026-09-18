import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  with10sTimeout,
  saveOfflineActiveSession,
  getOfflineActiveSession,
  clearOfflineActiveSession,
  updateOfflineActiveSession,
  saveOfflineCompletedSession,
  getOfflineCompletedSessions,
  removeOfflineCompletedSession,
  enqueueSessionAction,
  getPendingSessionActions,
  removeSessionAction,
  clearPendingSessionActions,
  flushSessionActionQueue,
  getCachedActiveGoal,
  saveCachedActiveGoal,
  getCachedUserProfile,
  saveCachedUserProfile,
  getCachedSessions,
  saveCachedSessions,
  clearUserHistoryCache,
  clearAllUserStorageAndCache,
} from "@/lib/offline/sessionQueue";
import { STORAGE_KEYS, OfflineActiveSession, CompletedOfflineSessionRecord } from "@/lib/offline/storageKeys";

describe("Offline Session Queue & Durability Engine", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe("with10sTimeout", () => {
    it("resolves immediately if inner promise resolves quickly", async () => {
      const res = await with10sTimeout(Promise.resolve("hello"), "Quick task");
      expect(res).toBe("hello");
    });

    it("rejects if inner promise takes more than timeout duration", async () => {
      vi.useFakeTimers();
      const hangingPromise = new Promise((resolve) => setTimeout(resolve, 20000));
      const wrapped = with10sTimeout(hangingPromise, "Hanging RPC");

      vi.advanceTimersByTime(11000);

      await expect(wrapped).rejects.toThrow("Hanging RPC timed out after 10 seconds");
      vi.useRealTimers();
    });
  });

  describe("Offline Active Session Storage", () => {
    const mockSession: OfflineActiveSession = {
      sessionId: "sess_123",
      userId: "user_abc",
      startTime: new Date().toISOString(),
      status: "studying",
      elapsedStudySeconds: 45,
      lastResumedAt: new Date().toISOString(),
      breakStartedAt: null,
      blocks: [
        {
          id: "b1",
          block_type: "study",
          start_time: new Date().toISOString(),
          end_time: null,
        },
      ],
      updatedAt: new Date().toISOString(),
    };

    it("saves and retrieves offline active session from disk", () => {
      expect(getOfflineActiveSession()).toBeNull();

      saveOfflineActiveSession(mockSession);
      const retrieved = getOfflineActiveSession();
      expect(retrieved).not.toBeNull();
      expect(retrieved?.sessionId).toBe("sess_123");
      expect(retrieved?.status).toBe("studying");
      expect(retrieved?.blocks).toHaveLength(1);
    });

    it("updates offline active session cleanly", () => {
      saveOfflineActiveSession(mockSession);
      updateOfflineActiveSession((prev) => ({
        ...prev,
        status: "break",
        breakStartedAt: "2026-09-15T10:00:00.000Z",
      }));

      const updated = getOfflineActiveSession();
      expect(updated?.status).toBe("break");
      expect(updated?.breakStartedAt).toBe("2026-09-15T10:00:00.000Z");
    });

    it("clears offline active session upon stop", () => {
      saveOfflineActiveSession(mockSession);
      clearOfflineActiveSession();
      expect(getOfflineActiveSession()).toBeNull();
    });
  });

  describe("Offline Completed Sessions Cache", () => {
    const completedRecord: CompletedOfflineSessionRecord = {
      id: "offline_completed_1",
      user_id: "user_abc",
      start_time: "2026-09-15T09:00:00.000Z",
      end_time: "2026-09-15T10:00:00.000Z",
      duration_minutes: 60,
      completed_tasks: [{ id: "t1", task: "Solve Physics problems" }],
      blocks: [],
      created_at: "2026-09-15T10:00:00.000Z",
      is_offline_created: true,
    };

    it("saves completed session to local history cache and reads back", () => {
      expect(getOfflineCompletedSessions()).toHaveLength(0);

      saveOfflineCompletedSession(completedRecord);
      const list = getOfflineCompletedSessions();
      expect(list).toHaveLength(1);
      expect(list[0].id).toBe("offline_completed_1");
      expect(list[0].completed_tasks).toHaveLength(1);

      removeOfflineCompletedSession("offline_completed_1");
      expect(getOfflineCompletedSessions()).toHaveLength(0);
    });
  });

  describe("Persistent Action Queue", () => {
    it("enqueues and retrieves actions in chronological order", () => {
      clearPendingSessionActions();
      expect(getPendingSessionActions()).toHaveLength(0);

      const a1 = enqueueSessionAction("start_session");
      const a2 = enqueueSessionAction("pause_session", { elapsedStudySeconds: 120 });
      const a3 = enqueueSessionAction("finish_session", { completedTaskIds: ["t1", "t2"] });

      const pending = getPendingSessionActions();
      expect(pending).toHaveLength(3);
      expect(pending[0].action).toBe("start_session");
      expect(pending[1].action).toBe("pause_session");
      expect(pending[1].elapsedStudySeconds).toBe(120);
      expect(pending[2].action).toBe("finish_session");
      expect(pending[2].completedTaskIds).toEqual(["t1", "t2"]);

      removeSessionAction(a2.id);
      const remaining = getPendingSessionActions();
      expect(remaining).toHaveLength(2);
      expect(remaining.map((a) => a.id)).toEqual([a1.id, a3.id]);
    });
  });

  describe("flushSessionActionQueue Reconnection Sync", () => {
    it("does not flush when navigator is offline", async () => {
      Object.defineProperty(navigator, "onLine", { value: false, configurable: true });

      enqueueSessionAction("start_session");
      const mockSupabase = {} as any;

      const result = await flushSessionActionQueue(mockSupabase);
      expect(result.flushed).toBe(0);
      expect(getPendingSessionActions()).toHaveLength(1);

      Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    });

    it("flushes start, pause, and finish actions against Supabase RPCs when online", async () => {
      Object.defineProperty(navigator, "onLine", { value: true, configurable: true });

      const mockRpc = vi.fn().mockResolvedValue({ data: { success: true }, error: null });
      const mockSupabase = { rpc: mockRpc } as any;

      enqueueSessionAction("start_session");
      enqueueSessionAction("pause_session");
      enqueueSessionAction("finish_session", { completedTaskIds: ["task-1"] });

      const result = await flushSessionActionQueue(mockSupabase);
      expect(result.flushed).toBe(3);
      expect(mockRpc).toHaveBeenCalledWith("rpc_start_session", { p_focus: null });
      expect(mockRpc).toHaveBeenCalledWith("rpc_pause_session", expect.objectContaining({
        p_paused_at: expect.any(String),
      }));
      expect(mockRpc).toHaveBeenCalledWith("rpc_finish_session", {
        p_completed_task_ids: ["task-1"],
        p_reason: "manual_stop",
      });

      expect(getPendingSessionActions()).toHaveLength(0);
    });

    it("idempotently handles 'no active session' response without looping", async () => {
      Object.defineProperty(navigator, "onLine", { value: true, configurable: true });

      const mockRpc = vi.fn().mockResolvedValue({
        data: null,
        error: { message: "No active session found" },
      });
      const mockSupabase = { rpc: mockRpc } as any;

      enqueueSessionAction("finish_session", { completedTaskIds: [] });
      const result = await flushSessionActionQueue(mockSupabase);

      // Treated as complete, item purged from queue
      expect(result.flushed).toBe(1);
      expect(getPendingSessionActions()).toHaveLength(0);
    });
  });

  describe("Cached Active Goal Storage & Deduplication", () => {
    it("deduplicates tasks when saving active goal", () => {
      const goalWithDupes = {
        id: "goal-1",
        tasks: [
          { id: "task-1", task: "Task 1", completed: false },
          { id: "task-dup", task: "Exercise", completed: false },
          { id: "task-dup", task: "Exercise", completed: true },
        ],
      };
      saveCachedActiveGoal(goalWithDupes);

      const retrieved: any = getCachedActiveGoal();
      expect(retrieved.tasks).toHaveLength(2);
      expect(retrieved.tasks.map((t: any) => t.id)).toEqual(["task-1", "task-dup"]);
      expect(retrieved.tasks[1].completed).toBe(true);
    });

    it("deduplicates corrupt tasks on retrieval and updates localStorage", () => {
      const corruptRaw = {
        id: "goal-2",
        tasks: [
          { id: "task-1789647748357-0", task: "Exercise", completed: false },
          { id: "task-1789647748357-0", task: "Exercise", completed: false },
        ],
      };
      localStorage.setItem(STORAGE_KEYS.CACHED_ACTIVE_GOAL, JSON.stringify(corruptRaw));

      const retrieved: any = getCachedActiveGoal();
      expect(retrieved.tasks).toHaveLength(1);
      expect(retrieved.tasks[0].id).toBe("task-1789647748357-0");

      // Verify localStorage was healed
      const inStorage = JSON.parse(localStorage.getItem(STORAGE_KEYS.CACHED_ACTIVE_GOAL)!);
      expect(inStorage.tasks).toHaveLength(1);
    });
  });

  describe("Multi-User Storage Isolation & Cache Clearing", () => {
    it("clearAllUserStorageAndCache purges all studyroom keys and leaves foreign keys intact", () => {
      localStorage.setItem("studyroom_custom_key", "val1");
      localStorage.setItem("other_app_token", "secret123");
      sessionStorage.setItem("studyroom_temp", "val2");
      sessionStorage.setItem("foreign_session", "session456");

      saveCachedUserProfile({ id: "u1", full_name: "Alice" } as any);
      saveCachedActiveGoal({ id: "g1", user_id: "u1", tasks: [] });

      clearAllUserStorageAndCache();

      // StudyRoom keys purged
      expect(localStorage.getItem("studyroom_custom_key")).toBeNull();
      expect(sessionStorage.getItem("studyroom_temp")).toBeNull();
      expect(getCachedUserProfile()).toBeNull();
      expect(getCachedActiveGoal()).toBeNull();

      // Foreign keys preserved
      expect(localStorage.getItem("other_app_token")).toBe("secret123");
      expect(sessionStorage.getItem("foreign_session")).toBe("session456");
    });

    it("scopes getCachedUserProfile to expectedUserId and purges stale mismatched user profile", () => {
      saveCachedUserProfile({ id: "user-alpha", full_name: "Alpha User" } as any);

      // Requesting with matching user ID returns profile
      const alpha = getCachedUserProfile<{ id: string }>("user-alpha");
      expect(alpha?.id).toBe("user-alpha");

      // Requesting with different user ID returns null and purges cache
      const beta = getCachedUserProfile("user-beta");
      expect(beta).toBeNull();
      expect(localStorage.getItem(STORAGE_KEYS.CACHED_USER_PROFILE)).toBeNull();
    });

    it("scopes getCachedActiveGoal to expectedUserId and purges stale mismatched user goal", () => {
      saveCachedActiveGoal({ id: "goal-alpha", user_id: "user-alpha", tasks: [] });

      // Match returns goal
      expect(getCachedActiveGoal<{ id: string }>("user-alpha")?.id).toBe("goal-alpha");

      // Mismatch returns null and purges
      expect(getCachedActiveGoal("user-beta")).toBeNull();
      expect(localStorage.getItem(STORAGE_KEYS.CACHED_ACTIVE_GOAL)).toBeNull();
    });

    it("scopes getOfflineActiveSession to expectedUserId and purges stale session", () => {
      saveOfflineActiveSession({
        sessionId: "sess-alpha",
        userId: "user-alpha",
        startTime: new Date().toISOString(),
        status: "studying",
        elapsedStudySeconds: 100,
        lastResumedAt: new Date().toISOString(),
        breakStartedAt: null,
        blocks: [],
        updatedAt: new Date().toISOString(),
      });

      // Match returns session
      expect(getOfflineActiveSession("user-alpha")?.sessionId).toBe("sess-alpha");

      // Mismatch returns null and purges
      expect(getOfflineActiveSession("user-beta")).toBeNull();
      expect(localStorage.getItem(STORAGE_KEYS.OFFLINE_ACTIVE_SESSION)).toBeNull();
    });

    it("scopes getOfflineCompletedSessions to expectedUserId", () => {
      const records: CompletedOfflineSessionRecord[] = [
        {
          id: "rec-alpha",
          user_id: "user-alpha",
          start_time: "2026-09-18T10:00:00.000Z",
          end_time: "2026-09-18T11:00:00.000Z",
          duration_minutes: 60,
          break_minutes: 0,
          completed_tasks: [],
          blocks: [],
          created_at: new Date().toISOString(),
          is_offline_created: true,
        },
        {
          id: "rec-beta",
          user_id: "user-beta",
          start_time: "2026-09-18T12:00:00.000Z",
          end_time: "2026-09-18T14:00:00.000Z",
          duration_minutes: 120,
          break_minutes: 0,
          completed_tasks: [],
          blocks: [],
          created_at: new Date().toISOString(),
          is_offline_created: true,
        },
      ];

      records.forEach((r) => saveOfflineCompletedSession(r));

      const alphaOnly = getOfflineCompletedSessions("user-alpha");
      expect(alphaOnly).toHaveLength(1);
      expect(alphaOnly[0].user_id).toBe("user-alpha");

      const all = getOfflineCompletedSessions();
      expect(all).toHaveLength(2);
    });

    it("scopes getCachedSessions to expectedUserId and purges mismatched history cache", () => {
      saveCachedSessions([
        {
          id: "sess-1",
          user_id: "user-alpha",
          start_time: new Date().toISOString(),
          duration_minutes: 30,
        } as any,
      ]);

      expect(getCachedSessions("user-alpha")).toHaveLength(1);
      // Mismatched user returns null and purges cache
      expect(getCachedSessions("user-beta")).toBeNull();
      expect(localStorage.getItem(STORAGE_KEYS.CACHED_SESSIONS)).toBeNull();
    });

    it("flushSessionActionQueue does not replay actions belonging to another user", async () => {
      Object.defineProperty(navigator, "onLine", { value: true, configurable: true });

      const mockRpc = vi.fn().mockResolvedValue({ data: { success: true }, error: null });
      const mockSupabase = { rpc: mockRpc } as any;

      // User A enqueues an action
      enqueueSessionAction("finish_session", { completedTaskIds: [], userId: "user-alpha" });

      // Current user is User B -> Action should be retained in queue, NOT flushed
      const result = await flushSessionActionQueue(mockSupabase, "user-beta");
      expect(result.flushed).toBe(0);
      expect(mockRpc).not.toHaveBeenCalled();

      // Flushed when User A returns
      const flushAlpha = await flushSessionActionQueue(mockSupabase, "user-alpha");
      expect(flushAlpha.flushed).toBe(1);
      expect(mockRpc).toHaveBeenCalledWith("rpc_finish_session", {
        p_completed_task_ids: [],
        p_reason: "manual_stop",
      });
    });

    it("cleans up corrupted JSON gracefully without crashing", () => {
      localStorage.setItem(STORAGE_KEYS.OFFLINE_ACTIVE_SESSION, "{invalid-json-data");
      expect(getOfflineActiveSession()).toBeNull();
      expect(localStorage.getItem(STORAGE_KEYS.OFFLINE_ACTIVE_SESSION)).toBeNull();

      localStorage.setItem(STORAGE_KEYS.CACHED_USER_PROFILE, "not-a-json");
      expect(getCachedUserProfile()).toBeNull();
      expect(localStorage.getItem(STORAGE_KEYS.CACHED_USER_PROFILE)).toBeNull();

      localStorage.setItem(STORAGE_KEYS.CACHED_SESSIONS, "{broken[");
      expect(getCachedSessions()).toBeNull();
      expect(localStorage.getItem(STORAGE_KEYS.CACHED_SESSIONS)).toBeNull();

      localStorage.setItem(STORAGE_KEYS.OFFLINE_SESSION_QUEUE, "[broken");
      expect(getPendingSessionActions()).toEqual([]);
      expect(localStorage.getItem(STORAGE_KEYS.OFFLINE_SESSION_QUEUE)).toBeNull();
    });
  });
});

