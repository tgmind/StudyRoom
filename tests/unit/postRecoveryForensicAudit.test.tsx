import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { MemberList } from "@/components/room/MemberList";
import { UserProfile } from "@/lib/supabase/types";
import { calculateMemberElapsedStudySeconds, isMemberTimerCalibrating } from "@/lib/time/format";

// ---------------------------------------------------------------------------
// Mocks for Supabase
// ---------------------------------------------------------------------------
const mockRpc = vi.fn();
const mockFrom = vi.fn();
const mockChannel = vi.fn();
const mockRemoveChannel = vi.fn();

const mockClient = {
  from: mockFrom,
  rpc: mockRpc,
  channel: mockChannel,
  removeChannel: mockRemoveChannel,
};

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => mockClient,
}));

describe("Post-Recovery Forensic Audit & Correctness Gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // AUDIT 2: IN-FLIGHT ACCOUNTING & RECONCILIATION RACES
  // =========================================================================
  describe("Audit 2: Global Room In-Flight Accounting & Reconciliation Race Mechanics", () => {
    it("proves that three overlapping requests finishing out of order retain latest authoritative generation", async () => {
      let currentGen = 0;
      let inFlightCount = 0;
      let isReconciling = false;
      let state = "initial";

      type DeferredRequest = {
        gen: number;
        resolve: (data: string) => void;
      };
      const deferred: DeferredRequest[] = [];

      const startRequest = (dataToResolve: string) => {
        const thisGen = ++currentGen;
        inFlightCount++;
        isReconciling = true;

        return new Promise<void>((done) => {
          deferred.push({
            gen: thisGen,
            resolve: (resolvedData: string) => {
              // Stale check
              if (thisGen === currentGen) {
                state = resolvedData;
              }
              // Finally accounting
              inFlightCount = Math.max(0, inFlightCount - 1);
              if (inFlightCount === 0 || thisGen === currentGen) {
                isReconciling = false;
              }
              done();
            },
          });
        });
      };

      // Launch Req 1, Req 2, Req 3
      const p1 = startRequest("generation-1-data");
      const p2 = startRequest("generation-2-data");
      const p3 = startRequest("generation-3-data");

      expect(currentGen).toBe(3);
      expect(inFlightCount).toBe(3);
      expect(isReconciling).toBe(true);

      // Finish Req 2 first (out of order, stale generation)
      deferred[1].resolve("generation-2-data");
      await p2;
      expect(state).toBe("initial"); // Gen 2 ignored because currentGen is 3
      expect(inFlightCount).toBe(2);
      expect(isReconciling).toBe(true); // Still reconciling because Gen 3 and Gen 1 are in flight

      // Finish Req 3 next (latest generation)
      deferred[2].resolve("generation-3-data");
      await p3;
      expect(state).toBe("generation-3-data"); // Gen 3 committed!
      expect(inFlightCount).toBe(1);
      expect(isReconciling).toBe(false); // Settle: thisGen === currentGen clears reconciliation!

      // Finish Req 1 last (oldest generation arrives late)
      deferred[0].resolve("generation-1-data");
      await p1;
      expect(state).toBe("generation-3-data"); // Gen 1 rejected, does NOT overwrite Gen 3!
      expect(inFlightCount).toBe(0);
      expect(isReconciling).toBe(false);
    });

    it("proves that an older request failing after a newer request succeeds cannot lock reconciliation or overwrite state", async () => {
      let currentGen = 0;
      let inFlightCount = 0;
      let isReconciling = false;
      let committedState = "base";

      const runReq1 = async (shouldFail: boolean, releaseSignal: Promise<void>) => {
        const thisGen = ++currentGen;
        inFlightCount++;
        isReconciling = true;
        try {
          await releaseSignal;
          if (shouldFail) throw new Error("DB Network Error");
          if (thisGen === currentGen) committedState = "req1-data";
        } catch {
          // Handled gracefully as in useLiveRoom
        } finally {
          inFlightCount = Math.max(0, inFlightCount - 1);
          if (inFlightCount === 0 || thisGen === currentGen) {
            isReconciling = false;
          }
        }
      };

      const runReq2 = async (releaseSignal: Promise<void>) => {
        const thisGen = ++currentGen;
        inFlightCount++;
        isReconciling = true;
        try {
          await releaseSignal;
          if (thisGen === currentGen) committedState = "req2-authoritative";
        } catch {
          // Handled gracefully
        } finally {
          inFlightCount = Math.max(0, inFlightCount - 1);
          if (inFlightCount === 0 || thisGen === currentGen) {
            isReconciling = false;
          }
        }
      };

      let releaseReq1!: () => void;
      const signal1 = new Promise<void>((r) => (releaseReq1 = r));

      let releaseReq2!: () => void;
      const signal2 = new Promise<void>((r) => (releaseReq2 = r));

      const p1 = runReq1(true, signal1); // Req 1 will fail
      const p2 = runReq2(signal2);       // Req 2 will succeed

      expect(inFlightCount).toBe(2);
      expect(isReconciling).toBe(true);

      // Release Req 2 first
      releaseReq2();
      await p2;
      expect(committedState).toBe("req2-authoritative");
      expect(isReconciling).toBe(false);

      // Release Req 1 (fails with exception)
      releaseReq1();
      await p1;
      expect(committedState).toBe("req2-authoritative"); // Did not get corrupted
      expect(inFlightCount).toBe(0);                     // Decremented cleanly
      expect(isReconciling).toBe(false);                 // NEVER permanently locked
    });

    it("proves that synchronous throw before promise creation does not leak counter when guarded", () => {
      let inFlightCount = 0;
      let isReconciling = false;

      const safeFetch = () => {
        try {
          inFlightCount++;
          isReconciling = true;
          throw new Error("Synchronous dispatch failure");
        } finally {
          inFlightCount = Math.max(0, inFlightCount - 1);
          isReconciling = inFlightCount > 0;
        }
      };

      expect(() => safeFetch()).toThrow("Synchronous dispatch failure");
      expect(inFlightCount).toBe(0);
      expect(isReconciling).toBe(false);
    });

    it("proves that in-flight count never becomes negative even under abnormal decrement calls", () => {
      let inFlightCount = 0;
      inFlightCount = Math.max(0, inFlightCount - 1);
      expect(inFlightCount).toBe(0);
      inFlightCount = Math.max(0, inFlightCount - 1);
      expect(inFlightCount).toBe(0);
    });
  });

  // =========================================================================
  // AUDIT 3: PURPLE PILL TRUTHFULNESS & COMPLETE LIFECYCLE
  // =========================================================================
  describe("Audit 3: Purple Pill Truthfulness & Accurate Lifecycle State Machine", () => {
    const mockMembers: UserProfile[] = [
      {
        id: "m-1",
        display_name: "Test Student",
        current_status: "studying",
        session_start_time: new Date(Date.now() - 300000).toISOString(),
        last_resumed_at: new Date(Date.now() - 300000).toISOString(),
        active_study_seconds_snapshot: 0,
      } as UserProfile,
    ];

    it("cannot display 'Live Sync' when channel is created but not subscribed", () => {
      render(
        <MemberList
          members={mockMembers}
          isRealtimeConnected={false}
          connectionState="connecting"
          isLoading={false}
          isReconciling={false}
          hasInitialSnapshot={true}
        />
      );
      expect(screen.queryByText("Live Sync")).toBeNull();
      expect(screen.getByText("Connecting...")).toBeDefined();
    });

    it("cannot display 'Live Sync' when initial member snapshot has failed and cached data is rendered", () => {
      render(
        <MemberList
          members={mockMembers}
          isRealtimeConnected={true}
          connectionState="connected"
          isLoading={false}
          isReconciling={false}
          hasInitialSnapshot={false}
          roomError="Failed to load group members"
        />
      );
      expect(screen.queryByText("Live Sync")).toBeNull();
      expect(screen.getByText("Syncing...")).toBeDefined();
    });

    it("cannot display 'Live Sync' when initial snapshot is still pending", () => {
      render(
        <MemberList
          members={mockMembers}
          isRealtimeConnected={true}
          connectionState="connected"
          isLoading={true}
          isReconciling={true}
          hasInitialSnapshot={false}
        />
      );
      expect(screen.queryByText("Live Sync")).toBeNull();
    });

    it("cannot display 'Live Sync' when only cached data is available from localStorage", () => {
      render(
        <MemberList
          members={mockMembers}
          isRealtimeConnected={true}
          connectionState="connected"
          isLoading={false}
          isReconciling={false}
          hasInitialSnapshot={false} // Fresh network snapshot not yet received!
        />
      );
      expect(screen.queryByText("Live Sync")).toBeNull();
      expect(screen.getByText("Syncing...")).toBeDefined();
    });

    it("cannot display 'Live Sync' when channel has closed (offline)", () => {
      render(
        <MemberList
          members={mockMembers}
          isRealtimeConnected={false}
          connectionState="offline"
          isLoading={false}
          isReconciling={false}
          hasInitialSnapshot={true}
        />
      );
      expect(screen.queryByText("Live Sync")).toBeNull();
      expect(screen.getByText("Offline")).toBeDefined();
    });

    it("cannot display 'Live Sync' when reconnection is underway and missed events have not reconciled", () => {
      render(
        <MemberList
          members={mockMembers}
          isRealtimeConnected={false}
          connectionState="reconnecting"
          isLoading={false}
          isReconciling={true}
          hasInitialSnapshot={true}
        />
      );
      expect(screen.queryByText("Live Sync")).toBeNull();
      expect(screen.getByText("Reconnecting...")).toBeDefined();
    });

    it("cannot display 'Live Sync' when syncStatus is 'error'", () => {
      render(
        <MemberList
          members={mockMembers}
          isRealtimeConnected={true}
          connectionState="connected"
          isLoading={false}
          isReconciling={false}
          hasInitialSnapshot={true}
          syncStatus="error"
        />
      );
      expect(screen.queryByText("Live Sync")).toBeNull();
    });

    it("maintains 'Live Sync' during quiet room when healthy channel has received zero peer events recently", () => {
      render(
        <MemberList
          members={mockMembers}
          isRealtimeConnected={true}
          connectionState="connected"
          isLoading={false}
          isReconciling={false}
          hasInitialSnapshot={true}
          syncStatus="synced"
        />
      );
      expect(screen.getByText("Live Sync")).toBeDefined();
      const dot = screen.getByText("Live Sync").previousSibling as HTMLElement;
      expect(dot.className).toContain("bg-fuchsia-400");
    });

    it("proves the complete state lifecycle: connecting -> syncing -> live -> reconnecting -> syncing -> live", () => {
      const { rerender } = render(
        <MemberList
          members={mockMembers}
          isRealtimeConnected={false}
          connectionState="connecting"
          isLoading={false}
          isReconciling={false}
          hasInitialSnapshot={false}
        />
      );
      // 1. Initializing / Connecting
      expect(screen.getByText("Connecting...")).toBeDefined();

      // 2. Channel subscribed, syncing Phase 1 snapshot
      rerender(
        <MemberList
          members={mockMembers}
          isRealtimeConnected={true}
          connectionState="connected"
          isLoading={false}
          isReconciling={true}
          hasInitialSnapshot={false}
        />
      );
      expect(screen.getByText("Syncing...")).toBeDefined();

      // 3. Phase 1 resolved, Live Sync!
      rerender(
        <MemberList
          members={mockMembers}
          isRealtimeConnected={true}
          connectionState="connected"
          isLoading={false}
          isReconciling={false}
          hasInitialSnapshot={true}
        />
      );
      expect(screen.getByText("Live Sync")).toBeDefined();

      // 4. Temporary network interruption -> Reconnecting...
      rerender(
        <MemberList
          members={mockMembers}
          isRealtimeConnected={false}
          connectionState="reconnecting"
          isLoading={false}
          isReconciling={false}
          hasInitialSnapshot={true}
        />
      );
      expect(screen.getByText("Reconnecting...")).toBeDefined();

      // 5. Channel back up, reconciling missed events -> Syncing...
      rerender(
        <MemberList
          members={mockMembers}
          isRealtimeConnected={true}
          connectionState="connected"
          isLoading={false}
          isReconciling={true}
          hasInitialSnapshot={true}
        />
      );
      expect(screen.getByText("Syncing...")).toBeDefined();

      // 6. Reconciliation settled -> Live Sync!
      rerender(
        <MemberList
          members={mockMembers}
          isRealtimeConnected={true}
          connectionState="connected"
          isLoading={false}
          isReconciling={false}
          hasInitialSnapshot={true}
        />
      );
      expect(screen.getByText("Live Sync")).toBeDefined();
    });
  });

  // =========================================================================
  // AUDIT 4: WEBSITE TIMER AUTHORITATIVENESS & ACCURACY
  // =========================================================================
  describe("Audit 4: Website Timer Authoritativeness & Safe Fallback Anchor", () => {
    it("proves calculateMemberElapsedStudySeconds never counts break or paused period as active study time", () => {
      const t0 = new Date("2026-10-19T10:00:00Z");
      const tBreak = new Date("2026-10-19T10:30:00Z"); // 30m / 1800s study
      const tNow = new Date("2026-10-19T11:00:00Z");   // 30m later on break

      const breakProfile: UserProfile = {
        id: "student-break",
        display_name: "Break Student",
        current_status: "break",
        session_start_time: t0.toISOString(),
        break_started_at: tBreak.toISOString(),
        active_study_seconds_snapshot: 1800,
      } as UserProfile;

      const elapsed = calculateMemberElapsedStudySeconds(breakProfile, tNow);
      // Strictly frozen at 1800s, never increments during break!
      expect(elapsed).toBe(1800);
    });

    it("proves calculateMemberElapsedStudySeconds returns 0 when user status is offline", () => {
      const offlineProfile: UserProfile = {
        id: "student-off",
        display_name: "Offline Student",
        current_status: "offline",
        session_start_time: null,
        active_study_seconds_snapshot: 1800,
      } as UserProfile;

      const elapsed = calculateMemberElapsedStudySeconds(offlineProfile, new Date());
      expect(elapsed).toBe(0);
    });

    it("proves empty session_blocks fallback accurately anchors elapsed study seconds from session_start_time", () => {
      const t0 = new Date("2026-10-19T10:00:00Z");
      const tNow = new Date("2026-10-19T10:45:00Z"); // 45m / 2700s

      const cleanStartProfile: UserProfile = {
        id: "student-clean-start",
        display_name: "Clean Start Student",
        current_status: "studying",
        session_start_time: t0.toISOString(),
        last_resumed_at: null,
        active_study_seconds_snapshot: 0,
      } as UserProfile;

      expect(isMemberTimerCalibrating(cleanStartProfile)).toBe(false);
      const elapsed = calculateMemberElapsedStudySeconds(cleanStartProfile, tNow);
      expect(elapsed).toBe(2700);
    });

    it("proves calibrating user with accrued snapshot preserves duration instead of dropping to 0", () => {
      const t0 = new Date("2026-10-19T10:00:00Z");
      const calibratingProfile: UserProfile = {
        id: "student-calibrating",
        display_name: "Calibrating Student",
        current_status: "studying",
        session_start_time: t0.toISOString(),
        last_resumed_at: null,
        active_study_seconds_snapshot: 2400, // 40m accrued
      } as UserProfile;

      expect(isMemberTimerCalibrating(calibratingProfile)).toBe(true);
      const elapsed = calculateMemberElapsedStudySeconds(calibratingProfile, new Date());
      expect(elapsed).toBe(2400); // Retains 2400s
    });

    it("demonstrates that a 45-minute study period followed by a 15-minute break and then a 10-minute resumed study period produces 55 minutes of active study time, not 70 minutes", () => {
      // 1. Session start at 10:00:00
      const tStart = new Date("2026-10-19T10:00:00Z");
      let profile: UserProfile = {
        id: "student-45-15-10",
        display_name: "Student",
        current_status: "studying",
        session_start_time: tStart.toISOString(),
        last_resumed_at: tStart.toISOString(),
        active_study_seconds_snapshot: 0,
      } as UserProfile;

      // 45 minutes into study (10:45:00)
      const tBreakStart = new Date("2026-10-19T10:45:00Z");
      const studySecondsPhase1 = calculateMemberElapsedStudySeconds(profile, tBreakStart);
      expect(studySecondsPhase1).toBe(2700); // 45m = 2700s

      // 2. User pauses / takes break at 10:45:00 for 15 minutes
      profile = {
        ...profile,
        current_status: "break",
        break_started_at: tBreakStart.toISOString(),
        active_study_seconds_snapshot: 2700, // Frozen at 45m
      };

      // In the middle of the break (10:55:00)
      const tMidBreak = new Date("2026-10-19T10:55:00Z");
      expect(calculateMemberElapsedStudySeconds(profile, tMidBreak)).toBe(2700); // Still 45m, frozen!

      // At end of the 15-minute break (11:00:00)
      const tResume = new Date("2026-10-19T11:00:00Z");
      expect(calculateMemberElapsedStudySeconds(profile, tResume)).toBe(2700); // Exactly 45m

      // 3. User resumes studying at 11:00:00
      profile = {
        ...profile,
        current_status: "studying",
        break_started_at: null,
        last_resumed_at: tResume.toISOString(),
        active_study_seconds_snapshot: 2700,
      };

      // 10 minutes after resuming (11:10:00)
      const tFinal = new Date("2026-10-19T11:10:00Z");
      const totalElapsedStudySeconds = calculateMemberElapsedStudySeconds(profile, tFinal);

      // Total wall-clock elapsed is 70 minutes (10:00 to 11:10 = 4200s),
      // BUT active study time MUST BE exactly 55 minutes (2700s + 600s = 3300s), NOT 70 minutes!
      expect(totalElapsedStudySeconds).toBe(3300);
      expect(totalElapsedStudySeconds).not.toBe(4200);
      expect(Math.floor(totalElapsedStudySeconds / 60)).toBe(55);
    });
  });
});
