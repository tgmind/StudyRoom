"use client";

import React, { useState, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useAuthContext } from "@/components/auth/AuthProvider";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { triggerHapticFeedback } from "@/lib/utils/haptics";
import {
  Smartphone,
  Zap,
  ShieldCheck,
  CheckCircle2,
  DownloadCloud,
  Loader2,
  Sparkles,
  Clock,
  ArrowRight,
} from "lucide-react";
import {
  DEFAULT_RELEASE_VERSION,
  DEFAULT_APK_DOWNLOAD_URL,
  ReleaseInfo,
  AppEnvironmentInfo,
  fetchLatestApkRelease,
  triggerApkDirectDownload,
  getAppEnvironmentInfo,
} from "@/lib/app/latestRelease";

export const LAUNCH_UPDATE_STORAGE_KEY = "studyroom_stable_app_v1_0_3_announcement";

export function LaunchAnnouncementModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [downloadState, setDownloadState] = useState<"idle" | "downloading" | "downloaded">("idle");
  const isDownloadingRef = useRef(false);
  const [envInfo, setEnvInfo] = useState<AppEnvironmentInfo>({
    isNativeApp: false,
    isPwa: false,
    installedVersion: null,
    platformLabel: "Web",
  });
  const [latestRelease, setLatestRelease] = useState<ReleaseInfo>({
    version: DEFAULT_RELEASE_VERSION,
    apkDownloadUrl: DEFAULT_APK_DOWNLOAD_URL,
    apkSizeMb: "4.8",
  });

  const pathname = usePathname() || "";
  const auth = useAuthContext();

  const isExcludedRoute =
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname === "/onboarding" ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/onboarding");

  useEffect(() => {
    // 1. Strictly do NOT show on login, signup, or onboarding pages
    if (isExcludedRoute) {
      setIsOpen(false);
      return;
    }

    // Detect environment & fetch release info
    setEnvInfo(getAppEnvironmentInfo());
    fetchLatestApkRelease()
      .then((rel) => {
        if (rel) setLatestRelease(rel);
      })
      .catch(() => {});

    try {
      // 2. Check if user already acknowledged this update notice globally on this device
      const alreadySeen = localStorage.getItem(LAUNCH_UPDATE_STORAGE_KEY);
      if (alreadySeen === "true") {
        return;
      }

      // 3. Also check per-user acknowledgment key if user ID is present
      const userId = auth?.user?.id;
      if (userId) {
        const userSeen = localStorage.getItem(`${LAUNCH_UPDATE_STORAGE_KEY}_${userId}`);
        if (userSeen === "true") {
          return;
        }
      }

      // Small delay to allow initial page layout to paint smoothly
      const timer = setTimeout(() => {
        setIsOpen(true);
      }, 350);
      return () => clearTimeout(timer);
    } catch {
      // Fallback silently if localStorage is disabled or restricted
    }
  }, [isExcludedRoute, auth?.user?.id]);

  const handleUnderstood = () => {
    try {
      localStorage.setItem(LAUNCH_UPDATE_STORAGE_KEY, "true");
      if (auth?.user?.id) {
        localStorage.setItem(`${LAUNCH_UPDATE_STORAGE_KEY}_${auth.user.id}`, "true");
      }
    } catch {}

    triggerHapticFeedback([10, 30, 15]);
    setIsOpen(false);
  };

  const handleDownloadApp = () => {
    if (isDownloadingRef.current) return;
    isDownloadingRef.current = true;
    setDownloadState("downloading");
    const filename = `StudyRoom-${latestRelease.version}.apk`;
    triggerApkDirectDownload(latestRelease.apkDownloadUrl, filename);
    triggerHapticFeedback([20, 40]);

    setTimeout(() => {
      setDownloadState("downloaded");
    }, 400);

    // Save acknowledgment so download dismisses gracefully after starting
    try {
      localStorage.setItem(LAUNCH_UPDATE_STORAGE_KEY, "true");
      if (auth?.user?.id) {
        localStorage.setItem(`${LAUNCH_UPDATE_STORAGE_KEY}_${auth.user.id}`, "true");
      }
    } catch {}

    setTimeout(() => {
      setIsOpen(false);
      isDownloadingRef.current = false;
    }, 3000);
  };

  // Prevent rendering when on auth routes
  if (isExcludedRoute) {
    return null;
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleUnderstood}
      title="StudyRoom App Launch"
      subtitle="Official Native Android App is now available for all students"
    >
      {/* Single, non-nested fluid scroll container */}
      <div className="space-y-3.5 sm:space-y-4 pt-0.5 pb-8">
        {/* Glowing Ambient Hero Header Card */}
        <div className="relative overflow-hidden rounded-2xl p-4 sm:p-5 bg-gradient-to-br from-violet-950/80 via-zinc-900 to-emerald-950/40 border border-violet-500/35 shadow-[0_8px_30px_rgba(139,92,246,0.15)] space-y-2.5">
          {/* Ambient blur rings */}
          <div className="absolute -top-12 -right-12 w-36 h-36 bg-emerald-500/15 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute -bottom-12 -left-12 w-36 h-36 bg-violet-600/20 rounded-full blur-2xl pointer-events-none" />

          <div className="relative z-10 flex items-center space-x-3">
            <div className="p-2.5 sm:p-3 rounded-2xl bg-gradient-to-br from-violet-500/25 to-emerald-500/25 border border-violet-500/40 text-emerald-300 shadow-md shrink-0">
              <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-400 animate-pulse" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                <span className="text-[11px] sm:text-xs font-black uppercase tracking-wider text-emerald-400">
                  Official Release
                </span>
                <span className="px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-extrabold bg-violet-500/20 text-violet-300 border border-violet-500/40 uppercase tracking-wide">
                  {latestRelease.version} Stable
                </span>
              </div>
              <h3 className="text-sm sm:text-base font-black text-white tracking-tight leading-snug mt-0.5">
                Switch to the Native Android App
              </h3>
            </div>
          </div>

          <p className="relative z-10 text-xs sm:text-[13px] text-zinc-300 leading-relaxed pl-0.5">
            We have launched the official <strong>StudyRoom Native App</strong> to eliminate PWA splash
            freezes, deliver live notification chronometers, and guarantee a rock-solid background study
            timer.
          </p>
        </div>

        {/* Feature Highlights Grid */}
        <div className="space-y-2.5 sm:space-y-3">
          {/* 1. 0ms Instant Launch & No Freezes */}
          <div className="rounded-2xl bg-zinc-900/80 border border-zinc-800/90 p-3.5 sm:p-4 shadow-sm">
            <div className="flex items-start space-x-3 sm:space-x-3.5">
              <div className="p-2 sm:p-2.5 rounded-xl bg-violet-500/10 border border-violet-500/25 text-violet-400 shrink-0 mt-0.5 shadow-inner">
                <Zap className="w-4 h-4 sm:w-5 sm:h-5 text-violet-400" />
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h4 className="text-xs sm:text-sm font-black text-zinc-100 tracking-tight">
                    0ms Instant Launch &amp; Zero Freezes
                  </h4>
                  <span className="text-[9px] sm:text-[10px] font-bold px-2 py-0.5 rounded-md bg-violet-500/10 text-violet-300 border border-violet-500/30 shrink-0">
                    No PWA Lag
                  </span>
                </div>
                <p className="text-[11px] sm:text-xs text-zinc-300 leading-relaxed">
                  Opens instantly from your home screen with zero delay. Permanently solves splash
                  screen freezes and bottom navigation lag.
                </p>
              </div>
            </div>
          </div>

          {/* 2. Live Notification Panel Chronometer */}
          <div className="rounded-2xl bg-zinc-900/80 border border-zinc-800/90 p-3.5 sm:p-4 shadow-sm">
            <div className="flex items-start space-x-3 sm:space-x-3.5">
              <div className="p-2 sm:p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 shrink-0 mt-0.5 shadow-inner">
                <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400" />
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h4 className="text-xs sm:text-sm font-black text-zinc-100 tracking-tight">
                    Live Notification Chronometer
                  </h4>
                  <span className="text-[9px] sm:text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 shrink-0">
                    Background Mode
                  </span>
                </div>
                <p className="text-[11px] sm:text-xs text-zinc-300 leading-relaxed">
                  Watch your study timer and break countdown tick live in your notification shade with
                  colorized status badges and instant <em>Resume Study</em> action buttons.
                </p>
              </div>
            </div>
          </div>

          {/* 3. Rock-Solid Synced Timer */}
          <div className="rounded-2xl bg-zinc-900/80 border border-zinc-800/90 p-3.5 sm:p-4 shadow-sm">
            <div className="flex items-start space-x-3 sm:space-x-3.5">
              <div className="p-2 sm:p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-400 shrink-0 mt-0.5 shadow-inner">
                <ShieldCheck className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400" />
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h4 className="text-xs sm:text-sm font-black text-zinc-100 tracking-tight">
                    Rock-Solid Background Sync
                  </h4>
                  <span className="text-[9px] sm:text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-300 border border-amber-500/30 shrink-0">
                    Always Accurate
                  </span>
                </div>
                <p className="text-[11px] sm:text-xs text-zinc-300 leading-relaxed">
                  Your study session is continuously protected. Even if your phone locks, goes to sleep,
                  or reboots, your time is safely calculated and synced.
                </p>
              </div>
            </div>
          </div>

          {/* 4. Current Platform Status Banner */}
          {envInfo.isNativeApp ? (
            <div className="rounded-xl bg-emerald-950/20 border border-emerald-800/50 p-3 flex items-center space-x-2.5 text-emerald-300">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <p className="text-[11px] sm:text-xs leading-snug">
                <strong>You are on the Native Android App:</strong> You already have live notification
                timers and instant navigation active.
              </p>
            </div>
          ) : (
            <div className="rounded-xl bg-zinc-900/50 border border-zinc-800/70 p-3 flex items-center space-x-2.5 text-zinc-300">
              <Smartphone className="w-4 h-4 text-violet-400 shrink-0" />
              <p className="text-[11px] sm:text-xs leading-snug">
                <strong>Currently on WebApp:</strong> Download the APK below for zero-lag performance
                and full notification shade timer support.
              </p>
            </div>
          )}
        </div>

        {/* Action Buttons Section */}
        <div className="pt-2 space-y-2">
          {!envInfo.isNativeApp ? (
            <>
              {/* Primary Install APK Button */}
              <button
                type="button"
                onClick={handleDownloadApp}
                disabled={downloadState !== "idle"}
                className="w-full font-black text-xs sm:text-sm py-3.5 px-4 rounded-xl bg-gradient-to-r from-violet-600 via-indigo-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white shadow-lg shadow-violet-500/25 flex items-center justify-center space-x-2 active:scale-[0.98] transition-all disabled:opacity-75"
              >
                {downloadState === "downloading" ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                    <span>Starting Download...</span>
                  </>
                ) : downloadState === "downloaded" ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                    <span>Download Started! Check Notifications</span>
                  </>
                ) : (
                  <>
                    <DownloadCloud className="w-4 h-4 text-white" />
                    <span>Download Native App ({latestRelease.version})</span>
                  </>
                )}
              </button>

              {/* Secondary Dismiss Button */}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleUnderstood}
                className="w-full text-zinc-400 hover:text-zinc-200 text-[11px] sm:text-xs py-2"
              >
                Continue on WebApp for now
              </Button>
            </>
          ) : (
            /* For students already on native app */
            <Button
              type="button"
              variant="primary"
              size="lg"
              onClick={handleUnderstood}
              className="w-full font-black text-xs sm:text-sm py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-lg shadow-emerald-500/25 flex items-center justify-center space-x-2 active:scale-95 transition-all"
            >
              <span>Understood • Continue to Room</span>
              <ArrowRight className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

export const StudyRoomUpdateModal = LaunchAnnouncementModal;
