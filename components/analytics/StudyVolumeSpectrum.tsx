"use client";

import React, { memo, useState, useEffect, useMemo } from "react";
import { MostStudyingEntry } from "@/lib/supabase/types";
import { formatMinutesToHours } from "@/lib/time/format";
import { Flame, Clock, Calendar, Trophy, Activity } from "lucide-react";
import { ObservatoryAvatar } from "./ObservatoryAvatar";
import { createClient } from "@/lib/supabase/client";

interface StudyVolumeSpectrumProps {
  entries: MostStudyingEntry[];
  currentUserId?: string;
  weekStart?: string;
  weekEnd?: string;
}

export const StudyVolumeSpectrum = memo(function StudyVolumeSpectrum({
  entries,
  currentUserId,
  weekStart,
  weekEnd,
}: StudyVolumeSpectrumProps) {
  if (entries.length === 0) {
    return (
      <div className="p-8 text-center rounded-3xl bg-zinc-900/40 border border-dashed border-zinc-800 text-xs text-zinc-500">
        No qualifying study velocity recorded for this period.
      </div>
    );
  }

  const top1 = entries[0];
  const top2And3 = entries.slice(1, 3);
  const top4And5 = entries.slice(3, 5);

  const maxDailyAvg = Math.max(...entries.map((e) => e.daily_average_minutes), 1);

  return (
    <div className="w-full space-y-3">
      {/* 1. Pinnacle Hero Velocity Node (#1) */}
      {top1 && (
        <PinnacleHeroNode
          entry={top1}
          isCurrent={top1.user_id === currentUserId}
          weekStart={weekStart}
          weekEnd={weekEnd}
        />
      )}

      {/* 2. Comparative Velocity Pair (#2 & #3) — Clean without full-width bars */}
      {top2And3.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {top2And3.map((entry) => (
            <ComparativeVelocityCard
              key={entry.user_id}
              entry={entry}
              maxDailyAvg={maxDailyAvg}
              isCurrent={entry.user_id === currentUserId}
            />
          ))}
        </div>
      )}

      {/* 3. Compact Velocity Rows (#4 & #5) — Information dense, zero bars */}
      {top4And5.length > 0 && (
        <div className="space-y-1.5 pt-1">
          {top4And5.map((entry) => (
            <CompactVelocityRow
              key={entry.user_id}
              entry={entry}
              isCurrent={entry.user_id === currentUserId}
            />
          ))}
        </div>
      )}
    </div>
  );
});

// A. #1 Pinnacle Hero Node
function PinnacleHeroNode({
  entry,
  isCurrent,
  weekStart,
  weekEnd,
}: {
  entry: MostStudyingEntry;
  isCurrent: boolean;
  weekStart?: string;
  weekEnd?: string;
}) {
  const dailyHours = (entry.daily_average_minutes / 60).toFixed(1);
  const totalHours = formatMinutesToHours(entry.total_study_minutes);

  const [dailyMinutes, setDailyMinutes] = useState<number[] | null>(null);

  useEffect(() => {
    let isMounted = true;
    const targetWeekStart = weekStart;
    const targetWeekEnd = weekEnd;
    const targetUserId = entry.user_id;

    if (!targetWeekStart || !targetWeekEnd || !targetUserId) {
      return;
    }

    async function fetchDailySessions(wStart: string, wEnd: string, uId: string) {
      try {
        const supabase = createClient();
        if (!supabase || typeof supabase.from !== "function") {
          return;
        }

        const { data, error } = await supabase
          .from("study_sessions")
          .select("start_time, duration_minutes")
          .eq("user_id", uId)
          .gte("start_time", wStart)
          .lt("start_time", wEnd);

        if (error || !data || !isMounted) {
          return;
        }

        const days = [0, 0, 0, 0, 0, 0, 0];
        const startMs = new Date(wStart).getTime();

        data.forEach((s: { start_time: string; duration_minutes: number | null }) => {
          if (!s.start_time) return;
          const sessionMs = new Date(s.start_time).getTime();
          const diffDays = Math.floor((sessionMs - startMs) / (24 * 60 * 60 * 1000));
          if (diffDays >= 0 && diffDays < 7) {
            days[diffDays] += Math.max(0, s.duration_minutes || 0);
          }
        });

        if (isMounted) {
          setDailyMinutes(days);
        }
      } catch {
        // Safe fallback
      }
    }

    fetchDailySessions(targetWeekStart, targetWeekEnd, targetUserId);

    return () => {
      isMounted = false;
    };
  }, [entry.user_id, weekStart, weekEnd]);

  const resolvedMinutes = useMemo(() => {
    if (dailyMinutes) return dailyMinutes;
    const activeCount = Math.max(0, Math.min(7, entry.active_study_days || 0));
    const avgForActive =
      activeCount > 0
        ? Math.round(entry.total_study_minutes / activeCount)
        : 0;
    return Array.from({ length: 7 }, (_, i) => (i < activeCount ? avgForActive : 0));
  }, [dailyMinutes, entry.active_study_days, entry.total_study_minutes]);

  const maxDayMinutes = useMemo(
    () => Math.max(...resolvedMinutes, 1),
    [resolvedMinutes]
  );

  return (
    <div
      className={`w-full relative overflow-hidden rounded-2xl border p-4 sm:p-5 transition-all duration-300 ${
        isCurrent
          ? "bg-gradient-to-b from-amber-500/15 via-zinc-900/95 to-zinc-950 border-amber-400/50 shadow-[0_0_30px_rgba(245,158,11,0.18)] ring-1 ring-amber-400/30"
          : "bg-gradient-to-b from-amber-500/10 via-zinc-900/90 to-zinc-950 border-amber-500/30 shadow-[0_4px_20px_rgba(0,0,0,0.5)]"
      }`}
    >
      <div className="relative z-10 space-y-3.5">
        {/* Header Bar */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-amber-400/15 border border-amber-400/30 text-amber-300 text-[10px] sm:text-xs font-black uppercase tracking-wider">
            <Flame className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
            <span>Top Study Velocity · #1</span>
          </span>

          {isCurrent && (
            <span className="px-2 py-0.5 rounded-full bg-amber-400 text-zinc-950 text-[10px] font-black uppercase tracking-wider shadow-sm">
              You · #1 Worldwide
            </span>
          )}
        </div>

        {/* Member & Velocity Callout */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-3 min-w-0">
            {/* Profile Avatar */}
            <div className="relative shrink-0">
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl p-0.5 bg-gradient-to-b from-amber-300 via-amber-400 to-amber-600 shadow-[0_0_16px_rgba(245,158,11,0.35)] ring-2 ring-amber-400/30 overflow-hidden">
                <div className="w-full h-full rounded-[14px] overflow-hidden bg-zinc-950 flex items-center justify-center relative">
                  <ObservatoryAvatar
                    name={entry.display_name}
                    url={entry.avatar_url}
                    size="hero"
                    theme="amber"
                  />
                </div>
              </div>
              <div className="absolute -bottom-1 -right-1 px-1.5 py-0.2 rounded-full bg-amber-400 text-zinc-950 text-[9px] font-black shadow border border-amber-200">
                #1
              </div>
            </div>

            <div className="min-w-0 flex-1">
              <h3 className="text-sm sm:text-base font-black text-white truncate">
                {entry.display_name}
              </h3>
              <div className="flex items-center gap-2 mt-0.5 text-[11px] text-zinc-400 flex-wrap">
                <span className="inline-flex items-center gap-1 text-zinc-300 font-medium">
                  <Calendar className="w-3 h-3 text-amber-400" />
                  {entry.active_study_days} of 7 active days
                </span>
                <span className="text-zinc-600">•</span>
                <span className="inline-flex items-center gap-1 text-zinc-400 font-medium text-[10px]">
                  <Trophy className="w-3 h-3 text-amber-400/80" />
                  {entry.score.toFixed(1)} pts
                </span>
              </div>
            </div>
          </div>

          {/* Primary Velocity Stat */}
          <div className="text-left sm:text-right font-mono shrink-0 pl-1 sm:pl-0 border-l sm:border-l-0 border-zinc-800/80">
            <div className="text-xl sm:text-2xl font-black text-amber-300 tracking-tight">
              {dailyHours}
              <span className="text-xs font-semibold text-zinc-400 font-sans">
                {" "}
                h / day
              </span>
            </div>
            <div className="text-[10.5px] text-zinc-400 font-medium mt-0.5 flex items-center sm:justify-end gap-1">
              <Clock className="w-3 h-3 text-zinc-500" />
              <span>{totalHours} total volume</span>
            </div>
          </div>
        </div>

        {/* 7-Day Slotted Rhythm Track */}
        <div className="pt-1.5 space-y-2">
          {/* Header Row */}
          <div className="flex items-center gap-1.5 text-xs text-zinc-300 font-semibold tracking-wide">
            <Activity className="w-3.5 h-3.5 text-amber-400" />
            <span>7-Day Study Rhythm Track</span>
          </div>

          {/* Slotted multi-segment rhythm progress bar */}
          <div className="w-full h-2.5 sm:h-3 rounded-full bg-black/60 p-[2px] border border-amber-500/20 shadow-inner flex gap-1">
            {resolvedMinutes.map((mins, idx) => {
              const isPeak = mins === maxDayMinutes && mins > 0;
              const dayName = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][idx];
              const hoursLabel = (mins / 60).toFixed(1);

              let slotStyle = "bg-zinc-900/90 border border-dashed border-zinc-800/80";
              if (mins > 0) {
                if (isPeak) {
                  slotStyle =
                    "bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.65)]";
                } else if (mins >= 360) {
                  slotStyle =
                    "bg-gradient-to-r from-amber-500 to-amber-400 shadow-[0_0_6px_rgba(245,158,11,0.35)]";
                } else if (mins >= 180) {
                  slotStyle = "bg-gradient-to-r from-amber-600 to-amber-500";
                } else {
                  slotStyle = "bg-gradient-to-r from-amber-700/80 to-amber-600/70";
                }
              }

              return (
                <div
                  key={idx}
                  className={`flex-1 h-full first:rounded-l-full last:rounded-r-full transition-all duration-300 relative ${slotStyle}`}
                  title={`${dayName}: ${hoursLabel}h ${isPeak ? "(Peak Focus)" : mins === 0 ? "(Rest Day)" : ""}`}
                />
              );
            })}
          </div>

          {/* 7-Column Daily Micro-Grid */}
          <div className="grid grid-cols-7 gap-1 pt-0.5 text-center font-mono">
            {resolvedMinutes.map((mins, idx) => {
              const isPeak = mins === maxDayMinutes && mins > 0;
              const dayFull = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][idx];
              const dayShort = ["M", "T", "W", "T", "F", "S", "S"][idx];
              const hoursStr = (mins / 60).toFixed(1);

              return (
                <div key={idx} className="flex flex-col items-center">
                  <span className="text-[9px] sm:text-[10px] text-zinc-400 font-medium">
                    <span className="hidden sm:inline">{dayFull}</span>
                    <span className="sm:hidden">{dayShort}</span>
                  </span>
                  <span
                    className={`text-[8.5px] sm:text-[10px] font-bold tabular-nums leading-tight ${
                      mins > 0
                        ? isPeak
                          ? "text-amber-300 font-black"
                          : "text-zinc-200"
                        : "text-zinc-600"
                    }`}
                  >
                    {mins > 0 ? `${hoursStr}h` : "0h"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// B. Comparative Velocity Card (#2 & #3) — Clean without full-width bars
function ComparativeVelocityCard({
  entry,
  maxDailyAvg,
  isCurrent,
}: {
  entry: MostStudyingEntry;
  maxDailyAvg: number;
  isCurrent: boolean;
}) {
  const dailyHours = (entry.daily_average_minutes / 60).toFixed(1);
  const totalHours = formatMinutesToHours(entry.total_study_minutes);
  const pctOfPeak = Math.min(
    100,
    Math.max(15, Math.round((entry.daily_average_minutes / maxDailyAvg) * 100))
  );

  return (
    <div
      className={`w-full rounded-xl p-3 border transition-all duration-200 flex items-center justify-between gap-2.5 ${
        isCurrent
          ? "bg-amber-500/10 border-amber-500/40 shadow-sm ring-1 ring-amber-500/30"
          : "bg-zinc-900/60 border-zinc-800/80 hover:border-zinc-700/80"
      }`}
    >
      <div className="flex items-center space-x-2.5 min-w-0">
        <span className="font-mono text-xs font-black text-zinc-500 shrink-0">
          #{entry.rank}
        </span>
        <div className="w-9 h-9 rounded-xl overflow-hidden bg-zinc-900 border border-zinc-700/80 shrink-0 flex items-center justify-center">
          <ObservatoryAvatar name={entry.display_name} url={entry.avatar_url} size="md" theme="default" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center space-x-1.5">
            <h4 className="text-xs sm:text-sm font-bold text-zinc-100 truncate">
              {entry.display_name}
            </h4>
            {isCurrent && (
              <span className="px-1.5 py-0.2 rounded bg-amber-400/20 text-amber-300 text-[8.5px] font-black uppercase">
                You
              </span>
            )}
          </div>
          <div className="flex items-center space-x-1.5 text-[10px] text-zinc-400 mt-0.5">
            <span>{totalHours} total</span>
            <span>•</span>
            <span>{entry.active_study_days}/7 days</span>
          </div>
        </div>
      </div>

      <div className="text-right font-mono shrink-0">
        <span className="text-xs sm:text-sm font-black text-amber-300 block">
          {dailyHours}
          <span className="text-[10px] font-normal text-zinc-400 font-sans">
            {" "}
            h/d
          </span>
        </span>
        <span className="text-[9px] text-amber-400/70 font-semibold">
          {pctOfPeak}% of peak
        </span>
      </div>
    </div>
  );
}

// C. Compact Velocity Row (#4 & #5) — Information dense, zero bars
function CompactVelocityRow({
  entry,
  isCurrent,
}: {
  entry: MostStudyingEntry;
  isCurrent: boolean;
}) {
  const dailyHours = (entry.daily_average_minutes / 60).toFixed(1);
  const totalHours = formatMinutesToHours(entry.total_study_minutes);

  return (
    <div
      className={`w-full rounded-xl px-3 py-2 border transition-all duration-200 flex items-center justify-between gap-2.5 ${
        isCurrent
          ? "bg-amber-500/10 border-amber-500/40 shadow-sm ring-1 ring-amber-500/30"
          : "bg-zinc-900/40 border-zinc-800/80 hover:border-zinc-700/80"
      }`}
    >
      <div className="flex items-center space-x-2.5 min-w-0">
        <span className="font-mono text-xs font-black text-zinc-500 shrink-0">
          #{entry.rank}
        </span>
        <div className="w-7 h-7 rounded-lg overflow-hidden bg-zinc-900 border border-zinc-700/80 shrink-0 flex items-center justify-center">
          <ObservatoryAvatar name={entry.display_name} url={entry.avatar_url} size="xs" theme="default" />
        </div>
        <div className="min-w-0 flex items-center space-x-2">
          <span className="text-xs font-bold text-zinc-200 truncate">
            {entry.display_name}
          </span>
          {isCurrent && (
            <span className="px-1 py-0.2 rounded bg-amber-400/20 text-amber-300 text-[8.5px] font-black uppercase">
              You
            </span>
          )}
          <span className="text-[10px] text-zinc-500 hidden sm:inline">
            • {entry.active_study_days}/7 active
          </span>
        </div>
      </div>

      <div className="text-right font-mono shrink-0 flex items-baseline space-x-2">
        <span className="text-xs font-black text-amber-300">
          {dailyHours}
          <span className="text-[9.5px] font-normal text-zinc-400 font-sans">
            {" "}
            h/d
          </span>
        </span>
        <span className="text-[10px] text-zinc-500 hidden sm:inline">
          ({totalHours})
        </span>
      </div>
    </div>
  );
}
