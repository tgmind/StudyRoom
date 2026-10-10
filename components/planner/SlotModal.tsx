"use client";

import React, { useState, useEffect } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ExamPlanWithSlots, PreparationSlot, SlotCategory } from "@/lib/supabase/types";
import { PRESET_SLOT_CATEGORIES } from "@/lib/planner/types";
import { validateSlot, formatReadableDate } from "@/lib/planner/calculations";
import { IndianDatePicker } from "./IndianDatePicker";

interface SlotModalProps {
  isOpen: boolean;
  onClose: () => void;
  plan: ExamPlanWithSlots | null;
  slotToEdit?: PreparationSlot | null;
  onSaveSlot: (data: {
    title: string;
    start_date: string;
    end_date: string;
    category: SlotCategory | string;
    color: string;
    description?: string | null;
  }) => Promise<void>;
  isLoading?: boolean;
}

const COLOR_PRESETS = [
  "#3b82f6", // Blue
  "#a855f7", // Violet
  "#f97316", // Orange
  "#14b8a6", // Teal
  "#ec4899", // Pink
  "#eab308", // Yellow
  "#10b981", // Emerald
  "#6366f1", // Indigo
  "#ef4444", // Red
];

export function SlotModal({
  isOpen,
  onClose,
  plan,
  slotToEdit,
  onSaveSlot,
  isLoading = false,
}: SlotModalProps) {
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [category, setCategory] = useState<SlotCategory>("syllabus");
  const [color, setColor] = useState("#3b82f6");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isEditing = Boolean(slotToEdit);

  useEffect(() => {
    if (isOpen) {
      if (slotToEdit) {
        setTitle(slotToEdit.title);
        setStartDate(slotToEdit.start_date);
        setEndDate(slotToEdit.end_date);
        setCategory((slotToEdit.category as SlotCategory) || "custom");
        setColor(slotToEdit.color || "#3b82f6");
        setDescription(slotToEdit.description || "");
      } else {
        setTitle("");
        setStartDate("");
        setEndDate("");
        setCategory("syllabus");
        setColor(PRESET_SLOT_CATEGORIES.syllabus.defaultColor);
        setDescription("");
      }
      setError(null);
      setIsSubmitting(false);
    }
  }, [isOpen, slotToEdit]);

  const handleCategorySelect = (selectedCat: SlotCategory) => {
    setCategory(selectedCat);
    setColor(PRESET_SLOT_CATEGORIES[selectedCat].defaultColor);
    if (!title || Object.values(PRESET_SLOT_CATEGORIES).some((m) => m.label === title)) {
      setTitle(PRESET_SLOT_CATEGORIES[selectedCat].label);
    }
  };

  if (!plan) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting || isLoading) return;

    if (!title.trim()) {
      setError("Slot title is required");
      return;
    }

    if (!startDate || !endDate) {
      setError("Start date and end date are both required");
      return;
    }

    // Validate dates & overlaps
    const val = validateSlot(
      { title: title.trim(), start_date: startDate, end_date: endDate },
      plan.slots,
      plan.exam_date,
      slotToEdit?.id
    );

    if (!val.isValid) {
      setError(val.error || "Invalid slot dates");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await onSaveSlot({
        title: title.trim(),
        start_date: startDate,
        end_date: endDate,
        category,
        color,
        description: description.trim() || null,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save preparation slot");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? "Edit Preparation Slot" : "Add Preparation Slot"}
      subtitle={`Plan: ${plan.exam_name} (Exam on ${formatReadableDate(plan.exam_date)})`}
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-xl bg-rose-950/40 border border-rose-500/40 p-3 text-xs text-rose-300">
            {error}
          </div>
        )}

        <div className="space-y-3">
          {/* Preset Categories */}
          <div>
            <label className="block text-xs font-bold text-zinc-300 mb-1.5">
              Category
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {(Object.keys(PRESET_SLOT_CATEGORIES) as SlotCategory[]).map(
                (catKey) => {
                  const meta = PRESET_SLOT_CATEGORIES[catKey];
                  const isSelected = category === catKey;
                  return (
                    <button
                      key={catKey}
                      type="button"
                      onClick={() => handleCategorySelect(catKey)}
                      className={`flex items-center space-x-2 px-2.5 py-2 rounded-xl border text-xs font-bold transition-all text-left ${
                        isSelected
                          ? "bg-zinc-800 border-white text-white shadow-sm ring-1 ring-white/50"
                          : "bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:bg-zinc-800/80 hover:text-zinc-200"
                      }`}
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: meta.defaultColor }}
                      />
                      <span className="truncate">{meta.label}</span>
                    </button>
                  );
                }
              )}
            </div>
          </div>

          {/* Slot Title */}
          <div>
            <label className="block text-xs font-bold text-zinc-300 mb-1">
              Slot Title <span className="text-amber-400">*</span>
            </label>
            <Input
              type="text"
              placeholder="e.g., Syllabus Covering, Revision Phase 1, Mock Test Series"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={isSubmitting || isLoading}
              required
            />
          </div>

          {/* Color Chooser */}
          <div>
            <label className="block text-xs font-bold text-zinc-300 mb-1.5">
              Visual Color
            </label>
            <div className="flex items-center space-x-2 flex-wrap gap-y-2">
              {COLOR_PRESETS.map((presetColor) => {
                const isSelected = color.toLowerCase() === presetColor.toLowerCase();
                return (
                  <button
                    key={presetColor}
                    type="button"
                    onClick={() => setColor(presetColor)}
                    className={`w-6 h-6 rounded-full transition-transform ${
                      isSelected ? "scale-125 ring-2 ring-white ring-offset-2 ring-offset-zinc-950" : "hover:scale-110"
                    }`}
                    style={{ backgroundColor: presetColor }}
                    aria-label={`Color ${presetColor}`}
                  />
                );
              })}
            </div>
          </div>

          {/* Date Boundaries */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <IndianDatePicker
                label="Start Date"
                required
                value={startDate}
                onChange={setStartDate}
                disabled={isSubmitting || isLoading}
                maxDate={plan.exam_date}
              />
            </div>
            <div>
              <IndianDatePicker
                label="End Date"
                required
                value={endDate}
                onChange={setEndDate}
                disabled={isSubmitting || isLoading}
                minDate={startDate || undefined}
                maxDate={plan.exam_date}
              />
            </div>
          </div>
          <p className="text-[10px] text-zinc-500">
            Dates are inclusive and must conclude on or before exam day ({formatReadableDate(plan.exam_date)}).
          </p>

          {/* Notes / Description */}
          <div>
            <label className="block text-xs font-bold text-zinc-300 mb-1">
              Description / Notes (Optional)
            </label>
            <textarea
              rows={2}
              placeholder="e.g., Focus on syllabus chapters 1 through 10, NCERT notes, and formula revisions."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isSubmitting || isLoading}
              className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-white transition-all resize-none"
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
            {isEditing ? "Save Changes" : "Create Slot"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
