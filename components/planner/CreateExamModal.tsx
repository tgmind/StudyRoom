"use client";

import React, { useState, useEffect } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PRESET_SLOT_CATEGORIES } from "@/lib/planner/types";
import { SlotCategory } from "@/lib/supabase/types";
import { validateSlot } from "@/lib/planner/calculations";
import { IndianDatePicker } from "./IndianDatePicker";
import { Plus, Calendar, Layers, ChevronDown, ChevronUp } from "lucide-react";

interface CreateExamModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmCreate: (data: {
    exam_name: string;
    exam_date: string;
    description?: string;
    show_in_streaks?: boolean;
    initial_slot?: {
      title: string;
      start_date: string;
      end_date: string;
      category?: SlotCategory;
      color?: string;
      description?: string;
    };
  }) => Promise<void>;
  isLoading?: boolean;
}

export function CreateExamModal({
  isOpen,
  onClose,
  onConfirmCreate,
  isLoading = false,
}: CreateExamModalProps) {
  const [examName, setExamName] = useState("");
  const [examDate, setExamDate] = useState("");
  const [description, setDescription] = useState("");
  const [showInStreaks, setShowInStreaks] = useState(true);

  // Optional initial slot state
  const [showInitialSlot, setShowInitialSlot] = useState(false);
  const [slotTitle, setSlotTitle] = useState("");
  const [slotStartDate, setSlotStartDate] = useState("");
  const [slotEndDate, setSlotEndDate] = useState("");
  const [slotCategory, setSlotCategory] = useState<SlotCategory>("syllabus");
  const [slotDescription, setSlotDescription] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setExamName("");
      setExamDate("");
      setDescription("");
      setShowInStreaks(true);
      setShowInitialSlot(false);
      setSlotTitle("");
      setSlotStartDate("");
      setSlotEndDate("");
      setSlotCategory("syllabus");
      setSlotDescription("");
      setError(null);
      setIsSubmitting(false);
    }
  }, [isOpen]);

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

    let initialSlotData: any = undefined;
    if (showInitialSlot && slotTitle.trim()) {
      if (!slotStartDate || !slotEndDate) {
        setError("Both start date and end date are required for the initial slot");
        return;
      }

      const val = validateSlot(
        { title: slotTitle, start_date: slotStartDate, end_date: slotEndDate },
        [],
        examDate
      );

      if (!val.isValid) {
        setError(val.error || "Invalid slot dates");
        return;
      }

      const categoryMeta = PRESET_SLOT_CATEGORIES[slotCategory];

      initialSlotData = {
        title: slotTitle.trim(),
        start_date: slotStartDate,
        end_date: slotEndDate,
        category: slotCategory,
        color: categoryMeta.defaultColor,
        description: slotDescription.trim() || undefined,
      };
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await onConfirmCreate({
        exam_name: examName.trim(),
        exam_date: examDate,
        description: description.trim() || undefined,
        show_in_streaks: showInStreaks,
        initial_slot: initialSlotData,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create exam plan");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create Exam Plan"
      subtitle="Define your target exam and start organizing preparation phases"
      maxWidth="lg"
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
              placeholder="e.g., SSC CGL, UPSC Prelims, GATE, CFA Level 1"
              value={examName}
              onChange={(e) => setExamName(e.target.value)}
              disabled={isSubmitting || isLoading}
              autoFocus
              required
            />
          </div>

          <IndianDatePicker
            label="Exam Date"
            required
            value={examDate}
            onChange={setExamDate}
            disabled={isSubmitting || isLoading}
            hint="Select the final examination day. All preparation slots must conclude on or before this date."
          />

          <div>
            <label className="block text-xs font-bold text-zinc-300 mb-1">
              Description / Notes (Optional)
            </label>
            <textarea
              rows={2}
              placeholder="e.g., Target: 160+ in Tier-1. Focus on Quantitative Aptitude & GS."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isSubmitting || isLoading}
              className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-white focus:border-transparent transition-all resize-none"
            />
          </div>

          <div className="flex items-center justify-between rounded-xl bg-zinc-900/60 border border-zinc-800/80 p-3">
            <div>
              <span className="text-xs font-bold text-zinc-200 block">
                Show in Streaks Calendar
              </span>
              <span className="text-[10px] text-zinc-400">
                Display this exam and preparation slots in your Streaks timeline
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

          {/* Optional Initial Slot Expansion */}
          <div className="pt-2 border-t border-zinc-800/80">
            <button
              type="button"
              onClick={() => setShowInitialSlot((prev) => !prev)}
              className="flex items-center justify-between w-full text-xs font-bold text-zinc-300 hover:text-zinc-100 py-1"
            >
              <span className="flex items-center space-x-1.5">
                <Layers className="w-3.5 h-3.5 text-amber-400" />
                <span>Add Initial Preparation Slot (Optional)</span>
              </span>
              {showInitialSlot ? (
                <ChevronUp className="w-4 h-4 text-zinc-500" />
              ) : (
                <ChevronDown className="w-4 h-4 text-zinc-500" />
              )}
            </button>

            {showInitialSlot && (
              <div className="mt-3 p-3.5 rounded-xl bg-zinc-900/40 border border-zinc-800/80 space-y-3 animate-in fade-in-50 duration-150">
                <div>
                  <label className="block text-[11px] font-bold text-zinc-400 mb-1">
                    Slot Title
                  </label>
                  <Input
                    type="text"
                    placeholder="e.g., Syllabus Coverage, Round 1 Revision"
                    value={slotTitle}
                    onChange={(e) => setSlotTitle(e.target.value)}
                    disabled={isSubmitting || isLoading}
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-zinc-400 mb-1">
                    Category
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                    {(Object.keys(PRESET_SLOT_CATEGORIES) as SlotCategory[]).map(
                      (catKey) => {
                        const meta = PRESET_SLOT_CATEGORIES[catKey];
                        const isSelected = slotCategory === catKey;
                        return (
                          <button
                            key={catKey}
                            type="button"
                            onClick={() => setSlotCategory(catKey)}
                            className={`flex items-center space-x-1.5 px-2 py-1.5 rounded-lg border text-[11px] font-bold transition-all text-left ${
                              isSelected
                                ? "bg-zinc-800 border-white text-white"
                                : "bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:bg-zinc-850"
                            }`}
                          >
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: meta.defaultColor }}
                            />
                            <span className="truncate">{meta.label}</span>
                          </button>
                        );
                      }
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <IndianDatePicker
                      label="Start Date"
                      value={slotStartDate}
                      onChange={setSlotStartDate}
                      disabled={isSubmitting || isLoading}
                      maxDate={examDate || undefined}
                    />
                  </div>
                  <div>
                    <IndianDatePicker
                      label="End Date"
                      value={slotEndDate}
                      onChange={setSlotEndDate}
                      disabled={isSubmitting || isLoading}
                      minDate={slotStartDate || undefined}
                      maxDate={examDate || undefined}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-zinc-400 mb-1">
                    Slot Notes (Optional)
                  </label>
                  <Input
                    type="text"
                    placeholder="e.g., Complete chapters 1-15 and solved examples"
                    value={slotDescription}
                    onChange={(e) => setSlotDescription(e.target.value)}
                    disabled={isSubmitting || isLoading}
                  />
                </div>
              </div>
            )}
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
            Save Exam Plan
          </Button>
        </div>
      </form>
    </Modal>
  );
}
