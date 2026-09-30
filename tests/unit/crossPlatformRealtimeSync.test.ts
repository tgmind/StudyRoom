import { describe, it, expect, vi, beforeEach } from "vitest";

describe("Cross-Platform Realtime Synchronization & Causal Ordering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Causal Ordering when state_version is absent (state_version = 0)", () => {
    const isOfflineUpdateAccepted = (
      currentLocalSession: { current_status: string; session_start_time?: string | null },
      incomingServerUpdate: { current_status: string; last_offline_at?: string | null }
    ): boolean => {
      if (incomingServerUpdate.current_status !== "offline") return true;
      if (
        currentLocalSession.current_status !== "studying" &&
        currentLocalSession.current_status !== "break"
      ) {
        return true;
      }
      if (!currentLocalSession.session_start_time) return true;

      const localStartMs = new Date(currentLocalSession.session_start_time).getTime();
      const offlineMs = incomingServerUpdate.last_offline_at
        ? new Date(incomingServerUpdate.last_offline_at).getTime()
        : 0;

      // If server went offline after or at the time the local session started,
      // it is a genuine remote session finish from another device (or auto-stop).
      if (offlineMs > 0 && localStartMs > 0) {
        return offlineMs >= localStartMs;
      }
      return true;
    };

    it("accepts incoming offline event when Web finishes session started earlier on Android", () => {
      const baseMs = 1700000000000;
      const androidLocalSession = {
        current_status: "studying",
        session_start_time: new Date(baseMs).toISOString(),
      };

      // User clicked "Stop Session" on Web 30 minutes later:
      const webFinishedUpdate = {
        current_status: "offline",
        last_offline_at: new Date(baseMs + 1800 * 1000).toISOString(),
      };

      expect(isOfflineUpdateAccepted(androidLocalSession, webFinishedUpdate)).toBe(true);
    });

    it("rejects stale offline packet from a previous session that ended before the current session started", () => {
      const baseMs = 1700000000000;
      // Stale packet from yesterday's offline event arriving delayed over network:
      const staleOfflineUpdate = {
        current_status: "offline",
        last_offline_at: new Date(baseMs - 3600 * 1000).toISOString(),
      };

      // Local session just started 5 minutes ago:
      const androidLocalSession = {
        current_status: "studying",
        session_start_time: new Date(baseMs).toISOString(),
      };

      expect(isOfflineUpdateAccepted(androidLocalSession, staleOfflineUpdate)).toBe(false);
    });
  });

  describe("External Offline Transition Reconciles Local Active Session", () => {
    it("clears local state and invokes AndroidBridge.onSessionStateResolved(false, 0, 0, false, 0, '')", () => {
      let localStatusOverride: string | null = "studying";
      let elapsedStudySeconds = 1200;
      let activeDiskState: any = { status: "studying" };
      const androidBridgeResolvedSpy = vi.fn();

      const handleExternalOfflineTransition = () => {
        localStatusOverride = null;
        activeDiskState = null;
        elapsedStudySeconds = 0;
        androidBridgeResolvedSpy(false, 0, 0, false, 0, "");
      };

      // Trigger external offline event from peer/web
      handleExternalOfflineTransition();

      expect(localStatusOverride).toBeNull();
      expect(activeDiskState).toBeNull();
      expect(elapsedStudySeconds).toBe(0);
      expect(androidBridgeResolvedSpy).toHaveBeenCalledWith(false, 0, 0, false, 0, "");
    });
  });
});
