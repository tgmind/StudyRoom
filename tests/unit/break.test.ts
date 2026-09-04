import { describe, it, expect } from "vitest";
import { calculateBreakStatus, MAX_BREAK_SECONDS, isMemberBreakExpired, getEffectiveMemberStatus } from "@/lib/time/break";

describe("Break Timer Calculations", () => {
  it("returns default zero values when no break start time is provided", () => {
    const status = calculateBreakStatus(null);
    expect(status.elapsedBreakSeconds).toBe(0);
    expect(status.remainingBreakSeconds).toBe(MAX_BREAK_SECONDS);
    expect(status.isExpired).toBe(false);
  });

  it("calculates 15 minutes of break correctly", () => {
    const start = new Date("2026-09-01T10:00:00Z");
    const now = new Date("2026-09-01T10:15:30Z");

    const status = calculateBreakStatus(start, now);
    expect(status.elapsedBreakSeconds).toBe(930); // 15m 30s
    expect(status.remainingBreakSeconds).toBe(3600 - 930); // 2670s
    expect(status.formattedElapsed).toBe("15:30");
    expect(status.isExpired).toBe(false);
  });

  it("identifies break expiration at and beyond 1 hour (3600s)", () => {
    const start = new Date("2026-09-01T10:00:00Z");
    const exactlyOneHour = new Date("2026-09-01T11:00:00Z");
    const beyondOneHour = new Date("2026-09-01T11:05:00Z");

    const exactStatus = calculateBreakStatus(start, exactlyOneHour);
    expect(exactStatus.elapsedBreakSeconds).toBe(3600);
    expect(exactStatus.remainingBreakSeconds).toBe(0);
    expect(exactStatus.isExpired).toBe(true);

    const beyondStatus = calculateBreakStatus(start, beyondOneHour);
    expect(beyondStatus.elapsedBreakSeconds).toBe(3900);
    expect(beyondStatus.remainingBreakSeconds).toBe(0);
    expect(beyondStatus.isExpired).toBe(true);
  });

  describe("isMemberBreakExpired & getEffectiveMemberStatus", () => {
    it("correctly identifies active breaks within 1 hour as not expired", () => {
      const now = new Date("2026-09-01T12:00:00Z");
      const breakStarted = new Date("2026-09-01T11:45:00Z").toISOString(); // 15 mins ago

      const member = { current_status: "break" as const, break_started_at: breakStarted };
      expect(isMemberBreakExpired(member, now)).toBe(false);
      expect(getEffectiveMemberStatus(member, now)).toBe("break");
    });

    it("identifies breaks >= 1 hour as expired and returns effective status 'offline'", () => {
      const now = new Date("2026-09-01T12:00:00Z");
      const breakStarted65m = new Date("2026-09-01T10:55:00Z").toISOString(); // 65 mins ago

      const member = { current_status: "break" as const, break_started_at: breakStarted65m };
      expect(isMemberBreakExpired(member, now)).toBe(true);
      expect(getEffectiveMemberStatus(member, now)).toBe("offline");
    });

    it("preserves studying within 3 hours and expires studying >= 3 hours to 'offline'", () => {
      const now = new Date("2026-09-01T12:00:00Z");

      // Studying for 2 hours 10 minutes (7800s): still active within 3-hour limit!
      const activeStudying2h = {
        current_status: "studying" as const,
        last_resumed_at: new Date("2026-09-01T09:50:00Z").toISOString(),
        active_study_seconds_snapshot: 0,
      };
      expect(getEffectiveMemberStatus(activeStudying2h, now)).toBe("studying");

      // Studying for 3 hours 10 minutes (11400s): expired to 'offline'!
      const expiredStudying3h = {
        current_status: "studying" as const,
        last_resumed_at: new Date("2026-09-01T08:50:00Z").toISOString(),
        active_study_seconds_snapshot: 0,
      };
      expect(getEffectiveMemberStatus(expiredStudying3h, now)).toBe("offline");

      // Offline member remains offline
      expect(getEffectiveMemberStatus({ current_status: "offline" }, now)).toBe("offline");
    });
  });
});
