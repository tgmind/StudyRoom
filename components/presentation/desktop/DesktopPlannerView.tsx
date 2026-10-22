"use client";

import React, { memo } from "react";
import { DesktopAppLayout } from "./DesktopAppLayout";
import { PlannerHeader } from "@/components/planner/PlannerHeader";
import { PlanningInsights } from "@/components/planner/PlanningInsights";
import { ExamCardList } from "@/components/planner/ExamCardList";
import { CreateExamModal } from "@/components/planner/CreateExamModal";
import { EditExamModal } from "@/components/planner/EditExamModal";
import { SlotModal } from "@/components/planner/SlotModal";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { AlertTriangle, Loader2 } from "lucide-react";
import { UserProfile, ExamPlanWithSlots, PreparationSlot } from "@/lib/supabase/types";

export interface DesktopPlannerViewProps {
  profile: UserProfile | null;
  loading: boolean;
  actionLoading: boolean;
  error: string | null;
  plans: ExamPlanWithSlots[];
  insights: any;
  showRoomUpcomingCard: boolean;
  toggleShowRoomUpcomingCard: () => Promise<void>;
  isPreferenceUpdating: boolean;
  isCreateExamOpen: boolean;
  setIsCreateExamOpen: (open: boolean) => void;
  editingExamPlan: ExamPlanWithSlots | null;
  setEditingExamPlan: (plan: ExamPlanWithSlots | null) => void;
  activePlanForSlot: ExamPlanWithSlots | null;
  setActivePlanForSlot: (plan: ExamPlanWithSlots | null) => void;
  editingSlot: PreparationSlot | null;
  setEditingSlot: (slot: PreparationSlot | null) => void;
  planToDelete: ExamPlanWithSlots | null;
  setPlanToDelete: (plan: ExamPlanWithSlots | null) => void;
  slotToDelete: { plan: ExamPlanWithSlots; slot: PreparationSlot } | null;
  setSlotToDelete: (item: { plan: ExamPlanWithSlots; slot: PreparationSlot } | null) => void;
  handleCreatePlan: (data: any) => Promise<void>;
  handleEditExam: (planId: string, updates: any) => Promise<void>;
  handleOpenAddSlot: (plan: ExamPlanWithSlots) => void;
  handleOpenEditSlot: (plan: ExamPlanWithSlots, slot: PreparationSlot) => void;
  handleSaveSlot: (slotData: any) => Promise<void>;
  handleConfirmDeletePlan: () => Promise<void>;
  handleConfirmDeleteSlot: () => Promise<void>;
  toggleLockPlan: (planId: string, currentLocked: boolean) => Promise<void>;
  toggleStreaksVisibility: (planId: string, currentVisible: boolean) => Promise<void>;
  reorderPlans: (newOrderIds: string[]) => void | Promise<void>;
}

export const DesktopPlannerView = memo(function DesktopPlannerView({
  profile,
  loading,
  actionLoading,
  error,
  plans,
  insights,
  showRoomUpcomingCard,
  toggleShowRoomUpcomingCard,
  isPreferenceUpdating,
  isCreateExamOpen,
  setIsCreateExamOpen,
  editingExamPlan,
  setEditingExamPlan,
  activePlanForSlot,
  setActivePlanForSlot,
  editingSlot,
  setEditingSlot,
  planToDelete,
  setPlanToDelete,
  slotToDelete,
  setSlotToDelete,
  handleCreatePlan,
  handleEditExam,
  handleOpenAddSlot,
  handleOpenEditSlot,
  handleSaveSlot,
  handleConfirmDeletePlan,
  handleConfirmDeleteSlot,
  toggleLockPlan,
  toggleStreaksVisibility,
  reorderPlans,
}: DesktopPlannerViewProps) {
  return (
    <DesktopAppLayout profile={profile}>
      <main className="w-full px-6 lg:px-8 xl:px-12 py-6 space-y-6">
        {/* Header Bar */}
        <PlannerHeader
          onCreateClick={() => setIsCreateExamOpen(true)}
          activeExamsCount={insights.activeExamsCount}
          showRoomUpcomingCard={showRoomUpcomingCard}
          onToggleShowRoomUpcomingCard={toggleShowRoomUpcomingCard}
          isPreferenceUpdating={isPreferenceUpdating}
        />

        {/* Global Hook Error Banner */}
        {error && (
          <div className="rounded-2xl bg-rose-950/30 border border-rose-500/30 p-4 text-xs text-rose-300 flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Loading Skeleton */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 space-y-3">
            <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
            <p className="text-xs font-semibold text-zinc-400">
              Loading your exam preparation plans...
            </p>
          </div>
        ) : (
          <>
            {/* Live Planning Insights Grid (Takes full width, beautifully responsive) */}
            <div className="w-full">
              <PlanningInsights insights={insights} />
            </div>

            {/* Exam Cards Collection across full width */}
            <div className="w-full">
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
            </div>
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
    </DesktopAppLayout>
  );
});
