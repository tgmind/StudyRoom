"use client";

import React, { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { DailyGoal, GoalTask } from "@/lib/supabase/types";
import { formatDurationSeconds } from "@/lib/time/format";
import { CheckSquare, Square as UncheckedSquare, CheckCircle2 } from "lucide-react";

interface StopHookModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmFinish: (completedTaskIds: string[]) => Promise<void>;
  activeGoal: DailyGoal | null;
  elapsedSeconds: number;
  isLoading?: boolean;
}

export function StopHookModal({
  isOpen,
  onClose,
  onConfirmFinish,
  activeGoal,
  elapsedSeconds,
  isLoading = false,
}: StopHookModalProps) {
  const tasks: GoalTask[] = activeGoal?.tasks || [];
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);

  // Toggle task selection
  const toggleTask = (taskId: string, alreadyCompleted: boolean) => {
    if (alreadyCompleted) return;
    setSelectedTaskIds((prev) =>
      prev.includes(taskId) ? prev.filter((id) => id !== taskId) : [...prev, taskId]
    );
  };

  const handleFinish = async () => {
    const newlyCompleted = selectedTaskIds;
    await onConfirmFinish(newlyCompleted);
    setSelectedTaskIds([]);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Finish Your Study Session">
      <div className="space-y-5">
        <p className="text-xs text-zinc-400">
          What did you accomplish during this session? Checked tasks will be recorded in your rolling 24-hour goal set.
        </p>

        {/* Session Stats Banner */}
        <div className="p-3.5 bg-zinc-900 border border-zinc-800 rounded-xl flex items-center justify-between text-xs">
          <span className="text-zinc-400 font-medium">Session Active Study Time</span>
          <span className="font-mono text-emerald-400 font-extrabold text-sm">
            {formatDurationSeconds(elapsedSeconds)}
          </span>
        </div>

        {/* 24-Hour Goal Checklist */}
        <div className="space-y-2">
          <label className="block text-xs font-bold uppercase tracking-wider text-zinc-300">
            Active 24-Hour Goal Tasks
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
                        ? "bg-emerald-950/30 border-emerald-500/60 text-emerald-200"
                        : "bg-zinc-900 border-zinc-800 text-zinc-200 hover:border-zinc-700"
                    }`}
                  >
                    <div className="flex items-center space-x-2.5 min-w-0 flex-1">
                      {isAlreadyCompleted ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                      ) : isSelected ? (
                        <CheckSquare className="w-4 h-4 text-emerald-400 shrink-0" />
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
                      <span className="text-[10px] uppercase font-bold text-emerald-500 bg-emerald-950/50 px-2 py-0.5 rounded border border-emerald-800/40 shrink-0">
                        Done
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Action Controls (High-Visibility Solid Buttons) */}
        <div className="pt-3 border-t border-zinc-800 flex items-center justify-end space-x-3">
          <Button variant="secondary" size="md" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={handleFinish}
            isLoading={isLoading}
            className="px-6 font-extrabold shadow-md text-zinc-950 bg-zinc-100 hover:bg-white"
          >
            Finish Session
          </Button>
        </div>
      </div>
    </Modal>
  );
}
