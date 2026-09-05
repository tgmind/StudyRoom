"use client";

import React from "react";
import { Modal } from "@/components/ui/Modal";

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
      subtitle="How StudyRoom calculates transparent 50/30/20 accountability scores"
    >
      <div className="space-y-4 text-xs text-zinc-300 leading-relaxed">
        <p>
          StudyRoom rewards long-term consistency over cheap gamification. Total score is computed out of 100 points using normalized component weighting:
        </p>

        <div className="space-y-3">
          <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-lg space-y-1">
            <h4 className="font-bold text-zinc-100 flex items-center justify-between">
              <span>1. Active Study Hours</span>
              <span className="text-violet-400 font-mono">50% Weight</span>
            </h4>
            <p className="text-zinc-400 text-[11px]">
              Calculated strictly from active study timestamps excluding breaks. Normalized relative to the highest member&apos;s study hours in the weekly window.
            </p>
          </div>

          <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-lg space-y-2">
            <h4 className="font-bold text-zinc-100 flex items-center justify-between">
              <span>2. Dual-Pillar Goal Index</span>
              <span className="text-amber-400 font-mono">30% Weight</span>
            </h4>
            <p className="text-zinc-400 text-[11px] leading-relaxed">
              Fair scoring that rewards ambitious achievement while honoring discipline. It combines two complementary pillars:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              <div className="p-2 rounded bg-zinc-950/70 border border-zinc-800/80">
                <span className="text-[10.5px] font-bold text-amber-300 block">
                  60% Volume Pillar
                </span>
                <span className="text-[10px] text-zinc-400 block mt-0.5 leading-snug">
                  Real tasks completed this week relative to group target (up to 15 tasks). Setting & finishing more tasks gives more points.
                </span>
              </div>
              <div className="p-2 rounded bg-zinc-950/70 border border-zinc-800/80">
                <span className="text-[10.5px] font-bold text-amber-300 block">
                  40% Discipline Pillar
                </span>
                <span className="text-[10px] text-zinc-400 block mt-0.5 leading-snug">
                  Completion rate of your committed tasks. Setting 1 task cannot game the system (minimum 3-task commitment benchmark).
                </span>
              </div>
            </div>
          </div>

          <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-lg space-y-1">
            <h4 className="font-bold text-zinc-100 flex items-center justify-between">
              <span>3. Consistency Streak</span>
              <span className="text-fuchsia-400 font-mono">20% Weight</span>
            </h4>
            <p className="text-zinc-400 text-[11px]">
              Consecutive days recording at least 30 active study minutes. Capped at 7 qualifying days (100% streak score).
            </p>
          </div>
        </div>

        <div className="p-3 bg-amber-950/20 border border-amber-800/40 rounded-lg text-amber-200 text-[11px]">
          <strong>⭐ Weekly Achiever Badge:</strong> Every Monday morning, the member with the highest overall score from the previous week is awarded the ⭐ Achiever Badge.
        </div>
      </div>
    </Modal>
  );
}
