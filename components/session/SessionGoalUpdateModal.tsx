"use client";

import React, { useState, useEffect } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { DailyGoal, GoalTask } from "@/lib/supabase/types";
import { formatDurationSeconds } from "@/lib/time/format";
import { CheckSquare, Square as UncheckedSquare, CheckCircle2, Clock, Sparkles } from "lucide-react";
import { triggerHapticFeedback } from "@/lib/utils/haptics";

export type SessionEndReason = "manual_stop" | "session_limit" | "break_expired";

interface SessionGoalUpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmSaveGoals: (completedTaskIds: string[]) => Promise<void>;
  activeGoal: DailyGoal | null;
  savedStudySeconds?: number;
  reason?: SessionEndReason | string;
  isLoading?: boolean;
}

export function SessionGoalUpdateModal({
  isOpen,
  onClose,
  onConfirmSaveGoals,
  activeGoal,
  savedStudySeconds = 0,
  reason = "manual_stop",
  isLoading = false,
}: SessionGoalUpdateModalProps) {
  const tasks: GoalTask[] = activeGoal?.tasks || [];
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset selected tasks whenever modal re-opens
  useEffect(() => {
    if (isOpen) {
      setSelectedTaskIds([]);
    }
  }, [isOpen]);

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
      console.error("Save goals error in session goal update modal:", err);
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
      console.error("Skip goals error in session goal update modal:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const hasSelectedTasks = selectedTaskIds.length > 0;

  // Title and subtitle tailored to how the session ended
  let title = "Finish Your Study Session";
  let subtitle = "Your active study time has been recorded";
  let bannerLabel = "Session Study Time Credited";
  let bannerSub = "Timestamp recorded authoritatively";

  if (reason === "session_limit") {
    title = "3-Hour Session Completed";
    subtitle = "Study session reached the 3-hour maximum limit";
    bannerLabel = "3-Hour Max Session Credited";
    bannerSub = "Fair-play cap applied to preserve rankings";
  } else if (reason === "break_expired") {
    title = "1-Hour Break Limit Exceeded";
    subtitle = "Session ended after 1-hour break inactivity limit";
    bannerLabel = "Study Time Before Break Saved";
    bannerSub = "Break duration excluded from study time";
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      closeOnBackdropClick={false}
      hideCloseButton={false}
    >
      <div className="space-y-5">
        <p className="text-xs text-zinc-400 leading-relaxed">
          {reason === "session_limit"
            ? "To ensure fair rankings and prevent unattended timers, study sessions are capped at 3 hours. Your study time is safe! Mark any goals you achieved."
            : reason === "break_expired"
            ? "You stayed on break for more than 1 hour. Your study time before the break has been credited. Mark what you accomplished."
            : "What did you accomplish during this study session? Checked tasks will be recorded in your rolling 20-hour goal set and credited to your session log."}
        </p>

        {/* Saved Session Stats Banner */}
        <div className="p-3.5 bg-gradient-to-r from-violet-950/50 via-zinc-900 to-fuchsia-950/40 border border-violet-500/30 rounded-xl flex items-center justify-between gap-2 flex-wrap text-xs shadow-inner">
          <div className="flex items-center space-x-2.5 min-w-0 flex-1">
            <div className="w-7 h-7 rounded-lg bg-violet-500/20 border border-violet-500/40 flex items-center justify-center text-violet-400 shrink-0">
              <Clock className="w-4 h-4" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-zinc-200 font-bold break-words">{bannerLabel}</span>
              <span className="text-[10px] text-zinc-400 font-medium break-words">{bannerSub}</span>
            </div>
          </div>
          <span className="font-mono text-violet-300 font-black text-sm sm:text-base tracking-tight drop-shadow-[0_0_8px_rgba(167,139,250,0.3)] shrink-0 tabular-nums whitespace-nowrap">
            {formatDurationSeconds(savedStudySeconds)}
          </span>
        </div>

        {/* 20-Hour Goal Checklist */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between flex-wrap gap-1.5">
            <label className="block text-sm sm:text-base font-extrabold text-zinc-100 tracking-tight">
              How many Goals did you complete ?
            </label>
            <div className="flex items-center space-x-1.5">
              {activeGoal && new Date(activeGoal.expires_at).getTime() <= Date.now() && (
                <span className="text-[10px] uppercase font-bold text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800/60 shrink-0">
                  Window ended mid-session
                </span>
              )}
              {hasSelectedTasks && (
                <span className="text-[10px] font-bold text-violet-400 bg-violet-950/40 border border-violet-500/30 px-2 py-0.5 rounded-full">
                  {selectedTaskIds.length} selected
                </span>
              )}
            </div>
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
                        className={`text-xs break-words leading-relaxed font-medium ${
                          isCompleted
                            ? "line-through text-zinc-500"
                            : isSelected
                            ? "text-violet-200 font-semibold"
                            : "text-zinc-200"
                        }`}
                      >
                        {task.task}
                      </span>
                    </div>

                    {isCompleted && (
                      <span className="text-[10px] font-bold text-emerald-400/90 bg-emerald-950/30 border border-emerald-500/30 px-2 py-0.5 rounded-full shrink-0 ml-2">
                        Done
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="p-4 bg-zinc-900/40 border border-zinc-800 rounded-xl text-center text-xs text-zinc-500">
              No active 20-hour goals found. You can set new goals anytime from the Goals tab.
            </div>
          )}
        </div>

        {/* Modal Action Controls */}
        <div className="pt-3 border-t border-zinc-800/80 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 sm:gap-2.5">
          <Button
            type="button"
            variant="secondary"
            size="md"
            onClick={handleSkipGoals}
            disabled={isBusy}
            className="w-full sm:w-auto font-medium text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60"
          >
            End Without Goals
          </Button>

          <Button
            type="button"
            variant="primary"
            size="md"
            onClick={handleSaveWithGoals}
            isLoading={isBusy}
            disabled={isBusy}
            className="w-full sm:w-auto font-extrabold text-xs bg-violet-600 hover:bg-violet-500 text-white shadow-md shadow-violet-500/20 px-5 space-x-1.5"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{hasSelectedTasks ? `Save Goals (${selectedTaskIds.length})` : "Save Goals"}</span>
          </Button>
        </div>
      </div>
    </Modal>
  );
}
