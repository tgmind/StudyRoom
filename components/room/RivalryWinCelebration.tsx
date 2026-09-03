"use client";

import React, { useState, useEffect, memo } from "react";
import { RivalryWinEvent } from "@/lib/time/rivalry";
import { Trophy, X, Sparkles, Swords, Crown, Flame } from "lucide-react";
import { triggerHapticFeedback } from "@/lib/utils/haptics";

interface RivalryWinCelebrationProps {
  winEvent?: RivalryWinEvent | null;
  onDismiss?: () => void;
}

const PERSISTENCE_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const POPUP_AUTO_MINIMIZE_MS = 4500; // 4.5 seconds before hooking to compact form

// Ambient celebratory confetti particles for gold-standard celebratory immersion
const CONFETTI_PARTICLES = [
  { id: 1, color: "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]", style: { top: "15%", left: "18%", animationDelay: "0ms" } },
  { id: 2, color: "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]", style: { top: "22%", left: "82%", animationDelay: "150ms" } },
  { id: 3, color: "bg-yellow-300 shadow-[0_0_8px_rgba(253,224,71,0.8)]", style: { top: "68%", left: "14%", animationDelay: "300ms" } },
  { id: 4, color: "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]", style: { top: "72%", left: "86%", animationDelay: "450ms" } },
  { id: 5, color: "bg-fuchsia-400 shadow-[0_0_8px_rgba(232,121,249,0.8)]", style: { top: "12%", left: "50%", animationDelay: "100ms" } },
  { id: 6, color: "bg-amber-300 shadow-[0_0_8px_rgba(252,211,77,0.8)]", style: { top: "82%", left: "48%", animationDelay: "250ms" } },
  { id: 7, color: "bg-orange-400 shadow-[0_0_8px_rgba(251,146,60,0.8)]", style: { top: "35%", left: "10%", animationDelay: "400ms" } },
  { id: 8, color: "bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.8)]", style: { top: "38%", left: "90%", animationDelay: "200ms" } },
  { id: 9, color: "bg-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.8)]", style: { top: "54%", left: "22%", animationDelay: "350ms" } },
  { id: 10, color: "bg-violet-400 shadow-[0_0_8px_rgba(167,139,250,0.8)]", style: { top: "52%", left: "78%", animationDelay: "50ms" } },
];

export const RivalryWinCelebration = memo(function RivalryWinCelebration({
  winEvent,
  onDismiss,
}: RivalryWinCelebrationProps) {
  const [isPopupVisible, setIsPopupVisible] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [remainingMinutes, setRemainingMinutes] = useState(15);
  const [progressPercent, setProgressPercent] = useState(100);

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

    // If event is fresh (less than 10 seconds old), show full celebration popup with haptic feedback
    if (elapsed < 10000) {
      setIsPopupVisible(true);
      triggerHapticFeedback([30, 40, 50]);
      const timer = setTimeout(() => {
        setIsPopupVisible(false);
      }, POPUP_AUTO_MINIMIZE_MS);
      return () => clearTimeout(timer);
    } else {
      setIsPopupVisible(false);
    }
  }, [winEvent]);

  // Keep remaining persistence timer and bottom progress bar updated
  useEffect(() => {
    if (!winEvent) return;

    const updateRemaining = () => {
      const remainingMs = PERSISTENCE_DURATION_MS - (Date.now() - winEvent.timestamp);
      if (remainingMs <= 0) {
        setIsDismissed(true);
      } else {
        setRemainingMinutes(Math.max(1, Math.ceil(remainingMs / 60000)));
        setProgressPercent(Math.max(0, Math.min(100, (remainingMs / PERSISTENCE_DURATION_MS) * 100)));
      }
    };

    updateRemaining();
    const interval = setInterval(updateRemaining, 2000);
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
    triggerHapticFeedback(15);
    try {
      localStorage.setItem(`studyroom_win_dismissed_${winEvent.id}`, "true");
    } catch {}
    if (onDismiss) onDismiss();
  };

  return (
    <>
      {/* 1. Full-Screen Overlapping Celebration Pop-up */}
      {isPopupVisible && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xl animate-in fade-in duration-300 pointer-events-auto">
          <div className="relative w-full max-w-sm sm:max-w-md p-6 sm:p-7 rounded-3xl bg-gradient-to-b from-[#2b1606] via-[#1a0e07] to-[#0d0604] border-2 border-amber-500/70 shadow-[0_0_70px_rgba(245,158,11,0.45),_0_0_30px_rgba(225,29,72,0.25)] text-center space-y-4 overflow-hidden animate-in zoom-in-95 duration-400">
            {/* Ambient gold-rose radial light beacon */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(245,158,11,0.3)_0%,_rgba(225,29,72,0.12)_50%,_transparent_75%)] pointer-events-none animate-pulse" />
            <div className="absolute top-0 left-1/4 right-1/4 h-[2px] bg-gradient-to-r from-transparent via-amber-400 to-transparent shadow-[0_0_20px_rgba(251,191,36,1)] pointer-events-none" />

            {/* Confetti & Sparkles Scatter Particles */}
            {CONFETTI_PARTICLES.map((p) => (
              <div
                key={p.id}
                style={p.style}
                className={`absolute w-2 h-2 rounded-full ${p.color} animate-ping pointer-events-none opacity-85`}
              />
            ))}

            {/* Floating Close Button */}
            <button
              onClick={handleDismiss}
              className="absolute top-3.5 right-3.5 p-1.5 rounded-full bg-zinc-900/80 border border-zinc-700/70 text-zinc-400 hover:text-white hover:border-amber-500/50 transition-all hover:scale-110 active:scale-95 z-20"
              title="Close celebration"
              aria-label="Close celebration"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Trophy & Crown Icon Badge */}
            <div className="relative mx-auto w-20 h-20 rounded-3xl bg-gradient-to-tr from-amber-500 via-yellow-400 to-amber-300 flex items-center justify-center text-zinc-950 shadow-[0_0_35px_rgba(245,158,11,0.7),_0_0_15px_rgba(251,191,36,0.9)] animate-bounce">
              <Trophy className="w-10 h-10 fill-current drop-shadow-md" />
              <Crown className="w-5 h-5 text-amber-950 fill-amber-950 absolute -top-2 left-1/2 -translate-x-1/2 animate-pulse" />
              <Sparkles className="w-5 h-5 text-white absolute -top-1.5 -right-1.5 animate-spin" style={{ animationDuration: "6s" }} />
            </div>

            {/* Headline */}
            <div className="space-y-1 relative z-10">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/50 text-amber-300 text-[10px] font-black uppercase tracking-widest shadow-sm">
                <Swords className="w-3 h-3 text-amber-400" />
                <span>Rivalry Victorious</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-yellow-100 to-amber-300 tracking-tight">
                Victory Claimed!
              </h2>
            </div>

            {/* Victory Announcement Card */}
            <div className="relative z-10 p-4 rounded-2xl bg-zinc-950/80 border border-amber-500/40 shadow-inner space-y-1">
              <p className="text-sm sm:text-base font-extrabold text-zinc-100 leading-snug">
                <span className="text-amber-400 underline decoration-amber-500/60 decoration-2 font-black">
                  {winEvent.winnerName}
                </span>{" "}
                won the Rivalry against{" "}
                <span className="text-rose-300 font-bold">{winEvent.loserName}</span> 🎉
              </p>
              <div className="flex items-center justify-center gap-1.5 text-[11px] text-amber-300/90 font-semibold pt-1">
                <Flame className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                <span>Extended weekly study lead in Live Study!</span>
              </div>
            </div>

            <p className="relative z-10 text-[11px] text-zinc-400 font-medium">
              This result stays pinned above Studying for 15 minutes.
            </p>
          </div>
        </div>
      )}

      {/* 2. Persistent Compact Banner Hooked Above 'Studying' Section */}
      <div className="relative w-full mb-3 rounded-xl bg-gradient-to-r from-[#221006]/95 via-[#181119]/95 to-[#21090f]/95 border border-amber-500/40 shadow-[0_4px_25px_rgba(245,158,11,0.14),_0_0_12px_rgba(225,29,72,0.10)] backdrop-blur-xl flex items-center justify-between gap-2.5 p-2.5 sm:p-3 overflow-hidden transition-all duration-300 select-none animate-in fade-in slide-in-from-top-2">
        {/* Subtle Ambient Radial Highlight */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_left,_rgba(245,158,11,0.15),_transparent_60%)] pointer-events-none" />

        <div className="relative z-10 flex items-center gap-2.5 min-w-0">
          {/* Glowing Left Indicator Bar */}
          <div className="w-1 self-stretch rounded-full bg-gradient-to-b from-amber-400 via-yellow-300 to-rose-500 shrink-0 shadow-[0_0_8px_rgba(245,158,11,0.8)]" />

          {/* Trophy Icon */}
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-gradient-to-tr from-amber-500 to-yellow-400 flex items-center justify-center text-zinc-950 shadow-[0_0_12px_rgba(245,158,11,0.5)] shrink-0">
            <Trophy className="w-4 h-4 sm:w-4.5 sm:h-4.5 fill-current" />
          </div>

          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-gradient-to-r from-amber-500/20 to-yellow-500/20 text-amber-300 border border-amber-500/35">
                Rivalry Victor
              </span>
              <span className="text-[9px] text-zinc-400 font-mono font-medium">
                • {remainingMinutes}m remaining
              </span>
            </div>
            <p className="text-xs sm:text-sm font-extrabold text-zinc-100 truncate mt-0.5">
              <span className="text-amber-300">{winEvent.winnerName}</span>{" "}
              won the Rivalry against{" "}
              <span className="text-rose-300 font-bold">{winEvent.loserName}</span> 🎉
            </p>
          </div>
        </div>

        {/* Dismiss Button (x) */}
        <button
          onClick={handleDismiss}
          className="relative z-10 p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800/80 border border-transparent hover:border-amber-500/30 transition-all hover:scale-105 active:scale-95 shrink-0"
          title="Dismiss result notice"
          aria-label="Dismiss result notice"
        >
          <X className="w-3.5 h-3.5" />
        </button>

        {/* Dynamic 15-Minute Countdown Bottom Progress Line */}
        <div
          className="absolute bottom-0 left-0 h-[1.5px] bg-gradient-to-r from-amber-400 via-rose-500 to-amber-300 transition-all duration-1000 shadow-[0_0_6px_rgba(245,158,11,0.9)]"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
    </>
  );
});
