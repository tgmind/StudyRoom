export interface ReleaseInfo {
  version: string;
  apkDownloadUrl: string;
  apkSizeMb?: string;
  publishedAt?: string;
}

export const DEFAULT_RELEASE_VERSION = "v1.0.4";
export const DEFAULT_APK_DOWNLOAD_URL =
  "https://github.com/tgmind/StudyRoom/releases/download/v1.0.4/StudyRoom-v1.0.4.apk";

/**
 * Detects if the user is running inside an installed PWA or Native Android App.
 */
export function isRunningInAppOrPwa(): boolean {
  if (typeof window === "undefined") return false;

  // 1. Native Android App Bridge or custom User Agent
  const hasAndroidBridge = Boolean(
    (window as unknown as { AndroidBridge?: unknown }).AndroidBridge
  );
  const isAndroidAppUa = window.navigator.userAgent.includes("StudyRoom-Android");
  if (hasAndroidBridge || isAndroidAppUa) return true;

  // 2. Standalone / Fullscreen PWA display mode
  if (typeof window.matchMedia === "function") {
    if (
      window.matchMedia("(display-mode: standalone)").matches ||
      window.matchMedia("(display-mode: fullscreen)").matches ||
      window.matchMedia("(display-mode: minimal-ui)").matches
    ) {
      return true;
    }
  }

  // 3. iOS standalone mode or Android app referrer
  if ((window.navigator as unknown as { standalone?: boolean }).standalone === true) return true;
  if (typeof document !== "undefined" && document.referrer.startsWith("android-app://")) return true;

  return false;
}

export interface AppEnvironmentInfo {
  isNativeApp: boolean;
  isPwa: boolean;
  installedVersion: string | null;
  platformLabel: string;
}

/**
 * Normalizes a version string by removing any leading 'v' or 'V' and trimming whitespace.
 */
export function normalizeVersion(v: string): string {
  return (v || "").trim().replace(/^v/i, "");
}

/**
 * Compares two semantic version strings (e.g. "1.0.0" and "1.0.1").
 * Returns:
 *  -1 if v1 < v2
 *   0 if v1 === v2
 *   1 if v1 > v2
 */
export function compareSemver(v1: string, v2: string): number {
  const norm1 = normalizeVersion(v1);
  const norm2 = normalizeVersion(v2);

  const parts1 = norm1.split(".").map((num) => parseInt(num, 10) || 0);
  const parts2 = norm2.split(".").map((num) => parseInt(num, 10) || 0);

  const length = Math.max(parts1.length, parts2.length);
  for (let i = 0; i < length; i++) {
    const p1 = parts1[i] ?? 0;
    const p2 = parts2[i] ?? 0;
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }
  return 0;
}

/**
 * Checks if the currently installed native app version is up-to-date with latest release.
 * Returns false if installedVersion is null (e.g. PWA / Web).
 */
export function isAppUpToDate(installedVersion: string | null, latestVersion: string): boolean {
  if (!installedVersion) return false;
  return compareSemver(installedVersion, latestVersion) >= 0;
}

/**
 * Analyzes the runtime environment to detect whether user is on:
 * - Native Android App (and resolves its version)
 * - PWA (standalone display mode)
 * - Standard Web browser
 */
export function getAppEnvironmentInfo(): AppEnvironmentInfo {
  if (typeof window === "undefined") {
    return {
      isNativeApp: false,
      isPwa: false,
      installedVersion: null,
      platformLabel: "Web Browser",
    };
  }

  // 1. Check for Native Android App Bridge & User Agent
  const bridge = (window as unknown as { AndroidBridge?: { getAppVersion?: () => string } }).AndroidBridge;
  const hasAndroidBridge = Boolean(bridge);
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const isAndroidAppUa = ua.includes("StudyRoom-Android");
  const isNativeApp = hasAndroidBridge || isAndroidAppUa;

  let installedVersion: string | null = null;
  if (isNativeApp) {
    // Attempt 1: Call AndroidBridge.getAppVersion() if available
    try {
      if (typeof bridge?.getAppVersion === "function") {
        const ver = bridge.getAppVersion();
        if (ver) installedVersion = normalizeVersion(ver);
      }
    } catch {
      // ignore
    }

    // Attempt 2: Check window.__STUDYROOM_NATIVE_VERSION
    if (!installedVersion) {
      const injectedVer = (window as unknown as { __STUDYROOM_NATIVE_VERSION?: string }).__STUDYROOM_NATIVE_VERSION;
      if (injectedVer) {
        installedVersion = normalizeVersion(injectedVer);
      }
    }

    // Attempt 3: Extract from User-Agent (e.g. "StudyRoom-Android/1.0.1")
    if (!installedVersion) {
      const match = ua.match(/StudyRoom-Android\/([0-9]+(?:\.[0-9]+)*)/);
      if (match && match[1]) {
        installedVersion = normalizeVersion(match[1]);
      }
    }

    // Attempt 4: Fallback for initial v1.0.0 release (which had StudyRoom-Android without version suffix)
    if (!installedVersion) {
      installedVersion = "1.0.0";
    }
  }

  // 2. Check for PWA standalone mode
  let isPwa = false;
  if (typeof window.matchMedia === "function") {
    if (
      window.matchMedia("(display-mode: standalone)").matches ||
      window.matchMedia("(display-mode: fullscreen)").matches ||
      window.matchMedia("(display-mode: minimal-ui)").matches
    ) {
      isPwa = true;
    }
  }
  if ((window.navigator as unknown as { standalone?: boolean }).standalone === true) {
    isPwa = true;
  }
  if (typeof document !== "undefined" && document.referrer.startsWith("android-app://")) {
    isPwa = true;
  }

  let platformLabel = "Web Browser";
  if (isNativeApp) {
    platformLabel = "Android App";
  } else if (isPwa) {
    platformLabel = "Web PWA";
  }

  return {
    isNativeApp,
    isPwa,
    installedVersion,
    platformLabel,
  };
}

let cachedRelease: ReleaseInfo | null = null;

/**
 * Fetches the latest published APK release from GitHub API.
 * Uses in-memory caching and falls back safely to v1.0.0 on error or rate-limit.
 */
export async function fetchLatestApkRelease(): Promise<ReleaseInfo> {
  if (cachedRelease) return cachedRelease;

  try {
    const res = await fetch("https://api.github.com/repos/tgmind/StudyRoom/releases/latest", {
      headers: { Accept: "application/vnd.github.v3+json" },
    });

    if (res.ok) {
      const data = await res.json();
      const apkAsset = (data.assets || []).find(
        (a: { name?: string; browser_download_url?: string }) =>
          typeof a.name === "string" &&
          a.name.endsWith(".apk") &&
          !a.name.endsWith(".sha256")
      );

      if (apkAsset?.browser_download_url) {
        cachedRelease = {
          version: data.tag_name || DEFAULT_RELEASE_VERSION,
          apkDownloadUrl: apkAsset.browser_download_url,
          apkSizeMb:
            typeof apkAsset.size === "number"
              ? (apkAsset.size / (1024 * 1024)).toFixed(1)
              : undefined,
          publishedAt: data.published_at,
        };
        return cachedRelease;
      }
    }
  } catch (err) {
    // Non-fatal: safely fallback to latest default asset
    console.warn("Using fallback StudyRoom APK release:", err);
  }

  return {
    version: DEFAULT_RELEASE_VERSION,
    apkDownloadUrl: DEFAULT_APK_DOWNLOAD_URL,
  };
}

/**
 * Triggers a direct APK file download in the browser without redirecting or reloading the page.
 * Uses an invisible iframe combined with a programmatic anchor click.
 */
export function triggerApkDirectDownload(downloadUrl: string, filename = "StudyRoom.apk") {
  if (typeof document === "undefined") return;

  // Primary mechanism: Invisible iframe.
  // Because the URL returns Content-Disposition: attachment, the browser handles it
  // as a file download and the current web page NEVER navigates or reloads.
  const iframe = document.createElement("iframe");
  iframe.style.display = "none";
  iframe.setAttribute("aria-hidden", "true");
  iframe.src = downloadUrl;
  document.body.appendChild(iframe);

  // Fallback anchor click
  const link = document.createElement("a");
  link.href = downloadUrl;
  link.setAttribute("download", filename);
  link.setAttribute("target", "_blank");
  link.rel = "noopener noreferrer";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();

  // Clean up elements after download starts
  setTimeout(() => {
    try {
      if (document.body.contains(iframe)) document.body.removeChild(iframe);
      if (document.body.contains(link)) document.body.removeChild(link);
    } catch {
      // Ignore cleanup error
    }
  }, 10000);
}
