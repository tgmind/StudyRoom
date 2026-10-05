"use client";

import React, { memo, useState, useEffect } from "react";
import { WeeklyAchieverSnapshot } from "@/lib/supabase/types";
import { formatMinutesToHours } from "@/lib/time/format";
import { Trophy, Star, Target, Calendar, Clock, Sparkles } from "lucide-react";

interface AchieverCelebrationCardProps {
  achiever: WeeklyAchieverSnapshot | null;
}

export const AchieverCelebrationCard = memo(function AchieverCelebrationCard({
  achiever,
}: AchieverCelebrationCardProps) {
  // Animation stages: "initial" (hidden) -> "entering" (scale/opacity) -> "revealed" (radial glow/crown burst) -> "settled" (static)
  const [animationStage, setAnimationStage] = useState<
    "initial" | "entering" | "revealed" | "settled"
  >("initial");

  useEffect(() => {
    if (!achiever) return;

    // Honor prefers-reduced-motion: jump straight to settled
    if (
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setAnimationStage("settled");
      return;
    }

    // Deliberate 3-stage entrance reveal sequence on mount
    const t1 = setTimeout(() => setAnimationStage("entering"), 40);
    const t2 = setTimeout(() => setAnimationStage("revealed"), 320);
    const t3 = setTimeout(() => setAnimationStage("settled"), 1400);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [achiever]);

  if (!achiever) {
    return (
      <div className="w-full relative overflow-hidden rounded-3xl bg-zinc-900/60 border border-zinc-800/80 p-6 sm:p-8 text-center backdrop-blur-md shadow-2xl">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mb-3 shadow-inner">
          <Trophy className="w-7 h-7" />
        </div>
        <h2 className="text-base sm:text-lg font-black text-zinc-100 tracking-tight">
          Achiever of the Week
        </h2>
        <p className="text-xs text-zinc-400 max-w-sm mx-auto mt-1.5 leading-relaxed">
          No qualifying study activity recorded for the previous weekly period. Complete your sessions to claim next week&apos;s title!
        </p>
      </div>
    );
  }

  const initials = achiever.display_name
    ? achiever.display_name.substring(0, 2).toUpperCase()
    : "??";

  const totalHours = formatMinutesToHours(achiever.total_study_minutes || 0);
  const dailyHours = (
    (achiever.average_study_minutes_per_day || 0) / 60
  ).toFixed(1);

  // Authoritative data contract preservation
  const rawScore = achiever.leaderboard_score ?? achiever.score;
  const hasValidScore = typeof rawScore === "number" && !Number.isNaN(rawScore);
  const canonicalScore = hasValidScore ? rawScore : 0;

  const isEntering = animationStage === "entering";
  const isRevealed = animationStage === "revealed";
  const isSettled = animationStage === "settled";

  return (
    <section
      aria-label="Weekly Achiever Celebration"
      className={`relative w-full rounded-3xl bg-gradient-to-b from-[#1c1308]/95 via-[#130d05]/95 to-[#0b0804] border border-amber-500/35 p-4 sm:p-6 md:p-8 shadow-[0_12px_40px_rgba(245,158,11,0.09),0_4px_20px_rgba(0,0,0,0.8)] overflow-hidden backdrop-blur-xl group ${
        isSettled
          ? "opacity-100 scale-100 translate-y-0"
          : isRevealed || isEntering
          ? "opacity-100 scale-100 translate-y-0 transition-all duration-700 ease-out"
          : "opacity-0 scale-[0.97] translate-y-1.5"
      }`}
    >
      {/* 1. Ambient Radial Glow & Background Accents */}
      <div
        className={`pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-96 h-96 bg-gradient-to-b from-amber-500/20 via-yellow-500/10 to-transparent rounded-full blur-3xl transition-opacity duration-1000 ${
          isRevealed ? "opacity-100 scale-110" : "opacity-80"
        }`}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute top-0 right-0 w-48 h-48 bg-amber-400/5 rounded-full blur-2xl"
        aria-hidden="true"
      />

      {/* 2. One-time Subtle Light Sweep Shimmer on Page Entry */}
      {isRevealed && (
        <div
          className="pointer-events-none absolute inset-0 -translate-x-full animate-[pulse_1s_ease-out_1] bg-gradient-to-r from-transparent via-amber-400/10 to-transparent motion-reduce:hidden"
          aria-hidden="true"
        />
      )}

      {/* 3. Controlled Sparkle Nodes during Reveal Stage */}
      {isRevealed && (
        <div
          className="pointer-events-none absolute inset-0 overflow-hidden motion-reduce:hidden"
          aria-hidden="true"
        >
          <div className="absolute top-6 left-8 w-1.5 h-1.5 rounded-full bg-amber-300 shadow-[0_0_8px_rgba(251,191,36,0.9)] animate-ping" />
          <div className="absolute top-10 right-12 w-1.5 h-1.5 rounded-full bg-yellow-200 shadow-[0_0_8px_rgba(254,240,138,0.9)] animate-pulse" />
          <div className="absolute bottom-8 left-16 w-1 h-1 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(245,158,11,0.8)]" />
          <div className="absolute bottom-10 right-20 w-1 h-1 rounded-full bg-amber-300 shadow-[0_0_6px_rgba(251,191,36,0.8)]" />
        </div>
      )}

      <div className="relative z-10 flex flex-col items-center text-center space-y-4 sm:space-y-5">
        {/* Top Celebration Distinction Banner */}
        <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-gradient-to-r from-amber-500/20 via-yellow-500/15 to-amber-500/20 border border-amber-400/40 text-amber-300 text-[10px] sm:text-xs font-black tracking-wider uppercase shadow-[0_0_15px_rgba(245,158,11,0.25)] select-none">
          <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400 motion-safe:animate-spin-slow motion-reduce:animate-none" />
          <span>Achiever of the Week</span>
          <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400 motion-safe:animate-spin-slow motion-reduce:animate-none" />
        </div>

        {/* Crowned Profile Photo Avatar with Reveal Aura */}
        <div className="relative mt-2">
          {/* Master Achievement Crown SVG */}
          <div
            className={`absolute -top-6 sm:-top-7 left-1/2 -translate-x-1/2 z-20 pointer-events-none transition-transform duration-500 ${
              isRevealed
                ? "drop-shadow-[0_4px_16px_rgba(245,158,11,0.85)] scale-105"
                : "drop-shadow-[0_4px_12px_rgba(245,158,11,0.6)] scale-100"
            }`}
            aria-hidden="true"
          >
            <svg
              className="w-9 h-9 sm:w-11 sm:h-11 text-amber-300 transform -rotate-2"
              viewBox="0 0 24 24"
              fill="currentColor"
              stroke="#78350f"
              strokeWidth="0.8"
            >
              <path d="M2.5 19h19a1 1 0 0 0 1-1V9a1 1 0 0 0-1.6-.8l-4.4 3.3-3.4-6.8a1 1 0 0 0-1.8 0L7.9 11.5 3.5 8.2A1 1 0 0 0 2 9.1v8.9a1 1 0 0 0 .5 1z" />
              <circle cx="2.5" cy="8.5" r="1.5" fill="#fef08a" />
              <circle cx="12" cy="3.5" r="1.5" fill="#fef08a" />
              <circle cx="21.5" cy="8.5" r="1.5" fill="#fef08a" />
            </svg>
          </div>

          {/* Profile Picture Frame with Multi-layered Amber Rings */}
          <div
            className={`relative w-20 h-20 sm:w-24 sm:h-24 rounded-full p-[2.5px] bg-gradient-to-b from-amber-300 via-amber-500 to-yellow-600 ring-4 ring-amber-500/20 transition-all duration-700 ${
              isRevealed
                ? "shadow-[0_0_36px_rgba(245,158,11,0.65)]"
                : "shadow-[0_0_24px_rgba(245,158,11,0.45)]"
            }`}
          >
            <div className="w-full h-full rounded-full overflow-hidden bg-zinc-900 flex items-center justify-center border-2 border-zinc-950">
              {achiever.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={achiever.avatar_url}
                  alt={achiever.display_name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-xl sm:text-2xl font-black text-amber-300 tracking-wider">
                  {initials}
                </span>
              )}
            </div>

            {/* Rank #1 Mini Badge */}
            <div className="absolute -bottom-1 -right-1 px-1.5 py-0.5 rounded-full bg-amber-400 text-zinc-950 text-[10px] sm:text-xs font-black shadow-md border border-amber-200">
              #1
            </div>
          </div>
        </div>

        {/* Display Name and Recognition Subtitle */}
        <div className="space-y-1">
          <h1 className="text-lg sm:text-2xl font-black text-white tracking-tight leading-snug">
            {achiever.display_name}
          </h1>
          <p className="text-[11px] sm:text-xs text-amber-200/80 font-medium max-w-sm mx-auto flex items-center justify-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>Highest consolidated performance in the StudyRoom community</span>
          </p>
        </div>

        {/* Consolidated Previous-Week Authoritative Metrics Grid */}
        <div className="w-full grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 pt-2 text-left">
          {/* Total Study Duration */}
          <div className="p-3 rounded-2xl bg-[#221606]/80 border border-amber-500/20 shadow-sm flex flex-col justify-between">
            <div className="flex items-center space-x-1.5 text-zinc-400 text-[10px] sm:text-xs mb-1">
              <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="font-semibold text-zinc-300">Total Study</span>
            </div>
            <div className="text-base sm:text-lg font-black text-zinc-100 tracking-tight font-mono">
              {totalHours}
            </div>
            <span className="text-[9.5px] text-zinc-400 font-medium">
              Finalized weekly hours
            </span>
          </div>

          {/* Daily Average (Strict 7-day average) */}
          <div className="p-3 rounded-2xl bg-[#221606]/80 border border-amber-500/20 shadow-sm flex flex-col justify-between">
            <div className="flex items-center space-x-1.5 text-zinc-400 text-[10px] sm:text-xs mb-1">
              <Calendar className="w-3.5 h-3.5 text-violet-400 shrink-0" />
              <span className="font-semibold text-zinc-300">7-Day Avg</span>
            </div>
            <div className="text-base sm:text-lg font-black text-zinc-100 tracking-tight font-mono">
              {dailyHours}
              <span className="text-xs text-zinc-400 font-normal"> /day</span>
            </div>
            <span className="text-[9.5px] text-zinc-400 font-medium">
              Across all 7 days
            </span>
          </div>

          {/* Goal Discipline Rate */}
          <div className="p-3 rounded-2xl bg-[#221606]/80 border border-amber-500/20 shadow-sm flex flex-col justify-between">
            <div className="flex items-center space-x-1.5 text-zinc-400 text-[10px] sm:text-xs mb-1">
              <Target className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="font-semibold text-zinc-300">Goal Follow-Through</span>
            </div>
            <div className="text-base sm:text-lg font-black text-zinc-100 tracking-tight font-mono">
              {achiever.goal_completion_pct}%
            </div>
            <span className="text-[9.5px] text-zinc-400 font-medium">
              {achiever.completed_goals_count}/{achiever.total_goals_count} tasks completed
            </span>
          </div>

          {/* Dual-Pillar Score */}
          <div className="p-3 rounded-2xl bg-[#221606]/80 border border-amber-500/20 shadow-sm flex flex-col justify-between">
            <div className="flex items-center space-x-1.5 text-zinc-400 text-[10px] sm:text-xs mb-1">
              <Trophy className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
              <span className="font-semibold text-zinc-300">Score Index</span>
            </div>
            {hasValidScore ? (
              <div className="text-base sm:text-lg font-black text-amber-300 tracking-tight font-mono">
                {canonicalScore.toFixed(1)}
                <span className="text-xs text-zinc-400 font-normal"> / 100</span>
              </div>
            ) : (
              <div className="text-xs sm:text-sm font-semibold text-zinc-400 tracking-tight font-mono py-1">
                Score unavailable
              </div>
            )}
            <span className="text-[9.5px] text-zinc-400 font-medium">
              {achiever.active_study_days} active study days
            </span>
          </div>
        </div>
      </div>
    </section>
  );
});
