"use client";

import React, { useState, useEffect, memo } from "react";
import { RivalryWinEvent } from "@/lib/time/rivalry";
import { Trophy, X, Sparkles, Swords } from "lucide-react";

interface RivalryWinCelebrationProps {
  winEvent?: RivalryWinEvent | null;
  onDismiss?: () => void;
}

const PERSISTENCE_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const POPUP_AUTO_MINIMIZE_MS = 4500; // 4.5 seconds before hooking to compact form

export const RivalryWinCelebration = memo(function RivalryWinCelebration({
  winEvent,
  onDismiss,
}: RivalryWinCelebrationProps) {
  const [isPopupVisible, setIsPopupVisible] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [remainingMinutes, setRemainingMinutes] = useState(15);

  useEffect(() => {
    if (!winEvent) return;

    const now = Date.now();
    const elapsed = now - winEvent.timestamp;

    // If older than 15 minutes, do not display
    if (elapsed >= PERSISTENCE_DURATION_MS) {
      return;
    }

    // Check if dismissed in localStorage
    try {
      const dismissedKey = `studyroom_win_dismissed_${winEvent.id}`;
      if (localStorage.getItem(dismissedKey)) {
        setIsDismissed(true);
        return;
      }
    } catch {}

    // If event is fresh (less than 10 seconds old), show full celebration popup first
    if (elapsed < 10000) {
      setIsPopupVisible(true);
      const timer = setTimeout(() => {
        setIsPopupVisible(false);
      }, POPUP_AUTO_MINIMIZE_MS);
      return () => clearTimeout(timer);
    } else {
      setIsPopupVisible(false);
    }
  }, [winEvent]);

  // Keep remaining persistence timer updated every 15 seconds
  useEffect(() => {
    if (!winEvent) return;

    const updateRemaining = () => {
      const remainingMs = PERSISTENCE_DURATION_MS - (Date.now() - winEvent.timestamp);
      if (remainingMs <= 0) {
        setIsDismissed(true);
      } else {
        setRemainingMinutes(Math.max(1, Math.ceil(remainingMs / 60000)));
      }
    };

    updateRemaining();
    const interval = setInterval(updateRemaining, 15000);
    return () => clearInterval(interval);
  }, [winEvent]);

  if (!winEvent || isDismissed) {
    return null;
  }

  const isStillValid = Date.now() - winEvent.timestamp < PERSISTENCE_DURATION_MS;
  if (!isStillValid) {
    return null;
  }

  const handleDismiss = () => {
    setIsDismissed(true);
    setIsPopupVisible(false);
    try {
      localStorage.setItem(`studyroom_win_dismissed_${winEvent.id}`, "true");
    } catch {}
    if (onDismiss) onDismiss();
  };

  return (
    <>
      {/* 1. Full-Screen Overlapping Celebration Pop-up */}
      {isPopupVisible && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in zoom-in-95 duration-300 pointer-events-auto">
          <div className="relative w-full max-w-sm sm:max-w-md p-6 rounded-3xl bg-gradient-to-b from-[#2b1807] via-[#1a0e05] to-[#0d0702] border-2 border-amber-500/60 shadow-[0_0_50px_rgba(245,158,11,0.35)] text-center space-y-4 overflow-hidden">
            {/* Ambient gold radial glow */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(245,158,11,0.25),_transparent_70%)] pointer-events-none" />

            {/* Floating Close Button */}
            <button
              onClick={handleDismiss}
              className="absolute top-3 right-3 p-1.5 rounded-full bg-zinc-900/60 border border-zinc-700/60 text-zinc-400 hover:text-white transition-colors"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Trophy & Confetti Icon */}
            <div className="relative mx-auto w-16 h-16 rounded-2xl bg-gradient-to-tr from-amber-500 to-yellow-300 flex items-center justify-center text-zinc-950 shadow-[0_0_30px_rgba(245,158,11,0.6)] animate-bounce">
              <Trophy className="w-8 h-8 fill-current" />
              <Sparkles className="w-4 h-4 text-white absolute -top-1 -right-1 animate-pulse" />
            </div>

            {/* Headline */}
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[10px] font-black uppercase tracking-widest">
                <Swords className="w-3 h-3" />
                <span>Rivalry Victor Decided</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-yellow-100 to-amber-300 tracking-tight">
                Victory Claimed!
              </h2>
            </div>

            {/* Victory Announcement Text */}
            <div className="p-3.5 rounded-2xl bg-zinc-950/60 border border-amber-500/30 shadow-inner">
              <p className="text-sm sm:text-base font-extrabold text-zinc-100">
                <span className="text-amber-400 underline decoration-amber-500/50 decoration-2">
                  {winEvent.winnerName}
                </span>{" "}
                won the Rivalry against{" "}
                <span className="text-rose-300">{winEvent.loserName}</span> 🎉
              </p>
            </div>

            <p className="text-[11px] text-zinc-400 font-medium">
              Racing through this week&apos;s live sessions to secure the lead!
            </p>
          </div>
        </div>
      )}

      {/* 2. Persistent Compact Banner Hooked Above 'Studying' Section */}
      <div className="w-full mb-3 p-2.5 sm:p-3 rounded-xl bg-gradient-to-r from-amber-950/40 via-zinc-900/90 to-rose-950/40 border border-amber-500/40 shadow-[0_4px_20px_rgba(245,158,11,0.12)] backdrop-blur-md flex items-center justify-between gap-2.5 transition-all duration-300 select-none animate-in fade-in slide-in-from-top-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-amber-500 to-yellow-400 flex items-center justify-center text-zinc-950 shadow-md shrink-0">
            <Trophy className="w-4 h-4 fill-current" />
          </div>

          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[8px] font-black uppercase tracking-wider px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                Rivalry Result
              </span>
              <span className="text-[9px] text-zinc-500 font-medium">
                {remainingMinutes}m remaining
              </span>
            </div>
            <p className="text-xs sm:text-sm font-extrabold text-zinc-100 truncate">
              <span className="text-amber-300">{winEvent.winnerName}</span>{" "}
              won the Rivalry against{" "}
              <span className="text-rose-300">{winEvent.loserName}</span> 🎉
            </p>
          </div>
        </div>

        {/* Dismiss Button (x) */}
        <button
          onClick={handleDismiss}
          className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800/80 border border-transparent hover:border-zinc-700 transition-colors shrink-0"
          title="Dismiss notification"
          aria-label="Dismiss notification"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </>
  );
});
