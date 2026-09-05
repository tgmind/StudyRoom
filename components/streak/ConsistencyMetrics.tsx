"use client";

import React, { memo } from "react";
import { ConsistencyStats } from "@/lib/scoring/streak";
import { formatMinutesToHours } from "@/lib/time/format";
import {
  Trophy,
  Clock,
  Target,
  BarChart3,
  Zap,
  CheckCircle2,
  CalendarCheck,
} from "lucide-react";

interface ConsistencyMetricsProps {
  stats: ConsistencyStats;
}

export const ConsistencyMetrics = memo(function ConsistencyMetrics({
  stats,
}: ConsistencyMetricsProps) {
  const {
    weeklyTotalMinutes,
    weeklyQualifiedDays,
    weeklyConsistencyRate,
    dailyAverageMinutes,
    bestStreak,
    totalSessionsCount,
    activeDaysCount,
  } = stats;

  return (
    <section aria-label="Consistency Analytics" className="space-y-3">
      <div className="flex items-center space-x-2 px-1">
        <div className="p-1.5 rounded-lg bg-violet-500/10 border border-violet-500/20 text-violet-400">
          <BarChart3 className="w-4 h-4" />
        </div>
        <div>
          <h2 className="text-sm sm:text-base font-extrabold text-zinc-100 tracking-tight">
            Consistency Reports & Analytics
          </h2>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3.5">
        {/* Card 1: Weekly Consistency Rate */}
        <div className="rounded-xl bg-zinc-900/70 border border-zinc-800/80 p-3 sm:p-4 backdrop-blur-sm relative overflow-hidden flex flex-col justify-between space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-bold text-zinc-400">
              Consistency Rate
            </span>
            <Target className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <div className="flex items-baseline space-x-1.5 flex-wrap">
              <span className="text-2xl sm:text-3xl font-black text-white tabular-nums">
                {weeklyConsistencyRate}%
              </span>
              <span className="text-[10px] min-[360px]:text-[11px] font-semibold text-zinc-400">
                ({weeklyQualifiedDays}/7 Days)
              </span>
            </div>
            {/* Progress bar */}
            <div className="w-full h-1.5 bg-zinc-800 rounded-full mt-2 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(0, weeklyConsistencyRate))}%` }}
              />
            </div>
          </div>
        </div>

        {/* Card 2: Total Study Time This Week */}
        <div className="rounded-xl bg-zinc-900/70 border border-zinc-800/80 p-3 sm:p-4 backdrop-blur-sm relative overflow-hidden flex flex-col justify-between space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-bold text-zinc-400">
              Weekly Volume
            </span>
            <Clock className="w-4 h-4 text-violet-400" />
          </div>
          <div>
            <span className="text-2xl sm:text-3xl font-black text-white tabular-nums">
              {formatMinutesToHours(weeklyTotalMinutes)}
            </span>
            <p className="text-[10px] sm:text-[11px] text-zinc-400 mt-0.5">
              Total time this week
            </p>
          </div>
        </div>

        {/* Card 3: Daily Average (Active Days) */}
        <div className="rounded-xl bg-zinc-900/70 border border-zinc-800/80 p-3 sm:p-4 backdrop-blur-sm relative overflow-hidden flex flex-col justify-between space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-bold text-zinc-400">
              Daily Average
            </span>
            <Zap className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <span className="text-2xl sm:text-3xl font-black text-white tabular-nums">
              {formatMinutesToHours(dailyAverageMinutes)}
            </span>
            <p className="text-[10px] sm:text-[11px] text-zinc-400 mt-0.5">
              Active days ({activeDaysCount} {activeDaysCount === 1 ? "day" : "days"})
            </p>
          </div>
        </div>

        {/* Card 4: Best Streak Record */}
        <div className="rounded-xl bg-zinc-900/70 border border-zinc-800/80 p-3 sm:p-4 backdrop-blur-sm relative overflow-hidden flex flex-col justify-between space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-bold text-zinc-400">
              Best Record
            </span>
            <Trophy className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <div className="flex items-baseline space-x-1 flex-wrap">
              <span className="text-2xl sm:text-3xl font-black text-white tabular-nums">
                {bestStreak}
              </span>
              <span className="text-xs font-bold text-zinc-400">
                {bestStreak === 1 ? "Day" : "Days"}
              </span>
            </div>
            <p className="text-[10px] sm:text-[11px] text-zinc-400 mt-0.5">
              All-time streak
            </p>
          </div>
        </div>

        {/* Card 5: Total Completed Sessions */}
        <div className="rounded-xl bg-zinc-900/70 border border-zinc-800/80 p-3 sm:p-4 backdrop-blur-sm relative overflow-hidden flex flex-col justify-between space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-bold text-zinc-400">
              Sessions
            </span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <div className="flex items-baseline space-x-1 flex-wrap">
              <span className="text-2xl sm:text-3xl font-black text-white tabular-nums">
                {totalSessionsCount}
              </span>
              <span className="text-xs font-bold text-zinc-400">
                {totalSessionsCount === 1 ? "Session" : "Sessions"}
              </span>
            </div>
            <p className="text-[10px] sm:text-[11px] text-zinc-400 mt-0.5">
              Logged this week
            </p>
          </div>
        </div>

        {/* Card 6: Qualifying Days Met */}
        <div className="rounded-xl bg-zinc-900/70 border border-zinc-800/80 p-3 sm:p-4 backdrop-blur-sm relative overflow-hidden flex flex-col justify-between space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-bold text-zinc-400">
              Goal Met
            </span>
            <CalendarCheck className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <div className="flex items-baseline space-x-1 flex-wrap">
              <span className="text-2xl sm:text-3xl font-black text-white tabular-nums">
                {weeklyQualifiedDays}
              </span>
              <span className="text-xs font-bold text-zinc-400">
                {weeklyQualifiedDays === 1 ? "Day" : "Days"}
              </span>
            </div>
            <p className="text-[10px] sm:text-[11px] text-zinc-400 mt-0.5">
              ≥30m daily goal met
            </p>
          </div>
        </div>
      </div>
    </section>
  );
});
