"use client";

import React, { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { DailyGoal, GoalTask } from "@/lib/supabase/types";
import { formatDurationSeconds } from "@/lib/time/format";
import { CheckSquare, Square as UncheckedSquare, CheckCircle2, Clock, Play } from "lucide-react";
import { triggerHapticFeedback } from "@/lib/utils/haptics";

interface SessionLimitModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmSaveGoals: (completedTaskIds: string[]) => Promise<void>;
  activeGoal: DailyGoal | null;
  savedStudySeconds?: number;
  isStartingNewSession?: boolean;
  isLoading?: boolean;
}

export function SessionLimitModal({
  isOpen,
  onClose,
  onConfirmSaveGoals,
  activeGoal,
  savedStudySeconds = 10800,
  isStartingNewSession = false,
  isLoading = false,
}: SessionLimitModalProps) {
  const tasks: GoalTask[] = activeGoal?.tasks || [];
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isBusy = isLoading || isSubmitting;

  const toggleTask = (taskId: string, alreadyCompleted: boolean) => {
    if (alreadyCompleted || isBusy) return;
    triggerHapticFeedback(10);
    setSelectedTaskIds((prev) =>
      prev.includes(taskId) ? prev.filter((id) => id !== taskId) : [...prev, taskId]
    );
  };

  const handleSaveWithGoals = async () => {
    if (isBusy) return;
    setIsSubmitting(true);
    triggerHapticFeedback(25);
    try {
      await onConfirmSaveGoals(selectedTaskIds);
      setSelectedTaskIds([]);
      onClose();
    } catch (err) {
      console.error("Save goals error in limit modal:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSkipGoals = async () => {
    if (isBusy) return;
    setIsSubmitting(true);
    try {
      setSelectedTaskIds([]);
      await onConfirmSaveGoals([]);
      onClose();
    } catch (err) {
      console.error("Skip goals error in limit modal:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const hasSelectedTasks = selectedTaskIds.length > 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="3-Hour Session Completed"
      subtitle="Study session reached the 3-hour maximum limit"
    >
      <div className="space-y-5">
        <p className="text-xs text-zinc-400 leading-relaxed">
          To ensure fair rankings and prevent unattended timers, study sessions are capped at 3 hours. Your study time has been saved. Please mark which goals you accomplished during this session.
        </p>

        {/* Saved Session Stats Banner */}
        <div className="p-3.5 bg-gradient-to-r from-fuchsia-950/40 via-zinc-900 to-violet-950/40 border border-fuchsia-500/30 rounded-xl flex items-center justify-between gap-2 flex-wrap text-xs shadow-inner">
          <div className="flex items-center space-x-2.5 min-w-0 flex-1">
            <div className="w-7 h-7 rounded-lg bg-fuchsia-500/20 border border-fuchsia-500/40 flex items-center justify-center text-fuchsia-400 shrink-0">
              <Clock className="w-4 h-4" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-zinc-200 font-bold break-words">Session Study Time Credited</span>
              <span className="text-[10px] text-zinc-400 font-medium break-words">Fair play cap enforced</span>
            </div>
          </div>
          <span className="font-mono text-fuchsia-400 font-black text-sm sm:text-base tracking-tight drop-shadow-[0_0_8px_rgba(232,121,249,0.3)] shrink-0 tabular-nums whitespace-nowrap">
            {formatDurationSeconds(savedStudySeconds)}
          </span>
        </div>

        {/* 24-Hour Goal Checklist */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between flex-wrap gap-1.5">
            <label className="block text-sm sm:text-base font-extrabold text-zinc-100 tracking-tight">
              How many Goals did you complete ?
            </label>
            {hasSelectedTasks && (
              <span className="text-[10px] font-bold text-violet-400 bg-violet-950/40 border border-violet-500/30 px-2 py-0.5 rounded-full">
                {selectedTaskIds.length} selected
              </span>
            )}
          </div>

          {tasks.length > 0 ? (
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {tasks.map((task) => {
                const isSelected = selectedTaskIds.includes(task.id);
                const isCompleted = task.completed;

                return (
                  <button
                    key={task.id}
                    type="button"
                    disabled={isCompleted || isBusy}
                    onClick={() => toggleTask(task.id, isCompleted)}
                    className={`w-full flex items-center justify-between p-3 rounded-xl border text-left transition-all ${
                      isCompleted
                        ? "bg-zinc-900/30 border-zinc-800/40 opacity-60 cursor-not-allowed"
                        : isSelected
                        ? "bg-violet-950/40 border-violet-500/60 ring-1 ring-violet-500/30 shadow-[0_0_15px_rgba(139,92,246,0.15)]"
                        : "bg-zinc-900/70 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900"
                    }`}
                  >
                    <div className="flex items-center space-x-3 min-w-0 pr-2 flex-1">
                      <div className="shrink-0 text-zinc-400">
                        {isCompleted ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        ) : isSelected ? (
                          <CheckSquare className="w-4 h-4 text-violet-400" />
                        ) : (
                          <UncheckedSquare className="w-4 h-4 text-zinc-500" />
                        )}
                      </div>
                      <span
                        className={`text-xs sm:text-sm break-words leading-snug flex-1 ${
                          isCompleted
                            ? "line-through text-zinc-500"
                            : isSelected
                            ? "font-bold text-zinc-100"
                            : "text-zinc-300"
                        }`}
                      >
                        {task.task}
                      </span>
                    </div>

                    {isCompleted && (
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 shrink-0 px-1.5 py-0.5 rounded bg-emerald-950/40 border border-emerald-500/20">
                        Done
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="p-4 bg-zinc-900/40 border border-zinc-800/60 rounded-xl text-center space-y-1">
              <p className="text-xs text-zinc-400">No active goals locked for today.</p>
              <p className="text-[11px] text-zinc-500">
                You can start a new study session anytime from the main room.
              </p>
            </div>
          )}
        </div>

        {/* Modal Action Controls */}
        <div className="pt-2 flex items-center justify-end flex-wrap gap-2 sm:gap-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleSkipGoals}
            disabled={isBusy}
            className="text-xs text-zinc-400 hover:text-zinc-200"
          >
            Skip Goals
          </Button>

          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={handleSaveWithGoals}
            isLoading={isBusy}
            className="text-xs font-extrabold px-4 space-x-1.5"
          >
            {isStartingNewSession ? (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Save & Start New Session</span>
              </>
            ) : hasSelectedTasks ? (
              <span>Save Completed Goals</span>
            ) : (
              <span>Confirm & Close</span>
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
