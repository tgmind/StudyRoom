"use client";

import React, { useState } from "react";
import { Target, Flame, Clock, Award } from "lucide-react";

export function GoalsTrackingSection() {
  const [selectedGoalHours, setSelectedGoalHours] = useState<number>(6);

  // Simulated completed minutes for interactive demo
  const completedMinutes = 285; // 4h 45m
  const targetMinutes = selectedGoalHours * 60;
  const percentage = Math.min(100, Math.round((completedMinutes / targetMinutes) * 100));

  const formatHours = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h ${m > 0 ? `${m}m` : ""}`;
  };

  return (
    <section id="goals-tracking" className="py-14 sm:py-20 lg:py-24 bg-gradient-to-b from-[#fff7ed] via-[#fffaf5] to-[#ffedd5]/50 border-b border-orange-200/60 scroll-mt-20">
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-[#eaf5ff] px-3.5 py-1 text-xs font-black uppercase tracking-wider text-[#07458f]">
            <Target className="w-3.5 h-3.5" />
            <span>07 — 20-HOUR GOALS &amp; PROGRESS</span>
          </div>
          <h2 className="mt-3.5 text-2xl xs:text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-[#071a3a]">
            Rolling 20-Hour <span className="text-[#0b73e6]">Goal Tracking</span>
          </h2>
          <p className="mt-3.5 sm:mt-4 text-sm sm:text-base lg:text-lg font-medium leading-relaxed text-slate-600">
            Study schedules are not one-size-fits-all. Study Room replaces rigid calendar midnight resets
            with a continuous rolling 20-hour accountability window designed for realistic student routines.
          </p>
        </div>

        {/* 2-Column Responsive Layout */}
        <div className="mt-10 sm:mt-14 grid gap-8 lg:gap-12 lg:grid-cols-2 items-center">
          {/* Left Column: Core Value Propositions */}
          <div className="space-y-4 sm:space-y-5">
            {/* Card 1: Midnight Reset Solution */}
            <div className="rounded-3xl border border-blue-100 bg-[#f8fcff] p-5 sm:p-6 shadow-sm">
              <div className="flex items-start gap-3.5">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-100 text-[#0b73e6] shadow-sm">
                  <Clock className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-[#071a3a]">
                    No Midnight Wipeouts
                  </h3>
                  <p className="mt-1 text-xs sm:text-sm font-medium leading-relaxed text-slate-600">
                    If you study from 10:30 PM to 2:30 AM, standard apps reset your counter to 0 midway through.
                    In Study Room, your rolling 20-hour window accurately credits your unbroken night session.
                  </p>
                </div>
              </div>
            </div>

            {/* Card 2: Streak Protection */}
            <div className="rounded-3xl border border-blue-100 bg-[#f8fcff] p-5 sm:p-6 shadow-sm">
              <div className="flex items-start gap-3.5">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-600 shadow-sm">
                  <Flame className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-[#071a3a]">
                    Adaptive Habit Heatmaps &amp; Streaks
                  </h3>
                  <p className="mt-1 text-xs sm:text-sm font-medium leading-relaxed text-slate-600">
                    Earn streak days when you reach your chosen daily minimum. Build an unshakeable study rhythm
                    backed by visual weekly and monthly consistency heatmaps.
                  </p>
                </div>
              </div>
            </div>

            {/* Card 3: Subject Breakdown */}
            <div className="rounded-3xl border border-blue-100 bg-[#f8fcff] p-5 sm:p-6 shadow-sm">
              <div className="flex items-start gap-3.5">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600 shadow-sm">
                  <Award className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-[#071a3a]">
                    Subject Distribution &amp; Target Tags
                  </h3>
                  <p className="mt-1 text-xs sm:text-sm font-medium leading-relaxed text-slate-600">
                    Tag every session with your specific subject and topic. Review exactly where your hours
                    are invested across your academic preparation.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Interactive Goal Progress Card Simulator */}
          <div className="rounded-3xl border-2 border-blue-100 bg-white p-5 sm:p-8 shadow-xl shadow-blue-500/10">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-[#0b73e6]">
                  20-Hour Goal Dashboard
                </span>
                <h4 className="text-lg sm:text-xl font-black text-[#071a3a]">
                  Ravi&apos;s Daily Target
                </h4>
              </div>
              <div className="flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200 px-3 py-1 text-xs font-black text-amber-700">
                <Flame className="h-4 w-4 fill-amber-500 text-amber-500" />
                <span>14 Day Streak</span>
              </div>
            </div>

            {/* Select Goal Threshold */}
            <div className="mt-5">
              <label className="text-xs font-black uppercase tracking-wider text-slate-500">
                Adjust Daily Study Target
              </label>
              <div className="mt-2 grid grid-cols-4 gap-2">
                {[4, 6, 8, 10].map((hrs) => (
                  <button
                    key={hrs}
                    type="button"
                    onClick={() => setSelectedGoalHours(hrs)}
                    className={`rounded-xl py-2 px-1 xs:px-2.5 sm:px-3 text-[11px] sm:text-xs font-black transition-all cursor-pointer text-center ${
                      selectedGoalHours === hrs
                        ? "bg-[#071a3a] text-white shadow-sm"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    <span>{hrs}h</span>
                    <span className="hidden xs:inline"> Hours</span>
                  </button>

                ))}
              </div>
            </div>

            {/* Progress Bar & Percentage */}
            <div className="mt-6 rounded-2xl bg-[#f8fcff] border border-blue-100 p-4 sm:p-5">
              <div className="flex items-baseline justify-between">
                <div>
                  <span className="text-2xl sm:text-3xl font-black text-[#071a3a]">
                    {formatHours(completedMinutes)}
                  </span>
                  <span className="text-xs font-bold text-slate-400 ml-1.5">
                    / {selectedGoalHours}h Goal
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-xl sm:text-2xl font-black text-[#0b73e6]">
                    {percentage}%
                  </span>
                </div>
              </div>

              {/* Progress track */}
              <div className="mt-3 h-3 w-full rounded-full bg-blue-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#0b73e6] to-[#00d084] transition-all duration-500"
                  style={{ width: `${percentage}%` }}
                />
              </div>

              <div className="mt-3 flex items-center justify-between text-[11px] font-bold text-slate-500">
                <span>Rolling 20h Window Active</span>
                <span>{selectedGoalHours * 60 - completedMinutes > 0 ? `${formatHours(selectedGoalHours * 60 - completedMinutes)} to target` : "Goal Achieved! 🎉"}</span>
              </div>
            </div>

            {/* Subject Distribution Mock */}
            <div className="mt-6">
              <span className="text-xs font-black uppercase tracking-wider text-slate-500 block mb-2.5">
                Today&apos;s Subject Breakdown
              </span>
              <div className="space-y-2">
                <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-xs font-semibold">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-[#0b73e6]" />
                    <span className="text-[#071a3a] font-bold">Physics • Dual Nature</span>
                  </div>
                  <span className="font-mono text-slate-600">2h 30m</span>
                </div>

                <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-xs font-semibold">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-purple-500" />
                    <span className="text-[#071a3a] font-bold">Calculus • Definite Integrals</span>
                  </div>
                  <span className="font-mono text-slate-600">1h 45m</span>
                </div>

                <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-xs font-semibold">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    <span className="text-[#071a3a] font-bold">Inorganic Chem • Periodic Table</span>
                  </div>
                  <span className="font-mono text-slate-600">0h 30m</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
