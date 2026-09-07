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
});
