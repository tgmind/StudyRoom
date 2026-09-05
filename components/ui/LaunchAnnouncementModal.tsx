"use client";

import React, { useState, useEffect } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { triggerHapticFeedback } from "@/lib/utils/haptics";
import { Clock, Flame, ShieldCheck, ArrowRight, Sparkles, CheckCircle2 } from "lucide-react";

export const LAUNCH_UPDATE_STORAGE_KEY = "studyroom_update_3h_streak_notice_v2";

export function LaunchAnnouncementModal() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    try {
      // Check if user already acknowledged this update notice on this device
      const alreadySeen = localStorage.getItem(LAUNCH_UPDATE_STORAGE_KEY);
      if (alreadySeen === "true") {
        return;
      }

      // Small delay to allow initial page layout to paint smoothly
      const timer = setTimeout(() => {
        setIsOpen(true);
      }, 500);
      return () => clearTimeout(timer);
    } catch {
      // Fallback silently if localStorage is disabled or restricted
    }
  }, []);

  const handleUnderstood = () => {
    try {
      localStorage.setItem(LAUNCH_UPDATE_STORAGE_KEY, "true");
    } catch {}

    triggerHapticFeedback([10, 30, 15]);
    setIsOpen(false);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleUnderstood}
      title="StudyRoom UPDATE"
      subtitle="Important updates: 3-Hour Session Cap & New Streak Section"
    >
      <div className="space-y-3.5 sm:space-y-4 pt-0.5">
        {/* Glowing Ambient Hero Header Card */}
        <div className="relative overflow-hidden rounded-2xl p-4 sm:p-5 bg-gradient-to-br from-violet-950/80 via-zinc-900 to-amber-950/40 border border-violet-500/35 shadow-[0_8px_30px_rgba(139,92,246,0.15)] space-y-2.5">
          {/* Subtle background ambient blur rings */}
          <div className="absolute -top-12 -right-12 w-36 h-36 bg-amber-500/15 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute -bottom-12 -left-12 w-36 h-36 bg-violet-600/20 rounded-full blur-2xl pointer-events-none" />

          <div className="relative z-10 flex items-center space-x-3">
            <div className="p-2.5 sm:p-3 rounded-2xl bg-gradient-to-br from-violet-500/25 to-amber-500/25 border border-violet-500/40 text-amber-300 shadow-md shrink-0">
              <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-amber-400 animate-pulse" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                <span className="text-[11px] sm:text-xs font-black uppercase tracking-wider text-amber-400">
                  StudyRoom UPDATE
                </span>
                <span className="px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-extrabold bg-violet-500/20 text-violet-300 border border-violet-500/40 uppercase tracking-wide">
                  New Features &amp; Rules
                </span>
              </div>
              <h3 className="text-sm sm:text-base font-black text-white tracking-tight leading-snug mt-0.5">
                Built for Fair Play &amp; Daily Consistency
              </h3>
            </div>
          </div>

          <p className="relative z-10 text-xs sm:text-[13px] text-zinc-300 leading-relaxed pl-0.5">
            We&apos;ve added two major platform improvements to keep rankings 100% fair and help you build an unbreakable study habit.
          </p>
        </div>

        {/* Feature Cards Grid */}
        <div className="space-y-2.5 sm:space-y-3">
          {/* 1. 3-Hour Session Cap */}
          <div className="group rounded-2xl bg-zinc-900/80 hover:bg-zinc-900 border border-zinc-800/90 hover:border-violet-500/40 p-3.5 sm:p-4 transition-all duration-200 shadow-sm">
            <div className="flex items-start space-x-3 sm:space-x-3.5">
              <div className="p-2 sm:p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-400 shrink-0 mt-0.5 shadow-inner">
                <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400" />
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h4 className="text-xs sm:text-sm font-black text-zinc-100 tracking-tight">
                    3-Hour Maximum Session Limit
                  </h4>
                  <span className="text-[9px] sm:text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-300 border border-amber-500/30 shrink-0">
                    Fair Play Rule
                  </span>
                </div>
                <p className="text-[11px] sm:text-xs text-zinc-300 leading-relaxed">
                  To ensure genuine effort and a level playing field, each study session is now limited to a maximum of <strong>3 hours</strong>. No student can leave their timer running unattended to earn unfair study time.
                </p>
                <div className="flex items-center space-x-1.5 pt-0.5 text-[10px] sm:text-[11px] text-emerald-400 font-semibold">
                  <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                  <span>Your full 3 hours are saved automatically. You can start a new session anytime!</span>
                </div>
              </div>
            </div>
          </div>

          {/* 2. New Streak Heatmap Section */}
          <div className="group rounded-2xl bg-zinc-900/80 hover:bg-zinc-900 border border-zinc-800/90 hover:border-amber-500/40 p-3.5 sm:p-4 transition-all duration-200 shadow-sm">
            <div className="flex items-start space-x-3 sm:space-x-3.5">
              <div className="p-2 sm:p-2.5 rounded-xl bg-orange-500/10 border border-orange-500/25 text-orange-400 shrink-0 mt-0.5 shadow-inner">
                <Flame className="w-4 h-4 sm:w-5 sm:h-5 text-orange-400 fill-orange-400/90" />
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h4 className="text-xs sm:text-sm font-black text-zinc-100 tracking-tight">
                    Brand-New &quot;Streak&quot; Heatmap Section
                  </h4>
                  <span className="text-[9px] sm:text-[10px] font-bold px-2 py-0.5 rounded-md bg-orange-500/10 text-orange-300 border border-orange-500/30 shrink-0">
                    New Feature
                  </span>
                </div>
                <p className="text-[11px] sm:text-xs text-zinc-300 leading-relaxed">
                  Track your consistency with our new visual study heatmap in the bottom navigation bar. Study for at least <strong>30 minutes</strong> each day to secure your streak flame.
                </p>
                <div className="flex items-center space-x-1.5 pt-0.5 text-[10px] sm:text-[11px] text-amber-400 font-semibold">
                  <Flame className="w-3.5 h-3.5 shrink-0 fill-amber-400" />
                  <span>Heatmap updates every midnight with real-time consistency reports &amp; all-time records.</span>
                </div>
              </div>
            </div>
          </div>

          {/* 3. Account Safety Assurance */}
          <div className="rounded-xl bg-zinc-900/40 border border-zinc-800/60 p-2.5 sm:p-3 flex items-center space-x-2.5 text-zinc-400">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <p className="text-[10px] sm:text-[11px] leading-snug">
              <strong className="text-zinc-200">Your Data is Safe:</strong> All sign-ins, passwords, profile photos, and past study hours remain completely intact.
            </p>
          </div>
        </div>

        {/* Full-width Gradient Action Button */}
        <div className="pt-1.5 sm:pt-2">
          <Button
            type="button"
            variant="primary"
            size="lg"
            onClick={handleUnderstood}
            className="w-full font-black text-xs sm:text-sm py-3.5 bg-gradient-to-r from-violet-600 via-indigo-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white border-0 shadow-lg shadow-violet-500/25 flex items-center justify-center space-x-2 touch-manipulation active:scale-95 transition-all"
          >
            <span>Understood</span>
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export const StudyRoomUpdateModal = LaunchAnnouncementModal;
