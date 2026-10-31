"use client";

import React, { memo, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { DailyGoal } from "@/lib/supabase/types";
import {
  Target,
  CheckCircle2,
  Circle,
  Flame,
  Clock,
  GraduationCap,
  ChevronRight,
  ChevronLeft,
} from "lucide-react";
import { formatMinutesToHours } from "@/lib/time/format";

export interface RoomMissionCompanionProps {
  activeGoal: DailyGoal | null;
  isStudying: boolean;
  onCompleteTask?: (taskId: string) => Promise<void> | void;
  streakDays?: number;
  weeklyStudySeconds?: number;
  streakLoading?: boolean;
  nearestExamName?: string | null;
  nearestExamDaysRemaining?: number | null;
  onOpenCreateGoal?: () => void;
  className?: string;
  compact?: boolean;
}

export const RoomMissionCompanion = memo(function RoomMissionCompanion({
  activeGoal,
  isStudying,
  onCompleteTask,
  streakDays = 0,
  weeklyStudySeconds = 0,
  streakLoading = false,
  nearestExamName,
  nearestExamDaysRemaining,
  onOpenCreateGoal,
  className,
  compact = false,
}: RoomMissionCompanionProps) {
  const tasks = useMemo(() => activeGoal?.tasks || [], [activeGoal?.tasks]);
  const completedCount = useMemo(() => tasks.filter((t) => t.completed).length, [tasks]);
  const totalCount = tasks.length;
  const completionPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const weeklyMinutes = Math.floor(weeklyStudySeconds / 60);

  // Pagination / Slider logic: strictly fixed at 2 tasks per slide to preserve bounds
  const TASKS_PER_PAGE = 2;
  const totalPages = Math.max(1, Math.ceil(totalCount / TASKS_PER_PAGE));
  const [currentPage, setCurrentPage] = useState(0);

  // Auto-clamp active page if tasks are removed or modified
  const activePage = Math.min(currentPage, totalPages - 1);

  const handlePrev = useCallback(() => {
    setCurrentPage((p) => Math.max(0, p - 1));
  }, []);

  const handleNext = useCallback(() => {
    setCurrentPage((p) => Math.min(totalPages - 1, p + 1));
  }, [totalPages]);

  return (
    <div
      className={`w-full h-full flex flex-col justify-between rounded-2xl bg-gradient-to-br from-zinc-900/90 via-zinc-900/70 to-zinc-950/90 border border-zinc-800/80 shadow-xl backdrop-blur-md select-none transition-all ${
        compact ? "p-3 sm:p-3.5 space-y-1.5" : "p-4 sm:p-5 space-y-3"
      } ${className || ""}`}
    >
      {/* Top Header */}
      <div
        className={`flex items-center justify-between border-b border-zinc-800/80 ${
          compact ? "pb-2" : "pb-3"
        }`}
      >
        <div className="flex items-center space-x-2">
          <div className="p-1 rounded-lg bg-violet-500/10 border border-violet-500/25 text-violet-300 shrink-0">
            <Target className="w-3.5 h-3.5" />
          </div>
          <div>
            <h3 className="text-xs font-black uppercase tracking-wider text-zinc-200">
              {isStudying ? "Live Session Mission" : "Daily Study Target"}
            </h3>
            <span className="text-[10px] text-zinc-400 font-medium block -mt-0.5">
              {totalCount > 0
                ? `${completedCount}/${totalCount} completed (${completionPct}% discipline)`
                : "No active daily goals set"}
            </span>
          </div>
        </div>

        <Link
          href="/goals"
          className="text-[10px] font-bold text-violet-400 hover:text-violet-300 transition-colors flex items-center space-x-0.5"
        >
          <span>Goals</span>
          <ChevronRight className="w-3 h-3" />
        </Link>
      </div>

      {/* Center: Tasks Checklist with Slider Navigation */}
      <div className={`flex-1 flex flex-col justify-center min-h-0 ${compact ? "py-0.5" : "py-1"}`}>
        {totalCount > 0 ? (
          <div className="w-full flex-1 flex flex-col justify-between">
            {/* Slider Navigation Bar (Visible when totalPages > 1) */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pb-1 px-0.5 text-[10px] text-zinc-400 select-none">
                <span className="font-mono font-medium text-zinc-400">
                  Slide {activePage + 1} of {totalPages} • {totalCount} tasks
                </span>
                <div className="flex items-center space-x-1.5">
                  <button
                    type="button"
                    onClick={handlePrev}
                    disabled={activePage === 0}
                    aria-label="Previous goals slide"
                    className="p-1 rounded-md bg-zinc-800/80 hover:bg-zinc-700/80 border border-zinc-700/60 text-zinc-300 disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer"
                  >
                    <ChevronLeft className="w-3 h-3" />
                  </button>
                  {/* Micro Interactive Range Slider */}
                  <input
                    type="range"
                    min={0}
                    max={totalPages - 1}
                    value={activePage}
                    onChange={(e) => setCurrentPage(Number(e.target.value))}
                    aria-label="Goals slide position"
                    className="w-12 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-violet-500"
                  />
                  <button
                    type="button"
                    onClick={handleNext}
                    disabled={activePage === totalPages - 1}
                    aria-label="Next goals slide"
                    className="p-1 rounded-md bg-zinc-800/80 hover:bg-zinc-700/80 border border-zinc-700/60 text-zinc-300 disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer"
                  >
                    <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            )}

            {/* Sliding Carousel of Tasks */}
            <div className="relative overflow-hidden w-full flex-1 flex flex-col justify-center min-h-[64px]">
              <div
                className="flex transition-transform duration-300 ease-out w-full"
                style={{ transform: `translateX(-${activePage * 100}%)` }}
              >
                {Array.from({ length: totalPages }).map((_, pageIndex) => {
                  const pageTasks = tasks.slice(
                    pageIndex * TASKS_PER_PAGE,
                    (pageIndex + 1) * TASKS_PER_PAGE
                  );
                  return (
                    <div key={pageIndex} className={`w-full shrink-0 px-0.5 ${compact ? "space-y-1.5" : "space-y-2"}`}>
                      {pageTasks.map((task) => (
                        <button
                          key={task.id}
                          type="button"
                          onClick={() => onCompleteTask && !task.completed && onCompleteTask(task.id)}
                          disabled={task.completed}
                          className={`w-full flex items-center space-x-2 rounded-xl text-left transition-all ${
                            compact ? "p-1.5 px-2" : "p-2.5"
                          } ${
                            task.completed
                              ? "bg-violet-950/20 border border-violet-500/20 text-zinc-400 opacity-80"
                              : "bg-zinc-950/60 hover:bg-zinc-900 border border-zinc-800/80 text-zinc-200 hover:border-violet-500/40 cursor-pointer"
                          }`}
                        >
                          {task.completed ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          ) : (
                            <Circle className="w-3.5 h-3.5 text-zinc-500 shrink-0 hover:text-violet-400" />
                          )}
                          <span
                            title={task.task}
                            className={`text-xs font-medium min-w-0 flex-1 break-words select-text ${
                              task.completed ? "line-through text-zinc-500" : ""
                            }`}
                          >
                            {task.task}
                          </span>
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Slide Indicator Dots (Visible when totalPages > 1) */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center space-x-1.5 pt-0.5 select-none">
                {Array.from({ length: totalPages }).map((_, idx) => (
                  <button
                    type="button"
                    key={idx}
                    onClick={() => setCurrentPage(idx)}
                    aria-label={`Go to slide ${idx + 1}`}
                    className={`h-1 rounded-full transition-all cursor-pointer ${
                      idx === activePage
                        ? "w-3.5 bg-violet-400 shadow-[0_0_8px_rgba(167,139,250,0.6)]"
                        : "w-1 bg-zinc-700/80 hover:bg-zinc-600"
                    }`}
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="py-2 text-center space-y-1.5">
            <p className="text-xs text-zinc-400">
              Set clear study tasks to boost your accountability and leaderboard discipline score.
            </p>
            {onOpenCreateGoal && (
              <button
                type="button"
                onClick={onOpenCreateGoal}
                className="px-3 py-1 rounded-xl bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/30 text-violet-200 text-xs font-bold transition-all shadow-sm cursor-pointer"
              >
                + Set Today&apos;s Target
              </button>
            )}
          </div>
        )}
      </div>

      {/* Bottom Telemetry Bar: Streak, Week Total, and Exam countdown */}
      <div
        className={`border-t border-zinc-800/80 flex items-center justify-between text-[10.5px] font-medium text-zinc-400 flex-wrap gap-2 ${
          compact ? "pt-1.5" : "pt-2.5"
        }`}
      >
        {streakLoading ? (
          <div className="flex items-center space-x-2.5 py-0.5">
            <div className="h-4 w-16 bg-zinc-800/70 rounded-full animate-pulse" />
            <div className="h-4 w-16 bg-zinc-800/70 rounded-full animate-pulse" />
          </div>
        ) : (
          <div className="flex items-center space-x-3">
            <Link
              href="/streak"
              title="View daily consistency & streak details in the Streaks tab"
              className="flex items-center space-x-1 text-amber-300 hover:text-amber-200 font-bold transition-all group cursor-pointer"
            >
              <Flame className="w-3.5 h-3.5 fill-amber-400 text-amber-400 group-hover:scale-110 transition-transform" />
              <span>{streakDays}d streak</span>
            </Link>
            <Link
              href="/streak"
              title="View weekly study hours & consistency heatmap in the Streaks tab"
              className="flex items-center space-x-1 text-zinc-300 hover:text-zinc-100 transition-all group cursor-pointer"
            >
              <Clock className="w-3.5 h-3.5 text-zinc-500 group-hover:text-zinc-400 transition-colors" />
              <span>{formatMinutesToHours(weeklyMinutes)} this wk</span>
            </Link>
          </div>
        )}

        {nearestExamName && nearestExamDaysRemaining !== null && nearestExamDaysRemaining !== undefined && (
          <div className="flex items-center space-x-1 text-rose-300 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-full font-bold">
            <GraduationCap className="w-3 h-3 text-rose-400" />
            <span className="truncate max-w-[120px]">{nearestExamName}:</span>
            <span className="text-white tabular-nums font-black">{nearestExamDaysRemaining}d</span>
          </div>
        )}
      </div>
    </div>
  );
});
