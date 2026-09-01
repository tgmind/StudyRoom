"use client";

import React, { useState, useEffect } from "react";
import { Download, X, Share, PlusSquare, Smartphone } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PwaInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Check if running in standalone mode (already installed)
    const inStandaloneMode =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;

    if (inStandaloneMode) {
      setIsStandalone(true);
      return;
    }

    // Detect iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIos(isIosDevice);

    // Listen for beforeinstallprompt event (Android / Chromium)
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);

      // Check if user dismissed banner recently in localStorage
      const dismissedTime = localStorage.getItem("pwa_banner_dismissed");
      if (!dismissedTime || Date.now() - parseInt(dismissedTime, 10) > 86400000) {
        setShowBanner(true);
      }
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    // Show iOS guide banner if on iOS Safari and not dismissed recently
    if (isIosDevice && !inStandaloneMode) {
      const dismissedTime = localStorage.getItem("pwa_banner_dismissed");
      if (!dismissedTime || Date.now() - parseInt(dismissedTime, 10) > 86400000) {
        setShowBanner(true);
      }
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === "accepted") {
        setShowBanner(false);
      }
      setDeferredPrompt(null);
    } else if (isIos) {
      setShowIosGuide(true);
    }
  };

  const handleDismiss = () => {
    setShowBanner(false);
    localStorage.setItem("pwa_banner_dismissed", Date.now().toString());
  };

  if (isStandalone || !showBanner) return null;

  return (
    <>
      {/* Floating Bottom PWA Install Banner */}
      <div className="fixed bottom-20 left-4 right-4 z-50 max-w-md mx-auto p-4 bg-zinc-950/95 border border-zinc-700/80 rounded-2xl shadow-2xl backdrop-blur-xl animate-in slide-in-from-bottom duration-300">
        <div className="flex items-center justify-between space-x-3">
          <div className="flex items-center space-x-3 min-w-0 flex-1">
            <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-700 flex items-center justify-center text-zinc-100 shrink-0 shadow-md">
              <Smartphone className="w-5 h-5 text-emerald-400" />
            </div>

            <div className="min-w-0 flex-1">
              <h3 className="text-xs font-bold text-zinc-100 truncate">
                Install StudyRoom PWA
              </h3>
              <p className="text-[11px] text-zinc-400 truncate mt-0.5">
                Fast home screen access & offline study support
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            <Button
              variant="primary"
              size="sm"
              onClick={handleInstallClick}
              className="px-3 text-xs font-extrabold space-x-1.5 shadow-md bg-zinc-100 text-zinc-950 hover:bg-white"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Install</span>
            </Button>

            <button
              type="button"
              onClick={handleDismiss}
              className="p-2 text-zinc-400 hover:text-white rounded-lg transition-colors"
              aria-label="Dismiss banner"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
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
            <Share className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-zinc-100">Step 1: Tap the Share Button</p>
              <p className="text-zinc-400 mt-0.5">
                Tap the Share icon in your Safari browser navigation toolbar at the bottom of your screen.
              </p>
            </div>
          </div>

          <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-xl flex items-start space-x-3 text-xs">
            <PlusSquare className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-zinc-100">Step 2: Tap &quot;Add to Home Screen&quot;</p>
              <p className="text-zinc-400 mt-0.5">
                Scroll down the options list and select <strong>Add to Home Screen</strong> to install.
              </p>
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <Button variant="primary" size="md" onClick={() => setShowIosGuide(false)}>
              Got it!
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
