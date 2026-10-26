"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
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

interface TaskFieldItem {
  id: string;
  value: string;
}

let taskFieldIdCounter = 0;
function createNewTaskField(): TaskFieldItem {
  taskFieldIdCounter += 1;
  return {
    id: `add-task-row-${Date.now()}-${taskFieldIdCounter}`,
    value: "",
  };
}

export function AddGoalModal({
  isOpen,
  onClose,
  onConfirmAdd,
  isLoading = false,
}: AddGoalModalProps) {
  const [taskFields, setTaskFields] = useState<TaskFieldItem[]>([createNewTaskField()]);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const pendingFocusIdRef = useRef<string | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setIsSubmitting(false);
      setError(null);
      setTaskFields([createNewTaskField()]);
    }
  }, [isOpen]);

  const handleTaskChange = useCallback((id: string, value: string) => {
    setTaskFields((prev) =>
      prev.map((field) => (field.id === id ? { ...field, value } : field))
    );
  }, []);

  const addTaskField = useCallback(() => {
    setTaskFields((prev) => {
      if (prev.length >= 5 || isSubmitting || isLoading) return prev;
      const newField = createNewTaskField();
      pendingFocusIdRef.current = newField.id;
      return [...prev, newField];
    });
  }, [isSubmitting, isLoading]);

  useEffect(() => {
    if (pendingFocusIdRef.current) {
      const el = inputRefs.current.get(pendingFocusIdRef.current);
      if (el && typeof el.focus === "function") {
        el.focus();
      }
      pendingFocusIdRef.current = null;
    }
  }, [taskFields]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting || isLoading) return;

    const rawTasks = taskFields.map((f) => f.value);
    const validation = validateGoalTasks(rawTasks);

    if (!validation.isValid) {
      setError(validation.error || "Invalid goal task");
      return;
    }

    setIsSubmitting(true);
    try {
      setError(null);
      await onConfirmAdd(validation.value);
      setTaskFields([createNewTaskField()]);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add goals");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Add Goals to 20-Hour Window"
      subtitle="Append additional tasks to your current active 20-hour commitment window."
      fullScreenMobile
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
          {taskFields.map((field, idx) => (
            <div key={field.id} className="flex items-center space-x-2">
              <span className="text-xs font-bold text-violet-400 w-5 text-right shrink-0">
                +{idx + 1}
              </span>
              <Input
                ref={(el) => {
                  if (el) {
                    inputRefs.current.set(field.id, el);
                  } else {
                    inputRefs.current.delete(field.id);
                  }
                }}
                placeholder="New Task (e.g. Solve 20 organic chemistry questions)"
                value={field.value}
                onChange={(e) => handleTaskChange(field.id, e.target.value)}
                maxLength={120}
                disabled={isLoading || isSubmitting}
                autoFocus={idx === 0}
              />
            </div>
          ))}
        </div>

        {taskFields.length < 5 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={addTaskField}
            disabled={isLoading || isSubmitting}
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
            <strong>Accountability Rule:</strong> Once added, goals cannot be deleted. If unfinished when the 20-hour window expires, they count against your weekly Leaderboard completion rate.
          </span>
        </div>

        <div className="pt-2 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 sm:gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={isLoading || isSubmitting}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            isLoading={isLoading || isSubmitting}
            disabled={isLoading || isSubmitting}
            className="w-full sm:w-auto font-extrabold px-5"
          >
            Append to Active Window
          </Button>
        </div>
      </form>
    </Modal>
  );
}
