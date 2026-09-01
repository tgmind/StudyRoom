"use client";

import React, { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useDailyGoals } from "@/hooks/useDailyGoals";
import { TopHeader } from "@/components/navigation/TopHeader";
import { BottomNav } from "@/components/navigation/BottomNav";
import { GoalWindowCard } from "@/components/goals/GoalWindowCard";
import { CreateGoalModal } from "@/components/goals/CreateGoalModal";
import { AddGoalModal } from "@/components/goals/AddGoalModal";
import { Target, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";

export default function GoalsPage() {
  const { user, profile } = useAuth();
  const {
    activeGoal,
    countdown,
    loading,
    actionLoading,
    createGoal,
    addTasksToGoal,
  } = useDailyGoals(user?.id);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

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
      <main className="flex-1 w-full max-w-2xl sm:max-w-3xl px-3.5 sm:px-6 py-4 mx-auto space-y-4 sm:space-y-5">
        {/* Header Hero Card */}
        <div className="w-full bg-zinc-900/70 border border-zinc-800/90 rounded-2xl p-4 sm:p-5 shadow-xl space-y-2 backdrop-blur-md">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center space-x-3 min-w-0">
              <div className="p-2 sm:p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 shrink-0">
                <Target className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <div className="min-w-0">
                <h1 className="text-sm sm:text-base font-extrabold text-zinc-100 tracking-tight truncate">
                  Rolling 24-Hour Goals
                </h1>
                <p className="text-[10px] sm:text-xs text-zinc-400 truncate">
                  Continuous 24h commitment window (Append-only accountability)
                </p>
              </div>
            </div>

            {(!activeGoal || countdown.isExpired) ? (
              <Button
                size="sm"
                variant="primary"
                onClick={() => setIsCreateModalOpen(true)}
                className="space-x-1 font-extrabold text-xs shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Goals</span>
              </Button>
            ) : (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setIsAddModalOpen(true)}
                className="space-x-1 bg-zinc-900 border-zinc-700 text-zinc-200 hover:bg-zinc-800 text-xs font-bold shrink-0"
              >
                <Plus className="w-3.5 h-3.5 text-emerald-400" />
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

      <BottomNav />
    </div>
  );
}
