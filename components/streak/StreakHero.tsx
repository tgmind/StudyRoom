"use client";

import React, { memo } from "react";
import Link from "next/link";
import { ConsistencyStats } from "@/lib/scoring/streak";
import { Flame, Clock, Sparkles, Trophy, ArrowRight, ShieldCheck, Zap } from "lucide-react";
import { triggerHapticFeedback } from "@/lib/utils/haptics";

interface StreakHeroProps {
  stats: ConsistencyStats;
}

export const StreakHero = memo(function StreakHero({ stats }: StreakHeroProps) {
  const {
    currentStreak,
    bestStreak,
    todayMinutes,
    todayQualified,
    todayMinutesRemaining,
    timeUntilMidnight,
  } = stats;

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-b from-zinc-900/90 via-zinc-900/50 to-zinc-950/80 border border-amber-500/20 shadow-[0_8px_32px_rgba(0,0,0,0.6)] backdrop-blur-xl p-4 sm:p-6 transition-all">
      {/* Background ambient radial glow */}
      <div className="absolute -top-16 -right-16 w-56 h-56 bg-amber-500/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-16 -left-16 w-48 h-48 bg-orange-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 flex flex-col space-y-4">
        {/* Top Header Row: Streak Badge & Best Record */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-black tracking-wide shadow-sm">
            <Flame className="w-3.5 h-3.5 text-amber-400 fill-amber-400 animate-pulse" />
            <span>CURRENT STREAK</span>
          </div>

          <div className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-zinc-800/80 border border-zinc-700/60 text-zinc-300 text-xs font-semibold">
            <Trophy className="w-3.5 h-3.5 text-amber-400" />
            <span>
              Best: <strong className="text-zinc-100 font-black">{bestStreak} {bestStreak === 1 ? "Day" : "Days"}</strong>
            </span>
          </div>
        </div>

        {/* Hero Display: Streak Number & Fire Aura */}
        <div className="flex items-center justify-between gap-4 py-1">
          <div className="space-y-1 min-w-0">
            <div className="flex items-baseline space-x-2.5 flex-wrap">
              <span className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight text-white drop-shadow-md">
                {currentStreak}
              </span>
              <span className="text-lg sm:text-2xl font-black bg-gradient-to-r from-amber-400 via-orange-400 to-rose-400 bg-clip-text text-transparent">
                {currentStreak === 1 ? "Day Streak" : "Days Streak"}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-zinc-400 font-medium">
              {currentStreak > 0
                ? `${currentStreak} consecutive qualifying ${currentStreak === 1 ? "day" : "days"} (≥30m)`
                : "No active streak yet (≥30m daily study required)"}
            </p>
          </div>

          {/* Glowing Animated Flame Ring */}
          <div className="relative shrink-0">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br from-amber-500/20 via-orange-500/25 to-rose-500/10 border border-amber-500/40 flex items-center justify-center shadow-[0_0_25px_rgba(245,158,11,0.3)]">
              <Flame className="w-9 h-9 sm:w-11 sm:h-11 text-amber-400 fill-amber-400/90 drop-shadow-[0_0_12px_rgba(245,158,11,0.8)] animate-pulse" />
            </div>
            {todayQualified && (
              <div className="absolute -top-1.5 -right-1.5 p-1 bg-emerald-500 rounded-full text-zinc-950 border-2 border-zinc-900 shadow-md">
                <ShieldCheck className="w-3.5 h-3.5 stroke-[3]" />
              </div>
            )}
          </div>
        </div>

        {/* Status Callout Banner */}
        <div
          className={`rounded-xl p-3 sm:p-3.5 border transition-all ${
            todayQualified
              ? "bg-emerald-950/40 border-emerald-500/30 text-emerald-200 shadow-[0_0_15px_rgba(16,185,129,0.1)]"
              : "bg-amber-950/40 border-amber-500/30 text-amber-200 shadow-[0_0_15px_rgba(245,158,11,0.1)]"
          }`}
        >
          <div className="flex items-center justify-between gap-3 flex-wrap sm:flex-nowrap">
            <div className="flex items-center space-x-2.5 min-w-0 flex-1">
              {todayQualified ? (
                <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <Zap className="w-4 h-4 text-amber-400 shrink-0" />
              )}
              <div className="text-xs sm:text-sm font-bold break-words leading-snug">
                {todayQualified ? (
                  <span>
                    Streak Secured Today! <strong className="text-emerald-300 font-extrabold">({todayMinutes}m logged)</strong>
                  </span>
                ) : (
                  <span>
                    Study <strong className="text-amber-300 font-black">{todayMinutesRemaining}m more</strong> today to secure streak!
                  </span>
                )}
              </div>
            </div>

            {!todayQualified && (
              <Link
                href="/room"
                onClick={() => triggerHapticFeedback(10)}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-zinc-950 font-black text-xs shrink-0 shadow-md active:scale-95 transition-all touch-manipulation"
              >
                <span>Study Now</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            )}
          </div>
        </div>

        {/* Midnight Countdown Footer */}
        <div className="flex items-center justify-between pt-1 border-t border-zinc-800/80 text-[11px] sm:text-xs text-zinc-400 flex-wrap gap-2">
          <div className="flex items-center space-x-1.5">
            <Clock className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
            <span>
              Daily midnight lock in <strong className="text-zinc-200 font-semibold tabular-nums">{timeUntilMidnight}</strong>
            </span>
          </div>
          <span className="text-[10px] sm:text-[11px] text-zinc-500 font-medium">
            30m daily goal threshold
          </span>
        </div>
      </div>
    </div>
  );
});
