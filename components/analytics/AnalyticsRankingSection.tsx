"use client";

import React, { memo, useState } from "react";
import { GlobalAnalyticsRankings } from "@/lib/supabase/types";
import {
  AnalyticsLensSelector,
  AnalyticsLensType,
} from "@/components/analytics/AnalyticsLensSelector";
import { StudyVolumeSpectrum } from "@/components/analytics/StudyVolumeSpectrum";
import { ConsistencyRhythmMatrix } from "@/components/analytics/ConsistencyRhythmMatrix";
import { AchieversHallOfFame } from "@/components/analytics/AchieversHallOfFame";
import { GoalExecutionGauges } from "@/components/analytics/GoalExecutionGauges";
import { Compass } from "lucide-react";

interface AnalyticsRankingSectionProps {
  rankings: GlobalAnalyticsRankings;
  currentUserId?: string;
}

export const AnalyticsRankingSection = memo(function AnalyticsRankingSection({
  rankings,
  currentUserId,
}: AnalyticsRankingSectionProps) {
  const [activeLens, setActiveLens] =
    useState<AnalyticsLensType>("most_studying");

  return (
    <section
      aria-label="Global Analytics Observatory"
      className="w-full rounded-3xl bg-zinc-950/80 border border-zinc-800/80 p-3.5 sm:p-5 shadow-2xl backdrop-blur-md space-y-4"
    >
      {/* 1. Dedicated Observatory Section Header */}
      <div className="flex items-center justify-between pb-2.5 border-b border-zinc-800/80">
        <div className="flex items-center space-x-2">
          <Compass className="w-4 h-4 text-zinc-400 shrink-0" />
          <h2 className="text-xs sm:text-sm font-black uppercase tracking-wider text-zinc-300">
            Study Ecosystem Observatory
          </h2>
        </div>
        <span className="text-[10px] font-mono text-zinc-500 font-bold uppercase tracking-wider">
          Top 5 Telemetry
        </span>
      </div>

      {/* 2. Interactive Mobile-First Analytics Lens Selector */}
      <AnalyticsLensSelector
        activeLens={activeLens}
        onSelectLens={setActiveLens}
      />

      {/* 3. Responsive Analytical Subtitle (Never Chopped) */}
      <div className="px-1 flex items-center justify-between text-xs text-zinc-400">
        <div>
          <span className="text-[10px] uppercase font-mono font-bold tracking-wider text-zinc-500 block">
            {activeLens === "most_studying" && "TOP 5 · INTENSITY"}
            {activeLens === "consistency_boost" && "GROWTH RUNWAY · DISCIPLINE"}
            {activeLens === "achievers" && "HALL OF FAME · EXCELLENCE"}
            {activeLens === "goal_chasers" && "TASK PRECISION · EXECUTION"}
          </span>
          <h3 className="text-xs sm:text-sm font-extrabold text-zinc-200">
            <span className="sm:hidden">
              {activeLens === "most_studying" && "Highest Daily Study Velocity"}
              {activeLens === "consistency_boost" && "7-Day Habit Continuity"}
              {activeLens === "achievers" && "Multi-Week Title Winners"}
              {activeLens === "goal_chasers" && "Highest Goal Follow-Through"}
            </span>
            <span className="hidden sm:inline">
              {activeLens === "most_studying" &&
                "Top 5 students with the highest daily average study time"}
              {activeLens === "consistency_boost" &&
                "Top 5 students demonstrating the most consistent daily study habits"}
              {activeLens === "achievers" &&
                "Hall of Fame: Students with the most weekly Achiever badge distinctions"}
              {activeLens === "goal_chasers" &&
                "Top 5 students with the highest weekly goal follow-through rate"}
            </span>
          </h3>
        </div>
      </div>

      {/* 4. Domain-Specific Analytical Visualizer */}
      <div
        role="tabpanel"
        id={`lens-panel-${activeLens}`}
        aria-labelledby={`lens-tab-${activeLens}`}
        className="w-full pt-1"
      >
        {activeLens === "most_studying" && (
          <StudyVolumeSpectrum
            entries={rankings.most_studying || []}
            currentUserId={currentUserId}
          />
        )}
        {activeLens === "consistency_boost" && (
          <ConsistencyRhythmMatrix
            entries={rankings.consistency_rhythm_matrix || []}
            currentUserId={currentUserId}
          />
        )}
        {activeLens === "achievers" && (
          <AchieversHallOfFame
            entries={rankings.achiever_winners || []}
            currentUserId={currentUserId}
          />
        )}
        {activeLens === "goal_chasers" && (
          <GoalExecutionGauges
            entries={rankings.goal_chasers || []}
            currentUserId={currentUserId}
          />
        )}
      </div>
    </section>
  );
});
