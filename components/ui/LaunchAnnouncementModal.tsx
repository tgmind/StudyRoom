"use client";

import React, { useState, useEffect } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { triggerHapticFeedback } from "@/lib/utils/haptics";
import { Rocket, Sparkles, Trophy, Target, ShieldCheck, ArrowRight } from "lucide-react";

// Target launch time: 11:58 PM IST on Sep 3, 2026 (18:28 UTC)
const LAUNCH_TIMESTAMP_MS = new Date("2026-09-03T18:28:00Z").getTime();
const STORAGE_KEY = "studyroom_launch_notice_seen_v1";

export function LaunchAnnouncementModal() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    try {
      // Check if user already acknowledged the launch popup on this browser
      const alreadySeen = localStorage.getItem(STORAGE_KEY);
      if (alreadySeen === "true") {
        return;
      }

      // Check if launch time has arrived OR if testing via ?preview_launch=true
      const isPreview = typeof window !== "undefined" && window.location.search.includes("preview_launch=true");
      const isPostLaunch = Date.now() >= LAUNCH_TIMESTAMP_MS;

      if (isPostLaunch || isPreview) {
        // Small timeout to allow initial page layout to mount smoothly
        const timer = setTimeout(() => {
          setIsOpen(true);
        }, 600);
        return () => clearTimeout(timer);
      }
    } catch {
      // Fallback silently if localStorage is disabled/restricted
    }
  }, []);

  const handleUnderstood = () => {
    try {
      localStorage.setItem(STORAGE_KEY, "true");
    } catch {}

    triggerHapticFeedback([10, 30, 15]);
    setIsOpen(false);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleUnderstood}
      title="StudyRoom Official Launch"
      subtitle="Welcome to the fresh season of live accountability"
    >
      <div className="space-y-4 pt-1">
        {/* Hero Announcement Banner */}
        <div className="relative overflow-hidden rounded-2xl p-4 bg-gradient-to-br from-violet-950/60 via-zinc-900 to-indigo-950/60 border border-violet-500/30 shadow-xl space-y-2.5">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-violet-500/20 to-amber-500/20 border border-violet-500/40 text-amber-300 shadow-md shrink-0">
              <Rocket className="w-5 h-5 animate-pulse text-amber-400" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center space-x-2">
                <span className="text-xs font-black uppercase tracking-wider text-amber-400">
                  Official Launch
                </span>
                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-violet-500/20 text-violet-300 border border-violet-500/30 uppercase">
                  Season 1
                </span>
              </div>
              <h3 className="text-sm sm:text-base font-extrabold text-white tracking-tight leading-snug mt-0.5">
                The Platform is Freshly Initialized!
              </h3>
            </div>
          </div>

          <p className="text-xs text-zinc-300 leading-relaxed pl-0.5">
            StudyRoom has been officially launched with a clean slate. All study logs, timers, and rankings start from zero for everyone tonight.
          </p>
        </div>

        {/* Feature Highlights Grid */}
        <div className="space-y-2">
          <div className="flex items-start space-x-3 p-2.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80">
            <div className="p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 shrink-0 mt-0.5">
              <Trophy className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1 text-xs">
              <strong className="text-zinc-200 block font-semibold">Weekly Leaderboard Reset</strong>
              <span className="text-zinc-400 text-[11px] leading-snug block">
                Every member begins at 0h 0m. Consistent study habits and completed daily goals determine the Weekly Achiever crown on Monday.
              </span>
            </div>
          </div>

          <div className="flex items-start space-x-3 p-2.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80">
            <div className="p-1.5 rounded-lg bg-violet-500/10 border border-violet-500/20 text-violet-400 shrink-0 mt-0.5">
              <Target className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1 text-xs">
              <strong className="text-zinc-200 block font-semibold">Live Room & Daily Goals</strong>
              <span className="text-zinc-400 text-[11px] leading-snug block">
                Enter the Live Room to study alongside peers, monitor live break periods, and commit to 24-hour goal checklists.
              </span>
            </div>
          </div>

          <div className="flex items-start space-x-3 p-2.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80">
            <div className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 shrink-0 mt-0.5">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1 text-xs">
              <strong className="text-zinc-200 block font-semibold">Your Account & Avatar Preserved</strong>
              <span className="text-zinc-400 text-[11px] leading-snug block">
                Your sign-in credentials, display name, and profile picture remain intact. Only study activity has been reset.
              </span>
            </div>
          </div>
        </div>

        {/* Motivational Callout */}
        <div className="flex items-center space-x-2 px-3 py-2 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-200 text-xs font-medium">
          <Sparkles className="w-4 h-4 text-violet-400 shrink-0" />
          <span>Log your first session today to claim the top spot!</span>
        </div>

        {/* Primary Action Button */}
        <div className="pt-2">
          <Button
            type="button"
            variant="primary"
            size="lg"
            onClick={handleUnderstood}
            className="w-full font-extrabold text-xs sm:text-sm py-3 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white border-0 shadow-lg shadow-violet-500/25 flex items-center justify-center space-x-2 touch-manipulation"
          >
            <span>Understood</span>
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </Modal>
  );
}
