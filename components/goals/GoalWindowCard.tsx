"use client";

import React, { memo } from "react";
import { DailyGoal, GoalTask } from "@/lib/supabase/types";
import { GoalCountdownResult } from "@/lib/time/countdown";
import { Button } from "@/components/ui/Button";
import { CheckCircle2, Circle, Clock, Lock, Plus, Target } from "lucide-react";

interface GoalWindowCardProps {
  goal: DailyGoal | null;
  countdown: GoalCountdownResult;
  onOpenCreateModal?: () => void;
  onOpenAddGoalModal?: () => void;
}

export const GoalWindowCard = memo(function GoalWindowCard({
  goal,
  countdown,
  onOpenCreateModal,
  onOpenAddGoalModal,
}: GoalWindowCardProps) {
  if (!goal) {
    return (
      <div className="p-6 sm:p-8 bg-zinc-900/80 border border-dashed border-violet-500/30 rounded-2xl text-center space-y-3.5 shadow-xl backdrop-blur-md relative overflow-hidden">
        <div className="p-3 rounded-2xl bg-violet-500/10 border border-violet-500/25 w-12 h-12 mx-auto flex items-center justify-center text-violet-300 shadow-inner">
          <Target className="w-6 h-6" />
        </div>

        <div className="space-y-1 max-w-sm mx-auto">
          <h3 className="text-sm sm:text-base font-extrabold text-zinc-100">
            No Active 24-Hour Goal Set
          </h3>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Commit your daily study targets to start your continuous 24-hour cycle.
          </p>
        </div>

        {onOpenCreateModal && (
          <div className="pt-1">
            <Button
              variant="primary"
              size="md"
              onClick={onOpenCreateModal}
              className="space-x-2 font-bold text-xs bg-violet-600 hover:bg-violet-500 text-white shadow-md shadow-violet-500/20 px-5 py-2.5 rounded-xl transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Start 24-Hour Goal Set</span>
            </Button>
          </div>
        )}
      </div>
    );
  }

  const tasks: GoalTask[] = goal.tasks || [];
  const completedCount = tasks.filter((t) => t.completed).length;
  const totalCount = tasks.length;
  const completionPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const isWarnZone = countdown.remainingSeconds <= 7200 && countdown.remainingSeconds > 0;

  return (
    <div className="w-full bg-zinc-900/85 border border-zinc-800 rounded-2xl p-3.5 sm:p-4 shadow-xl space-y-3 backdrop-blur-md relative">
      {/* Sleek Integrated Header & Status Pill */}
      <div className="space-y-2.5 border-b border-zinc-800/80 pb-3">
        {/* Row 1: Title & Countdown */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center space-x-2 min-w-0">
            <div className="p-1.5 rounded-lg bg-violet-500/10 border border-violet-500/25 text-violet-400 shrink-0">
              <Lock className="w-3.5 h-3.5" />
            </div>
            <div className="flex items-center space-x-1.5 min-w-0">
              <span className="w-2 h-2 rounded-full bg-violet-400 animate-pulse shrink-0" />
              <h2 className="text-xs sm:text-sm font-bold text-zinc-100 uppercase tracking-wider whitespace-nowrap">
                24h Window
              </h2>
            </div>
          </div>

          {/* Live Timer Pill */}
          <div
            className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-xl text-[11px] font-mono font-bold border shrink-0 shadow-sm ${
              isWarnZone
                ? "bg-rose-500/15 text-rose-300 border-rose-500/40 animate-pulse"
                : countdown.isExpired
                ? "bg-zinc-900 text-zinc-400 border-zinc-700"
                : "bg-violet-950/40 text-violet-300 border-violet-500/30"
            }`}
          >
            <Clock className="w-3 h-3" />
            <span className="whitespace-nowrap">{countdown.formattedText}</span>
          </div>
        </div>

        {/* Row 2: Progress Stats & Bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-zinc-400">
            <span>Task Completion</span>
            <span className="font-mono font-bold text-violet-300">
              {completedCount} / {totalCount} ({completionPct}%)
            </span>
          </div>
          <div className="w-full h-1.5 bg-zinc-950 rounded-full overflow-hidden border border-zinc-800/80">
            <div
              className="h-full bg-gradient-to-r from-violet-500 via-fuchsia-500 to-violet-400 rounded-full transition-all duration-500 shadow-sm shadow-violet-500/20"
              style={{ width: `${completionPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Task Cards List (Front & Center) */}
      <div className="space-y-2">
        {tasks.map((taskItem, idx) => (
          <div
            key={taskItem.id}
            className={`p-3 rounded-xl border flex items-center justify-between text-xs transition-all ${
              taskItem.completed
                ? "bg-violet-950/20 border-violet-500/30 text-violet-200/90 shadow-sm"
                : "bg-zinc-950/80 hover:bg-zinc-900/80 border-zinc-800 text-zinc-100 shadow-sm"
            }`}
          >
            <div className="flex items-center space-x-2.5 min-w-0 flex-1">
              {taskItem.completed ? (
                <div className="p-0.5 rounded-full bg-violet-500/20 text-violet-400 shrink-0">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              ) : (
                <div className="p-0.5 text-zinc-500 shrink-0">
                  <Circle className="w-4 h-4" />
                </div>
              )}
              <span
                className={`font-semibold leading-snug break-words ${
                  taskItem.completed ? "line-through text-zinc-400" : "text-zinc-100"
                }`}
              >
                {taskItem.task}
              </span>
            </div>

            <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400 ml-2 shrink-0">
              #{idx + 1}
            </span>
          </div>
        ))}
      </div>

      {/* Inline Add Goal Button */}
      {onOpenAddGoalModal && !countdown.isExpired && (
        <div className="pt-1">
          <Button
            size="sm"
            variant="secondary"
            onClick={onOpenAddGoalModal}
            className="w-full space-x-1.5 text-xs font-bold bg-zinc-950/80 hover:bg-zinc-900 border-dashed border-zinc-700 hover:border-violet-500/40 text-zinc-300 hover:text-violet-200 py-2 rounded-xl transition-all touch-manipulation"
          >
            <Plus className="w-3.5 h-3.5 text-violet-400" />
            <span>Add Goal to 24h Window</span>
          </Button>
        </div>
      )}
    </div>
  );
});
