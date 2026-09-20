import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import {
  calibrateWithServerTime,
  getServerNow,
  getServerTime,
  resetClockCalibration,
  isServerTimeCalibrated,
} from "@/lib/time/clockSync";
import { calculateMemberElapsedStudySeconds } from "@/lib/time/format";
import { useActiveSession } from "@/hooks/useActiveSession";
import { UserProfile } from "@/lib/supabase/types";

describe("Adversarial Production Reality Verification", () => {
  beforeEach(() => {
    resetClockCalibration();
    if (typeof localStorage !== "undefined") {
      localStorage.clear();
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetClockCalibration();
  });

  describe("Audit 1 & 2: Clock Model & System Clock Tampering Immunity", () => {
    it("preserves elapsed timer accuracy even when local OS clock is manually stepped forward by 15 minutes", () => {
      let mockClientNow = new Date("2026-09-20T12:00:00.000Z").getTime();
      let mockPerfNow = 10000; // 10 seconds into process

      vi.spyOn(Date, "now").mockImplementation(() => mockClientNow);
      vi.spyOn(performance, "now").mockImplementation(() => mockPerfNow);

      // Server is in sync with client at start
      const serverTimestamp = "2026-09-20T12:00:00.000Z";
      calibrateWithServerTime(serverTimestamp, 20); // 20ms RTT -> +10ms one-way

      expect(isServerTimeCalibrated()).toBe(true);

      const userProfile: UserProfile = {
        id: "user-clock-test",
        display_name: "Tamper Tester",
        current_status: "studying",
        session_start_time: "2026-09-20T12:00:00.000Z",
        last_resumed_at: "2026-09-20T12:00:00.000Z",
        active_study_seconds_snapshot: 0,
      } as unknown as UserProfile;

      // Initial elapsed seconds
      const initialElapsed = calculateMemberElapsedStudySeconds(userProfile, getServerNow());
      expect(initialElapsed).toBe(0);

      // Real time elapses by 60 seconds (1 minute of real studying)
      mockPerfNow += 60000;
      mockClientNow += 60000;

      const elapsedAfter1Min = calculateMemberElapsedStudySeconds(userProfile, getServerNow());
      expect(elapsedAfter1Min).toBe(60);

      // ADVERSARIAL ATTACK: User or OS steps wall clock FORWARD by 15 minutes (+900,000ms)
      // Hardware monotonic performance clock only advances by 5 real seconds
      mockClientNow += 900000;
      mockPerfNow += 5000;

      // Because StudyRoom uses hardware monotonic anchor, Date.now() jumping forward 15 minutes
      // MUST NOT cause the study timer to jump by 15 minutes!
      const elapsedAfterTamper = calculateMemberElapsedStudySeconds(userProfile, getServerNow());
      expect(elapsedAfterTamper).toBe(65); // 60s + 5s = 65s, NOT 965s!
    });

    it("preserves elapsed timer accuracy when local OS clock is stepped BACKWARD by 1 hour", () => {
      let mockClientNow = new Date("2026-09-20T14:00:00.000Z").getTime();
      let mockPerfNow = 50000;

      vi.spyOn(Date, "now").mockImplementation(() => mockClientNow);
      vi.spyOn(performance, "now").mockImplementation(() => mockPerfNow);

      calibrateWithServerTime("2026-09-20T14:00:00.000Z", 0);

      const userProfile: UserProfile = {
        id: "user-clock-test-2",
        display_name: "Clock Rewinder",
        current_status: "studying",
        session_start_time: "2026-09-20T14:00:00.000Z",
        last_resumed_at: "2026-09-20T14:00:00.000Z",
        active_study_seconds_snapshot: 0,
      } as unknown as UserProfile;

      // 10 real seconds pass
      mockPerfNow += 10000;
      mockClientNow += 10000;
      expect(calculateMemberElapsedStudySeconds(userProfile, getServerNow())).toBe(10);

      // ADVERSARIAL ATTACK: Local OS clock rewound backward by 1 hour (-3,600,000ms)
      mockClientNow -= 3600000;
      mockPerfNow += 5000; // 5 real seconds pass

      // Monotonic clock prevents timer from reverting to 0 or crashing with negative time
      const elapsedAfterRewind = calculateMemberElapsedStudySeconds(userProfile, getServerNow());
      expect(elapsedAfterRewind).toBe(15); // 10s + 5s = 15s
    });
  });

  describe("Audit 3 & 4: Cold Mount & Truthful Synchronization Semantics", () => {
    it("reports syncStatus as 'syncing' when mounting with unconfirmed provisional disk session", () => {
      // Disk session exists from previous run
      const pastIso = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      localStorage.setItem(
        "studyroom_active_study",
        JSON.stringify({
          userId: "user-1",
          sessionStartTime: pastIso,
          lastResumedAt: pastIso,
          snapshotSeconds: 0,
          focus: "Mathematics",
        })
      );

      // Mount hook with profile === null (auth still loading or network slow)
      const { result } = renderHook(() =>
        useActiveSession(null, undefined, undefined, "connected", false)
      );

      // Status is provisionally recognized so timer does not flash 00:00
      expect(result.current.status).toBe("studying");

      // CRITICAL TRUTHFULNESS: syncStatus MUST NOT be 'synced' while profile is null!
      expect(result.current.syncStatus).toBe("syncing");
    });

    it("transitions from 'syncing' to 'synced' only after server profile confirms session", () => {
      const mockProfile: UserProfile = {
        id: "user-1",
        display_name: "Subodh",
        current_status: "offline",
        session_start_time: null,
        last_resumed_at: null,
        active_study_seconds_snapshot: 0,
      } as unknown as UserProfile;

      const { result, rerender } = renderHook(
        ({ prof }) => useActiveSession(prof, undefined, undefined, "connected", false),
        { initialProps: { prof: null as UserProfile | null } }
      );

      // While profile is null: syncing
      expect(result.current.syncStatus).toBe("syncing");

      // When profile loads from server: synced
      rerender({ prof: mockProfile });
      expect(result.current.syncStatus).toBe("synced");
    });
  });
});
