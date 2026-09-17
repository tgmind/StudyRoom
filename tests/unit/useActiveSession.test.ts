import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useActiveSession } from "@/hooks/useActiveSession";
import { UserProfile } from "@/lib/supabase/types";

const mockRpc = vi.fn();
const mockFrom = vi.fn();

const mockClient = {
  from: mockFrom,
  rpc: mockRpc,
};

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => mockClient,
}));

describe("useActiveSession Hook - Break Expiry & RPC Resilience", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    if (typeof localStorage !== "undefined") {
      localStorage.clear();
    }
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          is: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      }),
    });
  });

  it("treats expired break user as effectively offline and opens notice on timeout check", async () => {
    const seventyMinutesAgo = new Date(Date.now() - 70 * 60 * 1000).toISOString();

    const expiredProfile = {
      id: "user-1",
      display_name: "Test User",
      current_status: "break",
      session_start_time: new Date(Date.now() - 120 * 60 * 1000).toISOString(),
      break_started_at: seventyMinutesAgo,
      active_study_seconds_snapshot: 3000,
    } as unknown as UserProfile;

    mockRpc.mockResolvedValue({
      data: { success: true },
      error: null,
    });

    const onStatusChange = vi.fn();
    const { result } = renderHook(() => useActiveSession(expiredProfile, onStatusChange));

    // Effective status should be offline since break exceeded 1 hour
    expect(result.current.status).toBe("offline");

    await waitFor(() => {
      expect(result.current.isBreakExpiredNoticeOpen).toBe(true);
    });

    expect(result.current.savedStudySecondsOnBreakExpiry).toBe(3000);
    expect(mockRpc).toHaveBeenCalledWith("rpc_finish_session", {
      p_completed_task_ids: [],
      p_reason: "break_expired",
    });
  });

  it("opens notice gracefully even if session was already ended in database", async () => {
    const seventyMinutesAgo = new Date(Date.now() - 70 * 60 * 1000).toISOString();

    const expiredProfile = {
      id: "user-2",
      display_name: "Test User 2",
      current_status: "break",
      break_started_at: seventyMinutesAgo,
      active_study_seconds_snapshot: 1800,
    } as unknown as UserProfile;

    // Simulate already ended session in backend
    mockRpc.mockResolvedValue({
      data: { success: false, error: "No active session found" },
      error: null,
    });

    const { result } = renderHook(() => useActiveSession(expiredProfile));

    await waitFor(() => {
      expect(result.current.isBreakExpiredNoticeOpen).toBe(true);
    });

    expect(result.current.error).toBeNull();
    expect(result.current.savedStudySecondsOnBreakExpiry).toBe(1800);
  });

  it("handles resume error gracefully when session was stopped on break expiration", async () => {
    const expiredProfile = {
      id: "user-3",
      display_name: "Test User 3",
      current_status: "break",
      break_started_at: new Date(Date.now() - 65 * 60 * 1000).toISOString(),
      active_study_seconds_snapshot: 2400,
    } as unknown as UserProfile;

    mockRpc.mockResolvedValue({
      data: null,
      error: new Error("User is not currently on break"),
    });

    const { result } = renderHook(() => useActiveSession(expiredProfile));

    await act(async () => {
      await result.current.resumeSession();
    });

    expect(result.current.isBreakExpiredNoticeOpen).toBe(true);
    expect(result.current.savedStudySecondsOnBreakExpiry).toBe(2400);
    expect(result.current.error).toBeNull();
  });

  it("does NOT open break expired notice when user voluntarily stops session while on break", async () => {
    // User has only been on break for 1 minute (not expired)
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();
    const activeBreakProfile = {
      id: "user-4",
      display_name: "Test User 4",
      current_status: "break",
      session_start_time: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      break_started_at: oneMinuteAgo,
      active_study_seconds_snapshot: 1740,
    } as unknown as UserProfile;

    mockRpc.mockResolvedValue({
      data: { success: true, server_now: new Date().toISOString() },
      error: null,
    });

    const { result } = renderHook(() => useActiveSession(activeBreakProfile));

    await act(async () => {
      await result.current.finishSession(["task-1"]);
    });

    // Voluntary stop must NOT trigger the break expired notice
    expect(result.current.isBreakExpiredNoticeOpen).toBe(false);
    expect(mockRpc).toHaveBeenCalledWith("rpc_finish_session", {
      p_completed_task_ids: ["task-1"],
      p_reason: "manual_stop",
    });
  });

  it("closeBreakExpiredNotice closes modal, calls rpc_acknowledge_break_expiry, and prevents reopening", async () => {
    const offlineProfileWithExpiry = {
      id: "user-5",
      display_name: "Test User 5",
      current_status: "offline",
      last_break_expired_study_seconds: 2500,
    } as unknown as UserProfile;

    mockRpc.mockResolvedValue({
      data: { success: true },
      error: null,
    });

    const { result, rerender } = renderHook(
      ({ profile }) => useActiveSession(profile),
      { initialProps: { profile: offlineProfileWithExpiry } }
    );

    await waitFor(() => {
      expect(result.current.isBreakExpiredNoticeOpen).toBe(true);
    });

    // User chooses "End Without Goals" or saves goals -> closeBreakExpiredNotice is called
    await act(async () => {
      await result.current.closeBreakExpiredNotice();
    });

    expect(result.current.isBreakExpiredNoticeOpen).toBe(false);
    expect(mockRpc).toHaveBeenCalledWith("rpc_acknowledge_break_expiry");

    // Even if rerender happens with the same profile object, notice must stay closed
    rerender({ profile: { ...offlineProfileWithExpiry } });
    expect(result.current.isBreakExpiredNoticeOpen).toBe(false);
  });

  it("stores localBreakStartMs and notifies AndroidBridge with 0 drift on pauseSession", async () => {
    const studyProfile = {
      id: "user-6",
      display_name: "Test User 6",
      current_status: "studying",
      session_start_time: new Date(Date.now() - 600 * 1000).toISOString(),
      active_study_seconds_snapshot: 600,
    } as unknown as UserProfile;

    const mockOnSessionStateResolved = vi.fn();
    (window as any).AndroidBridge = {
      onSessionStateResolved: mockOnSessionStateResolved,
    };

    mockRpc.mockResolvedValue({
      data: { success: true, server_now: new Date().toISOString() },
      error: null,
    });

    const { result } = renderHook(() => useActiveSession(studyProfile));

    await act(async () => {
      await result.current.pauseSession();
    });

    expect(result.current.status).toBe("break");

    // Check localStorage
    const rawBreak = localStorage.getItem("studyroom_active_break");
    expect(rawBreak).not.toBeNull();
    const parsed = JSON.parse(rawBreak!);
    expect(typeof parsed.localBreakStartMs).toBe("number");
    expect(parsed.localBreakStartMs).toBeGreaterThan(0);
    expect(typeof parsed.breakStartedAt).toBe("string");

    // Check AndroidBridge notification
    expect(mockOnSessionStateResolved).toHaveBeenCalledWith(
      true,
      parsed.localBreakStartMs,
      expect.any(Number),
      false,
      0,
      ""
    );

    delete (window as any).AndroidBridge;
  });

  it("does NOT open break expired notice when resume error occurs on an unexpired break (cross-device convergence)", async () => {
    // Break started only 5 minutes ago (unexpired)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const activeBreakProfile = {
      id: "user-7",
      display_name: "Test User 7",
      current_status: "break",
      break_started_at: fiveMinutesAgo,
      active_study_seconds_snapshot: 1500,
    } as unknown as UserProfile;

    // Simulate backend throwing "User is not currently on break" because Device A already resumed
    mockRpc.mockResolvedValue({
      data: null,
      error: new Error("User is not currently on break"),
    });

    const { result } = renderHook(() => useActiveSession(activeBreakProfile));

    let resumeResult: { success: boolean; expired?: boolean } | undefined;
    await act(async () => {
      resumeResult = await result.current.resumeSession();
    });

    // MUST NOT trigger the break expired notice
    expect(result.current.isBreakExpiredNoticeOpen).toBe(false);
    expect(resumeResult?.success).toBe(true);
    expect(resumeResult?.expired).toBeUndefined();
  });

  it("removes studyroom_active_break and notifies AndroidBridge when session transitions from break to studying", async () => {
    localStorage.setItem("studyroom_active_break", JSON.stringify({ userId: "user-8", localBreakStartMs: Date.now() }));
    const mockOnSessionStateResolved = vi.fn();
    (window as any).AndroidBridge = {
      onSessionStateResolved: mockOnSessionStateResolved,
    };

    const breakProfile = {
      id: "user-8",
      display_name: "Test User 8",
      current_status: "break",
      session_start_time: new Date(Date.now() - 1000 * 1000).toISOString(),
      break_started_at: new Date(Date.now() - 60 * 1000).toISOString(),
      active_study_seconds_snapshot: 900,
    } as unknown as UserProfile;

    const { rerender } = renderHook(
      ({ profile }) => useActiveSession(profile),
      { initialProps: { profile: breakProfile } }
    );

    // Profile updates from Device A resuming
    const studyingProfile = {
      ...breakProfile,
      current_status: "studying",
      break_started_at: null,
    } as unknown as UserProfile;

    await act(async () => {
      rerender({ profile: studyingProfile });
    });

    // studyroom_active_break must be removed
    expect(localStorage.getItem("studyroom_active_break")).toBeNull();

    // AndroidBridge must be notified of studying state
    expect(mockOnSessionStateResolved).toHaveBeenCalledWith(
      false, // isOnBreak = false
      0,
      expect.any(Number),
      true, // isStudying = true
      expect.any(Number),
      ""
    );

    delete (window as any).AndroidBridge;
  });

  it("removes studyroom_active_break and terminates AndroidBridge when session transitions to offline", async () => {
    localStorage.setItem("studyroom_active_break", JSON.stringify({ userId: "user-9", localBreakStartMs: Date.now() }));
    const mockOnSessionStateResolved = vi.fn();
    (window as any).AndroidBridge = {
      onSessionStateResolved: mockOnSessionStateResolved,
    };

    const breakProfile = {
      id: "user-9",
      display_name: "Test User 9",
      current_status: "break",
      break_started_at: new Date(Date.now() - 60 * 1000).toISOString(),
    } as unknown as UserProfile;

    const { rerender } = renderHook(
      ({ profile }) => useActiveSession(profile),
      { initialProps: { profile: breakProfile } }
    );

    // Profile updates from Device A stopping session
    const offlineProfile = {
      ...breakProfile,
      current_status: "offline",
      break_started_at: null,
    } as unknown as UserProfile;

    await act(async () => {
      rerender({ profile: offlineProfile });
    });

    expect(localStorage.getItem("studyroom_active_break")).toBeNull();
    expect(mockOnSessionStateResolved).toHaveBeenCalledWith(
      false,
      0,
      0,
      false,
      0,
      ""
    );

    delete (window as any).AndroidBridge;
  });

  it("includes active_study_seconds_snapshot when resuming session from break", async () => {
    const breakProfile = {
      id: "user-resume-1",
      display_name: "Resume Tester",
      current_status: "break",
      session_start_time: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      break_started_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      active_study_seconds_snapshot: 1500,
    } as unknown as UserProfile;

    mockRpc.mockResolvedValue({
      data: { success: true },
      error: null,
    });

    const onStatusChange = vi.fn();
    const { result } = renderHook(() => useActiveSession(breakProfile, onStatusChange));

    await act(async () => {
      await result.current.resumeSession();
    });

    expect(onStatusChange).toHaveBeenCalledWith(
      "studying",
      expect.objectContaining({
        current_status: "studying",
        break_started_at: null,
        active_study_seconds_snapshot: 1500,
      })
    );
  });

  it("keeps isGoalUpdateModalOpen open when finishing session even if profile refetch temporarily returns null pending_goal_session_id", async () => {
    const studyingProfile = {
      id: "user-finish-1",
      display_name: "Finish Tester",
      current_status: "studying",
      session_start_time: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      break_started_at: null,
      active_study_seconds_snapshot: 3600,
      pending_goal_session_id: null,
    } as unknown as UserProfile;

    mockRpc.mockResolvedValue({
      data: { success: true, session_id: "sess-completed-123" },
      error: null,
    });

    const { result, rerender } = renderHook(
      ({ profile }) => useActiveSession(profile),
      { initialProps: { profile: studyingProfile } }
    );

    await act(async () => {
      await result.current.finishSession([], "manual_stop");
    });

    expect(result.current.isGoalUpdateModalOpen).toBe(true);
    expect(result.current.pendingGoalSessionId).toBe("sess-completed-123");

    // Background refetch runs while DB is processing, profile still has pending_goal_session_id: null
    const interimProfile = {
      ...studyingProfile,
      current_status: "offline",
      pending_goal_session_id: null,
    } as unknown as UserProfile;

    await act(async () => {
      rerender({ profile: interimProfile });
    });

    // Modal must NOT be slammed shut!
    expect(result.current.isGoalUpdateModalOpen).toBe(true);
    expect(result.current.pendingGoalSessionId).toBe("sess-completed-123");

    // Once user completes goals, modal closes
    await act(async () => {
      await result.current.completeSessionGoals("sess-completed-123", []);
    });

    expect(result.current.isGoalUpdateModalOpen).toBe(false);
    expect(result.current.pendingGoalSessionId).toBeNull();
  });
});
