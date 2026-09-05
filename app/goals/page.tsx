"use client";

import React, { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useDailyGoals } from "@/hooks/useDailyGoals";
import { TopHeader } from "@/components/navigation/TopHeader";
import { BottomNav } from "@/components/navigation/BottomNav";
import { GoalWindowCard } from "@/components/goals/GoalWindowCard";
import { CreateGoalModal } from "@/components/goals/CreateGoalModal";
import { AddGoalModal } from "@/components/goals/AddGoalModal";
import { Target, Plus, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { GoalsGuideModal } from "@/components/goals/GoalsGuideModal";

export default function GoalsPage() {
  const { user, profile } = useAuth();
  const isSessionActive = profile?.current_status === "studying" || profile?.current_status === "break";
  const sessionStartTime = profile?.session_start_time || null;

  const {
    activeGoal,
    countdown,
    loading,
    actionLoading,
    createGoal,
    addTasksToGoal,
  } = useDailyGoals(user?.id, sessionStartTime, isSessionActive);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isGuideModalOpen, setIsGuideModalOpen] = useState(false);

  const handleCreateGoals = async (tasks: string[]) => {
    await createGoal(tasks);
  };

  const handleAddGoals = async (tasks: string[]) => {
    await addTasksToGoal(tasks);
  };

  return (
    <div className="flex-1 flex flex-col min-h-screen pb-24 bg-[#090a0f] text-zinc-100">
      <TopHeader profile={profile} />

      {/* Fluid Screen Container */}
      <main className="flex-1 w-full max-w-2xl sm:max-w-3xl px-3.5 sm:px-6 py-3.5 mx-auto space-y-3.5">
        {/* Sleek Compact Header Bar */}
        <div className="flex items-center justify-between gap-2 px-1">
          <div className="flex items-center space-x-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-violet-500/10 border border-violet-500/25 text-violet-300 shrink-0 shadow-inner">
              <Target className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-base font-black text-zinc-100 tracking-tight leading-snug">
                Rolling 24-Hour Goals
              </h1>
              <p className="text-[10px] sm:text-xs text-zinc-400 leading-snug">
                Continuous 24h commitment (Append-only)
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            <button
              type="button"
              onClick={() => setIsGuideModalOpen(true)}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-violet-300 text-xs font-bold transition-all shrink-0 touch-manipulation shadow-sm"
              title="View Goals Guide"
              aria-label="View Goals Guide"
            >
              <HelpCircle className="w-3.5 h-3.5 text-violet-400" />
              <span className="hidden sm:inline">Guide</span>
            </button>

            {(!activeGoal || countdown.isExpired) ? (
              <Button
                size="sm"
                variant="primary"
                onClick={() => setIsCreateModalOpen(true)}
                className="space-x-1 font-bold text-xs shrink-0 bg-violet-600 hover:bg-violet-500 text-white shadow-md shadow-violet-500/20 px-3.5 py-1.5 rounded-xl transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Goals</span>
              </Button>
            ) : (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setIsAddModalOpen(true)}
                className="space-x-1 bg-zinc-900 border-zinc-700 text-violet-200 hover:bg-zinc-800 hover:text-white text-xs font-bold shrink-0 px-3.5 py-1.5 rounded-xl transition-all"
              >
                <Plus className="w-3.5 h-3.5 text-violet-400" />
                <span>Add Goal</span>
              </Button>
            )}
          </div>
        </div>

        {/* Goal Window Card */}
        {loading ? (
          <div className="w-full h-48 bg-zinc-900/50 border border-zinc-800/80 rounded-2xl animate-pulse" />
        ) : (
          <GoalWindowCard
            goal={activeGoal}
            countdown={countdown}
            onOpenCreateModal={() => setIsCreateModalOpen(true)}
            onOpenAddGoalModal={() => setIsAddModalOpen(true)}
          />
        )}
      </main>

      <CreateGoalModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onConfirmCreate={handleCreateGoals}
        isLoading={actionLoading}
      />

      <AddGoalModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onConfirmAdd={handleAddGoals}
        isLoading={actionLoading}
      />

      <GoalsGuideModal
        isOpen={isGuideModalOpen}
        onClose={() => setIsGuideModalOpen(false)}
      />

      <BottomNav />
    </div>
  );
}
