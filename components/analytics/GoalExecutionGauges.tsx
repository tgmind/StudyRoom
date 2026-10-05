"use client";

import React, { memo } from "react";
import { GoalChaserEntry } from "@/lib/supabase/types";
import { formatMinutesToHours } from "@/lib/time/format";
import { Target, CheckCircle2, Clock } from "lucide-react";

interface GoalExecutionGaugesProps {
  entries: GoalChaserEntry[];
  currentUserId?: string;
}

export const GoalExecutionGauges = memo(function GoalExecutionGauges({
  entries,
  currentUserId,
}: GoalExecutionGaugesProps) {
  if (entries.length === 0) {
    return (
      <div className="p-8 text-center rounded-3xl bg-zinc-900/40 border border-dashed border-zinc-800 text-xs text-zinc-500">
        No qualifying goals completed for this period.
      </div>
    );
  }

  const top1 = entries[0];
  const otherEntries = entries.slice(1);

  return (
    <div className="w-full space-y-3.5">
      {/* Informational Guidance */}
      <div className="px-1 text-[11px] text-zinc-400 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-emerald-300/90 font-medium">
          <Target className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span>Task Discipline & Goal Execution Precision</span>
        </span>
        <span className="text-zinc-500 font-mono text-[10px]">
          Fulfillment rate (%)
        </span>
      </div>

      {/* 1. #1 Primary Precision Spotlight */}
      {top1 && (
        <PrimaryPrecisionSpotlight
          entry={top1}
          isCurrent={top1.user_id === currentUserId}
        />
      )}

      {/* 2. Compact Analytical Gauges Grid (#2 through #5) */}
      {otherEntries.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {otherEntries.map((entry) => (
            <CompactGaugeCard
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

// A. #1 Primary Precision Spotlight
function PrimaryPrecisionSpotlight({
  entry,
  isCurrent,
}: {
  entry: GoalChaserEntry;
  isCurrent: boolean;
}) {
  const totalHours = formatMinutesToHours(entry.total_study_minutes);
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.min(100, Math.max(0, entry.goal_completion_pct));
  const strokeDashoffset = circumference - (circumference * pct) / 100;

  return (
    <div
      className={`w-full relative overflow-hidden rounded-3xl border p-4 sm:p-6 transition-all duration-300 ${
        isCurrent
          ? "bg-gradient-to-b from-emerald-500/20 via-zinc-900/95 to-zinc-950 border-emerald-400/60 shadow-[0_0_35px_rgba(16,185,129,0.22)] ring-1 ring-emerald-400/40"
          : "bg-gradient-to-b from-emerald-500/10 via-zinc-900/90 to-zinc-950 border-emerald-500/35 shadow-[0_8px_30px_rgba(16,185,129,0.12)]"
      }`}
    >
      {/* Ambient background glow */}
      <div
        className="pointer-events-none absolute -top-20 -right-20 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl"
        aria-hidden="true"
      />

      <div className="relative z-10 space-y-4">
        {/* Header Bar */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-emerald-400/15 border border-emerald-400/30 text-emerald-300 text-[10px] sm:text-xs font-black uppercase tracking-wider">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>Precision Leader · #1 Execution</span>
          </span>

          {isCurrent && (
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-400 text-zinc-950 text-[10px] font-black uppercase tracking-wider shadow-sm">
              You · #1 Worldwide
            </span>
          )}
        </div>

        {/* Member & Radial Gauge Layout */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-3.5 min-w-0">
            {/* Profile Avatar */}
            <div className="relative shrink-0">
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl p-0.5 bg-gradient-to-b from-emerald-300 to-emerald-600 shadow-[0_0_20px_rgba(16,185,129,0.35)] ring-2 ring-emerald-400/30">
                <AvatarContent
                  name={entry.display_name}
                  url={entry.avatar_url}
                />
              </div>
              <div className="absolute -bottom-1 -right-1 px-1.5 py-0.2 rounded-full bg-emerald-400 text-zinc-950 text-[10px] font-black shadow border border-emerald-200">
                #1
              </div>
            </div>

            <div className="min-w-0 flex-1">
              <h3 className="text-base sm:text-lg font-black text-white truncate">
                {entry.display_name}
              </h3>
              <div className="text-[11px] text-zinc-400 mt-0.5 space-y-0.5">
                <p className="font-mono">
                  <strong className="text-emerald-300 font-bold">
                    {entry.completed_tasks}
                  </strong>{" "}
                  of{" "}
                  <strong className="text-zinc-200 font-bold">
                    {entry.total_tasks}
                  </strong>{" "}
                  tasks fulfilled
                </p>
                <p className="text-[10px] text-zinc-500 flex items-center gap-1 font-mono">
                  <Clock className="w-3 h-3" />
                  <span>{totalHours} study duration</span>
                </p>
              </div>
            </div>
          </div>

          {/* Primary SVG Precision Gauge */}
          <div className="flex items-center justify-center sm:justify-end shrink-0">
            <div className="relative w-24 h-24 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 96 96">
                {/* Background Ring */}
                <circle
                  cx="48"
                  cy="48"
                  r={radius}
                  className="stroke-zinc-800"
                  strokeWidth="8"
                  fill="transparent"
                />
                {/* Precision Active Arc */}
                <circle
                  cx="48"
                  cy="48"
                  r={radius}
                  className="stroke-emerald-400 motion-safe:transition-all motion-safe:duration-1000 motion-reduce:transition-none"
                  strokeWidth="8"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  fill="transparent"
                  style={{
                    filter: "drop-shadow(0 0 6px rgba(52, 211, 153, 0.6))",
                  }}
                />
              </svg>

              {/* Gauge Inset Text */}
              <div className="absolute inset-0 flex flex-col items-center justify-center font-mono">
                <span className="text-base sm:text-lg font-black text-emerald-300 tracking-tight">
                  {entry.goal_completion_pct}%
                </span>
                <span className="text-[9px] uppercase tracking-wider text-zinc-500 font-sans font-bold">
                  Precision
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// B. Compact Gauge Card (#2 through #5)
function CompactGaugeCard({
  entry,
  isCurrent,
}: {
  entry: GoalChaserEntry;
  isCurrent: boolean;
}) {
  const totalHours = formatMinutesToHours(entry.total_study_minutes);
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.min(100, Math.max(0, entry.goal_completion_pct));
  const strokeDashoffset = circumference - (circumference * pct) / 100;

  return (
    <div
      className={`w-full rounded-2xl p-3.5 sm:p-4 border transition-all duration-200 flex items-center justify-between gap-3 ${
        isCurrent
          ? "bg-emerald-500/10 border-emerald-500/40 shadow-[0_0_20px_rgba(16,185,129,0.15)] ring-1 ring-emerald-500/30"
          : "bg-zinc-900/80 border-zinc-800/90 hover:border-zinc-700/90"
      }`}
    >
      <div className="flex items-center space-x-2.5 min-w-0 flex-1">
        <span className="font-mono text-xs font-black text-emerald-400/90 shrink-0">
          #{entry.rank}
        </span>
        <div className="w-9 h-9 rounded-xl overflow-hidden bg-zinc-800 border border-zinc-700/80 shrink-0">
          <AvatarContent name={entry.display_name} url={entry.avatar_url} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center space-x-1.5">
            <h4 className="text-xs sm:text-sm font-bold text-zinc-100 truncate">
              {entry.display_name}
            </h4>
            {isCurrent && (
              <span className="px-1.5 py-0.2 rounded bg-emerald-400/20 text-emerald-300 text-[9px] font-black uppercase">
                You
              </span>
            )}
          </div>
          <span className="text-[10px] text-zinc-400 block truncate font-mono">
            {entry.completed_tasks}/{entry.total_tasks} tasks • {totalHours}
          </span>
        </div>
      </div>

      {/* SVG Mini Circular Gauge */}
      <div className="relative w-14 h-14 shrink-0 flex items-center justify-center">
        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 56 56">
          <circle
            cx="28"
            cy="28"
            r={radius}
            className="stroke-zinc-800"
            strokeWidth="5"
            fill="transparent"
          />
          <circle
            cx="28"
            cy="28"
            r={radius}
            className="stroke-emerald-400 motion-safe:transition-all motion-safe:duration-700 motion-reduce:transition-none"
            strokeWidth="5"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            fill="transparent"
          />
        </svg>
        <span className="absolute font-mono text-[10.5px] font-black text-emerald-300">
          {Math.round(entry.goal_completion_pct)}%
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
    <div className="w-full h-full bg-zinc-800 flex items-center justify-center text-zinc-300 font-black text-[11px]">
      {initials}
    </div>
  );
}
