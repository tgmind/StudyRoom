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
    <div className="flex-1 flex flex-col min-h-screen pb-20">
      <TopHeader profile={profile} />

      <div className="flex-1 p-4 space-y-5 max-w-xl mx-auto w-full">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold tracking-tight text-zinc-100 flex items-center space-x-2">
              <Target className="w-5 h-5 text-emerald-400" />
              <span>Rolling 24-Hour Goals</span>
            </h1>
            <p className="text-xs text-zinc-400 mt-0.5">
              Personalized 24-hour commitment window (Non-midnight reset)
            </p>
          </div>

          {(!activeGoal || countdown.isExpired) ? (
            <Button
              size="sm"
              variant="primary"
              onClick={() => setIsCreateModalOpen(true)}
              className="space-x-1"
            >
              <Plus className="w-4 h-4" />
              <span>New Goals</span>
            </Button>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setIsAddModalOpen(true)}
              className="space-x-1 bg-zinc-900 border-zinc-700 text-zinc-200 hover:bg-zinc-800"
            >
              <Plus className="w-4 h-4 text-emerald-400" />
              <span>Add Goal</span>
            </Button>
          )}
        </div>

        {/* Goal Window Card */}
        {loading ? (
          <div className="w-full h-48 bg-zinc-900/60 border border-zinc-800 rounded-xl animate-pulse" />
        ) : (
          <GoalWindowCard
            goal={activeGoal}
            countdown={countdown}
            onOpenCreateModal={() => setIsCreateModalOpen(true)}
            onOpenAddGoalModal={() => setIsAddModalOpen(true)}
          />
        )}
      </div>

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
