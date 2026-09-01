import { describe, it, expect } from "vitest";
import { isDeepNight, isEarlyBird } from "@/lib/time/indicators";

describe("Time Window Indicators (Deep Night & Early Bird)", () => {
  it("correctly identifies Deep Night (12:00 AM to 4:00 AM UTC)", () => {
    const deepNightTime = new Date("2026-09-01T02:30:00Z");
    const daytime = new Date("2026-09-01T14:00:00Z");

    expect(isDeepNight("studying", deepNightTime, "UTC")).toBe(true);
    expect(isDeepNight("break", deepNightTime, "UTC")).toBe(false);
    expect(isDeepNight("offline", deepNightTime, "UTC")).toBe(false);
    expect(isDeepNight("studying", daytime, "UTC")).toBe(false);
  });

  it("correctly identifies Early Bird (4:00 AM to 7:00 AM UTC)", () => {
    const earlyBirdTime = new Date("2026-09-01T05:15:00Z");
    const deepNightTime = new Date("2026-09-01T02:30:00Z");

    expect(isEarlyBird("studying", earlyBirdTime, "UTC")).toBe(true);
    expect(isEarlyBird("break", earlyBirdTime, "UTC")).toBe(false);
    expect(isEarlyBird("studying", deepNightTime, "UTC")).toBe(false);
  });
});
