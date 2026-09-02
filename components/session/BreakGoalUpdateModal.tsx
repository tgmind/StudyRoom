"use client";

import React, { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { DailyGoal, GoalTask } from "@/lib/supabase/types";
import { formatDurationSeconds } from "@/lib/time/format";
import { CheckSquare, Square as UncheckedSquare, CheckCircle2, Clock, Play } from "lucide-react";

interface BreakGoalUpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmSaveGoals: (completedTaskIds: string[]) => Promise<void>;
  activeGoal: DailyGoal | null;
  savedStudySeconds: number;
  isStartingNewSession?: boolean;
  isLoading?: boolean;
}

export function BreakGoalUpdateModal({
  isOpen,
  onClose,
  onConfirmSaveGoals,
  activeGoal,
  savedStudySeconds,
  isStartingNewSession = false,
  isLoading = false,
}: BreakGoalUpdateModalProps) {
  const tasks: GoalTask[] = activeGoal?.tasks || [];
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isBusy = isLoading || isSubmitting;

  // Toggle task selection
  const toggleTask = (taskId: string, alreadyCompleted: boolean) => {
    if (alreadyCompleted || isBusy) return;
    setSelectedTaskIds((prev) =>
      prev.includes(taskId) ? prev.filter((id) => id !== taskId) : [...prev, taskId]
    );
  };

  const handleSaveWithGoals = async () => {
    if (isBusy) return;
    setIsSubmitting(true);
    try {
      const newlyCompleted = selectedTaskIds;
      await onConfirmSaveGoals(newlyCompleted);
      setSelectedTaskIds([]);
      onClose();
    } catch (err) {
      console.error("Save goals error in modal:", err);
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
      console.error("Skip goals error in modal:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const hasSelectedTasks = selectedTaskIds.length > 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Update Your Goals"
      subtitle="Session ended after 1-hour break limit"
    >
      <div className="space-y-5">
        <p className="text-xs text-zinc-400">
          Did you accomplish any goals during your study session before the break? Checked tasks will be recorded in your rolling 24-hour goal set.
        </p>

        {/* Saved Session Stats Banner */}
        <div className="p-3.5 bg-zinc-900 border border-zinc-800 rounded-xl flex items-center justify-between text-xs">
          <div className="flex items-center space-x-2">
            <Clock className="w-4 h-4 text-violet-400 shrink-0" />
            <span className="text-zinc-300 font-medium">Session Active Study Time Saved</span>
          </div>
          <span className="font-mono text-violet-400 font-extrabold text-sm">
            {formatDurationSeconds(savedStudySeconds)}
          </span>
        </div>

        {/* 24-Hour Goal Checklist */}
        <div className="space-y-2.5">
          <label className="block text-sm sm:text-base font-extrabold text-zinc-100 tracking-tight">
            How many Goals did you complete ?
          </label>

          {tasks.length === 0 ? (
            <div className="p-4 bg-zinc-900/40 border border-zinc-800 rounded-xl text-center text-xs text-zinc-500">
              No active 24-hour goals found. You can set goals anytime from the Goals tab.
            </div>
          ) : (
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {tasks.map((taskItem) => {
                const isAlreadyCompleted = taskItem.completed;
                const isSelected = selectedTaskIds.includes(taskItem.id);

                return (
                  <div
                    key={taskItem.id}
                    onClick={() => toggleTask(taskItem.id, isAlreadyCompleted)}
                    className={`w-full p-3 rounded-xl border flex items-center justify-between text-xs transition-all cursor-pointer select-none ${
                      isAlreadyCompleted
                        ? "bg-zinc-900/40 border-zinc-800/80 text-zinc-500 opacity-80 cursor-not-allowed"
                        : isSelected
                        ? "bg-violet-950/40 border-violet-500/60 text-violet-200"
                        : "bg-zinc-900 border-zinc-800 text-zinc-200 hover:border-zinc-700"
                    }`}
                  >
                    <div className="flex items-center space-x-2.5 min-w-0 flex-1">
                      {isAlreadyCompleted ? (
                        <CheckCircle2 className="w-4 h-4 text-violet-400 shrink-0" />
                      ) : isSelected ? (
                        <CheckSquare className="w-4 h-4 text-violet-400 shrink-0" />
                      ) : (
                        <UncheckedSquare className="w-4 h-4 text-zinc-500 shrink-0" />
                      )}
                      <span
                        className={`truncate font-medium ${
                          isAlreadyCompleted ? "line-through text-zinc-500" : ""
                        }`}
                      >
                        {taskItem.task}
                      </span>
                    </div>

                    {isAlreadyCompleted && (
                      <span className="text-[10px] uppercase font-bold text-violet-300 bg-violet-950/50 px-2 py-0.5 rounded border border-violet-800/40 shrink-0">
                        Done
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Action Controls */}
        <div className="pt-3 border-t border-zinc-800 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 sm:gap-2.5">
          {/* Skip / End Without Goals */}
          <Button
            type="button"
            variant="secondary"
            size="md"
            onClick={handleSkipGoals}
            disabled={isBusy}
            className="w-full sm:w-auto px-4 font-bold text-xs bg-zinc-900 text-zinc-300 hover:bg-zinc-800 border-zinc-700"
          >
            {isStartingNewSession ? "Skip & Start New" : "Skip Goals"}
          </Button>

          {/* Primary Action Button */}
          {hasSelectedTasks ? (
            <Button
              type="button"
              variant="primary"
              size="md"
              onClick={handleSaveWithGoals}
              isLoading={isBusy}
              className="w-full sm:w-auto px-5 font-extrabold text-xs shadow-md bg-violet-600 hover:bg-violet-500 text-white border-violet-500 shadow-violet-600/20"
            >
              Save Goals ({selectedTaskIds.length})
            </Button>
          ) : isStartingNewSession ? (
            <Button
              type="button"
              variant="primary"
              size="md"
              onClick={handleSkipGoals}
              disabled={isBusy}
              className="w-full sm:w-auto px-5 font-extrabold text-xs shadow-md bg-zinc-100 text-zinc-950 hover:bg-white border-white flex items-center justify-center space-x-1.5"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Start New Session</span>
            </Button>
          ) : (
            <Button
              type="button"
              variant="primary"
              size="md"
              onClick={handleSkipGoals}
              disabled={isBusy}
              className="w-full sm:w-auto px-5 font-extrabold text-xs shadow-md bg-zinc-100 text-zinc-950 hover:bg-white border-white"
            >
              Done
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
