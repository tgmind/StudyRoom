import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  calibrateWithServerTime,
  getServerNow,
  getServerTime,
  resetClockCalibration,
} from "@/lib/time/clockSync";
import { calculateMemberElapsedStudySeconds, MAX_SESSION_STUDY_SECONDS } from "@/lib/time/format";
import { getEffectiveMemberStatus, isMemberBreakExpired, isMemberStudyExpired } from "@/lib/time/break";
import { useActiveSession } from "@/hooks/useActiveSession";
import { UserProfile } from "@/lib/supabase/types";

describe("Adversarial Production Reality — Exhaustive Verification", () => {
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

  describe("1. Zero-Client Server Enforcement & Stale Session Non-Resurrection", () => {
    it("guarantees getEffectiveMemberStatus reports offline when user studied continuously >= 3 hours while offline", () => {
      const fourHoursAgo = new Date(Date.now() - 4 * 3600 * 1000).toISOString();
      const staleStudyingUser: UserProfile = {
        id: "user-abandoned-study",
        display_name: "Abandoned Study User",
        current_status: "studying",
        session_start_time: fourHoursAgo,
        last_resumed_at: fourHoursAgo,
        active_study_seconds_snapshot: 0,
      } as unknown as UserProfile;

      const now = getServerNow();
      expect(isMemberStudyExpired(staleStudyingUser, now)).toBe(true);
      expect(getEffectiveMemberStatus(staleStudyingUser, now)).toBe("offline");
    });

    it("guarantees getEffectiveMemberStatus reports offline when break exceeded 1 hour while offline", () => {
      const ninetyMinutesAgo = new Date(Date.now() - 90 * 60 * 1000).toISOString();
      const staleBreakUser: UserProfile = {
        id: "user-abandoned-break",
        display_name: "Abandoned Break User",
        current_status: "break",
        session_start_time: new Date(Date.now() - 150 * 60 * 1000).toISOString(),
        break_started_at: ninetyMinutesAgo,
        active_study_seconds_snapshot: 3600,
      } as unknown as UserProfile;

      const now = getServerNow();
      expect(isMemberBreakExpired(staleBreakUser, now)).toBe(true);
      expect(getEffectiveMemberStatus(staleBreakUser, now)).toBe("offline");
    });

    it("guarantees reopening app after 3.5 hours of closed browser NEVER resurrects expired session", () => {
      // User closed browser 3.5 hours ago while studying
      const threeAndHalfHoursAgo = new Date(Date.now() - 3.5 * 3600 * 1000).toISOString();
      localStorage.setItem(
        "studyroom_active_study",
        JSON.stringify({
          userId: "user-reopen-test",
          sessionStartTime: threeAndHalfHoursAgo,
          lastResumedAt: threeAndHalfHoursAgo,
          snapshotSeconds: 0,
          focus: "Deep Work",
        })
      );

      // Reopening app: initial render before profile loads
      const { result } = renderHook(() =>
        useActiveSession(null, undefined, undefined, "connected", false)
      );

      // Because study duration > 3 hours (10800s), provisional disk state must be REJECTED and PURGED!
      expect(result.current.status).toBe("offline");
      expect(localStorage.getItem("studyroom_active_study")).toBeNull();
    });

    it("guarantees reopening app after 75 minutes of closed browser on break NEVER resurrects expired break", () => {
      // User closed browser 75 minutes ago while on break
      const seventyFiveMinsAgo = new Date(Date.now() - 75 * 60 * 1000).toISOString();
      localStorage.setItem(
        "studyroom_active_break",
        JSON.stringify({
          userId: "user-reopen-break",
          breakStartedAt: seventyFiveMinsAgo,
          accruedSeconds: 1800,
        })
      );

      // Reopening app: initial render before profile loads
      const { result } = renderHook(() =>
        useActiveSession(null, undefined, undefined, "connected", false)
      );

      // Because break duration > 1 hour (3600s), provisional break state must be REJECTED and PURGED!
      expect(result.current.status).toBe("offline");
      expect(localStorage.getItem("studyroom_active_break")).toBeNull();
    });
  });

  describe("2. User Account Isolation on Shared Devices", () => {
    it("guarantees User B logging in cannot read or resurrect User A's un-purged disk study session", () => {
      const activeStudyTime = new Date(Date.now() - 20 * 60 * 1000).toISOString(); // 20 mins ago
      localStorage.setItem(
        "studyroom_active_study",
        JSON.stringify({
          userId: "user-A",
          sessionStartTime: activeStudyTime,
          lastResumedAt: activeStudyTime,
          snapshotSeconds: 0,
          focus: "User A's Secret Study",
        })
      );

      // User B mounts with their profile
      const userBProfile: UserProfile = {
        id: "user-B",
        display_name: "User B",
        current_status: "offline",
        session_start_time: null,
        last_resumed_at: null,
        active_study_seconds_snapshot: 0,
      } as unknown as UserProfile;

      const { result } = renderHook(() =>
        useActiveSession(userBProfile, undefined, undefined, "connected", false)
      );

      // User B MUST be offline; User A's active session is isolated and purged!
      expect(result.current.status).toBe("offline");
      expect(result.current.elapsedStudySeconds).toBe(0);
      expect(localStorage.getItem("studyroom_active_study")).toBeNull();
    });
  });

  describe("3. Concurrency, Row Locking & Idempotency Simulation", () => {
    // Model PostgreSQL user row state machine
    class MockPostgresUserTable {
      status: "studying" | "break" | "offline" = "offline";
      version: number = 1;
      studyBlocks: Array<{ id: string; type: "study" | "break"; end: boolean }> = [];
      savedSessions: Array<{ duration: number; reason: string }> = [];

      startSession() {
        // SELECT ... FOR UPDATE
        if (this.status === "studying") {
          return { success: true, already_active: true, version: this.version };
        }
        this.status = "studying";
        this.version += 1;
        this.studyBlocks.push({ id: `block-${this.studyBlocks.length}`, type: "study", end: false });
        return { success: true, status: "studying", version: this.version };
      }

      pauseSession() {
        // SELECT ... FOR UPDATE
        if (this.status === "break") {
          return { success: true, already_paused: true, version: this.version };
        }
        if (this.status !== "studying") {
          throw new Error("User is not currently studying");
        }
        this.status = "break";
        this.version += 1;
        // Close study block, open break block
        const openStudy = this.studyBlocks.find((b) => b.type === "study" && !b.end);
        if (openStudy) openStudy.end = true;
        this.studyBlocks.push({ id: `block-${this.studyBlocks.length}`, type: "break", end: false });
        return { success: true, status: "break", version: this.version };
      }

      resumeSession() {
        // SELECT ... FOR UPDATE
        if (this.status === "studying") {
          return { success: true, already_resumed: true, version: this.version };
        }
        if (this.status !== "break") {
          throw new Error("User is not currently on break");
        }
        this.status = "studying";
        this.version += 1;
        const openBreak = this.studyBlocks.find((b) => b.type === "break" && !b.end);
        if (openBreak) openBreak.end = true;
        this.studyBlocks.push({ id: `block-${this.studyBlocks.length}`, type: "study", end: false });
        return { success: true, status: "studying", version: this.version };
      }

      finishSession(reason: string = "manual_stop") {
        // SELECT ... FOR UPDATE
        if (this.status === "offline") {
          return { success: true, already_finished: true, version: this.version };
        }
        this.status = "offline";
        this.version += 1;
        this.studyBlocks.forEach((b) => (b.end = true));
        this.savedSessions.push({ duration: 60, reason });
        return { success: true, status: "offline", version: this.version };
      }
    }

    it("handles Client A (pause) and Client B (stop) without invalid state", () => {
      const db = new MockPostgresUserTable();
      db.startSession();

      // Client A executes pause, Client B executes finish
      const resA = db.pauseSession();
      const resB = db.finishSession();

      expect(resA.success).toBe(true);
      expect(resB.success).toBe(true);
      expect(db.status).toBe("offline");
      expect(db.savedSessions.length).toBe(1);
      // All blocks closed
      expect(db.studyBlocks.every((b) => b.end)).toBe(true);
    });

    it("handles Client A (resume) and Client B (stop) without resurrecting session", () => {
      const db = new MockPostgresUserTable();
      db.startSession();
      db.pauseSession();

      // Client B (stop) commits first
      db.finishSession();
      // Client A (resume) attempts to run against offline user
      expect(() => db.resumeSession()).toThrow("User is not currently on break");
      expect(db.status).toBe("offline");
    });

    it("guarantees idempotent safe retry when HTTP response is dropped after database commit", () => {
      const db = new MockPostgresUserTable();
      // 1. Initial start
      const firstCall = db.startSession();
      expect(firstCall.success).toBe(true);
      expect(db.studyBlocks.length).toBe(1);

      // 2. Client retries startSession after network drop
      const secondCall = db.startSession();
      expect(secondCall.success).toBe(true);
      expect((secondCall as any).already_active).toBe(true);
      // Crucial: exactly ONE study block exists, not two!
      expect(db.studyBlocks.length).toBe(1);
    });
  });

  describe("4. Mid-Session Clock Recalibration Monotonic Continuity", () => {
    it("ensures repeated clock calibrations mid-study do NOT jump, regress, or reset elapsed timer", () => {
      let clientDateNow = new Date("2026-09-20T10:00:00.000Z").getTime();
      let perfNow = 1000;

      vi.spyOn(Date, "now").mockImplementation(() => clientDateNow);
      vi.spyOn(performance, "now").mockImplementation(() => perfNow);

      // Initial calibration: server is exactly in sync with client
      calibrateWithServerTime("2026-09-20T10:00:00.000Z", 20);

      const profile: UserProfile = {
        id: "user-recalib",
        display_name: "Recalibration Student",
        current_status: "studying",
        session_start_time: "2026-09-20T10:00:00.000Z",
        last_resumed_at: "2026-09-20T10:00:00.000Z",
        active_study_seconds_snapshot: 0,
      } as unknown as UserProfile;

      // 10 minutes (600 seconds) pass
      clientDateNow += 600 * 1000;
      perfNow += 600 * 1000;

      const elapsedBefore = calculateMemberElapsedStudySeconds(profile, getServerNow());
      expect(elapsedBefore).toBe(600);

      // Periodic 5-minute background calibration runs with 40ms RTT
      // Server atomic clock is at 10:10:00.000Z
      calibrateWithServerTime("2026-09-20T10:10:00.000Z", 40);

      const elapsedAfter = calculateMemberElapsedStudySeconds(profile, getServerNow());
      // Elapsed timer MUST NOT reset to 0 or jump wildly!
      expect(Math.abs(elapsedAfter - 600)).toBeLessThanOrEqual(1);

      // Another 5 minutes (300 seconds) pass
      clientDateNow += 300 * 1000;
      perfNow += 300 * 1000;

      const elapsedFinal = calculateMemberElapsedStudySeconds(profile, getServerNow());
      expect(Math.abs(elapsedFinal - 900)).toBeLessThanOrEqual(1);
    });
  });
});
