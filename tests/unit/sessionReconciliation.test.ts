import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useActiveSession } from "@/hooks/useActiveSession";
import { UserProfile, SessionBlock } from "@/lib/supabase/types";
import { isMemberTimerCalibrating } from "@/lib/time/format";

const mockRpc = vi.fn();
const mockFrom = vi.fn();

const mockClient = {
  from: mockFrom,
  rpc: mockRpc,
};

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => mockClient,
}));

describe("Timer Sync & Authoritative Session Reconciliation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
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
    if (typeof localStorage !== "undefined") {
      localStorage.clear();
    }
  });

  describe("Multi-Tier Timer Fallback (Tier 2: session_blocks)", () => {
    it("uses active server blocks to compute elapsed seconds when profile timestamps are null", async () => {
      const calibratingProfile: UserProfile = {
        id: "user-test-1",
        display_name: "Subodh",
        current_status: "studying",
        session_start_time: null, // missing timestamps!
        last_resumed_at: null,
        break_started_at: null,
        active_study_seconds_snapshot: 0,
      } as UserProfile;

      expect(isMemberTimerCalibrating(calibratingProfile)).toBe(true);

      const serverNow = new Date("2026-10-01T12:00:00Z");
      vi.setSystemTime(serverNow);

      const serverBlocks: SessionBlock[] = [
        {
          id: "block-1",
          user_id: "user-test-1",
          session_id: null,
          block_type: "study",
          start_time: new Date(serverNow.getTime() - 1500 * 1000).toISOString(),
          end_time: null,
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
        useActiveSession(calibratingProfile, undefined, undefined, "connected")
      );

      // syncStatus truthfully reports syncing while calibrating
      expect(result.current.syncStatus).toBe("syncing");

      // Wait for fetchSessionBlocks promise resolution
      await act(async () => {
        await Promise.resolve();
      });

      // Instead of 00:00, timer successfully computes 1500 seconds from server blocks!
      expect(result.current.elapsedStudySeconds).toBeGreaterThanOrEqual(1500);
    });
  });

  describe("Automatic Debounced Self-Healing (rpc_synchronize_session)", () => {
    it("invokes rpc_synchronize_session after 1200ms grace period and repairs state", async () => {
      const calibratingProfile: UserProfile = {
        id: "user-test-2",
        display_name: "Subodh",
        current_status: "studying",
        session_start_time: null,
        last_resumed_at: null,
        break_started_at: null,
        active_study_seconds_snapshot: 0,
      } as UserProfile;

      const optimisticUpdateSpy = vi.fn();

      mockRpc.mockResolvedValue({
        data: {
          success: true,
          status: "studying",
          repaired: true,
          reason: "repaired_from_server_blocks",
          session_start_time: "2026-10-01T10:00:00Z",
          last_resumed_at: "2026-10-01T10:00:00Z",
          break_started_at: null,
          active_study_seconds_snapshot: 0,
          elapsed_seconds: 3600,
          state_version: 2,
          server_now: "2026-10-01T11:00:00Z",
        },
        error: null,
      });

      const { result } = renderHook(() =>
        useActiveSession(
          calibratingProfile,
          undefined,
          optimisticUpdateSpy,
          "connected",
          false
        )
      );

      expect(result.current.syncStatus).toBe("syncing");
      // RPC should not have been called yet immediately (grace period active)
      expect(mockRpc).not.toHaveBeenCalledWith("rpc_synchronize_session");

      // Advance timers by 1200ms to trigger reconciliation
      await act(async () => {
        vi.advanceTimersByTime(1200);
      });

      expect(mockRpc).toHaveBeenCalledWith("rpc_synchronize_session");
      expect(optimisticUpdateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          current_status: "studying",
          session_start_time: "2026-10-01T10:00:00Z",
          last_resumed_at: "2026-10-01T10:00:00Z",
        })
      );
    });

    it("cleanses ghost session when server returns ghost_session_cleaned", async () => {
      const calibratingProfile: UserProfile = {
        id: "user-test-ghost",
        display_name: "Ghost User",
        current_status: "studying",
        session_start_time: null,
        last_resumed_at: null,
        break_started_at: null,
        active_study_seconds_snapshot: 0,
      } as UserProfile;

      const optimisticUpdateSpy = vi.fn();

      mockRpc.mockResolvedValue({
        data: {
          success: true,
          status: "offline",
          repaired: true,
          reason: "ghost_session_cleaned",
          session_start_time: null,
          last_resumed_at: null,
          break_started_at: null,
          active_study_seconds_snapshot: 0,
          elapsed_seconds: 0,
          state_version: 2,
          server_now: "2026-10-01T11:00:00Z",
        },
        error: null,
      });

      const { result } = renderHook(() =>
        useActiveSession(
          calibratingProfile,
          undefined,
          optimisticUpdateSpy,
          "connected",
          false
        )
      );

      await act(async () => {
        vi.advanceTimersByTime(1200);
      });

      expect(mockRpc).toHaveBeenCalledWith("rpc_synchronize_session");
      expect(optimisticUpdateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          current_status: "offline",
          session_start_time: null,
        })
      );
      expect(result.current.elapsedStudySeconds).toBe(0);
    });

    it("opens break expired notice when server returns break_expired", async () => {
      const calibratingProfile: UserProfile = {
        id: "user-test-break",
        display_name: "Break User",
        current_status: "studying",
        session_start_time: null,
        last_resumed_at: null,
      } as UserProfile;

      mockRpc.mockResolvedValue({
        data: {
          success: true,
          status: "offline",
          repaired: true,
          reason: "break_expired",
          session_start_time: null,
          last_resumed_at: null,
          break_started_at: null,
          active_study_seconds_snapshot: 1800,
          elapsed_seconds: 1800,
          state_version: 3,
          server_now: "2026-10-01T11:00:00Z",
        },
        error: null,
      });

      const { result } = renderHook(() =>
        useActiveSession(calibratingProfile, undefined, undefined, "connected", false)
      );

      await act(async () => {
        vi.advanceTimersByTime(1200);
      });

      expect(result.current.isBreakExpiredNoticeOpen).toBe(true);
      expect(result.current.savedStudySecondsOnBreakExpiry).toBe(1800);
    });

    it("opens session limit notice when server returns session_limit_exceeded", async () => {
      const calibratingProfile: UserProfile = {
        id: "user-test-limit",
        display_name: "Limit User",
        current_status: "studying",
        session_start_time: null,
        last_resumed_at: null,
      } as UserProfile;

      mockRpc.mockResolvedValue({
        data: {
          success: true,
          status: "offline",
          repaired: true,
          reason: "session_limit_exceeded",
          session_start_time: null,
          last_resumed_at: null,
          break_started_at: null,
          active_study_seconds_snapshot: 0,
          elapsed_seconds: 10800,
          state_version: 4,
          server_now: "2026-10-01T11:00:00Z",
        },
        error: null,
      });

      const { result } = renderHook(() =>
        useActiveSession(calibratingProfile, undefined, undefined, "connected", false)
      );

      await act(async () => {
        vi.advanceTimersByTime(1200);
      });

      expect(result.current.isSessionLimitNoticeOpen).toBe(true);
      expect(result.current.savedStudySecondsOnLimit).toBe(10800);
    });
  });

  describe("Interactive Force Synchronization (forceSynchronizeSession)", () => {
    it("invokes rpc_synchronize_session immediately without waiting for grace period", async () => {
      const calibratingProfile: UserProfile = {
        id: "user-test-manual",
        display_name: "Manual User",
        current_status: "studying",
        session_start_time: null,
        last_resumed_at: null,
      } as UserProfile;

      mockRpc.mockResolvedValue({
        data: {
          success: true,
          status: "studying",
          repaired: true,
          reason: "repaired_from_server_blocks",
          session_start_time: "2026-10-01T10:00:00Z",
          last_resumed_at: "2026-10-01T10:00:00Z",
          break_started_at: null,
          active_study_seconds_snapshot: 0,
          elapsed_seconds: 2400,
          state_version: 5,
          server_now: "2026-10-01T10:40:00Z",
        },
        error: null,
      });

      const { result } = renderHook(() =>
        useActiveSession(calibratingProfile, undefined, undefined, "connected", false)
      );

      expect(mockRpc).not.toHaveBeenCalledWith("rpc_synchronize_session");

      // Trigger manual interactive force synchronization
      await act(async () => {
        await result.current.forceSynchronizeSession();
      });

      expect(mockRpc).toHaveBeenCalledWith("rpc_synchronize_session");
      expect(result.current.elapsedStudySeconds).toBe(2400);
    });
  });

  describe("Memory Continuity & Monotonicity (Tier 4)", () => {
    it("preserves elapsed seconds monotonically rather than dropping to 0 when profile transitions into calibrating state", async () => {
      const serverNow = new Date("2026-10-01T12:00:00Z");
      vi.setSystemTime(serverNow);

      const activeProfile: UserProfile = {
        id: "user-continuity",
        display_name: "Continuity User",
        current_status: "studying",
        session_start_time: new Date(serverNow.getTime() - 600 * 1000).toISOString(),
        last_resumed_at: new Date(serverNow.getTime() - 600 * 1000).toISOString(),
        break_started_at: null,
        active_study_seconds_snapshot: 0,
      } as UserProfile;

      const { result, rerender } = renderHook(
        ({ prof }) => useActiveSession(prof, undefined, undefined, "connected", false),
        { initialProps: { prof: activeProfile } }
      );

      expect(result.current.elapsedStudySeconds).toBe(600);

      // Transition profile to calibrating (e.g. partial update where timestamps are missing)
      const calibratingProfile: UserProfile = {
        ...activeProfile,
        session_start_time: null,
        last_resumed_at: null,
      };

      rerender({ prof: calibratingProfile });

      // Advance clock by 1s
      await act(async () => {
        vi.advanceTimersByTime(1000);
      });

      // Crucial: elapsedStudySeconds does NOT collapse to 00:00! It retains 600 seconds!
      expect(result.current.elapsedStudySeconds).toBeGreaterThanOrEqual(600);
    });

    it("guarantees that an externally terminated session's elapsed time never leaks into a newly started session", async () => {
      const serverNow = new Date("2026-10-01T12:00:00Z");
      vi.setSystemTime(serverNow);

      // 1. Previous session has non-zero elapsed time (1800s)
      const sessionAProfile: UserProfile = {
        id: "user-leak-test",
        display_name: "Leak Test User",
        current_status: "studying",
        session_start_time: new Date(serverNow.getTime() - 1800 * 1000).toISOString(),
        last_resumed_at: new Date(serverNow.getTime() - 1800 * 1000).toISOString(),
        break_started_at: null,
        active_study_seconds_snapshot: 0,
      } as UserProfile;

      const { result, rerender } = renderHook(
        ({ prof }) => useActiveSession(prof, undefined, undefined, "connected", false),
        { initialProps: { prof: sessionAProfile } }
      );

      expect(result.current.elapsedStudySeconds).toBe(1800);

      // 2. Previous session is externally terminated (e.g. from another device or admin)
      const externalOfflineProfile: UserProfile = {
        ...sessionAProfile,
        current_status: "offline",
        session_start_time: null,
        last_resumed_at: null,
        last_offline_at: serverNow.toISOString(),
      };

      rerender({ prof: externalOfflineProfile });
      expect(result.current.status).toBe("offline");

      // 3. User begins a new session (Session B)
      mockRpc.mockResolvedValueOnce({
        data: {
          success: true,
          session_id: "new-session-b",
          server_now: serverNow.toISOString(),
        },
        error: null,
      });

      await act(async () => {
        await result.current.startSession();
      });

      // 4 & 5. The previous elapsed value (1800s) cannot be returned by Tier-4 fallback
      // New session begins from 0 and authoritative state
      expect(result.current.elapsedStudySeconds).toBe(0);
      expect(result.current.elapsedStudySeconds).not.toBe(1800);
      expect(result.current.status).toBe("studying");
    });
  });
});
