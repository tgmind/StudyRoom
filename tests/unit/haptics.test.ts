import { describe, it, expect, vi } from "vitest";
import { triggerHapticFeedback } from "@/lib/utils/haptics";

describe("Web Haptics Utility", () => {
  it("executes without error when navigator.vibrate is available or unsupported", () => {
    // Mock navigator.vibrate
    const vibrateMock = vi.fn();
    Object.defineProperty(global.navigator, "vibrate", {
      value: vibrateMock,
      writable: true,
      configurable: true,
    });

    triggerHapticFeedback(10);
    expect(vibrateMock).toHaveBeenCalledWith(10);
  });
});
