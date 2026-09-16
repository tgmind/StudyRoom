"use client";

import React, { memo } from "react";
import { Clock, XCircle } from "lucide-react";
import { LapsedGoalWindow } from "@/hooks/useStudyHistory";
import { formatLapsedDateTime } from "@/lib/time/format";

interface LapsedGoalHistoryCardProps {
  lapsedGoal: LapsedGoalWindow;
}

export const LapsedGoalHistoryCard = memo(function LapsedGoalHistoryCard({
  lapsedGoal,
}: LapsedGoalHistoryCardProps) {
  const endingDateTime = lapsedGoal.expires_at
    ? formatLapsedDateTime(lapsedGoal.expires_at)
    : "";

  return (
    <div className="relative">
      {/* Timeline Node Dot (Matching Rose/Red) */}
      <div className="absolute -left-4 sm:-left-6 top-4 -translate-x-1/2 w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-rose-500 border-2 border-zinc-950 shadow-sm ring-2 ring-rose-500/20" />

      <div className="bg-zinc-900/80 border border-rose-500/30 hover:border-rose-500/50 rounded-xl p-3 sm:p-4 shadow-sm transition-all space-y-2.5">
        {/* Top Line: Red Lapsed Badge + Minimal Ending Date/Time + Unfinished Tasks Badge */}
        <div className="flex flex-wrap items-center justify-between gap-x-2.5 gap-y-1.5">
          <div className="flex flex-wrap items-center gap-x-2 sm:gap-x-2.5 gap-y-1 min-w-0">
            <span className="px-2 py-0.5 sm:px-2.5 sm:py-0.5 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 font-mono text-xs sm:text-sm font-black shadow-sm shrink-0">
              Lapsed Goals
            </span>

            {endingDateTime && (
              <div className="text-xs sm:text-sm text-zinc-300 font-mono flex items-center gap-1.5 min-w-0">
                <Clock className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                <span className="tabular-nums">
                  Ended {endingDateTime}
                </span>
              </div>
            )}
          </div>

          <span className="text-[10px] sm:text-xs font-mono font-bold text-rose-400/90 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20 shrink-0">
            {lapsedGoal.lapsedTasks.length} {lapsedGoal.lapsedTasks.length === 1 ? "task" : "tasks"} unfinished
          </span>
        </div>

        {/* Bottom Line: Lapsed Goal Chips */}
        {lapsedGoal.lapsedTasks.length > 0 && (
          <div className="pt-2 border-t border-rose-500/15 flex flex-wrap gap-1.5 items-center">
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-rose-400 mr-1 flex items-center gap-1 shrink-0">
              <XCircle className="w-3 h-3 text-rose-400 shrink-0" />
              <span>Lapsed:</span>
            </span>
            {lapsedGoal.lapsedTasks.map((t) => (
              <span
                key={t.id}
                className="inline-flex items-center gap-1 px-2 py-0.5 sm:px-2.5 sm:py-0.5 rounded-md bg-rose-500/10 border border-rose-500/20 text-rose-200 text-[11px] sm:text-xs font-medium max-w-full shadow-sm break-words"
              >
                <span className="text-rose-400 font-bold shrink-0">✕</span>
                <span className="break-words line-through decoration-rose-500/50">{t.task}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});
