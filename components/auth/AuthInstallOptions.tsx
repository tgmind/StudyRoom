"use client";

import React, { useState, useEffect } from "react";
import { Download, Smartphone, Check, Loader2, Globe, Share, PlusSquare } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
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

export function AuthInstallOptions() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIos, setIsIos] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [showPwaGuide, setShowPwaGuide] = useState(false);

  const [apkUrl, setApkUrl] = useState(DEFAULT_APK_DOWNLOAD_URL);
  const [appVersion, setAppVersion] = useState(DEFAULT_RELEASE_VERSION);
  const [apkSize, setApkSize] = useState<string | undefined>(undefined);
  const [isDownloadingApk, setIsDownloadingApk] = useState(false);
  const [downloadSuccessToast, setDownloadSuccessToast] = useState(false);

  useEffect(() => {
    // Detect standalone / already installed in PWA or Native App
    if (typeof window !== "undefined") {
      if (isRunningInAppOrPwa()) {
        setIsStandalone(true);
        return;
      }

      const ua = window.navigator.userAgent.toLowerCase();
      setIsIos(/iphone|ipad|ipod/.test(ua));

      const handlePrompt = (e: Event) => {
        e.preventDefault();
        setDeferredPrompt(e as BeforeInstallPromptEvent);
      };
      window.addEventListener("beforeinstallprompt", handlePrompt);

      // Fetch dynamic latest release from GitHub API
      fetchLatestApkRelease().then((info) => {
        if (info.apkDownloadUrl) setApkUrl(info.apkDownloadUrl);
        if (info.version) setAppVersion(info.version);
        if (info.apkSizeMb) setApkSize(info.apkSizeMb);
      });

      return () => {
        window.removeEventListener("beforeinstallprompt", handlePrompt);
      };
    }
  }, []);

  const handlePwaClick = async () => {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === "accepted") {
          setDeferredPrompt(null);
        }
      } catch {
        setShowPwaGuide(true);
      }
    } else if (isIos) {
      setShowIosGuide(true);
    } else {
      setShowPwaGuide(true);
    }
  };

  const handleApkDownload = () => {
    setIsDownloadingApk(true);
    setDownloadSuccessToast(true);

    // Directly triggers silent background file download without redirecting or navigating away
    triggerApkDirectDownload(apkUrl, `StudyRoom-${appVersion}.apk`);

    // Reset download button after short interval
    setTimeout(() => {
      setIsDownloadingApk(false);
    }, 3500);

    // Auto-dismiss confirmation toast after 7 seconds
    setTimeout(() => {
      setDownloadSuccessToast(false);
    }, 7000);
  };

  if (isStandalone) {
    return null;
  }

  return (
    <div className="pt-4 border-t border-zinc-900/90 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold tracking-wide uppercase text-zinc-400">
          Get StudyRoom
        </span>
        <span className="text-[10px] text-zinc-400">Two ways to install</span>
      </div>

      {downloadSuccessToast && (
        <div className="p-2.5 bg-emerald-950/60 border border-emerald-800/80 rounded-xl text-xs text-emerald-200 flex items-center space-x-2 animate-in fade-in slide-in-from-top-1 duration-200">
          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="leading-tight text-[11px]">
            <strong>Download started!</strong> Pull down your phone&apos;s notification shade to tap and install the APK.
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2.5">
        {/* Option 1: Web PWA */}
        <div className="p-3 bg-zinc-900/60 border border-zinc-800/90 rounded-xl flex flex-col justify-between hover:border-zinc-700 transition-colors">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <div className="w-7 h-7 rounded-lg bg-violet-950/70 border border-violet-800/50 flex items-center justify-center text-violet-300">
                <Globe className="w-3.5 h-3.5" />
              </div>
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                Instant
              </span>
            </div>
            <h4 className="text-xs font-bold text-zinc-100">Web PWA</h4>
            <p className="text-[10px] text-zinc-400 mt-0.5 leading-snug">
              Add to Home Screen directly from browser
            </p>
          </div>

          <button
            type="button"
            onClick={handlePwaClick}
            className="mt-3 w-full py-1.5 px-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded-lg text-[11px] font-bold flex items-center justify-center space-x-1 transition-colors active:scale-[0.98]"
          >
            <Download className="w-3 h-3 text-zinc-400" />
            <span>{isStandalone ? "Installed" : "Install PWA"}</span>
          </button>
        </div>

        {/* Option 2: Native Android App (.APK) */}
        <div className="p-3 bg-gradient-to-br from-emerald-950/20 via-zinc-900/60 to-zinc-900/90 border border-emerald-900/40 rounded-xl flex flex-col justify-between hover:border-emerald-700/60 transition-colors relative overflow-hidden">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <div className="w-7 h-7 rounded-lg bg-emerald-950/80 border border-emerald-800/60 flex items-center justify-center text-emerald-300">
                <Smartphone className="w-3.5 h-3.5" />
              </div>
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-800/60">
                {appVersion}
              </span>
            </div>
            <h4 className="text-xs font-bold text-zinc-100 flex items-center space-x-1">
              <span>Android App</span>
            </h4>
            <p className="text-[10px] text-zinc-400 mt-0.5 leading-snug">
              Direct .APK {apkSize ? `(${apkSize} MB)` : ""} • Live Notification Timer
            </p>
          </div>

          <button
            type="button"
            onClick={handleApkDownload}
            disabled={isDownloadingApk}
            className="mt-3 w-full py-1.5 px-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-75 text-white rounded-lg text-[11px] font-bold flex items-center justify-center space-x-1 transition-colors active:scale-[0.98] shadow-sm shadow-emerald-950"
          >
            {isDownloadingApk ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Downloading...</span>
              </>
            ) : (
              <>
                <Download className="w-3 h-3" />
                <span>Download APK</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* iOS Guide Modal */}
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
                Tap the Share icon in your Safari toolbar at the bottom of the screen.
              </p>
            </div>
          </div>

          <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-xl flex items-start space-x-3 text-xs">
            <PlusSquare className="w-5 h-5 text-violet-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-zinc-100">Step 2: Tap &quot;Add to Home Screen&quot;</p>
              <p className="text-zinc-400 mt-0.5">
                Scroll down and select <strong>Add to Home Screen</strong> to install.
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

      {/* General PWA Guide Modal */}
      <Modal
        isOpen={showPwaGuide}
        onClose={() => setShowPwaGuide(false)}
        title="Install Web PWA"
        subtitle="Add StudyRoom to your home screen or desktop:"
      >
        <div className="space-y-3 py-2 text-xs text-zinc-300">
          <p>
            If the automatic install prompt did not appear, you can install StudyRoom directly from your browser menu:
          </p>
          <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-xl space-y-2">
            <p>
              <strong>On Android Chrome:</strong> Tap the <strong>⋮ menu</strong> at top-right, then tap <strong>&quot;Add to Home screen&quot;</strong> or <strong>&quot;Install app&quot;</strong>.
            </p>
            <p>
              <strong>On Desktop Chrome/Edge:</strong> Click the install icon <Download className="w-3.5 h-3.5 inline mx-1 text-violet-400" /> in the address bar.
            </p>
          </div>
          <div className="pt-2 flex justify-end">
            <button
              type="button"
              onClick={() => setShowPwaGuide(false)}
              className="px-4 py-2 bg-zinc-100 text-zinc-950 font-bold rounded-lg text-xs hover:bg-white"
            >
              Close
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
