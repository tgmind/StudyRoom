"use client";

import React, { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Plus, ShieldAlert } from "lucide-react";
import { validateGoalTasks } from "@/lib/validation/schemas";

interface AddGoalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmAdd: (tasks: string[]) => Promise<void>;
  isLoading?: boolean;
}

export function AddGoalModal({
  isOpen,
  onClose,
  onConfirmAdd,
  isLoading = false,
}: AddGoalModalProps) {
  const [taskInputs, setTaskInputs] = useState<string[]>([""]);
  const [error, setError] = useState<string | null>(null);

  const handleTaskChange = (index: number, value: string) => {
    setTaskInputs((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const addTaskField = () => {
    if (taskInputs.length >= 5) return;
    setTaskInputs((prev) => [...prev, ""]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validation = validateGoalTasks(taskInputs);

    if (!validation.isValid) {
      setError(validation.error || "Invalid goal task");
      return;
    }

    try {
      setError(null);
      await onConfirmAdd(validation.value);
      setTaskInputs([""]);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add goals");
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Add Goals to 24-Hour Window"
      subtitle="Append additional tasks to your current active 24-hour commitment window."
      fullScreenMobile
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
          {taskInputs.map((taskText, idx) => (
            <div key={idx} className="flex items-center space-x-2">
              <span className="text-xs font-bold text-violet-400 w-5 text-right shrink-0">
                +{idx + 1}
              </span>
              <Input
                placeholder={`New Task (e.g. Solve 20 organic chemistry questions)`}
                value={taskText}
                onChange={(e) => handleTaskChange(idx, e.target.value)}
                maxLength={120}
                autoFocus={idx === 0}
              />
            </div>
          ))}
        </div>

        {taskInputs.length < 5 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={addTaskField}
            className="w-full text-xs space-x-1 border border-dashed border-zinc-800"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Another Task</span>
          </Button>
        )}

        {error && <p className="text-xs font-medium text-red-400">{error}</p>}

        <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-400 flex items-start space-x-2">
          <ShieldAlert className="w-4 h-4 text-violet-400 shrink-0 mt-0.5" />
          <span>
            <strong>Accountability Rule:</strong> Once added, goals cannot be deleted. If unfinished when the 24-hour window expires, they count against your weekly Leaderboard completion rate.
          </span>
        </div>

        <div className="pt-2 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 sm:gap-3">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isLoading} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button type="submit" variant="primary" isLoading={isLoading} className="w-full sm:w-auto font-extrabold px-5">
            Append to Active Window
          </Button>
        </div>
      </form>
    </Modal>
  );
}
