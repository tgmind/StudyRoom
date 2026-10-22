"use client";

import React, { memo } from "react";
import { DesktopAppLayout } from "./DesktopAppLayout";
import { StreakHero } from "@/components/streak/StreakHero";
import { StreakHeatmap } from "@/components/streak/StreakHeatmap";
import { ConsistencyMetrics } from "@/components/streak/ConsistencyMetrics";
import { DayDetailModal } from "@/components/streak/DayDetailModal";
import { PlannerCalendarMap } from "@/components/streak/PlannerCalendarMap";
import { Flame, Loader2 } from "lucide-react";
import { UserProfile } from "@/lib/supabase/types";
import { HeatmapDay, DailyStudySummary } from "@/lib/scoring/streak";

export interface DesktopStreakViewProps {
  profile: UserProfile | null;
  loading: boolean;
  error: string | null;
  heatmapDays: HeatmapDay[];
  stats: any;
  selectedDay: HeatmapDay | null;
  setSelectedDay: (day: HeatmapDay | null) => void;
  dailySummaries: DailyStudySummary[];
  examPlans: any[];
  plannerLoading: boolean;
}

export const DesktopStreakView = memo(function DesktopStreakView({
  profile,
  loading,
  error,
  heatmapDays,
  stats,
  selectedDay,
  setSelectedDay,
  dailySummaries,
  examPlans,
  plannerLoading,
}: DesktopStreakViewProps) {
  return (
    <DesktopAppLayout profile={profile}>
      <main className="w-full px-6 lg:px-8 xl:px-12 py-6 space-y-6">
        {/* Desktop Header */}
        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-400 shrink-0 shadow-inner">
              <Flame className="w-5 h-5 fill-amber-400" />
            </div>
            <div>
              <h1 className="text-base font-black text-zinc-100 tracking-tight">
                Study Consistency & Streak
              </h1>
              <p className="text-xs text-zinc-400">
                Continuous weekly habit heatmaps & accountability tracking (Updated every midnight IST)
              </p>
            </div>
          </div>
        </div>

        {/* Loading Skeleton */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 space-y-3">
            <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
            <p className="text-xs font-semibold text-zinc-400">
              Calculating your consistency streak...
            </p>
          </div>
        ) : error ? (
          <div className="rounded-2xl bg-rose-950/30 border border-rose-500/30 p-5 text-center text-xs text-rose-300">
            {error}
          </div>
        ) : (
          <>
            {/* 1. TOP BALANCED 50/50 HERO DECK */}
            <div className="grid grid-cols-2 gap-6 items-stretch">
              {/* Left Wing: Hero Streak Summary */}
              <div className="flex flex-col h-full">
                <StreakHero stats={stats} />
              </div>

              {/* Right Wing: Weekly Study Heatmap */}
              <div className="flex flex-col h-full">
                <StreakHeatmap
                  days={heatmapDays}
                  selectedDay={selectedDay}
                  onSelectDay={setSelectedDay}
                />
              </div>
            </div>

            {/* 2. DEEP CONSISTENCY METRICS */}
            <div className="w-full">
              <ConsistencyMetrics stats={stats} />
            </div>

            {/* 3. FULL-WIDTH EXAM PREPARATION CALENDAR MAP */}
            <div className="w-full">
              <PlannerCalendarMap
                plans={examPlans}
                loading={plannerLoading}
                dailySummaries={dailySummaries}
              />
            </div>

            {/* 4. Interactive Day Detail Modal */}
            <DayDetailModal
              day={selectedDay}
              onClose={() => setSelectedDay(null)}
            />
          </>
        )}
      </main>
    </DesktopAppLayout>
  );
});
