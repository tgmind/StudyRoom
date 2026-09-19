import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useActiveSession } from "@/hooks/useActiveSession";
import { UserProfile } from "@/lib/supabase/types";
import {
  calculateMemberElapsedStudySeconds,
  isMemberTimerCalibrating,
  MAX_SESSION_STUDY_SECONDS,
} from "@/lib/time/format";
import { calculateBreakStatus } from "@/lib/time/break";

const mockRpc = vi.fn();
const mockFrom = vi.fn();

const mockClient = {
  from: mockFrom,
  rpc: mockRpc,
};

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => mockClient,
}));

describe("Session Reliability & Authoritative Timer Invariants", () => {
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

  afterEach(() => {
    if (typeof localStorage !== "undefined") {
      localStorage.clear();
    }
  });

  // =========================================================================
  // 1. START SESSION: PERMANENCE & MUTEX
  // =========================================================================
  describe("Start Session Invariants", () => {
    it("transitions UI to studying at t=0 and never reverts after RPC succeeds", async () => {
      const initialProfile: UserProfile = {
        id: "user-1",
        display_name: "Subodh",
        current_status: "offline",
        session_start_time: null,
        break_started_at: null,
        last_resumed_at: null,
        active_study_seconds_snapshot: 0,
      } as UserProfile;

      const serverNowIso = new Date().toISOString();
      mockRpc.mockResolvedValue({
        data: { success: true, session_id: "sess-1", server_now: serverNowIso },
        error: null,
      });

      const optimisticUpdateSpy = vi.fn((partial) => {
        Object.assign(initialProfile, partial);
      });

      const { result } = renderHook(() =>
        useActiveSession(initialProfile, undefined, optimisticUpdateSpy)
      );

      expect(result.current.status).toBe("offline");
      expect(result.current.syncStatus).toBe("synced");

      // User clicks Start
      await act(async () => {
        await result.current.startSession();
      });

      // After confirmation: status remains studying, never reverts to offline
      expect(result.current.status).toBe("studying");
      expect(result.current.syncStatus).toBe("synced");
      expect(result.current.mutationPending).toBeNull();
      expect(optimisticUpdateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          current_status: "studying",
          session_start_time: serverNowIso,
          last_resumed_at: serverNowIso,
        })
      );
    });

    it("mutex prevents duplicate RPC invocation on rapid double-click", async () => {
      const initialProfile: UserProfile = {
        id: "user-1",
        display_name: "Subodh",
        current_status: "offline",
      } as UserProfile;

      mockRpc.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => {
              resolve({
                data: { success: true, server_now: new Date().toISOString() },
                error: null,
              });
            }, 50);
          })
      );

      const { result } = renderHook(() => useActiveSession(initialProfile));

      // Click Start twice rapidly
      await act(async () => {
        const p1 = result.current.startSession();
        const p2 = result.current.startSession();
        await Promise.all([p1, p2]);
      });

      // Exactly 1 RPC call dispatched due to mutex and debounce
      expect(mockRpc).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // 2. PAUSE SESSION: PERMANENCE, ACCRUED PRESERVATION & MUTEX
  // =========================================================================
  describe("Pause Session Invariants", () => {
    it("transitions UI to break at t=0, preserves accrued seconds, and never reverts to studying", async () => {
      const initialProfile: UserProfile = {
        id: "user-1",
        display_name: "Subodh",
        current_status: "studying",
        session_start_time: new Date(Date.now() - 1800 * 1000).toISOString(),
        last_resumed_at: new Date(Date.now() - 1800 * 1000).toISOString(),
        active_study_seconds_snapshot: 0,
      } as UserProfile;

      const serverNowIso = new Date().toISOString();
      mockRpc.mockResolvedValue({
        data: { success: true, server_now: serverNowIso },
        error: null,
      });

      const optimisticUpdateSpy = vi.fn((partial) => {
        Object.assign(initialProfile, partial);
      });

      const { result } = renderHook(() =>
        useActiveSession(initialProfile, undefined, optimisticUpdateSpy)
      );

      expect(result.current.status).toBe("studying");

      // User clicks Pause
      await act(async () => {
        await result.current.pauseSession();
      });

      // After confirmation: status remains break, never reverts to studying
      expect(result.current.status).toBe("break");
      expect(result.current.syncStatus).toBe("synced");
      expect(result.current.mutationPending).toBeNull();
      expect(result.current.elapsedStudySeconds).toBeGreaterThanOrEqual(1800);
      expect(optimisticUpdateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          current_status: "break",
          break_started_at: serverNowIso,
          last_resumed_at: null,
        })
      );
    });

    it("mutex prevents duplicate RPC on rapid pause double-click", async () => {
      const initialProfile: UserProfile = {
        id: "user-1",
        display_name: "Subodh",
        current_status: "studying",
        session_start_time: new Date(Date.now() - 600 * 1000).toISOString(),
      } as UserProfile;

      mockRpc.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => {
              resolve({
                data: { success: true, server_now: new Date().toISOString() },
                error: null,
              });
            }, 50);
          })
      );

      const { result } = renderHook(() => useActiveSession(initialProfile));

      await act(async () => {
        const p1 = result.current.pauseSession();
        const p2 = result.current.pauseSession();
        await Promise.all([p1, p2]);
      });

      expect(mockRpc).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // 3. RESUME SESSION: PERMANENCE & MUTEX
  // =========================================================================
  describe("Resume Session Invariants", () => {
    it("transitions UI to studying at t=0 and never reverts to break", async () => {
      const initialProfile: UserProfile = {
        id: "user-1",
        display_name: "Subodh",
        current_status: "break",
        session_start_time: new Date(Date.now() - 3600 * 1000).toISOString(),
        break_started_at: new Date(Date.now() - 300 * 1000).toISOString(),
        active_study_seconds_snapshot: 3300,
        last_resumed_at: null,
      } as UserProfile;

      const serverNowIso = new Date().toISOString();
      mockRpc.mockResolvedValue({
        data: { success: true, server_now: serverNowIso },
        error: null,
      });

      const optimisticUpdateSpy = vi.fn((partial) => {
        Object.assign(initialProfile, partial);
      });

      const { result } = renderHook(() =>
        useActiveSession(initialProfile, undefined, optimisticUpdateSpy)
      );

      expect(result.current.status).toBe("break");

      await act(async () => {
        await result.current.resumeSession();
      });

      expect(result.current.status).toBe("studying");
      expect(result.current.syncStatus).toBe("synced");
      expect(result.current.mutationPending).toBeNull();
      expect(optimisticUpdateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          current_status: "studying",
          break_started_at: null,
          last_resumed_at: serverNowIso,
        })
      );
    });
  });

  // =========================================================================
  // 4. STOP SESSION: PERMANENCE & MODAL TRIGGER
  // =========================================================================
  describe("Stop Session Invariants", () => {
    it("transitions UI to offline at t=0, opens goal modal, and never reverts to studying", async () => {
      const initialProfile: UserProfile = {
        id: "user-1",
        display_name: "Subodh",
        current_status: "studying",
        session_start_time: new Date(Date.now() - 1800 * 1000).toISOString(),
        last_resumed_at: new Date(Date.now() - 1800 * 1000).toISOString(),
        active_study_seconds_snapshot: 0,
      } as UserProfile;

      const serverNowIso = new Date().toISOString();
      mockRpc.mockResolvedValue({
        data: { success: true, session_id: "finished-sess-1", server_now: serverNowIso },
        error: null,
      });

      const optimisticUpdateSpy = vi.fn((partial) => {
        Object.assign(initialProfile, partial);
      });

      const { result } = renderHook(() =>
        useActiveSession(initialProfile, undefined, optimisticUpdateSpy)
      );

      expect(result.current.status).toBe("studying");

      await act(async () => {
        await result.current.finishSession([], "manual_stop");
      });

      expect(result.current.status).toBe("offline");
      expect(result.current.syncStatus).toBe("synced");
      expect(result.current.mutationPending).toBeNull();
      expect(result.current.isGoalUpdateModalOpen).toBe(true);
      expect(optimisticUpdateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          current_status: "offline",
          session_start_time: null,
          break_started_at: null,
          last_resumed_at: null,
          active_study_seconds_snapshot: 0,
        })
      );
    });
  });

  // =========================================================================
  // 5. TRUTHFUL SYNC STATUS INVARIANTS (5 EXACT CONCEPTUAL STATES)
  // =========================================================================
  describe("Truthful Sync Status Invariants", () => {
    it("reports 'synced' when latest mutation is acknowledged and timing info is valid", async () => {
      const initialProfile: UserProfile = {
        id: "user-1",
        display_name: "Subodh",
        current_status: "studying",
        session_start_time: new Date(Date.now() - 600 * 1000).toISOString(),
        last_resumed_at: new Date(Date.now() - 600 * 1000).toISOString(),
      } as UserProfile;

      const { result } = renderHook(() =>
        useActiveSession(initialProfile, undefined, undefined, "connected")
      );

      expect(result.current.syncStatus).toBe("synced");
    });

    it("reports 'syncing' when a mutation is currently in flight", async () => {
      const initialProfile: UserProfile = {
        id: "user-1",
        display_name: "Subodh",
        current_status: "offline",
      } as UserProfile;

      let resolveRpc: (val: any) => void;
      mockRpc.mockImplementation(() => new Promise((res) => { resolveRpc = res; }));

      const { result } = renderHook(() => useActiveSession(initialProfile));

      act(() => {
        result.current.startSession();
      });

      expect(result.current.syncStatus).toBe("syncing");

      await act(async () => {
        resolveRpc!({ data: { success: true }, error: null });
      });

      expect(result.current.syncStatus).toBe("synced");
    });

    it("reports 'syncing' when active studying session is awaiting timer calibration", async () => {
      const calibratingProfile: UserProfile = {
        id: "user-1",
        display_name: "Subodh",
        current_status: "studying",
        session_start_time: null, // missing timestamps
        last_resumed_at: null,
      } as UserProfile;

      const { result } = renderHook(() =>
        useActiveSession(calibratingProfile, undefined, undefined, "connected")
      );

      expect(result.current.syncStatus).toBe("syncing");
    });

    it("reports 'reconnecting' when realtime stream is recovering", async () => {
      const initialProfile: UserProfile = {
        id: "user-1",
        display_name: "Subodh",
        current_status: "studying",
        session_start_time: new Date(Date.now() - 600 * 1000).toISOString(),
        last_resumed_at: new Date(Date.now() - 600 * 1000).toISOString(),
      } as UserProfile;

      const { result } = renderHook(() =>
        useActiveSession(initialProfile, undefined, undefined, "reconnecting")
      );

      expect(result.current.syncStatus).toBe("reconnecting");
    });

    it("reports 'no_network' when device has no usable connection", async () => {
      const initialProfile: UserProfile = {
        id: "user-1",
        display_name: "Subodh",
        current_status: "studying",
        session_start_time: new Date(Date.now() - 600 * 1000).toISOString(),
        last_resumed_at: new Date(Date.now() - 600 * 1000).toISOString(),
      } as UserProfile;

      const originalOnLine = navigator.onLine;
      Object.defineProperty(navigator, "onLine", { value: false, configurable: true });

      const { result } = renderHook(() =>
        useActiveSession(initialProfile, undefined, undefined, "connected")
      );

      expect(result.current.syncStatus).toBe("no_network");

      Object.defineProperty(navigator, "onLine", { value: originalOnLine, configurable: true });
    });

    it("reports 'error' when an RPC mutation fails", async () => {
      const initialProfile: UserProfile = {
        id: "user-1",
        display_name: "Subodh",
        current_status: "offline",
      } as UserProfile;

      mockRpc.mockResolvedValue({
        data: null,
        error: new Error("Network error"),
      });

      const { result } = renderHook(() => useActiveSession(initialProfile));

      await act(async () => {
        await result.current.startSession();
      });

      expect(result.current.syncStatus).toBe("error");
    });
  });

  // =========================================================================
  // 6. AUTHORITATIVE TIMER INVARIANTS: NO 00:00 FOR ACTIVE SESSIONS
  // =========================================================================
  describe("Authoritative Timer Invariant: Never 00:00 for Active Session", () => {
    it("returns correct elapsed seconds when session has both snapshot and active study block", () => {
      const now = new Date();
      const member: UserProfile = {
        id: "pallavi-1",
        display_name: "Pallavi",
        current_status: "studying",
        session_start_time: new Date(now.getTime() - 4626 * 1000).toISOString(), // ~01:17:06
        last_resumed_at: new Date(now.getTime() - 1026 * 1000).toISOString(),   // resumed ~17m ago
        active_study_seconds_snapshot: 3600,                                     // 1 hr accrued previously
      } as UserProfile;

      const elapsed = calculateMemberElapsedStudySeconds(member, now);
      expect(elapsed).toBe(4626);
      expect(isMemberTimerCalibrating(member)).toBe(false);
    });

    it("flags member as calibrating if session_start_time and last_resumed_at are missing", () => {
      const member: UserProfile = {
        id: "pallavi-1",
        display_name: "Pallavi",
        current_status: "studying",
        session_start_time: null,
        last_resumed_at: null,
        active_study_seconds_snapshot: 0,
      } as UserProfile;

      expect(isMemberTimerCalibrating(member)).toBe(true);
    });

    it("calculates accurate elapsed break seconds without corrupting study seconds", () => {
      const now = new Date();
      const breakStart = new Date(now.getTime() - 600 * 1000).toISOString(); // 10m on break
      const breakStatus = calculateBreakStatus(breakStart, now);

      expect(breakStatus.elapsedBreakSeconds).toBe(600);
      expect(breakStatus.remainingBreakSeconds).toBe(3000);
      expect(breakStatus.isExpired).toBe(false);
    });
  });

  // =========================================================================
  // 7. ANDROID NOTIFICATION DEADLINE COMPUTATION
  // =========================================================================
  describe("Android Notification Deadline Logic Invariants", () => {
    it("accurately calculates remaining study seconds to 10-min threshold (10200s) accounting for accrued time", () => {
      // User is at 01:17:06 (4626 seconds accrued)
      const WARNING_THRESHOLD_SECONDS = 10200; // 10 minutes before 3h limit
      const accruedSeconds = 4626;

      const remainingSeconds = Math.max(0, WARNING_THRESHOLD_SECONDS - accruedSeconds);
      // Expected remaining until warning is 10200 - 4626 = 5574 seconds (~1.5 hours away)
      expect(remainingSeconds).toBe(5574);
      expect(remainingSeconds).toBeGreaterThan(0); // MUST NOT trigger immediately
    });

    it("triggers warning only when accrued seconds reach 10200s (final 10m of 3h)", () => {
      const WARNING_THRESHOLD_SECONDS = 10200;
      const accruedUnder = 4626;
      const accruedWarning = 10205; // 10m left
      const accruedExpired = MAX_SESSION_STUDY_SECONDS; // 10800

      expect(accruedUnder >= WARNING_THRESHOLD_SECONDS).toBe(false);
      expect(accruedWarning >= WARNING_THRESHOLD_SECONDS && accruedWarning < MAX_SESSION_STUDY_SECONDS).toBe(true);
      expect(accruedExpired >= MAX_SESSION_STUDY_SECONDS).toBe(true);
    });
  });
});
