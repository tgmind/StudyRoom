"use client";

import React, { memo, useState, useCallback } from "react";
import { ExamPlanWithSlots, PreparationSlot } from "@/lib/supabase/types";
import { ExamCard } from "./ExamCard";
import { Plus, BookOpen } from "lucide-react";

interface ExamCardListProps {
  plans: ExamPlanWithSlots[];
  onEditExam: (plan: ExamPlanWithSlots) => void;
  onDeleteExam: (plan: ExamPlanWithSlots) => void;
  onToggleLock: (plan: ExamPlanWithSlots) => void;
  onToggleStreaksVisibility: (plan: ExamPlanWithSlots) => void;
  onAddSlot: (plan: ExamPlanWithSlots) => void;
  onEditSlot: (plan: ExamPlanWithSlots, slot: PreparationSlot) => void;
  onDeleteSlot: (plan: ExamPlanWithSlots, slot: PreparationSlot) => void;
  onReorder: (newOrderIds: string[]) => void;
  onCreateClick: () => void;
}

export const ExamCardList = memo(function ExamCardList({
  plans,
  onEditExam,
  onDeleteExam,
  onToggleLock,
  onToggleStreaksVisibility,
  onAddSlot,
  onEditSlot,
  onDeleteSlot,
  onReorder,
  onCreateClick,
}: ExamCardListProps) {
  const [draggedPlanId, setDraggedPlanId] = useState<string | null>(null);

  const handleDragStart = useCallback((id: string) => (e: React.DragEvent) => {
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.effectAllowed = "move";
    setDraggedPlanId(id);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const handleDrop = useCallback(
    (targetId: string) => (e: React.DragEvent) => {
      e.preventDefault();
      const sourceId = e.dataTransfer.getData("text/plain") || draggedPlanId;
      setDraggedPlanId(null);

      if (!sourceId || sourceId === targetId) return;

      const sourceIndex = plans.findIndex((p) => p.id === sourceId);
      const targetIndex = plans.findIndex((p) => p.id === targetId);
      if (sourceIndex === -1 || targetIndex === -1) return;

      // Reorder array
      const nextPlans = [...plans];
      const [moved] = nextPlans.splice(sourceIndex, 1);
      nextPlans.splice(targetIndex, 0, moved);

      onReorder(nextPlans.map((p) => p.id));
    },
    [plans, draggedPlanId, onReorder]
  );

  const handleMoveUp = useCallback(
    (index: number) => {
      if (index <= 0) return;
      const nextPlans = [...plans];
      const temp = nextPlans[index - 1];
      nextPlans[index - 1] = nextPlans[index];
      nextPlans[index] = temp;
      onReorder(nextPlans.map((p) => p.id));
    },
    [plans, onReorder]
  );

  const handleMoveDown = useCallback(
    (index: number) => {
      if (index >= plans.length - 1) return;
      const nextPlans = [...plans];
      const temp = nextPlans[index + 1];
      nextPlans[index + 1] = nextPlans[index];
      nextPlans[index] = temp;
      onReorder(nextPlans.map((p) => p.id));
    },
    [plans, onReorder]
  );

  if (plans.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-zinc-800/80 p-8 sm:p-12 text-center space-y-4 bg-zinc-950/40">
        <div className="mx-auto w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-amber-400 shadow-inner">
          <BookOpen className="w-6 h-6" />
        </div>

        <div className="space-y-1.5 max-w-md mx-auto">
          <h3 className="text-base sm:text-lg font-black text-zinc-100">
            No Exam Plans Yet
          </h3>
          <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
            Create your first target exam plan, define preparation phases, track days remaining, and project your schedule onto your Streaks calendar.
          </p>
        </div>

        <button
          type="button"
          onClick={onCreateClick}
          className="inline-flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-white hover:bg-zinc-200 active:scale-95 text-zinc-950 text-xs sm:text-sm font-black shadow-lg transition-all cursor-pointer select-none"
        >
          <Plus className="w-4 h-4 stroke-[2.75]" />
          <span>Create Your First Plan</span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3.5">
      <div className="flex items-center justify-between px-1 text-xs text-zinc-400">
        <span className="font-extrabold uppercase tracking-wider">
          Target Exams ({plans.length})
        </span>
        <span className="text-[11px] text-zinc-500 hidden sm:inline">
          Drag cards to set preparation priority
        </span>
      </div>

      <div className="space-y-3">
        {plans.map((plan, index) => (
          <ExamCard
            key={plan.id}
            plan={plan}
            index={index}
            totalPlans={plans.length}
            onEditExam={onEditExam}
            onDeleteExam={onDeleteExam}
            onToggleLock={onToggleLock}
            onToggleStreaksVisibility={onToggleStreaksVisibility}
            onAddSlot={onAddSlot}
            onEditSlot={onEditSlot}
            onDeleteSlot={onDeleteSlot}
            onMoveUp={() => handleMoveUp(index)}
            onMoveDown={() => handleMoveDown(index)}
            onDragStart={handleDragStart(plan.id)}
            onDragOver={handleDragOver}
            onDrop={handleDrop(plan.id)}
            isDragging={draggedPlanId === plan.id}
          />
        ))}
      </div>
    </div>
  );
});
