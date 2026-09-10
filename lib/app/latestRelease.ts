export interface ReleaseInfo {
  version: string;
  apkDownloadUrl: string;
  apkSizeMb?: string;
  publishedAt?: string;
}

export const DEFAULT_RELEASE_VERSION = "v1.0.0";
export const DEFAULT_APK_DOWNLOAD_URL =
  "https://github.com/tgmind/StudyRoom/releases/download/v1.0.0/StudyRoom-v1.0.0.apk";

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
