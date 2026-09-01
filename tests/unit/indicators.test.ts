import { describe, it, expect } from "vitest";
import { isDeepNight, isEarlyBird } from "@/lib/time/indicators";

describe("Time Window Indicators (Deep Night & Early Bird)", () => {
  it("correctly identifies Deep Night in UTC (12:00 AM to 4:00 AM UTC)", () => {
    const deepNightTime = new Date("2026-09-01T02:30:00Z");
    const daytime = new Date("2026-09-01T14:00:00Z");

    expect(isDeepNight("studying", deepNightTime, "UTC")).toBe(true);
    expect(isDeepNight("break", deepNightTime, "UTC")).toBe(false);
    expect(isDeepNight("offline", deepNightTime, "UTC")).toBe(false);
    expect(isDeepNight("studying", daytime, "UTC")).toBe(false);
  });

  it("correctly identifies Deep Night in Asia/Kolkata IST (India-Gorakhpur-UP)", () => {
    // 21:00 UTC = 02:30 AM IST (Deep Night in India)
    const istDeepNight = new Date("2026-09-01T21:00:00Z");
    // 08:30 UTC = 02:00 PM IST (Daytime in India)
    const istDaytime = new Date("2026-09-01T08:30:00Z");

    expect(isDeepNight("studying", istDeepNight, "Asia/Kolkata")).toBe(true);
    expect(isDeepNight("studying", istDaytime, "Asia/Kolkata")).toBe(false);
  });

  it("correctly identifies Early Bird in Asia/Kolkata IST (India-Gorakhpur-UP)", () => {
    // 00:30 UTC = 06:00 AM IST (Early Bird in India: 4am - 7am)
    const istEarlyBird = new Date("2026-09-01T00:30:00Z");
    // 21:00 UTC = 02:30 AM IST (Deep Night, not Early Bird)
    const istDeepNight = new Date("2026-09-01T21:00:00Z");

    expect(isEarlyBird("studying", istEarlyBird, "Asia/Kolkata")).toBe(true);
    expect(isEarlyBird("break", istEarlyBird, "Asia/Kolkata")).toBe(false);
    expect(isEarlyBird("studying", istDeepNight, "Asia/Kolkata")).toBe(false);
  });
});
