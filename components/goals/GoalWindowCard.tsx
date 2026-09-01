"use client";

import React, { memo } from "react";
import { DailyGoal, GoalTask } from "@/lib/supabase/types";
import { GoalCountdownResult } from "@/lib/time/countdown";
import { Button } from "@/components/ui/Button";
import { CheckCircle2, Circle, Clock, Lock, Sparkles, Plus } from "lucide-react";

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
      <div className="p-8 bg-zinc-900/70 border border-zinc-800/90 rounded-2xl text-center space-y-3 shadow-xl backdrop-blur-md">
        <div className="p-3 rounded-2xl bg-zinc-950/80 border border-zinc-800 w-12 h-12 mx-auto flex items-center justify-center text-zinc-500">
          <Lock className="w-6 h-6" />
        </div>
        <h3 className="text-xs sm:text-sm font-extrabold text-zinc-200">
          No Active 24-Hour Goal Set
        </h3>
        <p className="text-[11px] text-zinc-400 max-w-xs mx-auto">
          Create a 24-hour goal window to commit your daily study targets. Goals cannot be deleted to ensure real accountability!
        </p>

        {onOpenCreateModal && (
          <div className="pt-2">
            <Button
              variant="primary"
              size="md"
              onClick={onOpenCreateModal}
              className="space-x-2 font-extrabold text-xs shadow-md"
            >
              <Plus className="w-4 h-4" />
              <span>Create 24-Hour Goal Set</span>
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
    <div className="w-full bg-zinc-900/70 border border-zinc-800/90 rounded-2xl p-4 sm:p-5 shadow-xl space-y-4 backdrop-blur-md">
      {/* Header & Expiration Countdown */}
      <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3 gap-2">
        <div className="flex items-center space-x-2 min-w-0">
          <Lock className="w-4 h-4 text-emerald-400 shrink-0" />
          <h2 className="text-xs sm:text-sm font-extrabold text-zinc-100 uppercase tracking-wider truncate">
            Active 24h Window
          </h2>
        </div>

        <div
          className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[10px] sm:text-xs font-mono font-bold border shrink-0 ${
            isWarnZone
              ? "bg-amber-500/10 text-amber-300 border-amber-500/30 animate-pulse"
              : countdown.isExpired
              ? "bg-rose-500/10 text-rose-300 border-rose-500/30"
              : "bg-zinc-950/80 text-zinc-300 border-zinc-800"
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>{countdown.formattedText}</span>
        </div>
      </div>

      {/* Progress Bar & Percentage Readout */}
      <div className="space-y-2">
        <div className="flex justify-between items-center text-xs">
          <span className="text-zinc-400 font-semibold flex items-center space-x-1">
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            <span>Task Completion</span>
          </span>
          <span className="font-mono text-zinc-100 font-black">
            {completedCount} / {totalCount} ({completionPct}%)
          </span>
        </div>

        <div className="w-full h-2.5 bg-zinc-950/80 border border-zinc-800/80 rounded-full overflow-hidden p-0.5">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all duration-500 shadow-sm"
            style={{ width: `${completionPct}%` }}
          />
        </div>
      </div>

      {/* Immutable Task List (Strictly No Delete Option) */}
      <div className="space-y-2">
        {tasks.map((taskItem, idx) => (
          <div
            key={taskItem.id}
            className={`p-3 rounded-xl border flex items-center justify-between text-xs transition-all ${
              taskItem.completed
                ? "bg-zinc-950/40 border-zinc-800/60 text-zinc-500 line-through"
                : "bg-zinc-950/80 border-zinc-800/90 text-zinc-200"
            }`}
          >
            <div className="flex items-center space-x-2.5 min-w-0 flex-1">
              {taskItem.completed ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <Circle className="w-4 h-4 text-zinc-600 shrink-0" />
              )}
              <span className="truncate font-medium">{taskItem.task}</span>
            </div>

            <span className="text-[10px] font-mono text-zinc-600 ml-2 shrink-0 font-bold">
              #{idx + 1}
            </span>
          </div>
        ))}
      </div>

      {/* Add Goal to Current 24h Window Action */}
      {onOpenAddGoalModal && !countdown.isExpired && (
        <div className="pt-2 border-t border-zinc-800/80 flex justify-end">
          <Button
            size="sm"
            variant="secondary"
            onClick={onOpenAddGoalModal}
            className="space-x-1.5 text-xs font-extrabold bg-zinc-900 border-zinc-700 text-zinc-200 hover:bg-zinc-800 hover:text-white"
          >
            <Plus className="w-3.5 h-3.5 text-emerald-400" />
            <span>Add Goal to 24h Window</span>
          </Button>
        </div>
      )}
    </div>
  );
});
