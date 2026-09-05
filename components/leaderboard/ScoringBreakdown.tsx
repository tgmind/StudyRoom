"use client";

import React from "react";
import { Modal } from "@/components/ui/Modal";
import { Clock, Target, Flame, Trophy, Sparkles, CheckCircle2 } from "lucide-react";

interface ScoringBreakdownProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ScoringBreakdown({ isOpen, onClose }: ScoringBreakdownProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Leaderboard Scoring Methodology"
      subtitle="Transparent 50 / 30 / 20 accountability score breakdown"
    >
      <div className="space-y-4 text-xs text-zinc-300 leading-relaxed">
        {/* Scoring Upgraded Spotlight Card */}
        <div className="p-3 sm:p-3.5 rounded-xl bg-gradient-to-br from-violet-950/50 via-zinc-900 to-amber-950/30 border border-violet-500/30 space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-xs font-black text-violet-200 tracking-tight flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                Scoring Formula Upgraded
              </span>
            </div>
            <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/40 tracking-wider">
              Dual-Pillar Active
            </span>
          </div>
          <p className="text-[11.5px] text-zinc-300 leading-relaxed">
            We updated the scoring engine to reward genuine ambition and eliminate the 1-goal exploit. Goal scores now blend <strong>Volume (60%)</strong> and <strong>Discipline (40%)</strong>, ensuring members who commit to and achieve more tasks rank higher.
          </p>
        </div>

        <p className="text-[11.5px] text-zinc-400">
          Total score is computed out of 100 points using normalized component weighting:
        </p>

        <div className="space-y-3">
          {/* 1. Active Study Hours */}
          <div className="p-3 bg-zinc-900/90 border border-zinc-800 rounded-xl space-y-1.5">
            <h4 className="font-bold text-zinc-100 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                1. Active Study Hours
              </span>
              <span className="text-violet-400 font-mono font-bold">50% Weight</span>
            </h4>
            <p className="text-zinc-400 text-[11px] leading-relaxed">
              Calculated strictly from active study timestamps excluding breaks. Normalized relative to the highest member&apos;s study hours in the weekly window.
            </p>
          </div>

          {/* 2. Dual-Pillar Goal Index */}
          <div className="p-3 bg-zinc-900/90 border border-amber-500/30 rounded-xl space-y-2 relative">
            <h4 className="font-bold text-zinc-100 flex items-center justify-between">
              <span className="flex items-center gap-1.5 flex-wrap">
                <Target className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>2. Dual-Pillar Goal Index</span>
                <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 tracking-wider">
                  New Formula
                </span>
              </span>
              <span className="text-amber-400 font-mono font-bold">30% Weight</span>
            </h4>
            <p className="text-zinc-400 text-[11px] leading-relaxed">
              Fair scoring that rewards ambitious achievement while honoring discipline. It combines two complementary pillars:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              <div className="p-2.5 rounded-lg bg-zinc-950/80 border border-zinc-800/80 space-y-1">
                <span className="text-[10.5px] font-bold text-amber-300 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-amber-400" />
                  60% Volume Pillar
                </span>
                <span className="text-[10px] text-zinc-400 block leading-snug">
                  Real tasks completed this week relative to group target (up to 15 tasks). Setting &amp; finishing more tasks gives more points.
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-zinc-950/80 border border-zinc-800/80 space-y-1">
                <span className="text-[10.5px] font-bold text-amber-300 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-amber-400" />
                  40% Discipline Pillar
                </span>
                <span className="text-[10px] text-zinc-400 block leading-snug">
                  Completion rate of your committed tasks. Setting 1 task cannot game the system (minimum 3-task commitment benchmark).
                </span>
              </div>
            </div>
          </div>

          {/* 3. Consistency Streak */}
          <div className="p-3 bg-zinc-900/90 border border-zinc-800 rounded-xl space-y-1.5">
            <h4 className="font-bold text-zinc-100 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5 text-fuchsia-400 shrink-0" />
                3. Consistency Streak
              </span>
              <span className="text-fuchsia-400 font-mono font-bold">20% Weight</span>
            </h4>
            <p className="text-zinc-400 text-[11px] leading-relaxed">
              Consecutive days recording at least 30 active study minutes. Capped at 7 qualifying days (100% streak score).
            </p>
          </div>
        </div>

        <div className="p-3 bg-amber-950/20 border border-amber-800/40 rounded-xl text-amber-200 text-[11px] flex items-start gap-2">
          <Trophy className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <strong>Weekly Achiever Badge:</strong> Every Monday morning, the member with the highest overall score from the previous week is awarded the ⭐ Achiever Badge.
          </div>
        </div>
      </div>
    </Modal>
  );
}
