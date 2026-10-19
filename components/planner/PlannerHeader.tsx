"use client";

import React, { memo } from "react";
import { Plus, CalendarDays, Sparkles, LayoutDashboard } from "lucide-react";

interface PlannerHeaderProps {
  onCreateClick: () => void;
  activeExamsCount: number;
  showRoomUpcomingCard?: boolean;
  onToggleShowRoomUpcomingCard?: () => void;
  isPreferenceUpdating?: boolean;
}

export const PlannerHeader = memo(function PlannerHeader({
  onCreateClick,
  activeExamsCount,
  showRoomUpcomingCard = true,
  onToggleShowRoomUpcomingCard,
  isPreferenceUpdating = false,
}: PlannerHeaderProps) {
  const isEnabled = showRoomUpcomingCard !== false;

  return (
    <div className="relative rounded-2xl bg-zinc-950/80 border border-zinc-800/90 p-3 sm:p-3.5 shadow-xl backdrop-blur-md overflow-hidden">
      {/* Subtle dual-accent background glow */}
      <div className="absolute top-0 right-0 -mr-16 -mt-16 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-10 -mb-16 w-36 h-36 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-start sm:items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 shrink-0 shadow-inner mt-0.5 sm:mt-0">
              <CalendarDays className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                <h1 className="text-base sm:text-lg font-black text-white tracking-tight leading-snug">
                  Exam Study Planner
                </h1>
                {activeExamsCount > 0 && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9.5px] sm:text-[10px] font-extrabold bg-amber-500/15 text-amber-300 border border-amber-500/30 shrink-0">
                    <Sparkles className="w-2.5 h-2.5 mr-1" />
                    {activeExamsCount} {activeExamsCount === 1 ? "Active Exam" : "Active Exams"}
                  </span>
                )}
              </div>
              <p className="text-[11px] sm:text-xs text-zinc-400 leading-snug mt-0.5">
                Target exams, custom preparation phases, reverse countdowns & Streaks sync.
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onCreateClick}
          className="w-full sm:w-auto inline-flex items-center justify-center space-x-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-zinc-200 active:scale-95 text-zinc-950 text-xs sm:text-sm font-black shadow-[0_2px_14px_rgba(255,255,255,0.22)] transition-all cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white shrink-0"
        >
          <Plus className="w-4 h-4 stroke-[2.75]" />
          <span>Create Exam Plan</span>
        </button>
      </div>

      {/* Cross-Device Preference: Show Upcoming Exam in Main Room */}
      {onToggleShowRoomUpcomingCard && (
        <div className="relative mt-3 pt-2.5 border-t border-zinc-800/80 flex items-center justify-between gap-3">
          <div className="flex items-center space-x-2.5 min-w-0 flex-1">
            <div
              className={`p-1.5 rounded-lg border text-xs shrink-0 transition-colors ${
                isEnabled
                  ? "bg-indigo-500/15 border-indigo-500/30 text-indigo-300"
                  : "bg-zinc-800/50 border-zinc-700/50 text-zinc-500"
              }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center space-x-2">
                <span className="text-xs sm:text-[13px] font-bold text-zinc-200 truncate">
                  Show Upcoming Target in Room
                </span>
                <span
                  data-testid="room-card-toggle-status"
                  className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] sm:text-[10px] font-extrabold uppercase tracking-wider shrink-0 transition-colors ${
                    isEnabled
                      ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                      : "bg-zinc-800 text-zinc-400 border border-zinc-700"
                  }`}
                >
                  {isEnabled ? "ON" : "OFF"}
                </span>
              </div>
              <p className="text-[10.5px] sm:text-xs text-zinc-400 truncate mt-0.5">
                Display nearest upcoming exam & active phase above the study timer in Room
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={isPreferenceUpdating}
            onClick={onToggleShowRoomUpcomingCard}
            className={`relative inline-flex h-5 w-9 sm:h-5.5 sm:w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:opacity-50 select-none ${
              isEnabled ? "bg-amber-500" : "bg-zinc-700"
            }`}
            role="switch"
            aria-checked={isEnabled}
            aria-label="Toggle upcoming exam card on Room page"
            data-testid="toggle-room-upcoming-card-button"
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 sm:h-4.5 sm:w-4.5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                isEnabled ? "translate-x-4 sm:translate-x-4.5" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      )}
    </div>
  );
});
