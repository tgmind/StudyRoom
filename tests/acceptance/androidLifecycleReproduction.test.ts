import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
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

describe("Permanent Fix of Production Android Lifecycle Interruption", () => {
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

  it("FIX VERIFIED: when app reopens and profile is null during auth hydration, useActiveSession preserves active study state, does NOT call AndroidBridge STOP, sets syncStatus to syncing, and reconstructs elapsed study seconds from disk", () => {
    // 1. Simulate existing active study state stored on disk before swipe away
    const nowIso = new Date(Date.now() - 30 * 60 * 1000).toISOString(); // 30 mins ago (1800s)
    localStorage.setItem(
      "studyroom_active_study",
      JSON.stringify({
        userId: "user-subodh",
        sessionStartTime: nowIso,
        lastResumedAt: nowIso,
        snapshotSeconds: 0,
        focus: "Physics",
      })
    );
    expect(localStorage.getItem("studyroom_active_study")).not.toBeNull();

    // 2. App reopens! On initial render, AuthProvider is still hydrating, so profile is null and isAuthLoading is true
    const onBridgeResolved = (window as any).AndroidBridge.onSessionStateResolved;

    const { result, unmount } = renderHook(() =>
      useActiveSession(null, undefined, undefined, "connected", true)
    );

    // VERIFICATION 1: Status is recognized as "studying" via provisional disk state, not "offline"
    expect(result.current.status).toBe("studying");

    // VERIFICATION 2: Active study state in localStorage was NOT wiped!
    const studyStateAfterMount = localStorage.getItem("studyroom_active_study");
    expect(studyStateAfterMount).not.toBeNull();

    // VERIFICATION 3: AndroidBridge was NOT sent an explicit STOP/OFFLINE signal!
    expect(onBridgeResolved).not.toHaveBeenCalledWith(false, 0, 0, false, 0, "");

    // VERIFICATION 4: syncStatus truthfully indicates "syncing" during profile hydration!
    expect(result.current.syncStatus).toBe("syncing");

    // VERIFICATION 5: Elapsed study seconds is ~1800s (30 mins), NEVER flashing 00:00!
    expect(result.current.elapsedStudySeconds).toBeGreaterThanOrEqual(1799);

    unmount();
  });

  it("FIX VERIFIED: when app reopens while user is on break, useActiveSession preserves break state on disk and does NOT call AndroidBridge STOP", () => {
    // 1. Simulate active break stored on disk before swipe away
    const breakStartMs = Date.now() - 10 * 60 * 1000; // 10 mins ago
    const breakStartIso = new Date(breakStartMs).toISOString();
    localStorage.setItem(
      "studyroom_active_break",
      JSON.stringify({
        userId: "user-subodh",
        breakStartedAt: breakStartIso,
        localBreakStartMs: breakStartMs,
        serverBreakStartedAt: breakStartIso,
        accruedSeconds: 1200,
      })
    );
    expect(localStorage.getItem("studyroom_active_break")).not.toBeNull();

    // 2. App reopens with profile null and isAuthLoading true
    const onBridgeResolved = (window as any).AndroidBridge.onSessionStateResolved;
    const { result, unmount } = renderHook(() =>
      useActiveSession(null, undefined, undefined, "connected", true)
    );

    // VERIFICATION 1: Break status is preserved
    expect(result.current.status).toBe("break");

    // VERIFICATION 2: Break state was NOT wiped from localStorage
    expect(localStorage.getItem("studyroom_active_break")).not.toBeNull();

    // VERIFICATION 3: AndroidBridge STOP was NOT called, preserving foreground service & notification
    expect(onBridgeResolved).not.toHaveBeenCalledWith(false, 0, 0, false, 0, "");

    // VERIFICATION 4: Elapsed study seconds matches the accrued snapshot (1200s), not 0
    expect(result.current.elapsedStudySeconds).toBe(1200);

    // VERIFICATION 5: syncStatus is "syncing"
    expect(result.current.syncStatus).toBe("syncing");

    unmount();
  });

  it("FIX VERIFIED: when auth hydration completes, useActiveSession authoritatively reconciles with profile", async () => {
    const nowIso = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    localStorage.setItem(
      "studyroom_active_study",
      JSON.stringify({
        userId: "user-subodh",
        sessionStartTime: nowIso,
        lastResumedAt: nowIso,
        snapshotSeconds: 0,
        focus: "Physics",
      })
    );

    let profile: UserProfile | null = null;
    let isAuthLoading = true;

    const { result, rerender } = renderHook(() =>
      useActiveSession(profile, undefined, undefined, "connected", isAuthLoading)
    );

    expect(result.current.status).toBe("studying");
    expect(result.current.syncStatus).toBe("syncing");

    // Hydration completes! Authoritative profile loaded from server
    const serverProfile: UserProfile = {
      id: "user-subodh",
      display_name: "Subodh",
      avatar_url: null,
      has_achiever_badge: false,
      current_status: "studying",
      session_start_time: nowIso,
      last_resumed_at: nowIso,
      break_started_at: null,
      active_study_seconds_snapshot: 0,
      current_focus: "Physics",
      created_at: nowIso,
      weekly_study_seconds: 5400,
      total_sessions_count: 3,
      weekly_sessions_count: 3,
    };

    profile = serverProfile;
    isAuthLoading = false;

    rerender();

    expect(result.current.status).toBe("studying");
    expect(result.current.syncStatus).toBe("synced");
    expect(result.current.elapsedStudySeconds).toBeGreaterThanOrEqual(1799);
  });

  it("FIX VERIFIED: when server profile authoritatively indicates offline, useActiveSession cleans up disk and notifies AndroidBridge", () => {
    const onBridgeResolved = (window as any).AndroidBridge.onSessionStateResolved;

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

    const { result } = renderHook(() =>
      useActiveSession(offlineProfile, undefined, undefined, "connected", false)
    );

    expect(result.current.status).toBe("offline");
    expect(result.current.syncStatus).toBe("synced");
    expect(result.current.elapsedStudySeconds).toBe(0);
    expect(onBridgeResolved).toHaveBeenCalledWith(false, 0, 0, false, 0, "");
  });
});
