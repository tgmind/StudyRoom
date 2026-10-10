"use client";

import React, { useState, useEffect } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ExamPlanWithSlots } from "@/lib/supabase/types";
import { validateExamDateChange } from "@/lib/planner/calculations";
import { IndianDatePicker } from "./IndianDatePicker";

interface EditExamModalProps {
  isOpen: boolean;
  onClose: () => void;
  plan: ExamPlanWithSlots | null;
  onConfirmEdit: (
    planId: string,
    updates: {
      exam_name: string;
      exam_date: string;
      description?: string | null;
      show_in_streaks: boolean;
    }
  ) => Promise<void>;
  isLoading?: boolean;
}

export function EditExamModal({
  isOpen,
  onClose,
  plan,
  onConfirmEdit,
  isLoading = false,
}: EditExamModalProps) {
  const [examName, setExamName] = useState("");
  const [examDate, setExamDate] = useState("");
  const [description, setDescription] = useState("");
  const [showInStreaks, setShowInStreaks] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen && plan) {
      setExamName(plan.exam_name);
      setExamDate(plan.exam_date);
      setDescription(plan.description || "");
      setShowInStreaks(plan.show_in_streaks);
      setError(null);
      setIsSubmitting(false);
    }
  }, [isOpen, plan]);

  if (!plan) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting || isLoading) return;

    if (!examName.trim()) {
      setError("Exam name is required");
      return;
    }

    if (!examDate) {
      setError("Exam date is required");
      return;
    }

    // Validate that the new exam date does not create conflicts with existing slots
    const val = validateExamDateChange(examDate, plan.slots);
    if (!val.isValid) {
      setError(val.error || "Invalid exam date");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await onConfirmEdit(plan.id, {
        exam_name: examName.trim(),
        exam_date: examDate,
        description: description.trim() || null,
        show_in_streaks: showInStreaks,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update exam plan");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Edit Exam Plan"
      subtitle={`Updating ${plan.exam_name}`}
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-xl bg-rose-950/40 border border-rose-500/40 p-3 text-xs text-rose-300">
            {error}
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-zinc-300 mb-1">
              Exam Name <span className="text-amber-400">*</span>
            </label>
            <Input
              type="text"
              value={examName}
              onChange={(e) => setExamName(e.target.value)}
              disabled={isSubmitting || isLoading}
              required
            />
          </div>

          <IndianDatePicker
            label="Exam Date"
            required
            value={examDate}
            onChange={setExamDate}
            disabled={isSubmitting || isLoading}
            hint="All preparation slots must conclude on or before this date."
          />

          <div>
            <label className="block text-xs font-bold text-zinc-300 mb-1">
              Description / Notes
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isSubmitting || isLoading}
              className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-white transition-all resize-none"
            />
          </div>

          <div className="flex items-center justify-between rounded-xl bg-zinc-900/60 border border-zinc-800/80 p-3">
            <div>
              <span className="text-xs font-bold text-zinc-200 block">
                Show in Streaks Calendar
              </span>
              <span className="text-[10px] text-zinc-400">
                Visualize preparation slots on Streaks page
              </span>
            </div>
            <input
              type="checkbox"
              checked={showInStreaks}
              onChange={(e) => setShowInStreaks(e.target.checked)}
              disabled={isSubmitting || isLoading}
              className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
            />
          </div>
        </div>

        <div className="flex items-center justify-end space-x-2 pt-3 border-t border-zinc-800">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={isSubmitting || isLoading}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            isLoading={isSubmitting || isLoading}
          >
            Update Exam Plan
          </Button>
        </div>
      </form>
    </Modal>
  );
}
