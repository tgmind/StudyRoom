import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
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

describe("Dynamic Island Style Live Break Notification Bridge Verification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          is: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      }),
    });
    (window as any).AndroidBridge = {
      onSessionStateResolved: vi.fn(),
      onSessionStateChanged: vi.fn(),
    };
  });

  afterEach(() => {
    delete (window as any).AndroidBridge;
    localStorage.clear();
  });

  it("verifies break state accurately dispatches authoritative start timestamp and accrued study to AndroidBridge", () => {
    const breakStartMs = Date.now() - 5 * 60 * 1000; // 5 mins ago
    const breakStartIso = new Date(breakStartMs).toISOString();
    const accruedSeconds = 2400; // 40 minutes of accrued study

    localStorage.setItem(
      "studyroom_active_break",
      JSON.stringify({
        userId: "user-subodh",
        breakStartedAt: breakStartIso,
        localBreakStartMs: breakStartMs,
        serverBreakStartedAt: breakStartIso,
        accruedSeconds: accruedSeconds,
      })
    );

    const breakProfile: UserProfile = {
      id: "user-subodh",
      display_name: "Subodh",
      avatar_url: null,
      has_achiever_badge: false,
      current_status: "break",
      session_start_time: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
      last_resumed_at: null,
      break_started_at: breakStartIso,
      active_study_seconds_snapshot: accruedSeconds,
      current_focus: "Mathematics",
      created_at: new Date().toISOString(),
      weekly_study_seconds: accruedSeconds,
      total_sessions_count: 1,
      weekly_sessions_count: 1,
    };

    const onBridgeResolved = (window as any).AndroidBridge.onSessionStateResolved;

    const { result } = renderHook(() =>
      useActiveSession(breakProfile, undefined, undefined, "connected", false)
    );

    expect(result.current.status).toBe("break");
    expect(result.current.elapsedStudySeconds).toBe(accruedSeconds);

    // Verify bridge was called with isBreak=true, valid break timestamp, and accrued seconds number
    expect(onBridgeResolved).toHaveBeenCalledWith(
      true,
      expect.any(Number),
      expect.any(Number),
      false,
      0,
      ""
    );

    const callArgs = onBridgeResolved.mock.calls[0];
    expect(callArgs[0]).toBe(true);
    expect(callArgs[1]).toBeGreaterThanOrEqual(breakStartMs - 1000);
    expect(typeof callArgs[2]).toBe("number");
  });

  it("verifies session termination dispatches stop signal without leaving a stale break notification", () => {
    const offlineProfile: UserProfile = {
      id: "user-subodh",
      display_name: "Subodh",
      avatar_url: null,
      has_achiever_badge: false,
      current_status: "offline",
      session_start_time: null,
      last_resumed_at: null,
      break_started_at: null,
      active_study_seconds_snapshot: 0,
      current_focus: null,
      created_at: new Date().toISOString(),
      weekly_study_seconds: 0,
      total_sessions_count: 0,
      weekly_sessions_count: 0,
    };

    const onBridgeResolved = (window as any).AndroidBridge.onSessionStateResolved;

    renderHook(() =>
      useActiveSession(offlineProfile, undefined, undefined, "connected", false)
    );

    expect(onBridgeResolved).toHaveBeenCalledWith(false, 0, 0, false, 0, "");
  });

  it("verifies resuming from break preserves accrued study duration and notifies Android bridge", () => {
    const nowIso = new Date().toISOString();
    const accruedSeconds = 1800; // 30 minutes

    const studyingProfile: UserProfile = {
      id: "user-subodh",
      display_name: "Subodh",
      avatar_url: null,
      has_achiever_badge: false,
      current_status: "studying",
      session_start_time: nowIso,
      last_resumed_at: nowIso,
      break_started_at: null,
      active_study_seconds_snapshot: accruedSeconds,
      current_focus: "Chemistry",
      created_at: nowIso,
      weekly_study_seconds: accruedSeconds,
      total_sessions_count: 1,
      weekly_sessions_count: 1,
    };

    const onBridgeResolved = (window as any).AndroidBridge.onSessionStateResolved;

    const { result } = renderHook(() =>
      useActiveSession(studyingProfile, undefined, undefined, "connected", false)
    );

    expect(result.current.status).toBe("studying");
    expect(result.current.elapsedStudySeconds).toBeGreaterThanOrEqual(accruedSeconds);

    // When studying, isBreak must be false so StudySessionService stops break notification
    expect(onBridgeResolved).toHaveBeenCalledWith(
      false,
      0,
      expect.any(Number),
      true,
      expect.any(Number),
      "Chemistry"
    );
  });
});
