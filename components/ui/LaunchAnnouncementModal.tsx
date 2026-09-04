"use client";

import React, { useState, useEffect } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { triggerHapticFeedback } from "@/lib/utils/haptics";
import { Clock, ShieldCheck, CheckCircle2, ArrowRight } from "lucide-react";

const STORAGE_KEY = "studyroom_update_3h_notice_v1";

export function LaunchAnnouncementModal() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    try {
      // Check if user already acknowledged this update notice on this device
      const alreadySeen = localStorage.getItem(STORAGE_KEY);
      if (alreadySeen === "true") {
        return;
      }

      // Small delay to allow initial layout to paint smoothly
      const timer = setTimeout(() => {
        setIsOpen(true);
      }, 500);
      return () => clearTimeout(timer);
    } catch {
      // Fallback silently if localStorage is restricted
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
      title="StudyRoom UPDATE"
      subtitle="Important update regarding study session timing and fair play"
    >
      <div className="space-y-4 pt-1">
        {/* Glowing Purple/Amber Gradient Hero Banner */}
        <div className="relative overflow-hidden rounded-2xl p-4 bg-gradient-to-br from-violet-950/70 via-zinc-900 to-indigo-950/70 border border-violet-500/40 shadow-xl space-y-2.5">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-violet-500/20 to-amber-500/20 border border-violet-500/40 text-amber-300 shadow-md shrink-0">
              <Clock className="w-5 h-5 text-amber-400 animate-pulse" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center space-x-2">
                <span className="text-xs font-black uppercase tracking-wider text-amber-400">
                  StudyRoom UPDATE
                </span>
                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-violet-500/20 text-violet-300 border border-violet-500/30 uppercase">
                  Fair Play Rule
                </span>
              </div>
              <h3 className="text-sm sm:text-base font-extrabold text-white tracking-tight leading-snug mt-0.5">
                Study Sessions Capped at 3 Hours
              </h3>
            </div>
          </div>

          <p className="text-xs text-zinc-300 leading-relaxed pl-0.5">
            To ensure genuine accountability and a fair leaderboard, study session timers are now restricted to a maximum of 3 hours per session.
          </p>
        </div>

        {/* Informational Points */}
        <div className="space-y-2">
          <div className="flex items-start space-x-3 p-3 rounded-xl bg-zinc-900/60 border border-zinc-800/80">
            <div className="p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 shrink-0 mt-0.5">
              <Clock className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1 text-xs">
              <strong className="text-zinc-200 block font-semibold">3-Hour Maximum Duration</strong>
              <span className="text-zinc-400 text-[11px] leading-snug block">
                When you start studying, your session will automatically finish after 3 hours. Your full 3 hours of study time will be saved automatically.
              </span>
            </div>
          </div>

          <div className="flex items-start space-x-3 p-3 rounded-xl bg-zinc-900/60 border border-zinc-800/80">
            <div className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 shrink-0 mt-0.5">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1 text-xs">
              <strong className="text-zinc-200 block font-semibold">Fair Rankings for Everyone</strong>
              <span className="text-zinc-400 text-[11px] leading-snug block">
                This rule prevents unattended timers from running in the background and accumulating unfair hours, ensuring every minute on the leaderboard reflects real study effort.
              </span>
            </div>
          </div>

          <div className="flex items-start space-x-3 p-3 rounded-xl bg-zinc-900/60 border border-zinc-800/80">
            <div className="p-1.5 rounded-lg bg-violet-500/10 border border-violet-500/20 text-violet-400 shrink-0 mt-0.5">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1 text-xs">
              <strong className="text-zinc-200 block font-semibold">Review Goals & Continue</strong>
              <span className="text-zinc-400 text-[11px] leading-snug block">
                At the end of 3 hours, you can mark which daily goals you completed, take a break, and start a fresh session anytime.
              </span>
            </div>
          </div>
        </div>

        {/* Full-width Gradient Action Button */}
        <div className="pt-2">
          <Button
            type="button"
            variant="primary"
            size="lg"
            onClick={handleUnderstood}
            className="w-full font-extrabold text-xs sm:text-sm py-3 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white border-0 shadow-lg shadow-violet-500/25 flex items-center justify-center space-x-2 touch-manipulation active:scale-95"
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
