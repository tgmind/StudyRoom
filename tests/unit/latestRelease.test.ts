import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  normalizeVersion,
  compareSemver,
  isAppUpToDate,
  getAppEnvironmentInfo,
  downloadAndInstallApkInApp,
  DEFAULT_RELEASE_VERSION,
} from "@/lib/app/latestRelease";

describe("latestRelease utility functions", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("normalizeVersion", () => {
    it("strips leading v or V and trims whitespace", () => {
      expect(normalizeVersion("v1.0.1")).toBe("1.0.1");
      expect(normalizeVersion("V2.3.4")).toBe("2.3.4");
      expect(normalizeVersion("  1.0.0  ")).toBe("1.0.0");
      expect(normalizeVersion("")).toBe("");
    });
  });

  describe("compareSemver", () => {
    it("returns 0 for equal versions", () => {
      expect(compareSemver("1.0.0", "1.0.0")).toBe(0);
      expect(compareSemver("v1.0.1", "1.0.1")).toBe(0);
    });

    it("returns -1 when first version is lower", () => {
      expect(compareSemver("1.0.0", "1.0.1")).toBe(-1);
      expect(compareSemver("1.0.1", "1.1.0")).toBe(-1);
      expect(compareSemver("0.9.9", "1.0.0")).toBe(-1);
    });

    it("returns 1 when first version is higher", () => {
      expect(compareSemver("1.0.2", "1.0.1")).toBe(1);
      expect(compareSemver("2.0.0", "1.9.9")).toBe(1);
    });
  });

  describe("isAppUpToDate", () => {
    it("returns true when installed version equals or exceeds latest", () => {
      expect(isAppUpToDate("1.0.1", "v1.0.1")).toBe(true);
      expect(isAppUpToDate("v1.0.2", "v1.0.1")).toBe(true);
    });

    it("returns false when installed version is lower", () => {
      expect(isAppUpToDate("1.0.0", "v1.0.1")).toBe(false);
      expect(isAppUpToDate("v0.9.5", "v1.0.1")).toBe(false);
    });

    it("returns false when installedVersion is null (e.g. Web/PWA)", () => {
      expect(isAppUpToDate(null, "v1.0.1")).toBe(false);
    });
  });

  describe("getAppEnvironmentInfo", () => {
    it("detects native Android app v1.0.1 from userAgent", () => {
      vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
        "Mozilla/5.0 (Linux; Android 14) StudyRoom-Android/1.0.1"
      );

      const info = getAppEnvironmentInfo();
      expect(info.isNativeApp).toBe(true);
      expect(info.installedVersion).toBe("1.0.1");
      expect(info.platformLabel).toBe("Android App");
    });

    it("detects native Android app v1.0.0 fallback when no version tag is present", () => {
      vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
        "Mozilla/5.0 (Linux; Android 14) StudyRoom-Android"
      );

      const info = getAppEnvironmentInfo();
      expect(info.isNativeApp).toBe(true);
      expect(info.installedVersion).toBe("1.0.0");
      expect(info.platformLabel).toBe("Android App");
    });

    it("detects native Android app version from AndroidBridge.getAppVersion()", () => {
      vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0");
      (window as any).AndroidBridge = {
        getAppVersion: () => "1.0.1",
      };

      const info = getAppEnvironmentInfo();
      expect(info.isNativeApp).toBe(true);
      expect(info.installedVersion).toBe("1.0.1");
      delete (window as any).AndroidBridge;
    });

    it("detects Web PWA when in standalone display mode", () => {
      vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (Windows NT 10.0; Win64; x64)");
      delete (window as any).AndroidBridge;

      Object.defineProperty(window, "matchMedia", {
        writable: true,
        value: vi.fn().mockImplementation((query: string) => ({
          matches: query === "(display-mode: standalone)",
          media: query,
        })),
      });

      const info = getAppEnvironmentInfo();
      expect(info.isNativeApp).toBe(false);
      expect(info.isPwa).toBe(true);
      expect(info.installedVersion).toBeNull();
      expect(info.platformLabel).toBe("Web PWA");
    });

    it("detects regular Web Browser when not standalone and not native app", () => {
      vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (Windows NT 10.0; Win64; x64)");
      delete (window as any).AndroidBridge;

      Object.defineProperty(window, "matchMedia", {
        writable: true,
        value: vi.fn().mockImplementation(() => ({
          matches: false,
        })),
      });

      const info = getAppEnvironmentInfo();
      expect(info.isNativeApp).toBe(false);
      expect(info.isPwa).toBe(false);
      expect(info.installedVersion).toBeNull();
      expect(info.platformLabel).toBe("Web Browser");
    });
  });

  describe("downloadAndInstallApkInApp", () => {
    it("calls AndroidBridge.downloadAndInstallApk and registers progress callback when bridge is available", () => {
      const mockDownload = vi.fn();
      (window as any).AndroidBridge = {
        downloadAndInstallApk: mockDownload,
      };

      const progressSpy = vi.fn();
      const result = downloadAndInstallApkInApp(
        "https://example.com/StudyRoom.apk",
        "StudyRoom-test.apk",
        progressSpy
      );

      expect(result).toBe(true);
      expect(mockDownload).toHaveBeenCalledWith(
        "https://example.com/StudyRoom.apk",
        "StudyRoom-test.apk"
      );

      // Verify global hook was installed
      expect(typeof (window as any).__onApkProgress).toBe("function");
      (window as any).__onApkProgress(50, "Downloading 50%");
      expect(progressSpy).toHaveBeenCalledWith(50, "Downloading 50%");

      delete (window as any).AndroidBridge;
      delete (window as any).__onApkProgress;
    });

    it("returns false when AndroidBridge is not present (fallback mode)", () => {
      delete (window as any).AndroidBridge;
      const result = downloadAndInstallApkInApp(
        "https://example.com/StudyRoom.apk",
        "StudyRoom-test.apk"
      );
      expect(result).toBe(false);
    });
  });
});
