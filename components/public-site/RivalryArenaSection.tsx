"use client";

import React, { useState, useEffect } from "react";
import {
  Swords,
  Flame,
  Zap,
  Clock,
  BookOpen,
  Trophy,
  ShieldCheck,
  CheckCircle2,
  Target,
  Sparkles,
  EyeOff,
  Users2,
  Timer,
  Award,
} from "lucide-react";

export function RivalryArenaSection() {
  const [gapSeconds, setGapSeconds] = useState(492); // 8m 12s
  const [ticker, setTicker] = useState(0);
  const [clashMode, setClashMode] = useState<"duel" | "triclash">("duel");

  useEffect(() => {
    const timer = setInterval(() => {
      setGapSeconds((prev) => (prev > 0 ? prev - 1 : 600));
      setTicker((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatGap = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(mins).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
  };

  const formatTimer = (totalSec: number) => {
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  // 5 Compact Steps from text
  const HOW_IT_WORKS = [
    {
      step: "01",
      title: "Get Active",
      desc: "After the weekly warm-up, students with sufficient genuine study activity become eligible.",
      icon: Flame,
      color: "text-rose-600",
      border: "border-rose-300",
      bg: "bg-rose-50",
    },
    {
      step: "02",
      title: "Find Your Rival",
      desc: "StudyRoom looks for students with meaningful competitive proximity (study time, rank, score, recent progress).",
      icon: Target,
      color: "text-amber-600",
      border: "border-amber-300",
      bg: "bg-amber-50",
    },
    {
      step: "03",
      title: "Rivalry Goes Live",
      desc: "When two (or three) eligible students match, a live rivalry card appears with countdown, score bar, & gap.",
      icon: Swords,
      color: "text-purple-600",
      border: "border-purple-300",
      bg: "bg-purple-50",
    },
    {
      step: "04",
      title: "Keep Studying to Win",
      desc: "Every minute of real study updates your rivalry score. The gap shifts live as you study.",
      icon: Timer,
      color: "text-blue-600",
      border: "border-blue-300",
      bg: "bg-blue-50",
    },
    {
      step: "05",
      title: "Genuine Victory",
      desc: "Win by holding the lead when time expires or by being the first to reach the target study duration.",
      icon: Award,
      color: "text-emerald-600",
      border: "border-emerald-300",
      bg: "bg-emerald-50",
    },
  ];

  return (
    <section
      id="rivalry"
      className="py-12 sm:py-20 lg:py-24 bg-gradient-to-b from-[#fff1f2] via-[#ffe4e6] to-[#fecdd3]/40 text-[#4c0519] border-b border-rose-200 relative overflow-hidden scroll-mt-20"
    >
      {/* Subtle warm arena ambient pattern */}
      <div
        className="absolute inset-0 pointer-events-none opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(circle at 50% 0%, rgba(225, 29, 72, 0.15), transparent 70%)",
        }}
      />

      <div className="relative w-full max-w-7xl mx-auto px-3.5 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-rose-100 border border-rose-300 px-3.5 py-1 text-xs font-black uppercase tracking-wider text-rose-800 shadow-xs">
            <Swords className="h-3.5 w-3.5 text-rose-600" />
            <span>09 — LIVE RIVALRY ARENA</span>
          </div>
          <h2 className="mt-3.5 text-2xl xs:text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-[#881337] leading-tight">
            Study Together.{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-rose-600 via-red-600 to-amber-600">
              Compete Naturally.
            </span>
          </h2>
          <p className="mt-3.5 sm:mt-4 text-xs sm:text-base lg:text-lg font-medium leading-relaxed text-slate-700">
            Rivalry Arena turns genuine study progress into live, friendly competition. StudyRoom intelligently
            identifies students who are performing close to each other and creates a live{" "}
            <strong className="text-rose-700 font-extrabold">Duel</strong> or{" "}
            <strong className="text-amber-700 font-extrabold">Tri-Clash</strong>. Your real study activity
            drives the rivalry — there are no artificial points or rewards.
          </p>

          {/* Privacy Note */}
          <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-white border border-rose-200 px-3 py-1 text-[11px] font-bold text-rose-800 shadow-xs">
            <EyeOff className="w-3.5 h-3.5 text-rose-600 shrink-0" />
            <span>Contender names are privacy-masked in public displays (Student A., Student R., etc.)</span>
          </div>
        </div>

        {/* Live Rivalry Arena Battle Card Reproduction (Light Arena Theme) */}
        <div className="mt-8 sm:mt-12 max-w-4xl mx-auto">
          <div className="relative w-full rounded-2xl sm:rounded-3xl p-4 sm:p-6 bg-white border-2 border-rose-200/90 ring-4 ring-rose-500/10 shadow-2xl overflow-hidden">
            {/* Battle Header with Mode Toggle */}
            <div className="relative z-10 flex flex-wrap items-center justify-between gap-2 mb-4 pb-3 border-b border-rose-100">
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-rose-100 text-rose-600 shrink-0">
                  <Swords className="w-4 h-4" />
                </div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xs sm:text-sm font-black tracking-wider text-[#881337] uppercase">
                    Rivalry Arena
                  </h3>
                  <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 border border-rose-200">
                    ≤10m Clash
                  </span>
                </div>
              </div>

              {/* Interactive Match Format Switcher: Duel vs Tri-Clash */}
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-[11px] font-black">
                <button
                  type="button"
                  onClick={() => setClashMode("duel")}
                  className={`px-3 py-1 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                    clashMode === "duel"
                      ? "bg-rose-600 text-white shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <Swords className="w-3 h-3" />
                  <span>2-Way Duel</span>
                </button>
                <button
                  type="button"
                  onClick={() => setClashMode("triclash")}
                  className={`px-3 py-1 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                    clashMode === "triclash"
                      ? "bg-amber-600 text-white shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <Users2 className="w-3 h-3" />
                  <span>Tri-Clash</span>
                </button>
              </div>
            </div>

            {/* Duel Grid (2 or 3 contenders based on mode) */}
            <div
              className={`relative z-10 grid gap-3 sm:gap-5 items-stretch ${
                clashMode === "duel" ? "grid-cols-2" : "grid-cols-3"
              }`}
            >
              {/* Contender 1: Student A. (Leader) */}
              <div className="flex flex-col min-w-0">
                <div className="flex items-center justify-between px-2.5 py-1 mb-1.5 rounded-lg border text-[9px] sm:text-[10px] font-black uppercase tracking-tight shadow-xs border-rose-300 bg-rose-50 text-rose-800">
                  <span className="whitespace-nowrap shrink-0">LEADER</span>
                  <span className="font-mono text-rose-900 font-black ml-1 tabular-nums whitespace-nowrap">
                    21h 14m
                  </span>
                </div>

                <div className="relative flex flex-col items-center justify-between p-3 sm:p-4 rounded-xl sm:rounded-2xl border-2 border-rose-200 bg-gradient-to-b from-rose-50/50 to-white shadow-sm flex-1">
                  <span className="absolute top-2 left-2 text-[8px] sm:text-[9px] px-2 py-0.5 rounded-full bg-rose-100 border border-rose-300 text-rose-800 font-black uppercase tracking-wider">
                    ● Studying
                  </span>

                  <div className="relative mt-2">
                    <div className="w-11 h-11 sm:w-14 sm:h-14 rounded-full bg-zinc-900 border-2 border-rose-500 ring-2 ring-rose-500/20 flex items-center justify-center font-black text-xs sm:text-sm text-white shadow-md">
                      SA
                    </div>
                    <span className="absolute bottom-0 right-0 w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full border-2 border-white bg-rose-500" />
                  </div>

                  <div className="mt-2 text-center truncate w-full px-1">
                    <h4 className="text-xs sm:text-sm font-black text-[#071a3a] truncate">Student A.</h4>
                  </div>

                  {/* Weekly Stats Row */}
                  <div className="w-full flex items-center justify-center gap-1 sm:gap-1.5 mt-2 py-1.5 border-t border-slate-100 text-slate-600 text-[8.5px] xs:text-[10px] sm:text-[11px] font-bold">
                    <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
                      <Clock className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-rose-600 shrink-0" />
                      <span className="font-black text-slate-800 tabular-nums">21h 14m</span>
                      <span className="text-[8px] sm:text-[9px] text-slate-400">/wk</span>
                    </div>
                    <span className="text-slate-300">•</span>
                    <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
                      <BookOpen className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-purple-600 shrink-0" />
                      <span className="font-black text-slate-800 tabular-nums">16</span>
                      <span className="text-[8px] sm:text-[9px] text-slate-400">sess</span>
                    </div>
                  </div>

                  {/* Timer */}
                  <div className="w-full mt-2 pt-1.5 border-t border-slate-100 flex justify-center">
                    <div className="font-mono text-[9px] xs:text-[10px] sm:text-xs px-2 sm:px-2.5 py-0.5 font-black tracking-tight rounded-full border bg-rose-50 text-rose-700 border-rose-200 tabular-nums">
                      ● {formatTimer(7845 + ticker)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Centered Overlapping VS Emblem (Displayed in 2-Way Duel Mode) */}
              {clashMode === "duel" && (
                <div className="absolute left-1/2 top-[38%] -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none flex flex-col items-center justify-center select-none">
                  {/* Diamond Battle Crest Emblem */}
                  <div className="relative group flex items-center justify-center">
                    <div className="relative flex items-center justify-center w-7 h-7 xs:w-8 xs:h-8 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl rotate-45 border-2 border-amber-400 bg-white shadow-xl ring-2 ring-rose-500/20">
                      <span className="-rotate-45 text-[10px] sm:text-sm font-black italic tracking-tighter text-rose-600">
                        VS
                      </span>
                    </div>
                  </div>

                  {/* Gap Pill */}
                  <div className="mt-1.5 sm:mt-2 flex items-center gap-0.5 sm:gap-1 px-2 sm:px-2.5 py-0.5 rounded-full bg-white/95 border border-amber-300 sm:border-2 shadow-md backdrop-blur-xs">
                    <Zap className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-amber-500 shrink-0 fill-amber-500" />
                    <span className="text-[7.5px] xs:text-[8.5px] sm:text-[11px] font-black text-amber-800 tracking-tight font-mono whitespace-nowrap">
                      {formatGap(gapSeconds)} diff
                    </span>
                  </div>
                </div>
              )}


              {/* Contender 2: Student R. (Challenger) */}
              <div className="flex flex-col min-w-0">
                <div className="flex items-center justify-between px-2.5 py-1 mb-1.5 rounded-lg border text-[9px] sm:text-[10px] font-black uppercase tracking-tight shadow-xs border-amber-300 bg-amber-50 text-amber-800">
                  <span className="whitespace-nowrap shrink-0">CHALLENGER</span>
                  <span className="font-mono text-amber-900 font-black ml-1 tabular-nums whitespace-nowrap">
                    21h 06m
                  </span>
                </div>

                <div className="relative flex flex-col items-center justify-between p-3 sm:p-4 rounded-xl sm:rounded-2xl border-2 border-slate-200 bg-gradient-to-b from-slate-50/50 to-white shadow-sm flex-1">
                  <span className="absolute top-2 left-2 text-[8px] sm:text-[9px] px-2 py-0.5 rounded-full bg-amber-100 border border-amber-300 text-amber-800 font-black uppercase tracking-wider">
                    ● Studying
                  </span>

                  <div className="relative mt-2">
                    <div className="w-11 h-11 sm:w-14 sm:h-14 rounded-full bg-zinc-800 border-2 border-amber-500 ring-2 ring-amber-500/20 flex items-center justify-center font-black text-xs sm:text-sm text-white shadow-md">
                      SR
                    </div>
                    <span className="absolute bottom-0 right-0 w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full border-2 border-white bg-amber-500" />
                  </div>

                  <div className="mt-2 text-center truncate w-full px-1">
                    <h4 className="text-xs sm:text-sm font-black text-[#071a3a] truncate">Student R.</h4>
                  </div>

                  {/* Weekly Stats Row */}
                  <div className="w-full flex items-center justify-center gap-1 sm:gap-1.5 mt-2 py-1.5 border-t border-slate-100 text-slate-600 text-[8.5px] xs:text-[10px] sm:text-[11px] font-bold">
                    <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
                      <Clock className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-amber-600 shrink-0" />
                      <span className="font-black text-slate-800 tabular-nums">21h 06m</span>
                      <span className="text-[8px] sm:text-[9px] text-slate-400">/wk</span>
                    </div>
                    <span className="text-slate-300">•</span>
                    <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
                      <BookOpen className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-purple-600 shrink-0" />
                      <span className="font-black text-slate-800 tabular-nums">14</span>
                      <span className="text-[8px] sm:text-[9px] text-slate-400">sess</span>
                    </div>
                  </div>

                  {/* Timer */}
                  <div className="w-full mt-2 pt-1.5 border-t border-slate-100 flex justify-center">
                    <div className="font-mono text-[9px] xs:text-[10px] sm:text-xs px-2 sm:px-2.5 py-0.5 font-black tracking-tight rounded-full border bg-amber-50 text-amber-700 border-amber-200 tabular-nums">
                      ● {formatTimer(7353 + ticker)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Contender 3 (Only in Tri-Clash Mode) */}
              {clashMode === "triclash" && (
                <div className="flex flex-col min-w-0 animate-in fade-in zoom-in-95 duration-200">
                  <div className="flex items-center justify-between px-2.5 py-1 mb-1.5 rounded-lg border text-[9px] sm:text-[10px] font-black uppercase tracking-tight shadow-xs border-blue-300 bg-blue-50 text-blue-800">
                    <span className="whitespace-nowrap shrink-0">3RD SEED</span>
                    <span className="font-mono text-blue-900 font-black ml-1 tabular-nums whitespace-nowrap">
                      20h 58m
                    </span>
                  </div>

                  <div className="relative flex flex-col items-center justify-between p-3 sm:p-4 rounded-xl sm:rounded-2xl border-2 border-slate-200 bg-gradient-to-b from-blue-50/30 to-white shadow-sm flex-1">
                    <span className="absolute top-2 left-2 text-[8px] sm:text-[9px] px-2 py-0.5 rounded-full bg-blue-100 border border-blue-300 text-blue-800 font-black uppercase tracking-wider">
                      ● Break
                    </span>

                    <div className="relative mt-2">
                      <div className="w-10 h-10 xs:w-11 xs:h-11 sm:w-14 sm:h-14 rounded-full bg-zinc-800 border-2 border-blue-500 ring-2 ring-blue-500/20 flex items-center justify-center font-black text-xs sm:text-sm text-white shadow-md">
                        SM
                      </div>
                      <span className="absolute bottom-0 right-0 w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 rounded-full border-2 border-white bg-blue-500" />
                    </div>

                    <div className="mt-2 text-center truncate w-full px-1">
                      <h4 className="text-xs sm:text-sm font-black text-[#071a3a] truncate">Student M.</h4>
                    </div>

                    {/* Weekly Stats Row */}
                    <div className="w-full flex items-center justify-center gap-1 sm:gap-1.5 mt-2 py-1.5 border-t border-slate-100 text-slate-600 text-[8.5px] xs:text-[10px] sm:text-[11px] font-bold">
                      <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
                        <Clock className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-blue-600 shrink-0" />
                        <span className="font-black text-slate-800 tabular-nums">20h 58m</span>
                        <span className="text-[8px] sm:text-[9px] text-slate-400">/wk</span>
                      </div>
                      <span className="text-slate-300">•</span>
                      <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
                        <BookOpen className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-purple-600 shrink-0" />
                        <span className="font-black text-slate-800 tabular-nums">15</span>
                        <span className="text-[8px] sm:text-[9px] text-slate-400">sess</span>
                      </div>
                    </div>

                    {/* Timer */}
                    <div className="w-full mt-2 pt-1.5 border-t border-slate-100 flex justify-center">
                      <div className="font-mono text-[9px] xs:text-[10px] sm:text-xs px-2 sm:px-2.5 py-0.5 font-black tracking-tight rounded-full border bg-blue-50 text-blue-700 border-blue-200 tabular-nums">
                        ☕ Break 04:12
                      </div>
                    </div>
                  </div>
                </div>
              )}

            </div>

            {/* Live Study Score Progress Bar */}
            <div className="relative z-10 mt-5 pt-4 border-t border-rose-100">
              <div className="flex items-center justify-between text-xs font-black text-slate-700 mb-2">
                <span className="flex items-center gap-1.5 text-rose-700">
                  <span className="w-2 h-2 rounded-full bg-rose-600 animate-pulse" />
                  <span>Student A. (51%)</span>
                </span>
                <span className="text-xs font-black text-slate-500">Live Weekly Study Volume Gap</span>
                <span className="flex items-center gap-1.5 text-amber-700">
                  <span>Student R. (49%)</span>
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                </span>
              </div>
              <div className="h-3 w-full rounded-full bg-slate-100 border border-slate-200 overflow-hidden flex shadow-inner">
                <div className="h-full bg-gradient-to-r from-rose-500 to-rose-600 w-[51%] transition-all" />
                <div className="h-full bg-gradient-to-r from-amber-400 to-amber-500 w-[49%] transition-all" />
              </div>
            </div>
          </div>
        </div>

        {/* 5 Compact Steps from text */}
        <div className="mt-12 sm:mt-16">
          <div className="text-center mb-6">
            <h3 className="text-lg sm:text-xl font-black text-[#881337] uppercase tracking-wider">
              How It Works
            </h3>
            <p className="text-xs sm:text-sm font-semibold text-slate-600">
              Five straightforward steps driving natural, distraction-free accountability
            </p>
          </div>

          <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {HOW_IT_WORKS.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.step}
                  className="rounded-2xl p-4 bg-white border border-rose-200 shadow-sm flex flex-col justify-between transition-all hover:-translate-y-1 hover:border-rose-400 hover:shadow-md"
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-mono font-black text-rose-700 px-2 py-0.5 rounded-full bg-rose-50 border border-rose-200">
                        {item.step}
                      </span>
                      <div className={`p-2 rounded-xl ${item.bg} ${item.color}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                    </div>
                    <h4 className="text-sm font-black text-[#071a3a] mb-1">{item.title}</h4>
                    <p className="text-xs text-slate-600 leading-relaxed font-medium">{item.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 3 Strategy & Criteria Cards */}
        <div className="mt-8 sm:mt-10 grid gap-4 sm:gap-5 md:grid-cols-3">
          {/* Card 1: Eligibility & Matching Criteria */}
          <div className="rounded-2xl sm:rounded-3xl p-5 bg-white border border-rose-200 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 text-rose-700 mb-3">
                <Target className="w-5 h-5 text-rose-600" />
                <h4 className="text-sm sm:text-base font-black text-[#071a3a] uppercase tracking-wider">
                  Proximity Match Engine
                </h4>
              </div>
              <ul className="space-y-2.5 text-xs text-slate-600 font-semibold">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                  <span><strong>Warm-up Gate:</strong> Requires genuine active study before entering eligibility pool.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                  <span><strong>Study-Time Match:</strong> Contenders are within close weekly study hours.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                  <span><strong>Rank Clash:</strong> Contenders hold adjacent or close positions on leaderboard.</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Card 2: Two Ways to Clash */}
          <div className="rounded-2xl sm:rounded-3xl p-5 bg-white border border-rose-200 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 text-amber-700 mb-3">
                <Swords className="w-5 h-5 text-amber-600" />
                <h4 className="text-sm sm:text-base font-black text-[#071a3a] uppercase tracking-wider">
                  Two Ways to Clash
                </h4>
              </div>
              <div className="space-y-2.5">
                <div className="p-3 rounded-xl bg-rose-50/70 border border-rose-200">
                  <div className="flex items-center gap-1.5 text-xs font-black text-rose-800">
                    <Clock className="w-3.5 h-3.5 text-rose-600" />
                    <span>⏱ Study-Time Rivalry</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600 leading-relaxed font-medium">
                    Face off against someone with similar total study hours this week. Every minute counts.
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200">
                  <div className="flex items-center gap-1.5 text-xs font-black text-amber-800">
                    <Trophy className="w-3.5 h-3.5 text-amber-600" />
                    <span>🏆 Rank Clash</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600 leading-relaxed font-medium">
                    Battle a student right above or below you on the leaderboard. Overtake them before time runs out.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Card 3: Fair by Design & Built for Focus */}
          <div className="rounded-2xl sm:rounded-3xl p-5 bg-white border border-rose-200 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 text-purple-700 mb-3">
                <Sparkles className="w-5 h-5 text-purple-600" />
                <h4 className="text-sm sm:text-base font-black text-[#071a3a] uppercase tracking-wider">
                  Fair &amp; Built for Focus
                </h4>
              </div>
              <ul className="space-y-1.5 text-xs text-slate-600 font-medium">
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                  <span>No pay-to-win, no booster items, no artificial streaks</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                  <span>Rivalry only activates between genuinely comparable peers</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                  <span>Inactive members are automatically excluded</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                  <span>All competition based on verified timer duration</span>
                </li>
              </ul>
              <div className="mt-3.5 p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-center">
                <p className="text-xs font-black italic text-amber-800">
                  &ldquo;Rivalry doesn&apos;t create progress. It makes your real progress visible.&rdquo;
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
