"use client";

import React, { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Plus, Trash2, Lock } from "lucide-react";
import { validateGoalTasks } from "@/lib/validation/schemas";

interface CreateGoalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmCreate: (tasks: string[]) => Promise<void>;
  isLoading?: boolean;
}

export function CreateGoalModal({
  isOpen,
  onClose,
  onConfirmCreate,
  isLoading = false,
}: CreateGoalModalProps) {
  const [taskInputs, setTaskInputs] = useState<string[]>(["", "", ""]);
  const [error, setError] = useState<string | null>(null);

  const handleTaskChange = (index: number, value: string) => {
    setTaskInputs((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const addTaskField = () => {
    if (taskInputs.length >= 10) return;
    setTaskInputs((prev) => [...prev, ""]);
  };

  const removeTaskField = (index: number) => {
    if (taskInputs.length <= 1) return;
    setTaskInputs((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validation = validateGoalTasks(taskInputs);

    if (!validation.isValid) {
      setError(validation.error || "Invalid goals");
      return;
    }

    try {
      setError(null);
      await onConfirmCreate(validation.value);
      setTaskInputs(["", "", ""]);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create goal window");
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create 24-Hour Goal Window"
      subtitle="Set your study goals for the next 24 hours. Goals lock upon saving."
      fullScreenMobile
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
          {taskInputs.map((taskText, idx) => (
            <div key={idx} className="flex items-center space-x-2">
              <span className="text-xs font-bold text-zinc-500 w-5 text-right shrink-0">
                {idx + 1}.
              </span>
              <Input
                placeholder={`Task ${idx + 1} (e.g. Complete Chapter 5 PYQs)`}
                value={taskText}
                onChange={(e) => handleTaskChange(idx, e.target.value)}
                maxLength={120}
              />
              {taskInputs.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeTaskField(idx)}
                  className="p-2 text-zinc-500 hover:text-red-400 rounded-lg transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center shrink-0"
                  aria-label="Remove task"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>

        {taskInputs.length < 10 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={addTaskField}
            className="w-full text-xs space-x-1 border border-dashed border-zinc-800"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Another Task (Max 10)</span>
          </Button>
        )}

        {error && <p className="text-xs font-medium text-red-400">{error}</p>}

        <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-400 flex items-center space-x-2">
          <Lock className="w-4 h-4 text-zinc-400 shrink-0" />
          <span>
            Goals expire exactly 24 hours after creation. Task text cannot be edited once locked.
          </span>
        </div>

        <div className="pt-2 flex items-center justify-end space-x-3">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" isLoading={isLoading} className="font-extrabold px-5">
            Lock & Start 24h Window
          </Button>
        </div>
      </form>
    </Modal>
  );
}
