import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useActiveSession } from "@/hooks/useActiveSession";
import { useDailyGoals } from "@/hooks/useDailyGoals";
import { UserProfile } from "@/lib/supabase/types";
import { resetClockCalibration } from "@/lib/time/clockSync";

const mockRpc = vi.fn();
const mockFrom = vi.fn();

const mockClient = {
  from: mockFrom,
  rpc: mockRpc,
};

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => mockClient,
}));

describe("Cross-Device Session Lifecycle & Goal Preservation Audit Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetClockCalibration();
    if (typeof localStorage !== "undefined") {
      localStorage.clear();
    }
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          is: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    });
  });

  afterEach(() => {
    if (typeof localStorage !== "undefined") {
      localStorage.clear();
    }
  });

  describe("Bug #1: 3-Hour Study Session Completion & Recovery on Device B", () => {
    it("surfaces pending goal update modal on Device B when session was finalized on Device A", async () => {
      const sessionId = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
      const deviceBProfile: UserProfile = {
        id: "user-cross-device-1",
        display_name: "Device B User",
        current_status: "offline",
        session_start_time: null,
        break_started_at: null,
        last_resumed_at: null,
        active_study_seconds_snapshot: 0,
        pending_goal_session_id: sessionId,
        pending_goal_seconds: 10800, // 3 hours
        pending_goal_reason: "session_limit",
        state_version: 5,
      } as UserProfile;

      const { result } = renderHook(() => useActiveSession(deviceBProfile));

      // Device B must immediately detect the pending goal session and open the modal
      expect(result.current.isGoalUpdateModalOpen).toBe(true);
      expect(result.current.pendingGoalSessionId).toBe(sessionId);
      expect(result.current.pendingGoalSeconds).toBe(10800);
      expect(result.current.pendingGoalReason).toBe("session_limit");
      expect(result.current.status).toBe("offline");
    });

    it("recovers pending goal update when Device B hits finishSession race returning already_finished", async () => {
      const sessionId = "b2c3d4e5-f6a7-4b8c-8d0e-1f2a3b4c5d6e";
      // Device B thought it was studying before synchronizing (e.g. 5000 seconds in)
      const deviceBProfile: UserProfile = {
        id: "user-cross-device-2",
        display_name: "Device B User 2",
        current_status: "studying",
        session_start_time: new Date(Date.now() - 5000 * 1000).toISOString(),
        break_started_at: null,
        last_resumed_at: new Date(Date.now() - 5000 * 1000).toISOString(),
        active_study_seconds_snapshot: 0,
        pending_goal_session_id: sessionId,
        pending_goal_seconds: 5000,
        pending_goal_reason: "manual_stop",
        state_version: 4,
      } as UserProfile;

      mockRpc.mockImplementation((fn: string) => {
        if (fn === "rpc_finish_session") {
          return Promise.resolve({
            data: { success: true, already_finished: true },
            error: null,
          });
        }
        if (fn === "rpc_get_pending_goal_session") {
          return Promise.resolve({
            data: {
              has_pending: true,
              session_id: sessionId,
              duration_minutes: 83,
              pending_goal_seconds: 5000,
              pending_goal_reason: "manual_stop",
            },
            error: null,
          });
        }
        return Promise.resolve({ data: { success: true }, error: null });
      });

      const { result } = renderHook(() => useActiveSession(deviceBProfile));

      // Device B attempts to finish the session
      await act(async () => {
        const finishRes = await result.current.finishSession();
        expect(finishRes?.already_finished).toBe(true);
      });

      // Instead of discarding the session, Device B must retain the goal update opportunity!
      expect(result.current.isGoalUpdateModalOpen).toBe(true);
      expect(result.current.pendingGoalSessionId).toBe(sessionId);
      expect(result.current.pendingGoalSeconds).toBe(5000);
      expect(result.current.pendingGoalReason).toBe("manual_stop");
    });

    it("successfully submits completed goals on Device B with the target session ID", async () => {
      const sessionId = "c3d4e5f6-a7b8-4c9d-8e1f-2a3b4c5d6e7f";
      const deviceBProfile: UserProfile = {
        id: "user-cross-device-3",
        display_name: "Device B User 3",
        current_status: "offline",
        pending_goal_session_id: sessionId,
        pending_goal_seconds: 10800,
        pending_goal_reason: "session_limit",
      } as UserProfile;

      mockRpc.mockResolvedValue({
        data: { success: true },
        error: null,
      });

      const { result } = renderHook(() => useActiveSession(deviceBProfile));

      expect(result.current.pendingGoalSessionId).toBe(sessionId);

      await act(async () => {
        await result.current.completeSessionGoals(sessionId, ["task-1", "task-2"]);
      });

      expect(mockRpc).toHaveBeenCalledWith("rpc_complete_session_goals", {
        p_session_id: sessionId,
        p_completed_task_ids: ["task-1", "task-2"],
      });
      expect(result.current.isGoalUpdateModalOpen).toBe(false);
      expect(result.current.pendingGoalSessionId).toBeNull();
    });
  });

  describe("Bug #2: 1-Hour Break Expiry Completion & Recovery on Device B", () => {
    it("reconciles break expiry on Device B, opens goal modal with study seconds, and sets pendingGoalSessionId", async () => {
      const sessionId = "d4e5f6a7-b8c9-4d0e-8f2a-3b4c5d6e7f8a";
      const deviceBProfile: UserProfile = {
        id: "user-break-1",
        display_name: "Break User",
        current_status: "break",
        session_start_time: new Date(Date.now() - 7200 * 1000).toISOString(),
        break_started_at: new Date(Date.now() - 3700 * 1000).toISOString(), // > 1 hour
        active_study_seconds_snapshot: 3500,
        state_version: 6,
      } as UserProfile;

      mockRpc.mockImplementation((fn: string) => {
        if (fn === "rpc_synchronize_session" || fn === "rpc_finish_session") {
          return Promise.resolve({
            data: {
              success: true,
              status: "offline",
              repaired: true,
              reason: "break_expired",
              session_id: sessionId,
              pending_goal_session_id: sessionId,
              pending_goal_seconds: 3500,
              pending_goal_reason: "break_expired",
              elapsed_seconds: 3500,
              state_version: 7,
              server_now: new Date().toISOString(),
            },
            error: null,
          });
        }
        return Promise.resolve({ data: { success: true }, error: null });
      });

      const updateProfileOptimistic = vi.fn();
      const { result } = renderHook(() =>
        useActiveSession(deviceBProfile, undefined, updateProfileOptimistic)
      );

      await act(async () => {
        await result.current.forceSynchronizeSession();
      });

      // Break notice and Goal Update Modal must both recognize the pending goal session!
      expect(result.current.isBreakExpiredNoticeOpen).toBe(true);
      expect(result.current.isGoalUpdateModalOpen).toBe(true);
      expect(result.current.pendingGoalSessionId).toBe(sessionId);
      expect(result.current.pendingGoalSeconds).toBe(3500);
      expect(result.current.pendingGoalReason).toBe("break_expired");

      // Optimistic profile update must contain pending_goal_session_id so other components stay in sync
      expect(updateProfileOptimistic).toHaveBeenCalledWith(
        expect.objectContaining({
          current_status: "offline",
          pending_goal_session_id: sessionId,
          pending_goal_seconds: 3500,
          pending_goal_reason: "break_expired",
        })
      );
    });

    it("ensures closing break expired notice does not clear pending_goal_session_id before tasks are saved", async () => {
      const sessionId = "e5f6a7b8-c9d0-4e1f-8a3b-4c5d6e7f8a9b";
      const deviceBProfile: UserProfile = {
        id: "user-break-2",
        display_name: "Break User 2",
        current_status: "offline",
        last_break_expired_study_seconds: 2400,
        pending_goal_session_id: sessionId,
        pending_goal_seconds: 2400,
        pending_goal_reason: "break_expired",
      } as UserProfile;

      mockRpc.mockResolvedValue({
        data: { success: true },
        error: null,
      });

      const { result } = renderHook(() => useActiveSession(deviceBProfile));

      expect(result.current.isBreakExpiredNoticeOpen).toBe(true);
      expect(result.current.pendingGoalSessionId).toBe(sessionId);

      // Dismiss the banner notice
      await act(async () => {
        await result.current.closeBreakExpiredNotice();
      });

      // Banner is closed, but pendingGoalSessionId MUST STILL BE PRESERVED for the goal update modal!
      expect(result.current.isBreakExpiredNoticeOpen).toBe(false);
      expect(result.current.pendingGoalSessionId).toBe(sessionId);
      expect(mockRpc).toHaveBeenCalledWith("rpc_acknowledge_break_expiry");
    });
  });

  describe("Modal Dismissal & Persistence Safety: Dismissing Must Never Destroy Pending Goals", () => {
    it("preserves pendingGoalSessionId when modal is dismissed without submitting or skipping", async () => {
      const sessionId = "f6a7b8c9-d0e1-4f2a-8b3c-4d5e6f7a8b9c";
      const profileWithPending: UserProfile = {
        id: "user-dismiss-1",
        display_name: "Dismiss User",
        current_status: "offline",
        pending_goal_session_id: sessionId,
        pending_goal_seconds: 7200,
        pending_goal_reason: "manual_stop",
      } as UserProfile;

      const { result } = renderHook(() => useActiveSession(profileWithPending));

      expect(result.current.isGoalUpdateModalOpen).toBe(true);
      expect(result.current.pendingGoalSessionId).toBe(sessionId);

      // User dismisses modal (clicks X or presses Escape)
      await act(async () => {
        await result.current.closeGoalUpdateModal();
      });

      // UI modal is closed, but RPC complete_session_goals MUST NOT be called!
      expect(result.current.isGoalUpdateModalOpen).toBe(false);
      expect(mockRpc).not.toHaveBeenCalledWith("rpc_complete_session_goals", expect.anything());

      // Pending session remains intact on server and can be reopened
      expect(profileWithPending.pending_goal_session_id).toBe(sessionId);
    });

    it("finalizes session on server when user explicitly clicks Skip goals", async () => {
      const sessionId = "a7b8c9d0-e1f2-4a3b-8c4d-5e6f7a8b9c0d";
      const profileWithPending: UserProfile = {
        id: "user-skip-1",
        display_name: "Skip User",
        current_status: "offline",
        pending_goal_session_id: sessionId,
        pending_goal_seconds: 3600,
        pending_goal_reason: "manual_stop",
      } as UserProfile;

      mockRpc.mockResolvedValue({
        data: { success: true, session_id: sessionId, completed_tasks: [] },
        error: null,
      });

      const { result } = renderHook(() => useActiveSession(profileWithPending));

      // User explicitly skips
      await act(async () => {
        await result.current.completeSessionGoals(sessionId, []);
      });

      expect(mockRpc).toHaveBeenCalledWith("rpc_complete_session_goals", {
        p_session_id: sessionId,
        p_completed_task_ids: [],
      });
      expect(result.current.pendingGoalSessionId).toBeNull();
      expect(result.current.isGoalUpdateModalOpen).toBe(false);
    });

    it("enqueues complete_session_goals to offline queue if network fails during submission", async () => {
      const sessionId = "b8c9d0e1-f2a3-4b4c-8d5e-6f7a8b9c0d1e";
      const profileWithPending: UserProfile = {
        id: "user-net-err-1",
        display_name: "Net Err User",
        current_status: "offline",
        pending_goal_session_id: sessionId,
        pending_goal_seconds: 3600,
        pending_goal_reason: "manual_stop",
      } as UserProfile;

      mockRpc.mockResolvedValue({
        data: null,
        error: { message: "Network connection lost", code: "PGRST000" },
      });

      const { result } = renderHook(() => useActiveSession(profileWithPending));

      await act(async () => {
        await result.current.completeSessionGoals(sessionId, ["task-1"]);
      });

      // Must have called RPC
      expect(mockRpc).toHaveBeenCalledWith("rpc_complete_session_goals", {
        p_session_id: sessionId,
        p_completed_task_ids: ["task-1"],
      });

      // Actions queue should have the enqueued item for background sync
      const rawQueue = localStorage.getItem("studyroom_offline_session_queue");
      expect(rawQueue).not.toBeNull();
      const queue = JSON.parse(rawQueue || "[]");
      expect(queue.some((item: any) => item.action === "complete_session_goals")).toBe(true);
    });
  });

  describe("Goal Grace Period: Preserving 20-Hour Goals After Session Completion", () => {
    it("preserves active goal tasks in useDailyGoals when session just finished and session_start_time is null", async () => {
      const now = new Date();
      // Goal created 21 hours ago, expired 1 hour ago (within 20-hour grace window)
      const expiredGoal = {
        id: "goal-grace-1",
        user_id: "user-grace-1",
        created_at: new Date(now.getTime() - 21 * 3600 * 1000).toISOString(),
        expires_at: new Date(now.getTime() - 1 * 3600 * 1000).toISOString(),
        tasks: [
          { id: "task-1", task: "Read Chapter 4", completed: false },
          { id: "task-2", task: "Solve 10 problems", completed: false },
        ],
      };

      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: expiredGoal, error: null }),
              }),
            }),
          }),
        }),
      });

      // When session just finished, status is offline, sessionStartTime is null,
      // but isSessionActive is true because pendingGoalSessionId is present
      const sessionStartTime = null;
      const isSessionActive = true;

      const { result } = renderHook(() =>
        useDailyGoals("user-grace-1", sessionStartTime, isSessionActive)
      );

      await waitFor(() => {
        expect(result.current.activeGoal).not.toBeNull();
      });

      // The goal must NOT be wiped to null; tasks must be accessible for checking off!
      expect(result.current.activeGoal?.id).toBe("goal-grace-1");
      expect(result.current.activeGoal?.tasks).toHaveLength(2);
      expect(result.current.activeGoal?.tasks[0].task).toBe("Read Chapter 4");
    });
  });
});
