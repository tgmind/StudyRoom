"use client";

import React, { useState, useEffect } from "react";
import { Download, X, Share, PlusSquare, Smartphone, Globe, Loader2, Check } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { usePathname } from "next/navigation";
import { useAuthContext } from "@/components/auth/AuthProvider";
import {
  fetchLatestApkRelease,
  triggerApkDirectDownload,
  isRunningInAppOrPwa,
  DEFAULT_APK_DOWNLOAD_URL,
  DEFAULT_RELEASE_VERSION,
} from "@/lib/app/latestRelease";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PwaInstallBanner() {
  const auth = useAuthContext();
  const pathname = usePathname();

  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [isInstalledAppOrPwa, setIsInstalledAppOrPwa] = useState(false);

  const [apkUrl, setApkUrl] = useState(DEFAULT_APK_DOWNLOAD_URL);
  const [appVersion, setAppVersion] = useState(DEFAULT_RELEASE_VERSION);
  const [isDownloadingApk, setIsDownloadingApk] = useState(false);
  const [downloadSuccessToast, setDownloadSuccessToast] = useState(false);

  // STRICT RULE 1: Only display on Login or Signup pages
  const isAuthPage = pathname === "/login" || pathname === "/signup";

  // STRICT RULE 2: Never display to logged in users
  const isLoggedIn = Boolean(auth?.user);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // STRICT RULE 3: Never display to users already in the PWA or native App
    if (isRunningInAppOrPwa()) {
      setIsInstalledAppOrPwa(true);
      setShowBanner(false);
      return;
    }

    // Detect iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIos(isIosDevice);

    // STRICT RULE 4: Check if dismissed by the user. Once dismissed, stays hidden
    // until the user explicitly signs out (which clears this key in AuthProvider).
    const isDismissed = localStorage.getItem("pwa_banner_dismissed") === "true";

    // Listen for beforeinstallprompt event (Android / Chromium)
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);

      if (isAuthPage && !isLoggedIn && !isDismissed) {
        setShowBanner(true);
      }
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    // Show banner on auth pages for unauthenticated visitors if not dismissed
    if (isAuthPage && !isLoggedIn && !isDismissed) {
      setShowBanner(true);
    } else {
      setShowBanner(false);
    }

    // Fetch dynamic latest release from GitHub API
    fetchLatestApkRelease().then((info) => {
      if (info.apkDownloadUrl) setApkUrl(info.apkDownloadUrl);
      if (info.version) setAppVersion(info.version);
    });

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, [isAuthPage, isLoggedIn]);

  const handlePwaInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === "accepted") {
        setShowBanner(false);
      }
      setDeferredPrompt(null);
    } else if (isIos) {
      setShowIosGuide(true);
    } else {
      setShowIosGuide(false);
    }
  };

  const handleApkDownloadClick = () => {
    setIsDownloadingApk(true);
    setDownloadSuccessToast(true);

    // Direct background APK download without page redirect
    triggerApkDirectDownload(apkUrl, `StudyRoom-${appVersion}.apk`);

    setTimeout(() => {
      setIsDownloadingApk(false);
    }, 3500);

    setTimeout(() => {
      setDownloadSuccessToast(false);
    }, 7000);
  };

  const handleDismiss = () => {
    setShowBanner(false);
    localStorage.setItem("pwa_banner_dismissed", "true");
  };

  // If already installed in PWA or App, or user is logged in, or not on auth pages, never render
  if (isInstalledAppOrPwa || isLoggedIn || !isAuthPage || !showBanner) {
    return null;
  }

  return (
    <>
      {/* Floating Bottom Dual Install Banner (Strictly on Login & Signup) */}
      <div className="fixed bottom-4 sm:bottom-6 left-3.5 right-3.5 z-50 max-w-md mx-auto p-3.5 bg-zinc-950/95 border border-zinc-700/80 rounded-2xl shadow-2xl backdrop-blur-xl animate-in slide-in-from-bottom duration-300 space-y-3">
        <div className="flex items-start justify-between space-x-2">
          <div className="flex items-center space-x-2.5 min-w-0 flex-1">
            <div className="w-8 h-8 rounded-xl bg-zinc-900 border border-zinc-700 flex items-center justify-center text-zinc-100 shrink-0 shadow-sm">
              <Smartphone className="w-4 h-4 text-violet-400" />
            </div>

            <div className="min-w-0 flex-1">
              <h3 className="text-xs font-bold text-zinc-100 leading-tight">
                Install StudyRoom App
              </h3>
              <p className="text-[10px] text-zinc-400 mt-0.5 leading-tight">
                Choose Web PWA or direct Native Android APK
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleDismiss}
            className="p-1.5 text-zinc-400 hover:text-white rounded-lg transition-colors -mr-1 -mt-0.5"
            aria-label="Dismiss banner"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {downloadSuccessToast && (
          <div className="p-2 bg-emerald-950/70 border border-emerald-800/80 rounded-lg text-[11px] text-emerald-200 flex items-center space-x-1.5">
            <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>
              <strong>Download started!</strong> Pull down notification shade to install.
            </span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 pt-0.5">
          {/* Option 1: Web PWA */}
          <button
            type="button"
            onClick={handlePwaInstallClick}
            className="w-full py-2 px-2.5 bg-zinc-900 hover:bg-zinc-850 border border-zinc-700/70 text-zinc-100 rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5 transition-colors active:scale-[0.98] shadow-sm"
          >
            <Globe className="w-3.5 h-3.5 text-violet-400" />
            <span>Install PWA</span>
          </button>

          {/* Option 2: Native Android App (.APK) */}
          <button
            type="button"
            onClick={handleApkDownloadClick}
            disabled={isDownloadingApk}
            className="w-full py-2 px-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-75 text-white rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5 transition-colors active:scale-[0.98] shadow-sm shadow-emerald-950"
          >
            {isDownloadingApk ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Downloading...</span>
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5" />
                <span>Get APK ({appVersion})</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* iOS Installation Guide Modal */}
      <Modal
        isOpen={showIosGuide}
        onClose={() => setShowIosGuide(false)}
        title="Install StudyRoom on iOS"
        subtitle="Follow these 2 simple steps in Safari to add StudyRoom to your Home Screen:"
      >
        <div className="space-y-4 py-2">
          <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-xl flex items-start space-x-3 text-xs">
            <Share className="w-5 h-5 text-violet-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-zinc-100">Step 1: Tap the Share Button</p>
              <p className="text-zinc-400 mt-0.5">
                Tap the Share icon in your Safari browser navigation toolbar at the bottom of your screen.
              </p>
            </div>
          </div>

          <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-xl flex items-start space-x-3 text-xs">
            <PlusSquare className="w-5 h-5 text-violet-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-zinc-100">Step 2: Tap &quot;Add to Home Screen&quot;</p>
              <p className="text-zinc-400 mt-0.5">
                Scroll down the options list and select <strong>Add to Home Screen</strong> to install.
              </p>
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="button"
              onClick={() => setShowIosGuide(false)}
              className="px-4 py-2 bg-zinc-100 text-zinc-950 font-bold rounded-lg text-xs hover:bg-white"
            >
              Got it!
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
