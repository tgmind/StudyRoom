import { describe, it, expect } from "vitest";
import { calculateGoalCountdown } from "@/lib/time/countdown";

describe("24-Hour Goal Countdown Utility", () => {
  it("calculates remaining time derived from expires_at timestamp", () => {
    const now = new Date("2026-09-01T10:00:00Z");
    const expiresAt = new Date("2026-09-02T10:00:00Z").toISOString(); // 24 hours later

    const res = calculateGoalCountdown(expiresAt, now);
    expect(res.isExpired).toBe(false);
    expect(res.remainingSeconds).toBe(86400);
    expect(res.formattedText).toBe("24h 0m remaining");
  });

  it("handles expired goal window correctly", () => {
    const now = new Date("2026-09-02T11:00:00Z");
    const expiresAt = new Date("2026-09-02T10:00:00Z").toISOString();

    const res = calculateGoalCountdown(expiresAt, now);
    expect(res.isExpired).toBe(true);
    expect(res.remainingSeconds).toBe(0);
    expect(res.formattedText).toBe("EXPIRED");
  });
});
