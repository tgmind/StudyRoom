"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useUserStreak } from "@/hooks/useUserStreak";
import { calculateMemberElapsedStudySeconds } from "@/lib/time/format";
import { getServerNow } from "@/lib/time/clockSync";
import { TopHeader } from "@/components/navigation/TopHeader";
import { BottomNav } from "@/components/navigation/BottomNav";
import { StreakHero } from "@/components/streak/StreakHero";
import { StreakHeatmap } from "@/components/streak/StreakHeatmap";
import { ConsistencyMetrics } from "@/components/streak/ConsistencyMetrics";
import { DayDetailModal } from "@/components/streak/DayDetailModal";
import { Flame, Loader2 } from "lucide-react";

export default function StreakPage() {
  const { user, profile } = useAuth();

  // Lightweight live in-progress active study minutes derived directly from profile
  // Eliminates 1-second re-renders and decouples heavy session controller logic from the streak view
  const [liveActiveMinutes, setLiveActiveMinutes] = useState(() => {
    if (profile?.current_status === "studying") {
      return Math.floor(calculateMemberElapsedStudySeconds(profile, getServerNow()) / 60);
    }
    return 0;
  });

  useEffect(() => {
    if (profile?.current_status !== "studying") {
      setLiveActiveMinutes(0);
      return;
    }

    const checkMinutes = () => {
      const mins = Math.floor(calculateMemberElapsedStudySeconds(profile, getServerNow()) / 60);
      setLiveActiveMinutes((prev) => (prev !== mins ? mins : prev));
    };

    checkMinutes();
    const interval = setInterval(checkMinutes, 15000);

    const handleVisibility = () => {
      if (document.visibilityState === "visible") checkMinutes();
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [profile]);

  const {
    loading,
    error,
    heatmapDays,
    stats,
    selectedDay,
    setSelectedDay,
  } = useUserStreak(user?.id, liveActiveMinutes);

  return (
    <div className="flex-1 flex flex-col min-h-screen pb-24 bg-[#090a0f] text-zinc-100">
      <TopHeader profile={profile} />

      <main className="flex-1 w-full max-w-2xl sm:max-w-3xl lg:max-w-4xl px-3.5 sm:px-6 py-3.5 sm:py-5 mx-auto space-y-4 sm:space-y-5">
        {/* Compact Header Bar */}
        <div className="flex items-center justify-between gap-2 px-1">
          <div className="flex items-center space-x-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-400 shrink-0 shadow-inner">
              <Flame className="w-4 h-4 sm:w-5 sm:h-5 fill-amber-400" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-base font-black text-zinc-100 tracking-tight leading-snug">
                Study Consistency & Streak
              </h1>
              <p className="text-[10px] sm:text-xs text-zinc-400 leading-snug">
                Weekly study heatmap & habit tracking (Updated every midnight)
              </p>
            </div>
          </div>
        </div>

        {/* Loading Skeleton */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-3">
            <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
            <p className="text-xs font-semibold text-zinc-400">
              Calculating your consistency streak...
            </p>
          </div>
        ) : error ? (
          <div className="rounded-2xl bg-rose-950/30 border border-rose-500/30 p-4 text-center text-xs text-rose-300">
            {error}
          </div>
        ) : (
          <>
            {/* 1. Hero Streak Card */}
            <StreakHero stats={stats} />

            {/* 2. Weekly Study Heatmap */}
            <StreakHeatmap
              days={heatmapDays}
              selectedDay={selectedDay}
              onSelectDay={setSelectedDay}
            />

            {/* 3. Deep Consistency Reports & Analytics Grid */}
            <ConsistencyMetrics stats={stats} />

            {/* 4. Interactive Day Detail Modal */}
            <DayDetailModal
              day={selectedDay}
              onClose={() => setSelectedDay(null)}
            />
          </>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
