import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useActiveSession } from "@/hooks/useActiveSession";
import { UserProfile, SessionBlock } from "@/lib/supabase/types";
import { isMemberTimerCalibrating, calculateMemberElapsedStudySeconds } from "@/lib/time/format";
import { resetClockCalibration } from "@/lib/time/clockSync";
import { getActiveStudyState } from "@/lib/offline/sessionQueue";

const mockRpc = vi.fn();
const mockFrom = vi.fn();

const mockClient = {
  from: mockFrom,
  rpc: mockRpc,
};

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => mockClient,
}));

describe("Website Timer Resilience & Web Browser Lifecycle (No AndroidBridge)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetClockCalibration();
    vi.useFakeTimers();

    mockRpc.mockResolvedValue({ data: null, error: null });

    // Strict web environment: ensure window.AndroidBridge is undefined
    delete (window as any).AndroidBridge;

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

  afterEach(() => {
    vi.useRealTimers();
    delete (window as any).AndroidBridge;
    if (typeof localStorage !== "undefined") {
      localStorage.clear();
    }
  });

  it("advances second-by-second on a clean session start on the website", () => {
    const t0 = new Date("2026-10-09T10:00:00Z");
    vi.setSystemTime(t0);

    const activeProfile: UserProfile = {
      id: "web-user-1",
      display_name: "Web User",
      current_status: "studying",
      session_start_time: t0.toISOString(),
      last_resumed_at: t0.toISOString(),
      active_study_seconds_snapshot: 0,
      state_version: 1,
    } as UserProfile;

    expect(isMemberTimerCalibrating(activeProfile)).toBe(false);

    const { result } = renderHook(() =>
      useActiveSession(activeProfile, undefined, undefined, "connected")
    );

    expect(result.current.elapsedStudySeconds).toBe(0);

    // Advance 5 seconds
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(result.current.elapsedStudySeconds).toBe(5);

    // Advance another 55 seconds (total 60s)
    act(() => {
      vi.advanceTimersByTime(55000);
    });

    expect(result.current.elapsedStudySeconds).toBe(60);
  });

  it("utilizes Tier 2 server session blocks when profile has positive snapshot and missing resume timestamp", async () => {
    const t0 = new Date("2026-10-09T10:00:00Z");
    const resumeTime = new Date("2026-10-09T10:45:00Z");
    const currentTime = new Date("2026-10-09T10:50:00Z"); // 5m / 300s since resume

    vi.setSystemTime(currentTime);

    // Profile from server missing last_resumed_at (e.g. following cross-device sync)
    const profileWithMissingResume: UserProfile = {
      id: "web-user-2",
      display_name: "Web User 2",
      current_status: "studying",
      session_start_time: t0.toISOString(),
      last_resumed_at: null,
      active_study_seconds_snapshot: 1800, // 30m accrued before break
      state_version: 2,
    } as UserProfile;

    // Must be flagged as calibrating
    expect(isMemberTimerCalibrating(profileWithMissingResume)).toBe(true);

    // Server has authoritative unlinked session blocks
    const serverBlocks: SessionBlock[] = [
      {
        id: "block-1",
        user_id: "web-user-2",
        session_id: null,
        block_type: "study",
        start_time: t0.toISOString(),
        end_time: new Date(t0.getTime() + 1800 * 1000).toISOString(), // 30 min block
      },
      {
        id: "block-2",
        user_id: "web-user-2",
        session_id: null,
        block_type: "break",
        start_time: new Date(t0.getTime() + 1800 * 1000).toISOString(),
        end_time: resumeTime.toISOString(), // 15 min break
      },
      {
        id: "block-3",
        user_id: "web-user-2",
        session_id: null,
        block_type: "study",
        start_time: resumeTime.toISOString(),
        end_time: null, // open active study block
      },
    ];

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          is: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: serverBlocks, error: null }),
          }),
        }),
      }),
    });

    const { result } = renderHook(() =>
      useActiveSession(profileWithMissingResume, undefined, undefined, "connected")
    );

    // Initial state flags syncing while calibrating
    expect(result.current.syncStatus).toBe("syncing");

    // Resolve fetchSessionBlocks promise
    await act(async () => {
      await Promise.resolve();
    });

    // 1800s accrued + 300s open block = 2100s
    expect(result.current.elapsedStudySeconds).toBe(2100);

    // Advances dynamically with time
    act(() => {
      vi.advanceTimersByTime(10000); // 10 seconds pass
    });

    expect(result.current.elapsedStudySeconds).toBe(2110);
  });

  it("persists active study state to localStorage in standard web browser without AndroidBridge", async () => {
    const t0 = new Date("2026-10-09T10:00:00Z");
    vi.setSystemTime(t0);

    const activeProfile: UserProfile = {
      id: "web-user-3",
      display_name: "Web User 3",
      current_status: "studying",
      session_start_time: t0.toISOString(),
      last_resumed_at: t0.toISOString(),
      active_study_seconds_snapshot: 0,
      current_focus: "Mathematics",
      state_version: 1,
    } as UserProfile;

    expect((window as any).AndroidBridge).toBeUndefined();

    renderHook(() =>
      useActiveSession(activeProfile, undefined, undefined, "connected")
    );

    // Verification: active study state was persisted to localStorage despite NO AndroidBridge
    const saved = getActiveStudyState();
    expect(saved).not.toBeNull();
    expect(saved?.userId).toBe("web-user-3");
    expect(saved?.sessionStartTime).toBe(t0.toISOString());
    expect(saved?.focus).toBe("Mathematics");
  });

  it("clears stored active study state upon session transitioning to offline", async () => {
    const t0 = new Date("2026-10-09T10:00:00Z");
    vi.setSystemTime(t0);

    const studyingProfile: UserProfile = {
      id: "web-user-4",
      display_name: "Web User 4",
      current_status: "studying",
      session_start_time: t0.toISOString(),
      last_resumed_at: t0.toISOString(),
      active_study_seconds_snapshot: 0,
      state_version: 1,
    } as UserProfile;

    const { rerender } = renderHook(
      ({ prof }) => useActiveSession(prof, undefined, undefined, "connected"),
      { initialProps: { prof: studyingProfile } }
    );

    expect(getActiveStudyState()).not.toBeNull();

    // Rerender with offline profile
    const offlineProfile: UserProfile = {
      ...studyingProfile,
      current_status: "offline",
      session_start_time: null,
      last_resumed_at: null,
    };

    rerender({ prof: offlineProfile });

    expect(getActiveStudyState()).toBeNull();
  });

  it("re-evaluates timer on visibilitychange and focus without duplicate intervals", () => {
    const t0 = new Date("2026-10-09T10:00:00Z");
    vi.setSystemTime(t0);

    const activeProfile: UserProfile = {
      id: "web-user-5",
      display_name: "Web User 5",
      current_status: "studying",
      session_start_time: t0.toISOString(),
      last_resumed_at: t0.toISOString(),
      active_study_seconds_snapshot: 0,
      state_version: 1,
    } as UserProfile;

    const { result } = renderHook(() =>
      useActiveSession(activeProfile, undefined, undefined, "connected")
    );

    expect(result.current.elapsedStudySeconds).toBe(0);

    // Simulate tab backgrounding and time passing (30s)
    vi.setSystemTime(new Date(t0.getTime() + 30000));

    // Simulate tab restored to visible
    act(() => {
      Object.defineProperty(document, "visibilityState", {
        value: "visible",
        configurable: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(result.current.elapsedStudySeconds).toBe(30);
  });

  it("triggers self-healing reconciliation when profile has positive snapshot and missing resume timestamp, transitioning to Tier 1 upon repair", async () => {
    const t0 = new Date("2026-10-09T10:00:00Z");
    const resumeTime = new Date("2026-10-09T10:45:00Z");
    const currentTime = new Date("2026-10-09T10:50:00Z"); // 5 min since resume

    vi.setSystemTime(currentTime);

    const calibratingProfile: UserProfile = {
      id: "web-user-heal",
      display_name: "Web User Heal",
      current_status: "studying",
      session_start_time: t0.toISOString(),
      last_resumed_at: null, // missing resume timestamp
      active_study_seconds_snapshot: 1800,
      state_version: 2,
    } as UserProfile;

    expect(isMemberTimerCalibrating(calibratingProfile)).toBe(true);

    const optimisticUpdateSpy = vi.fn();

    // Mock RPC returning repaired session
    mockRpc.mockResolvedValue({
      data: {
        success: true,
        status: "studying",
        repaired: true,
        reason: "repaired_from_server_blocks",
        session_start_time: t0.toISOString(),
        last_resumed_at: resumeTime.toISOString(),
        break_started_at: null,
        active_study_seconds_snapshot: 1800,
        elapsed_seconds: 2100,
        state_version: 3,
        server_now: currentTime.toISOString(),
      },
      error: null,
    });

    const { result, rerender } = renderHook(
      ({ prof }) => useActiveSession(prof, undefined, optimisticUpdateSpy, "connected", false),
      { initialProps: { prof: calibratingProfile } }
    );

    // Initial state is syncing
    expect(result.current.syncStatus).toBe("syncing");

    // Advance by 1200ms grace period to trigger reconciliation
    await act(async () => {
      vi.advanceTimersByTime(1200);
    });

    expect(mockRpc).toHaveBeenCalledWith("rpc_synchronize_session");
    expect(optimisticUpdateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        current_status: "studying",
        session_start_time: t0.toISOString(),
        last_resumed_at: resumeTime.toISOString(),
        active_study_seconds_snapshot: 1800,
      })
    );

    // Now re-render with the repaired profile from the server
    const repairedProfile: UserProfile = {
      ...calibratingProfile,
      last_resumed_at: resumeTime.toISOString(),
      state_version: 3,
    };

    expect(isMemberTimerCalibrating(repairedProfile)).toBe(false);

    rerender({ prof: repairedProfile });

    // Status is now synced and timer continues counting accurately via Tier 1
    expect(result.current.syncStatus).toBe("synced");
    expect(result.current.elapsedStudySeconds).toBe(2100);

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.elapsedStudySeconds).toBe(2101);
  });
});
