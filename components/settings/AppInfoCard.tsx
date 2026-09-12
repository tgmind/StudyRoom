"use client";

import React, { useState, useEffect } from "react";
import {
  Smartphone,
  DownloadCloud,
  CheckCircle2,
  ArrowUpCircle,
  Zap,
  ShieldCheck,
  Loader2,
} from "lucide-react";
import {
  DEFAULT_RELEASE_VERSION,
  DEFAULT_APK_DOWNLOAD_URL,
  ReleaseInfo,
  AppEnvironmentInfo,
  fetchLatestApkRelease,
  downloadAndInstallApkInApp,
  triggerApkDirectDownload,
  getAppEnvironmentInfo,
  isAppUpToDate,
} from "@/lib/app/latestRelease";

export function AppInfoCard() {
  const [envInfo, setEnvInfo] = useState<AppEnvironmentInfo>({
    isNativeApp: false,
    isPwa: false,
    installedVersion: null,
    platformLabel: "Web Browser",
  });

  const [latestRelease, setLatestRelease] = useState<ReleaseInfo>({
    version: DEFAULT_RELEASE_VERSION,
    apkDownloadUrl: DEFAULT_APK_DOWNLOAD_URL,
    apkSizeMb: "15",
  });

  const [downloadState, setDownloadState] = useState<"idle" | "downloading" | "downloaded">("idle");
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [downloadStatusText, setDownloadStatusText] = useState<string>("");
  const [isNativeHandled, setIsNativeHandled] = useState(false);
  const isDownloadingRef = React.useRef(false);

  useEffect(() => {
    // Detect environment on client mount
    setEnvInfo(getAppEnvironmentInfo());

    // Fetch latest GitHub release info dynamically
    fetchLatestApkRelease()
      .then((rel) => {
        if (rel) setLatestRelease(rel);
      })
      .catch(() => {
        // Fallback already provided in state
      });
  }, []);

  const isLatestNative =
    envInfo.isNativeApp && isAppUpToDate(envInfo.installedVersion, latestRelease.version);
  const isOutdatedNative = envInfo.isNativeApp && !isLatestNative;

  const handleDirectDownload = () => {
    if (isDownloadingRef.current) return;
    isDownloadingRef.current = true;
    setDownloadState("downloading");
    setDownloadProgress(0);
    setDownloadStatusText("Starting in-app download...");

    const filename = `StudyRoom-${latestRelease.version}.apk`;

    const handledNatively = downloadAndInstallApkInApp(
      latestRelease.apkDownloadUrl,
      filename,
      (percent, status) => {
        setDownloadProgress(percent);
        if (status) setDownloadStatusText(status);
        if (percent >= 100) {
          setDownloadState("downloaded");
          setTimeout(() => {
            setDownloadState("idle");
            setDownloadProgress(null);
            setIsNativeHandled(false);
            isDownloadingRef.current = false;
          }, 4000);
        }
      },
      () => {
        setDownloadState("idle");
        setDownloadProgress(null);
        setIsNativeHandled(false);
        isDownloadingRef.current = false;
      }
    );

    setIsNativeHandled(handledNatively);

    // Fallback for Web browser & PWA when not handled natively
    if (!handledNatively) {
      triggerApkDirectDownload(latestRelease.apkDownloadUrl, filename);

      setTimeout(() => {
        setDownloadState("downloaded");
      }, 400);

      setTimeout(() => {
        setDownloadState("idle");
        setDownloadProgress(null);
        isDownloadingRef.current = false;
      }, 5000);
    }
  };

  const displayVersion = envInfo.installedVersion
    ? `v${envInfo.installedVersion}`
    : latestRelease.version;

  return (
    <div className="w-full bg-zinc-900/70 border border-zinc-800/90 rounded-2xl p-4 sm:p-5 shadow-xl space-y-3.5 backdrop-blur-md">
      {/* Header Row */}
      <div className="flex items-center justify-between min-w-0">
        <div className="flex items-center space-x-2.5 sm:space-x-3 min-w-0">
          <div
            className={`p-2 sm:p-2.5 rounded-xl border shrink-0 ${
              isLatestNative
                ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-400"
                : isOutdatedNative
                ? "bg-amber-500/10 border-amber-500/25 text-amber-400"
                : "bg-violet-500/10 border-violet-500/25 text-violet-300"
            }`}
          >
            {isLatestNative ? (
              <ShieldCheck className="w-4 h-4 sm:w-5 sm:h-5" />
            ) : isOutdatedNative ? (
              <ArrowUpCircle className="w-4 h-4 sm:w-5 sm:h-5" />
            ) : (
              <Smartphone className="w-4 h-4 sm:w-5 sm:h-5" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-xs sm:text-sm font-extrabold text-zinc-100 tracking-tight leading-snug">
              StudyRoom App
            </h2>
            <p className="text-[10px] sm:text-xs text-zinc-400 leading-snug">
              {envInfo.isNativeApp
                ? `Android Edition • Installed ${displayVersion}`
                : `Platform • ${envInfo.platformLabel}`}
            </p>
          </div>
        </div>

        {/* Status Badge */}
        <div className="shrink-0 ml-2">
          {isLatestNative ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] sm:text-xs font-bold bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">
              <CheckCircle2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-emerald-400" />
              <span>{displayVersion} • Up to Date</span>
            </span>
          ) : isOutdatedNative ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] sm:text-xs font-bold bg-amber-500/15 border border-amber-500/30 text-amber-300">
              <ArrowUpCircle className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-400" />
              <span>Update to {latestRelease.version}</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] sm:text-xs font-bold bg-zinc-800/80 border border-zinc-700/80 text-zinc-300">
              <Zap className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-violet-400" />
              <span>Latest: {latestRelease.version}</span>
            </span>
          )}
        </div>
      </div>

      {/* Content Section */}
      {isLatestNative ? (
        /* State 1: Up-to-date Native App Users */
        <div className="p-3 bg-emerald-950/20 border border-emerald-800/40 rounded-xl flex items-start space-x-2.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="text-xs sm:text-sm font-bold text-emerald-200 leading-snug">
              You are on the latest version of StudyRoom app.
            </p>
            <p className="text-[10px] sm:text-[11px] text-emerald-300/80 mt-0.5 leading-relaxed">
              Live background timer, notification chronometer, and instant navigation are running
              smoothly on your device.
            </p>
          </div>
        </div>
      ) : isOutdatedNative ? (
        /* State 2: Outdated Native App Users */
        <div className="space-y-2.5">
          <div className="p-3 bg-amber-950/20 border border-amber-800/40 rounded-xl flex items-start space-x-2.5">
            <ArrowUpCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-xs sm:text-sm font-bold text-amber-200 leading-snug">
                New Version {latestRelease.version} Available
              </p>
              <p className="text-[10px] sm:text-[11px] text-amber-300/80 mt-0.5 leading-relaxed">
                Your current app is on v{envInfo.installedVersion}. Downloads in-app and launches the
                update installer without leaving StudyRoom.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleDirectDownload}
            disabled={downloadState !== "idle"}
            className="w-full relative overflow-hidden flex items-center justify-center space-x-2 py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-zinc-950 font-black text-xs sm:text-sm shadow-md active:scale-[0.98] transition-all touch-manipulation disabled:opacity-85"
          >
            {downloadProgress !== null && downloadProgress > 0 && downloadProgress < 100 && (
              <span
                className="absolute left-0 top-0 bottom-0 bg-amber-400/40 pointer-events-none transition-all duration-200"
                style={{ width: `${downloadProgress}%` }}
              />
            )}
            {downloadState === "downloading" ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-zinc-950 relative z-10" />
                <span className="relative z-10">
                  {isNativeHandled && downloadProgress !== null && downloadProgress > 0
                    ? `Downloading In-App (${downloadProgress}%)`
                    : "Starting Download..."}
                </span>
              </>
            ) : downloadState === "downloaded" ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-zinc-950" />
                <span>
                  {isNativeHandled
                    ? "Launching Update Installer..."
                    : "Download Started! Check Notification Shade"}
                </span>
              </>
            ) : (
              <>
                <DownloadCloud className="w-4 h-4 text-zinc-950" />
                <span>Update to {latestRelease.version}</span>
              </>
            )}
          </button>
        </div>
      ) : (
        /* State 3: PWA / Web Users */
        <div className="space-y-2.5">
          <div className="p-3 bg-zinc-950/60 border border-zinc-800/80 rounded-xl flex items-start space-x-2.5">
            <Zap className="w-4 h-4 text-violet-400 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-xs sm:text-sm font-bold text-zinc-200 leading-snug">
                Upgrade to the Native Android App ({latestRelease.version})
              </p>
              <p className="text-[10px] sm:text-[11px] text-zinc-400 mt-0.5 leading-relaxed">
                Enjoy 0ms instant startup, zero-lag navigation, rock-solid background timer, and live
                notification chronometer without browser limits.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleDirectDownload}
            disabled={downloadState !== "idle"}
            className="w-full flex items-center justify-center space-x-2 py-2.5 px-4 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-extrabold text-xs sm:text-sm shadow-md shadow-violet-950/40 active:scale-[0.98] transition-all touch-manipulation disabled:opacity-75"
          >
            {downloadState === "downloading" ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-white" />
                <span>Starting Download...</span>
              </>
            ) : downloadState === "downloaded" ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                <span>Download Started! Check Notification Shade</span>
              </>
            ) : (
              <>
                <DownloadCloud className="w-4 h-4 text-white" />
                <span>Install StudyRoom App ({latestRelease.version})</span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
