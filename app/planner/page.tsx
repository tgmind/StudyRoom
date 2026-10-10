"use client";

import React, { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useExamPlans } from "@/hooks/useExamPlans";
import { TopHeader } from "@/components/navigation/TopHeader";
import { BottomNav } from "@/components/navigation/BottomNav";
import { PlannerHeader } from "@/components/planner/PlannerHeader";
import { PlanningInsights } from "@/components/planner/PlanningInsights";
import { ExamCardList } from "@/components/planner/ExamCardList";
import { CreateExamModal } from "@/components/planner/CreateExamModal";
import { EditExamModal } from "@/components/planner/EditExamModal";
import { SlotModal } from "@/components/planner/SlotModal";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { ExamPlanWithSlots, PreparationSlot, SlotCategory } from "@/lib/supabase/types";
import { Loader2, AlertTriangle } from "lucide-react";

export default function PlannerPage() {
  const { profile, user } = useAuth();
  const {
    plans,
    loading,
    actionLoading,
    error,
    insights,
    createExamPlan,
    updateExamPlan,
    deleteExamPlan,
    toggleLockPlan,
    toggleStreaksVisibility,
    reorderPlans,
    addSlot,
    updateSlot,
    deleteSlot,
  } = useExamPlans(user?.id);

  // Modals state
  const [isCreateExamOpen, setIsCreateExamOpen] = useState(false);
  const [editingExamPlan, setEditingExamPlan] = useState<ExamPlanWithSlots | null>(null);
  const [activePlanForSlot, setActivePlanForSlot] = useState<ExamPlanWithSlots | null>(null);
  const [editingSlot, setEditingSlot] = useState<PreparationSlot | null>(null);

  // Confirmation modal states
  const [planToDelete, setPlanToDelete] = useState<ExamPlanWithSlots | null>(null);
  const [slotToDelete, setSlotToDelete] = useState<{
    plan: ExamPlanWithSlots;
    slot: PreparationSlot;
  } | null>(null);

  // Handlers
  const handleCreatePlan = async (data: {
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
  }) => {
    await createExamPlan(data);
  };

  const handleEditExam = async (
    planId: string,
    updates: {
      exam_name: string;
      exam_date: string;
      description?: string | null;
      show_in_streaks: boolean;
    }
  ) => {
    await updateExamPlan(planId, updates);
  };

  const handleOpenAddSlot = (plan: ExamPlanWithSlots) => {
    setActivePlanForSlot(plan);
    setEditingSlot(null);
  };

  const handleOpenEditSlot = (plan: ExamPlanWithSlots, slot: PreparationSlot) => {
    setActivePlanForSlot(plan);
    setEditingSlot(slot);
  };

  const handleSaveSlot = async (slotData: {
    title: string;
    start_date: string;
    end_date: string;
    category: SlotCategory | string;
    color: string;
    description?: string | null;
  }) => {
    if (!activePlanForSlot) return;

    if (editingSlot) {
      await updateSlot(editingSlot.id, activePlanForSlot.id, slotData);
    } else {
      await addSlot(activePlanForSlot.id, slotData);
    }
  };

  const handleConfirmDeletePlan = async () => {
    if (!planToDelete) return;
    try {
      await deleteExamPlan(planToDelete.id);
      setPlanToDelete(null);
    } catch {
      // Error handled by hook
    }
  };

  const handleConfirmDeleteSlot = async () => {
    if (!slotToDelete) return;
    try {
      await deleteSlot(slotToDelete.slot.id, slotToDelete.plan.id);
      setSlotToDelete(null);
    } catch {
      // Error handled by hook
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-screen pb-24 bg-[#090a0f] text-zinc-100">
      <TopHeader profile={profile} />

      <main className="flex-1 w-full max-w-2xl sm:max-w-3xl lg:max-w-4xl px-3.5 sm:px-6 py-3.5 sm:py-5 mx-auto space-y-4 sm:space-y-5">
        {/* Header Bar */}
        <PlannerHeader
          onCreateClick={() => setIsCreateExamOpen(true)}
          activeExamsCount={insights.activeExamsCount}
        />

        {/* Global Hook Error Banner */}
        {error && (
          <div className="rounded-2xl bg-rose-950/30 border border-rose-500/30 p-3.5 text-xs text-rose-300 flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Loading Skeleton */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-3">
            <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
            <p className="text-xs font-semibold text-zinc-400">
              Loading your exam preparation plans...
            </p>
          </div>
        ) : (
          <>
            {/* Live Planning Insights Grid */}
            <PlanningInsights insights={insights} />

            {/* Exam Cards Collection */}
            <ExamCardList
              plans={plans}
              onEditExam={(plan) => setEditingExamPlan(plan)}
              onDeleteExam={(plan) => setPlanToDelete(plan)}
              onToggleLock={(plan) => toggleLockPlan(plan.id, plan.is_locked)}
              onToggleStreaksVisibility={(plan) =>
                toggleStreaksVisibility(plan.id, plan.show_in_streaks)
              }
              onAddSlot={handleOpenAddSlot}
              onEditSlot={handleOpenEditSlot}
              onDeleteSlot={(plan, slot) => setSlotToDelete({ plan, slot })}
              onReorder={reorderPlans}
              onCreateClick={() => setIsCreateExamOpen(true)}
            />
          </>
        )}
      </main>

      {/* MODALS */}
      <CreateExamModal
        isOpen={isCreateExamOpen}
        onClose={() => setIsCreateExamOpen(false)}
        onConfirmCreate={handleCreatePlan}
        isLoading={actionLoading}
      />

      <EditExamModal
        isOpen={Boolean(editingExamPlan)}
        onClose={() => setEditingExamPlan(null)}
        plan={editingExamPlan}
        onConfirmEdit={handleEditExam}
        isLoading={actionLoading}
      />

      <SlotModal
        isOpen={Boolean(activePlanForSlot)}
        onClose={() => {
          setActivePlanForSlot(null);
          setEditingSlot(null);
        }}
        plan={activePlanForSlot}
        slotToEdit={editingSlot}
        onSaveSlot={handleSaveSlot}
        isLoading={actionLoading}
      />

      {/* Delete Plan Confirmation Modal */}
      <Modal
        isOpen={Boolean(planToDelete)}
        onClose={() => setPlanToDelete(null)}
        title="Delete Exam Plan"
        subtitle={`Are you sure you want to delete "${planToDelete?.exam_name}"?`}
        maxWidth="sm"
      >
        <div className="space-y-4">
          <p className="text-xs text-zinc-400 leading-relaxed">
            This will permanently remove this exam plan and all {planToDelete?.slots.length || 0} associated preparation slots. This action cannot be undone.
          </p>

          <div className="flex items-center justify-end space-x-2 pt-2 border-t border-zinc-800">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setPlanToDelete(null)}
              disabled={actionLoading}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={handleConfirmDeletePlan}
              isLoading={actionLoading}
            >
              Delete Plan
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Slot Confirmation Modal */}
      <Modal
        isOpen={Boolean(slotToDelete)}
        onClose={() => setSlotToDelete(null)}
        title="Delete Preparation Slot"
        subtitle={`Remove slot "${slotToDelete?.slot.title}"?`}
        maxWidth="sm"
      >
        <div className="space-y-4">
          <p className="text-xs text-zinc-400 leading-relaxed">
            Are you sure you want to remove this preparation slot from {slotToDelete?.plan.exam_name}? This action cannot be undone.
          </p>

          <div className="flex items-center justify-end space-x-2 pt-2 border-t border-zinc-800">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setSlotToDelete(null)}
              disabled={actionLoading}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={handleConfirmDeleteSlot}
              isLoading={actionLoading}
            >
              Delete Slot
            </Button>
          </div>
        </div>
      </Modal>

      <BottomNav />
    </div>
  );
}
