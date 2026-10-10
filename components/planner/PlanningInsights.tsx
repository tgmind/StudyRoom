"use client";

import React, { memo } from "react";
import { PlanningInsights as PlanningInsightsType } from "@/lib/planner/types";
import {
  Calendar,
  Hourglass,
  Layers,
  Lock,
  Unlock,
  Eye,
  CheckCircle2,
} from "lucide-react";

interface PlanningInsightsProps {
  insights: PlanningInsightsType;
}

export const PlanningInsights = memo(function PlanningInsights({
  insights,
}: PlanningInsightsProps) {
  if (insights.totalPlans === 0) {
    return null;
  }

  return (
    <section
      aria-label="Planning Insights"
      className="grid grid-cols-2 min-[440px]:grid-cols-3 md:grid-cols-6 gap-2 sm:gap-2.5"
    >
      {/* 1. Active Exams */}
      <div className="rounded-xl bg-zinc-950/70 border border-zinc-800/80 p-2.5 sm:p-3 flex flex-col justify-between shadow-sm">
        <div className="flex items-center justify-between text-zinc-400 mb-1 sm:mb-1.5">
          <span className="text-[9.5px] sm:text-[10px] font-bold uppercase tracking-wider text-zinc-500">
            Active Exams
          </span>
          <Calendar className="w-3.5 h-3.5 text-amber-400 shrink-0" />
        </div>
        <div>
          <div className="text-base sm:text-lg font-black text-zinc-100 tabular-nums">
            {insights.activeExamsCount}
          </div>
          <p className="text-[9.5px] sm:text-[10px] text-zinc-500 mt-0.5 truncate">
            of {insights.totalPlans} total plans
          </p>
        </div>
      </div>

      {/* 2. Nearest Exam Target */}
      <div className="rounded-xl bg-zinc-950/70 border border-zinc-800/80 p-2.5 sm:p-3 flex flex-col justify-between shadow-sm">
        <div className="flex items-center justify-between text-zinc-400 mb-1 sm:mb-1.5">
          <span className="text-[9.5px] sm:text-[10px] font-bold uppercase tracking-wider text-zinc-500">
            Nearest Target
          </span>
          <Hourglass className="w-3.5 h-3.5 text-rose-400 shrink-0" />
        </div>
        <div>
          {insights.nearestExam ? (
            <>
              <div className="text-base sm:text-lg font-black text-zinc-100 tabular-nums truncate">
                {insights.nearestExam.daysRemaining === 0
                  ? "Today!"
                  : `${insights.nearestExam.daysRemaining}d`}
              </div>
              <p className="text-[9.5px] sm:text-[10px] text-zinc-400 mt-0.5 truncate" title={insights.nearestExam.examName}>
                {insights.nearestExam.examName}
              </p>
            </>
          ) : (
            <>
              <div className="text-sm font-bold text-zinc-500">None</div>
              <p className="text-[9.5px] sm:text-[10px] text-zinc-600 mt-0.5">No upcoming exam</p>
            </>
          )}
        </div>
      </div>

      {/* 3. Total Scheduled Preparation Days */}
      <div className="rounded-xl bg-zinc-950/70 border border-zinc-800/80 p-2.5 sm:p-3 flex flex-col justify-between shadow-sm">
        <div className="flex items-center justify-between text-zinc-400 mb-1 sm:mb-1.5">
          <span className="text-[9.5px] sm:text-[10px] font-bold uppercase tracking-wider text-zinc-500">
            Scheduled Days
          </span>
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
        </div>
        <div>
          <div className="text-base sm:text-lg font-black text-zinc-100 tabular-nums">
            {insights.totalScheduledDays}
          </div>
          <p className="text-[9.5px] sm:text-[10px] text-zinc-500 mt-0.5 truncate">
            unique days
          </p>
        </div>
      </div>

      {/* 4. Preparation Slots */}
      <div className="rounded-xl bg-zinc-950/70 border border-zinc-800/80 p-2.5 sm:p-3 flex flex-col justify-between shadow-sm">
        <div className="flex items-center justify-between text-zinc-400 mb-1 sm:mb-1.5">
          <span className="text-[9.5px] sm:text-[10px] font-bold uppercase tracking-wider text-zinc-500">
            Prep Slots
          </span>
          <Layers className="w-3.5 h-3.5 text-blue-400 shrink-0" />
        </div>
        <div>
          <div className="text-base sm:text-lg font-black text-zinc-100 tabular-nums">
            {insights.configuredSlotsCount}
          </div>
          <p className="text-[9.5px] sm:text-[10px] text-zinc-500 mt-0.5 truncate">
            across exams
          </p>
        </div>
      </div>

      {/* 5. Locked vs Editable */}
      <div className="rounded-xl bg-zinc-950/70 border border-zinc-800/80 p-2.5 sm:p-3 flex flex-col justify-between shadow-sm">
        <div className="flex items-center justify-between text-zinc-400 mb-1 sm:mb-1.5">
          <span className="text-[9.5px] sm:text-[10px] font-bold uppercase tracking-wider text-zinc-500">
            Protection
          </span>
          {insights.lockedPlansCount > 0 ? (
            <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          ) : (
            <Unlock className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
          )}
        </div>
        <div>
          <div className="text-sm sm:text-base font-extrabold text-zinc-100 tabular-nums">
            {insights.lockedPlansCount} locked
          </div>
          <p className="text-[9.5px] sm:text-[10px] text-zinc-500 mt-0.5 truncate">
            {insights.editablePlansCount} editable
          </p>
        </div>
      </div>

      {/* 6. Shown in Streaks */}
      <div className="rounded-xl bg-zinc-950/70 border border-zinc-800/80 p-2.5 sm:p-3 flex flex-col justify-between shadow-sm">
        <div className="flex items-center justify-between text-zinc-400 mb-1 sm:mb-1.5">
          <span className="text-[9.5px] sm:text-[10px] font-bold uppercase tracking-wider text-zinc-500">
            In Streaks
          </span>
          <Eye className="w-3.5 h-3.5 text-purple-400 shrink-0" />
        </div>
        <div>
          <div className="text-base sm:text-lg font-black text-zinc-100 tabular-nums">
            {insights.streaksVisiblePlansCount}
          </div>
          <p className="text-[9.5px] sm:text-[10px] text-zinc-500 mt-0.5 truncate">
            maps visible
          </p>
        </div>
      </div>
    </section>
  );
});
