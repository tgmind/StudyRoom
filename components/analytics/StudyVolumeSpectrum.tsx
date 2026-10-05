"use client";

import React, { memo } from "react";
import { MostStudyingEntry } from "@/lib/supabase/types";
import { formatMinutesToHours } from "@/lib/time/format";
import { Flame, Clock, Calendar, Trophy } from "lucide-react";

interface StudyVolumeSpectrumProps {
  entries: MostStudyingEntry[];
  currentUserId?: string;
}

export const StudyVolumeSpectrum = memo(function StudyVolumeSpectrum({
  entries,
  currentUserId,
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
}: {
  entry: MostStudyingEntry;
  isCurrent: boolean;
}) {
  const dailyHours = (entry.daily_average_minutes / 60).toFixed(1);
  const totalHours = formatMinutesToHours(entry.total_study_minutes);

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
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl p-0.5 bg-gradient-to-b from-amber-300 to-amber-600 shadow-[0_0_16px_rgba(245,158,11,0.3)] ring-2 ring-amber-400/30">
                <AvatarContent name={entry.display_name} url={entry.avatar_url} />
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

        {/* Hero Proportional Intensity Beam (ONLY on #1) */}
        <div className="pt-0.5 space-y-1">
          <div className="flex items-center justify-between text-[9.5px] font-mono text-zinc-400">
            <span>Study Velocity Intensity</span>
            <span className="text-amber-400 font-bold">100% Baseline</span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-zinc-950 overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-300 shadow-[0_0_8px_rgba(245,158,11,0.5)] w-full" />
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
        <div className="w-9 h-9 rounded-xl overflow-hidden bg-zinc-800 border border-zinc-700/80 shrink-0">
          <AvatarContent name={entry.display_name} url={entry.avatar_url} />
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
        <div className="w-7 h-7 rounded-lg overflow-hidden bg-zinc-800 border border-zinc-700/80 shrink-0">
          <AvatarContent name={entry.display_name} url={entry.avatar_url} />
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

function AvatarContent({ name, url }: { name: string; url: string | null }) {
  const initials = name ? name.substring(0, 2).toUpperCase() : "??";
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt={name} className="w-full h-full object-cover" />
    );
  }
  return (
    <div className="w-full h-full bg-zinc-800 flex items-center justify-center text-zinc-300 font-black text-xs">
      {initials}
    </div>
  );
}
