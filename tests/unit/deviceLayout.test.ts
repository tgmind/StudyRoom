import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { isAndroidApp, isHandheldDevice, resolveDeviceLayout, useDeviceLayout } from "@/lib/device/useDeviceLayout";

describe("Device Layout Detection & Android Isolation Unit Tests", () => {
  const originalNavigator = global.navigator;
  const originalWindow = global.window;

  beforeEach(() => {
    vi.stubGlobal("window", {
      innerWidth: 1440,
      innerHeight: 900,
      matchMedia: vi.fn().mockImplementation((query) => ({
        matches: query.includes("1024"),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });

    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      maxTouchPoints: 0,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("identifies standard desktop browser as desktop layout", () => {
    expect(isAndroidApp()).toBe(false);
    expect(isHandheldDevice()).toBe(false);
    expect(resolveDeviceLayout()).toBe("desktop");
  });

  it("strictly isolates native Android App and always returns mobile even on large desktop viewports", () => {
    // 1. Injected AndroidBridge object
    (window as unknown as { AndroidBridge: unknown }).AndroidBridge = { onResumeTriggered: () => {} };
    expect(isAndroidApp()).toBe(true);
    // Even at 1920px or landscape tablet width, Android App must receive mobile UI
    window.innerWidth = 1920;
    expect(resolveDeviceLayout()).toBe("mobile");
  });

  it("identifies Android user agent with StudyRoom-Android and forces mobile layout", () => {
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36 StudyRoom-Android/1.0.19",
      maxTouchPoints: 5,
    });

    expect(isAndroidApp()).toBe(true);
    window.innerWidth = 1440;
    expect(resolveDeviceLayout()).toBe("mobile");
  });

  it("returns mobile layout when screen width is less than 1024px", () => {
    window.innerWidth = 768; // iPad portrait or narrow window
    expect(resolveDeviceLayout()).toBe("mobile");

    window.innerWidth = 390; // iPhone
    expect(resolveDeviceLayout()).toBe("mobile");

    window.innerWidth = 320; // Small phone
    expect(resolveDeviceLayout()).toBe("mobile");
  });

  it("handles iPadOS detection with touch points correctly", () => {
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
      maxTouchPoints: 5, // iPad reporting as Mac
    });

    expect(isHandheldDevice()).toBe(true);
    window.innerWidth = 1024;
    expect(resolveDeviceLayout()).toBe("mobile");

    window.innerWidth = 1366; // iPad Pro 12.9" in landscape
    expect(resolveDeviceLayout()).toBe("mobile");
  });

  it("useDeviceLayout hook returns desktop on cold mount on desktop browser without delayed flash", () => {
    const { result } = renderHook(() => useDeviceLayout());
    expect(result.current).toBe("desktop");
  });

  it("useDeviceLayout hook strictly returns mobile on Android App even on large screens", () => {
    (window as unknown as { AndroidBridge: unknown }).AndroidBridge = { onResumeTriggered: () => {} };
    window.innerWidth = 1920;

    const { result } = renderHook(() => useDeviceLayout());
    expect(result.current).toBe("mobile");
  });
});
