"use client";

import React, { memo } from "react";
import { DesktopAppLayout } from "./DesktopAppLayout";
import { GoalWindowCard } from "@/components/goals/GoalWindowCard";
import { CreateGoalModal } from "@/components/goals/CreateGoalModal";
import { AddGoalModal } from "@/components/goals/AddGoalModal";
import { Target, Plus, HelpCircle, Clock, Lock, Trophy, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { GoalsGuideModal } from "@/components/goals/GoalsGuideModal";
import { UserProfile, DailyGoal } from "@/lib/supabase/types";

export interface DesktopGoalsViewProps {
  profile: UserProfile | null;
  activeGoal: DailyGoal | null;
  countdown: any;
  loading: boolean;
  actionLoading: boolean;
  isCreateModalOpen: boolean;
  setIsCreateModalOpen: (open: boolean) => void;
  isAddModalOpen: boolean;
  setIsAddModalOpen: (open: boolean) => void;
  isGuideModalOpen: boolean;
  setIsGuideModalOpen: (open: boolean) => void;
  handleCreateGoals: (tasks: string[]) => Promise<void>;
  handleAddGoals: (tasks: string[]) => Promise<void>;
}

export const DesktopGoalsView = memo(function DesktopGoalsView({
  profile,
  activeGoal,
  countdown,
  loading,
  actionLoading,
  isCreateModalOpen,
  setIsCreateModalOpen,
  isAddModalOpen,
  setIsAddModalOpen,
  isGuideModalOpen,
  setIsGuideModalOpen,
  handleCreateGoals,
  handleAddGoals,
}: DesktopGoalsViewProps) {
  return (
    <DesktopAppLayout profile={profile}>
      <main className="w-full px-6 lg:px-8 xl:px-12 py-6 space-y-6">
        {/* Desktop Header */}
        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="p-2.5 rounded-xl bg-violet-500/10 border border-violet-500/25 text-violet-300 shrink-0 shadow-inner">
              <Target className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-black text-zinc-100 tracking-tight">
                Rolling 20-Hour Accountability Goals
              </h1>
              <p className="text-xs text-zinc-400">
                Continuous 20-hour commitments • Append-only architecture for transparent discipline scoring
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3 shrink-0">
            <button
              type="button"
              onClick={() => setIsGuideModalOpen(true)}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-violet-300 text-xs font-bold transition-all shadow-sm"
              title="View Goals Guide"
            >
              <HelpCircle className="w-4 h-4 text-violet-400" />
              <span>Goals Handbook</span>
            </button>

            {(!activeGoal || countdown.isExpired) ? (
              <Button
                size="sm"
                variant="primary"
                onClick={() => setIsCreateModalOpen(true)}
                className="space-x-1.5 font-bold text-xs shrink-0 bg-violet-600 hover:bg-violet-500 text-white shadow-md shadow-violet-500/20 px-4 py-2 rounded-xl transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>+ Create 20-Hour Goals</span>
              </Button>
            ) : (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setIsAddModalOpen(true)}
                className="space-x-1.5 bg-zinc-900 border-zinc-700 text-violet-200 hover:bg-zinc-800 hover:text-white text-xs font-bold shrink-0 px-4 py-2 rounded-xl transition-all"
              >
                <Plus className="w-4 h-4 text-violet-400" />
                <span>+ Add Task to Goal</span>
              </Button>
            )}
          </div>
        </div>

        {/* Desktop Balanced 2-Column Goals Workspace */}
        {loading ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-7 w-full h-96 bg-zinc-900/50 border border-zinc-800/80 rounded-3xl animate-pulse" />
            <div className="lg:col-span-5 w-full h-96 bg-zinc-900/50 border border-zinc-800/80 rounded-3xl animate-pulse" />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left 60% Column: Active Goal Workspace */}
            <div className="lg:col-span-7 xl:col-span-7 min-w-0">
              <GoalWindowCard
                goal={activeGoal}
                countdown={countdown}
                onOpenCreateModal={() => setIsCreateModalOpen(true)}
                onOpenAddGoalModal={() => setIsAddModalOpen(true)}
              />
            </div>

            {/* Right 40% Column: Embedded Accountability Guide */}
            <aside className="lg:col-span-5 xl:col-span-5 space-y-4 min-w-0">
              <div className="p-5 rounded-3xl bg-zinc-900/70 border border-zinc-800/80 shadow-md space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
                  <div className="flex items-center space-x-2.5">
                    <div className="p-2 rounded-xl bg-violet-500/15 border border-violet-500/30 text-violet-300">
                      <Target className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-zinc-100">
                        Accountability Principles
                      </h3>
                      <p className="text-[11px] text-zinc-400">
                        Zero arbitrary resets • Authentic follow-through
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono font-bold text-violet-400 bg-violet-500/10 border border-violet-500/20 px-2 py-0.5 rounded-full">
                    20H RULES
                  </span>
                </div>

                <div className="space-y-3">
                  {/* Continuous Rolling Clock */}
                  <div className="p-3.5 rounded-2xl bg-zinc-950/60 border border-zinc-800/80 space-y-1.5">
                    <div className="flex items-center space-x-2 text-zinc-200">
                      <Clock className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                      <h4 className="text-xs font-bold">Continuous 20-Hour Clock</h4>
                    </div>
                    <p className="text-[11px] text-zinc-400 leading-relaxed pl-5">
                      Your window opens the second your first goal is committed and runs for exactly 1,200 minutes (20h), preventing midnight rush stress and supporting all study rhythms.
                    </p>
                  </div>

                  {/* Append-Only Discipline */}
                  <div className="p-3.5 rounded-2xl bg-zinc-950/60 border border-zinc-800/80 space-y-1.5">
                    <div className="flex items-center space-x-2 text-zinc-200">
                      <Lock className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                      <h4 className="text-xs font-bold">Append-Only Discipline</h4>
                    </div>
                    <p className="text-[11px] text-zinc-400 leading-relaxed pl-5">
                      Goals cannot be deleted once committed. You can append new goals as capacity allows, but uncompleted tasks count against your completion rate when time expires.
                    </p>
                  </div>

                  {/* Dual-Pillar Score Impact */}
                  <div className="p-3.5 rounded-2xl bg-zinc-950/60 border border-zinc-800/80 space-y-1.5">
                    <div className="flex items-center space-x-2 text-zinc-200">
                      <Trophy className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <h4 className="text-xs font-bold">30% Leaderboard Contribution</h4>
                    </div>
                    <p className="text-[11px] text-zinc-400 leading-relaxed pl-5">
                      Goal accountability accounts for 30% of your 100-pt leaderboard rank, calculated from both volume of verified study goals and honest completion rate.
                    </p>
                  </div>

                  {/* Recommended Strategy */}
                  <div className="p-3.5 rounded-2xl bg-violet-950/20 border border-violet-500/25 space-y-1.5">
                    <div className="flex items-center space-x-2 text-violet-300">
                      <Sparkles className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                      <h4 className="text-xs font-bold">Recommended Strategy</h4>
                    </div>
                    <p className="text-[11px] text-zinc-400 leading-relaxed pl-5">
                      Start your window with 2–3 high-priority targets. Once accomplished, use the <span className="text-violet-300 font-semibold">+ Add Task to Goal</span> button to append more targets without breaking momentum.
                    </p>
                  </div>
                </div>
              </div>
            </aside>
          </div>
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
    </DesktopAppLayout>
  );
});
