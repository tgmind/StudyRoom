import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getRunningBuildId,
  isUpdateDismissed,
  setUpdateDismissed,
  clearUpdateDismissal,
  checkLatestDeployment,
  performPlatformRefresh,
} from "@/lib/app/updateManager";
import { STORAGE_KEYS } from "@/lib/offline/storageKeys";

describe("StudyRoom Update Manager & Safe Platform Refresh Suite", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  describe("A. Build ID & Dismissal Management", () => {
    it("returns a valid non-empty running build ID", () => {
      const buildId = getRunningBuildId();
      expect(typeof buildId).toBe("string");
      expect(buildId.length).toBeGreaterThan(0);
    });

    it("handles dismissal cooldown and clearing correctly", () => {
      const testBuildId = "build-deploy-123";

      // Initially not dismissed
      expect(isUpdateDismissed(testBuildId)).toBe(false);

      // Dismiss
      setUpdateDismissed(testBuildId);
      expect(isUpdateDismissed(testBuildId)).toBe(true);

      // Other build IDs are not dismissed
      expect(isUpdateDismissed("build-deploy-456")).toBe(false);

      // Clear dismissal
      clearUpdateDismissal();
      expect(isUpdateDismissed(testBuildId)).toBe(false);
    });
  });

  describe("B. Deployment Check Logic", () => {
    it("detects when server buildId is different from client buildId", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          buildId: "build-new-deployment-xyz",
          buildTime: "2026-10-30T14:00:00.000Z",
          version: "1.0.1",
        }),
      });
      globalThis.fetch = fetchMock;

      // Mock window hostname to non-localhost to test production logic
      Object.defineProperty(window, "location", {
        writable: true,
        value: {
          hostname: "studyroom.netlify.app",
          href: "https://studyroom.netlify.app/room",
          pathname: "/room",
          search: "",
          replace: vi.fn(),
          reload: vi.fn(),
        },
      });

      const res = await checkLatestDeployment("build-old-local-abc");
      expect(res.hasUpdate).toBe(true);
      expect(res.latestBuildId).toBe("build-new-deployment-xyz");
      expect(res.currentBuildId).toBe("build-old-local-abc");
    });

    it("reports hasUpdate=false when server build matches current build", async () => {
      const currentId = "build-matching-123";
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          buildId: currentId,
          buildTime: "2026-10-30T14:00:00.000Z",
        }),
      });

      const res = await checkLatestDeployment(currentId);
      expect(res.hasUpdate).toBe(false);
      expect(res.latestBuildId).toBe(currentId);
    });
  });

  describe("C. Platform Refresh & Inviolable Data Safety", () => {
    it("clears CacheStorage, messages ServiceWorker, but NEVER wipes active study session or auth tokens", async () => {
      // 1. Setup CacheStorage mock
      const deleteCacheMock = vi.fn().mockResolvedValue(true);
      const cachesMock = {
        keys: vi.fn().mockResolvedValue(["studyroom-v11", "studyroom-static"]),
        delete: deleteCacheMock,
      };
      Object.defineProperty(window, "caches", {
        writable: true,
        value: cachesMock,
      });

      // 2. Setup Service Worker mock
      const postMessageWaiting = vi.fn();
      const postMessageActive = vi.fn();
      const updateMock = vi.fn().mockResolvedValue(undefined);

      const regMock = {
        waiting: { postMessage: postMessageWaiting },
        active: { postMessage: postMessageActive },
        update: updateMock,
      };

      Object.defineProperty(navigator, "serviceWorker", {
        writable: true,
        value: {
          getRegistration: vi.fn().mockResolvedValue(regMock),
        },
      });

      // 3. Setup Navigation mock
      const replaceMock = vi.fn();
      Object.defineProperty(window, "location", {
        writable: true,
        value: {
          hostname: "studyroom.netlify.app",
          href: "https://studyroom.netlify.app/room",
          pathname: "/room",
          search: "",
          replace: replaceMock,
          reload: vi.fn(),
        },
      });

      // 4. Setup critical user data that MUST REMAIN SAFE
      const authKey = "sb-wppnfezoqpcgmowdkofp-auth-token";
      const authPayload = JSON.stringify({ access_token: "secret-token", user: { id: "u123" } });
      localStorage.setItem(authKey, authPayload);

      const activeStudyPayload = JSON.stringify({
        userId: "u123",
        sessionStartTime: new Date().toISOString(),
        lastResumedAt: new Date().toISOString(),
      });
      localStorage.setItem(STORAGE_KEYS.ACTIVE_STUDY, activeStudyPayload);

      const queuePayload = JSON.stringify([{ id: "act-1", action: "create_goal" }]);
      localStorage.setItem(STORAGE_KEYS.OFFLINE_SESSION_QUEUE, queuePayload);

      // Execute platform refresh
      await performPlatformRefresh();

      // Verify caches were deleted
      expect(cachesMock.keys).toHaveBeenCalled();
      expect(deleteCacheMock).toHaveBeenCalledWith("studyroom-v11");
      expect(deleteCacheMock).toHaveBeenCalledWith("studyroom-static");

      // Verify ServiceWorker received SKIP_WAITING
      expect(postMessageWaiting).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
      expect(postMessageActive).toHaveBeenCalledWith({ type: "CLEAR_CACHES" });
      expect(postMessageActive).toHaveBeenCalledWith({ type: "SKIP_WAITING" });

      // Verify navigation was triggered with cache buster
      expect(replaceMock).toHaveBeenCalledWith(
        expect.stringContaining("https://studyroom.netlify.app/room?_updated=")
      );

      // INVIOLABLE SAFETY CHECKS:
      // Active study session is completely intact!
      expect(localStorage.getItem(STORAGE_KEYS.ACTIVE_STUDY)).toBe(activeStudyPayload);
      // Auth token is completely intact!
      expect(localStorage.getItem(authKey)).toBe(authPayload);
      // Offline queue is completely intact!
      expect(localStorage.getItem(STORAGE_KEYS.OFFLINE_SESSION_QUEUE)).toBe(queuePayload);
    });
  });
});
