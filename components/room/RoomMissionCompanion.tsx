"use client";

import React, { memo } from "react";
import Link from "next/link";
import { DailyGoal } from "@/lib/supabase/types";
import { Target, CheckCircle2, Circle, Flame, Trophy, Clock, GraduationCap, ChevronRight } from "lucide-react";
import { formatMinutesToHours } from "@/lib/time/format";

interface RoomMissionCompanionProps {
  activeGoal: DailyGoal | null;
  isStudying: boolean;
  onCompleteTask?: (taskId: string) => Promise<void> | void;
  streakDays?: number;
  weeklyStudySeconds?: number;
  streakLoading?: boolean;
  nearestExamName?: string | null;
  nearestExamDaysRemaining?: number | null;
  onOpenCreateGoal?: () => void;
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
}: RoomMissionCompanionProps) {
  const tasks = activeGoal?.tasks || [];
  const completedCount = tasks.filter((t) => t.completed).length;
  const totalCount = tasks.length;
  const completionPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const weeklyMinutes = Math.floor(weeklyStudySeconds / 60);

  return (
    <div className="w-full h-full flex flex-col justify-between p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-zinc-900/90 via-zinc-900/70 to-zinc-950/90 border border-zinc-800/80 shadow-xl backdrop-blur-md space-y-3.5 select-none transition-all">
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 rounded-lg bg-violet-500/10 border border-violet-500/25 text-violet-300 shrink-0">
            <Target className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-black uppercase tracking-wider text-zinc-200">
              {isStudying ? "Live Session Mission" : "Daily Study Target"}
            </h3>
            <span className="text-[10px] text-zinc-400 font-medium">
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

      {/* Center: Tasks Checklist or Goal CTA */}
      <div className="flex-1 min-h-[90px] flex flex-col justify-center">
        {totalCount > 0 ? (
          <div className="space-y-2 py-1 max-h-40 overflow-y-auto pr-1">
            {tasks.map((task) => (
              <button
                key={task.id}
                type="button"
                onClick={() => onCompleteTask && !task.completed && onCompleteTask(task.id)}
                disabled={task.completed}
                className={`w-full flex items-center space-x-2.5 p-2 rounded-xl text-left transition-all ${
                  task.completed
                    ? "bg-violet-950/20 border border-violet-500/20 text-zinc-400 opacity-80"
                    : "bg-zinc-950/60 hover:bg-zinc-900 border border-zinc-800/80 text-zinc-200 hover:border-violet-500/40 cursor-pointer"
                }`}
              >
                {task.completed ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <Circle className="w-4 h-4 text-zinc-500 shrink-0 hover:text-violet-400" />
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
        ) : (
          <div className="py-2 text-center space-y-2">
            <p className="text-xs text-zinc-400">
              Set clear study tasks to boost your accountability and leaderboard discipline score.
            </p>
            {onOpenCreateGoal && (
              <button
                type="button"
                onClick={onOpenCreateGoal}
                className="px-3 py-1.5 rounded-xl bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/30 text-violet-200 text-xs font-bold transition-all shadow-sm"
              >
                + Set Today&apos;s Target
              </button>
            )}
          </div>
        )}
      </div>

      {/* Bottom Telemetry Bar: Streak, Week Total, and Exam countdown */}
      <div className="pt-2.5 border-t border-zinc-800/80 flex items-center justify-between text-[10.5px] font-medium text-zinc-400 flex-wrap gap-2">
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
