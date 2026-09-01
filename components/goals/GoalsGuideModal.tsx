"use client";

import React from "react";
import { Modal } from "@/components/ui/Modal";
import {
  Target,
  Clock,
  Lock,
  CheckCircle2,
  Trophy,
  PlusCircle,
  Sparkles,
} from "lucide-react";

interface GoalsGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function GoalsGuideModal({ isOpen, onClose }: GoalsGuideModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Rolling 24-Hour Goals Guide"
      subtitle="How continuous 24h commitments and append-only accountability work"
    >
      <div className="space-y-4 text-xs text-zinc-300 leading-relaxed">
        {/* Intro banner */}
        <div className="p-3.5 rounded-2xl bg-gradient-to-r from-violet-500/15 via-purple-500/10 to-zinc-900/80 border border-violet-500/30 flex items-start space-x-3 shadow-sm">
          <div className="p-2 rounded-xl bg-violet-500/20 text-violet-300 shrink-0 mt-0.5">
            <Target className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="space-y-1">
            <h3 className="font-extrabold text-xs sm:text-sm text-violet-200">
              Discipline & Follow-Through
            </h3>
            <p className="text-zinc-400 text-[11px] leading-relaxed">
              StudyRoom eliminates arbitrary midnight resets. Your goals run for exactly 24 hours from creation, rewarding honest daily consistency and committed follow-through.
            </p>
          </div>
        </div>

        {/* Feature breakdown cards */}
        <div className="space-y-3">
          {/* 1. Continuous 24-Hour Windows */}
          <div className="p-4 bg-zinc-900/90 border border-violet-500/25 rounded-2xl space-y-2 relative overflow-hidden shadow-md">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center space-x-2.5 min-w-0">
                <div className="p-1.5 rounded-lg bg-violet-500/15 border border-violet-500/30 text-violet-400 shrink-0">
                  <Clock className="w-4 h-4" />
                </div>
                <h4 className="font-bold text-zinc-100 text-xs sm:text-sm">
                  1. Continuous 24-Hour Windows
                </h4>
              </div>
              <span className="text-[10px] font-mono font-bold text-violet-300 px-2.5 py-1 rounded-full bg-violet-500/15 border border-violet-500/30 shrink-0 whitespace-nowrap">
                24h Rolling
              </span>
            </div>
            <p className="text-zinc-400 text-[11px] leading-relaxed pl-1">
              Your goal window starts at the exact second you create your first task and expires after 1,440 minutes (24 hours). This fully supports night owls, early morning routines, and non-standard study blocks.
            </p>
          </div>

          {/* 2. Flexible Addition by Capacity */}
          <div className="p-4 bg-zinc-900/90 border border-purple-500/25 rounded-2xl space-y-2 relative overflow-hidden shadow-md">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center space-x-2.5 min-w-0">
                <div className="p-1.5 rounded-lg bg-purple-500/15 border border-purple-500/30 text-purple-400 shrink-0">
                  <PlusCircle className="w-4 h-4" />
                </div>
                <h4 className="font-bold text-zinc-100 text-xs sm:text-sm">
                  2. Add Multiple or One-by-One
                </h4>
              </div>
              <span className="text-[10px] font-mono font-bold text-purple-300 px-2.5 py-1 rounded-full bg-purple-500/15 border border-purple-500/30 shrink-0 whitespace-nowrap">
                Flexible Capacity
              </span>
            </div>
            <p className="text-zinc-400 text-[11px] leading-relaxed pl-1">
              You can commit up to 10 goals in bulk when setting up your window, or start with just 1 or 2 high-priority tasks and append more goals as you build momentum throughout the 24 hours.
            </p>
          </div>

          {/* 3. Strict No-Deletion Rule */}
          <div className="p-4 bg-zinc-900/90 border border-rose-500/25 rounded-2xl space-y-2 relative overflow-hidden shadow-md">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center space-x-2.5 min-w-0">
                <div className="p-1.5 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-400 shrink-0">
                  <Lock className="w-4 h-4" />
                </div>
                <h4 className="font-bold text-zinc-100 text-xs sm:text-sm">
                  3. Append-Only Accountability
                </h4>
              </div>
              <span className="text-[10px] font-mono font-bold text-rose-300 px-2.5 py-1 rounded-full bg-rose-500/15 border border-rose-500/30 shrink-0 whitespace-nowrap">
                Strict No-Delete
              </span>
            </div>
            <p className="text-zinc-400 text-[11px] leading-relaxed pl-1">
              Goals cannot be deleted or removed once committed. Any unfinished goals when the 24-hour timer expires are recorded as incomplete, teaching real-world planning and reliable self-discipline.
            </p>
          </div>

          {/* 4. Atomic Stop Hook Verification */}
          <div className="p-4 bg-zinc-900/90 border border-fuchsia-500/25 rounded-2xl space-y-2 relative overflow-hidden shadow-md">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center space-x-2.5 min-w-0">
                <div className="p-1.5 rounded-lg bg-fuchsia-500/15 border border-fuchsia-500/30 text-fuchsia-400 shrink-0">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <h4 className="font-bold text-zinc-100 text-xs sm:text-sm">
                  4. Completing Goals in Room
                </h4>
              </div>
              <span className="text-[10px] font-mono font-bold text-fuchsia-300 px-2.5 py-1 rounded-full bg-fuchsia-500/15 border border-fuchsia-500/30 shrink-0 whitespace-nowrap">
                Session Stop Hook
              </span>
            </div>
            <p className="text-zinc-400 text-[11px] leading-relaxed pl-1">
              Whenever you stop a study session in the live study room, an interactive checklist modal appears asking which active tasks were finished. Selected tasks are permanently recorded in your history.
            </p>
          </div>

          {/* 5. 30% Leaderboard Weight */}
          <div className="p-4 bg-zinc-900/90 border border-violet-500/25 rounded-2xl space-y-2 relative overflow-hidden shadow-md">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center space-x-2.5 min-w-0">
                <div className="p-1.5 rounded-lg bg-violet-500/15 border border-violet-500/30 text-violet-400 shrink-0">
                  <Trophy className="w-4 h-4" />
                </div>
                <h4 className="font-bold text-zinc-100 text-xs sm:text-sm">
                  5. 30% Leaderboard Contribution
                </h4>
              </div>
              <span className="text-[10px] font-mono font-bold text-violet-300 px-2.5 py-1 rounded-full bg-violet-500/15 border border-violet-500/30 shrink-0 whitespace-nowrap">
                30 Pts Weight
              </span>
            </div>
            <p className="text-zinc-400 text-[11px] leading-relaxed pl-1">
              Your weekly task completion rate directly contributes 30% to your 100-point Leaderboard score. Completing all committed goals is crucial for claiming the weekly ⭐ Achiever badge!
            </p>
          </div>
        </div>

        {/* Pro Tip Card */}
        <div className="p-4 bg-violet-950/25 border border-violet-500/30 rounded-2xl text-violet-200 text-xs space-y-1.5 shadow-sm">
          <div className="flex items-center space-x-2 font-bold text-violet-300">
            <Sparkles className="w-4 h-4 text-violet-400 shrink-0" />
            <span>Recommended Strategy:</span>
          </div>
          <p className="text-[11px] text-zinc-300 leading-relaxed pl-6">
            Start your day by committing 2–3 specific goals (e.g. &ldquo;Revise Mechanics formulas&rdquo; or &ldquo;Complete mock test&rdquo;). Once completed, use the <strong>+ Add Goal</strong> button to append more targets without breaking your stride.
          </p>
        </div>
      </div>
    </Modal>
  );
}
