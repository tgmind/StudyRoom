"use client";

import React, { memo } from "react";
import { HeatmapDay } from "@/lib/scoring/streak";
import { formatMinutesToHours } from "@/lib/time/format";
import { Flame, Check, Lock, Calendar, Info } from "lucide-react";
import { triggerHapticFeedback } from "@/lib/utils/haptics";

interface StreakHeatmapProps {
  days: HeatmapDay[];
  selectedDay: HeatmapDay | null;
  onSelectDay: (day: HeatmapDay) => void;
}

export const StreakHeatmap = memo(function StreakHeatmap({
  days,
  selectedDay,
  onSelectDay,
}: StreakHeatmapProps) {
  const getCellClasses = (day: HeatmapDay) => {
    if (day.isFuture) {
      return "bg-zinc-900/30 border-dashed border-zinc-800/60 text-zinc-600 opacity-60";
    }

    switch (day.intensityLevel) {
      case 4:
        return "bg-gradient-to-br from-amber-500 via-orange-600 to-violet-600 border-amber-300 text-white shadow-[0_0_16px_rgba(245,158,11,0.4)]";
      case 3:
        return "bg-orange-500/40 border-orange-400/80 text-orange-100 shadow-[0_0_12px_rgba(249,115,22,0.3)]";
      case 2:
        return "bg-amber-500/30 border-amber-400/60 text-amber-200 shadow-[0_0_10px_rgba(245,158,11,0.2)]";
      case 1:
        return "bg-amber-500/15 border-amber-500/30 text-amber-300";
      case 0:
      default:
        return "bg-zinc-900/60 border-zinc-800/80 text-zinc-500";
    }
  };

  return (
    <section
      aria-label="Weekly Study Heatmap"
      className="relative rounded-2xl bg-zinc-950/80 border border-zinc-800/90 p-3.5 sm:p-5 shadow-xl backdrop-blur-md space-y-3.5"
    >
      {/* Header with Title and Week Range */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center space-x-2 min-w-0">
          <div className="p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 shrink-0">
            <Calendar className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-extrabold text-zinc-100 tracking-tight break-words">
              Weekly Study Heatmap
            </h2>
            <p className="text-[10px] sm:text-xs text-zinc-400 break-words">
              Current Week (Monday – Sunday) • Daily midnight refresh
            </p>
          </div>
        </div>

        <div className="hidden sm:flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-400 font-medium">
          <Info className="w-3 h-3 text-zinc-500" />
          <span>Tap day to view sessions</span>
        </div>
      </div>

      {/* 7-Day Heatmap Grid */}
      <div
        className="grid grid-cols-7 gap-1 sm:gap-2.5"
        style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}
      >
        {days.map((day) => {
          const isSelected = selectedDay?.dateISO === day.dateISO;

          return (
            <button
              key={day.dateISO}
              type="button"
              onClick={() => {
                triggerHapticFeedback(10);
                onSelectDay(day);
              }}
              className={`group relative flex flex-col items-center justify-between p-1.5 sm:p-2.5 rounded-xl border transition-all duration-150 select-none touch-manipulation min-w-0 min-h-[76px] sm:min-h-[92px] ${getCellClasses(
                day
              )} ${
                isSelected
                  ? "ring-2 ring-amber-400 scale-[1.03] z-10"
                  : "hover:scale-[1.02] active:scale-95"
              } ${day.isToday ? "ring-1 ring-amber-500/60" : ""}`}
            >
              {/* Day Label & Date Number */}
              <div className="text-center w-full">
                <span className="block text-[10px] sm:text-xs font-bold uppercase tracking-wider text-zinc-400">
                  {day.dayName}
                </span>
                <span className="block text-xs sm:text-sm font-black text-zinc-100 mt-0.5">
                  {day.dayNumber}
                </span>
              </div>

              {/* Center Qualification or Status Icon */}
              <div className="my-1 flex items-center justify-center">
                {day.isFuture ? (
                  <Lock className="w-3 h-3 text-zinc-600" />
                ) : day.isQualified ? (
                  <div className="flex items-center justify-center w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-amber-400/90 text-zinc-950 shadow-sm">
                    <Flame className="w-2.5 h-2.5 sm:w-3 sm:h-3 fill-zinc-950" />
                  </div>
                ) : day.activeStudyMinutes > 0 ? (
                  <div className="w-2 h-2 rounded-full bg-amber-400/70 animate-pulse" />
                ) : (
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-700" />
                )}
              </div>

              {/* Bottom Duration Badge */}
              <div className="w-full text-center">
                <span
                  className={`block text-[8px] min-[340px]:text-[9px] sm:text-[11px] font-extrabold whitespace-nowrap tabular-nums px-0.5 ${
                    day.isFuture
                      ? "text-zinc-600"
                      : day.isQualified
                      ? "text-amber-300 drop-shadow-sm font-black"
                      : day.activeStudyMinutes > 0
                      ? "text-amber-200"
                      : "text-zinc-500"
                  }`}
                >
                  {day.isFuture ? "--" : formatMinutesToHours(day.activeStudyMinutes)}
                </span>
              </div>

              {/* "Today" Floating Pill */}
              {day.isToday && (
                <span className="absolute -top-2 left-1/2 -translate-x-1/2 px-1.5 py-0.2 rounded-full bg-amber-400 text-zinc-950 text-[8px] font-black tracking-wider uppercase shadow-sm">
                  Today
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Heatmap Legend & Summary Pill */}
      <div className="flex items-center justify-between pt-2 border-t border-zinc-900 text-[10px] sm:text-xs text-zinc-400 flex-wrap gap-2">
        <div className="flex items-center space-x-1.5">
          <span className="text-zinc-500">Less</span>
          <div className="flex items-center space-x-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-zinc-900 border border-zinc-800" title="0m" />
            <span className="w-2.5 h-2.5 rounded-sm bg-amber-500/20 border border-amber-500/30" title="1-29m" />
            <span className="w-2.5 h-2.5 rounded-sm bg-amber-500/50 border border-amber-400" title="30-89m (Qualified)" />
            <span className="w-2.5 h-2.5 rounded-sm bg-orange-500/70 border border-orange-400" title="90-179m" />
            <span className="w-2.5 h-2.5 rounded-sm bg-gradient-to-br from-amber-500 to-violet-600" title="180m+" />
          </div>
          <span className="text-zinc-500">More</span>
        </div>

        <div className="flex items-center space-x-1.5 text-amber-400/90 font-semibold">
          <Flame className="w-3 h-3 fill-amber-400" />
          <span>Qualifies at 30 mins / day</span>
        </div>
      </div>
    </section>
  );
});
