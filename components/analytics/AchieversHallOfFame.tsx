"use client";

import React, { memo } from "react";
import { AchieverWinnerEntry } from "@/lib/supabase/types";
import { formatMinutesToHours } from "@/lib/time/format";
import { Award, Trophy, Crown, Sparkles, Clock } from "lucide-react";

interface AchieversHallOfFameProps {
  entries: AchieverWinnerEntry[];
  currentUserId?: string;
}

export const AchieversHallOfFame = memo(function AchieversHallOfFame({
  entries,
  currentUserId,
}: AchieversHallOfFameProps) {
  if (entries.length === 0) {
    return (
      <div className="p-8 text-center rounded-3xl bg-zinc-900/40 border border-dashed border-zinc-800 text-xs text-zinc-500">
        No Achiever badge winners recorded for this weekly period.
      </div>
    );
  }

  const top1 = entries[0];
  const contenders = entries.slice(1);

  return (
    <div className="w-full space-y-3.5">
      {/* Informational Guidance */}
      <div className="px-1 text-[11px] text-zinc-400 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-purple-300/90 font-medium">
          <Award className="w-3.5 h-3.5 text-purple-400 shrink-0" />
          <span>Hall of Fame · Historical Multi-Week Distinction</span>
        </span>
        <span className="text-zinc-500 font-mono text-[10px]">
          Cumulative weekly titles
        </span>
      </div>

      {/* 1. All-Time Grand Achiever Showcase (#1) */}
      {top1 && (
        <GrandAchieverShowcase
          entry={top1}
          isCurrent={top1.user_id === currentUserId}
        />
      )}

      {/* 2. Distinction Contenders Grid (#2 through #5) */}
      {contenders.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {contenders.map((entry) => (
            <ContenderCard
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

// A. Grand Achiever Hero Showcase
function GrandAchieverShowcase({
  entry,
  isCurrent,
}: {
  entry: AchieverWinnerEntry;
  isCurrent: boolean;
}) {
  const totalHours = formatMinutesToHours(entry.total_study_minutes);
  // Visual trophy count, clamped to 8 tokens for UI elegance
  const trophyTokens = Math.min(8, Math.max(1, entry.achiever_count));
  const overflowCount = entry.achiever_count > 8 ? entry.achiever_count - 8 : 0;

  return (
    <div
      className={`w-full relative overflow-hidden rounded-3xl border p-4 sm:p-6 transition-all duration-300 ${
        isCurrent
          ? "bg-gradient-to-b from-purple-500/20 via-zinc-900/95 to-zinc-950 border-purple-400/60 shadow-[0_0_35px_rgba(168,85,247,0.22)] ring-1 ring-purple-400/40"
          : "bg-gradient-to-b from-purple-500/10 via-zinc-900/90 to-zinc-950 border-purple-500/35 shadow-[0_8px_30px_rgba(168,85,247,0.12)]"
      }`}
    >
      {/* Ambient background glow */}
      <div
        className="pointer-events-none absolute -top-20 -right-20 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl"
        aria-hidden="true"
      />

      <div className="relative z-10 space-y-4">
        {/* Header Bar */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-purple-400/15 border border-purple-400/30 text-purple-300 text-[10px] sm:text-xs font-black uppercase tracking-wider">
            <Crown className="w-3.5 h-3.5 text-purple-400" />
            <span>Grand Master Achiever · #1 Hall of Fame</span>
          </span>

          {isCurrent && (
            <span className="px-2.5 py-0.5 rounded-full bg-purple-500 text-zinc-100 text-[10px] font-black uppercase tracking-wider shadow-sm">
              You · #1 Hall of Fame
            </span>
          )}
        </div>

        {/* Member & Title Callout */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-3.5 min-w-0">
            {/* Crowned Profile Avatar */}
            <div className="relative shrink-0">
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl p-0.5 bg-gradient-to-b from-purple-300 to-purple-600 shadow-[0_0_20px_rgba(168,85,247,0.35)] ring-2 ring-purple-400/30">
                <AvatarContent
                  name={entry.display_name}
                  url={entry.avatar_url}
                />
              </div>
              <div className="absolute -bottom-1 -right-1 px-1.5 py-0.2 rounded-full bg-purple-500 text-zinc-100 text-[10px] font-black shadow border border-purple-300">
                #1
              </div>
            </div>

            <div className="min-w-0 flex-1">
              <h3 className="text-base sm:text-lg font-black text-white truncate">
                {entry.display_name}
              </h3>
              <p className="text-[11px] text-purple-300/80 font-medium flex items-center gap-1 mt-0.5">
                <Sparkles className="w-3 h-3 text-purple-400 shrink-0" />
                <span>All-time community distinction leader</span>
              </p>
            </div>
          </div>

          {/* Trophy Count Callout */}
          <div className="text-left sm:text-right shrink-0">
            <div className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-2xl bg-purple-500/20 border border-purple-400/40 text-purple-200 shadow-md">
              <Trophy className="w-4 h-4 text-purple-400" />
              <span className="font-mono text-base sm:text-xl font-black">
                ×{entry.achiever_count}
              </span>
              <span className="text-[10px] font-bold text-purple-300/90 uppercase tracking-wider">
                Weekly Titles
              </span>
            </div>
            <div className="text-[11px] text-zinc-400 font-mono mt-1 flex items-center sm:justify-end gap-1">
              <Clock className="w-3 h-3 text-zinc-500" />
              <span>{totalHours} finalized study duration</span>
            </div>
          </div>
        </div>

        {/* Visual Achievement Token Ribbon */}
        <div className="pt-2 border-t border-purple-500/20 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            {Array.from({ length: trophyTokens }).map((_, i) => (
              <div
                key={i}
                className="w-6 h-6 rounded-lg bg-purple-500/20 border border-purple-400/30 flex items-center justify-center text-purple-300 shadow-sm"
                title={`Historical Achiever Distinction #${i + 1}`}
              >
                <Trophy className="w-3 h-3 text-purple-400" />
              </div>
            ))}
            {overflowCount > 0 && (
              <span className="text-[10px] font-mono text-purple-300 font-bold pl-1">
                +{overflowCount} more
              </span>
            )}
          </div>

          <span className="text-[10px] font-mono text-zinc-500">
            Vault Recognition
          </span>
        </div>
      </div>
    </div>
  );
}

// B. Contender Distinction Card (#2 through #5)
function ContenderCard({
  entry,
  isCurrent,
}: {
  entry: AchieverWinnerEntry;
  isCurrent: boolean;
}) {
  const totalHours = formatMinutesToHours(entry.total_study_minutes);

  return (
    <div
      className={`w-full rounded-2xl p-3.5 sm:p-4 border transition-all duration-200 space-y-3 ${
        isCurrent
          ? "bg-purple-500/10 border-purple-500/40 shadow-[0_0_20px_rgba(168,85,247,0.15)] ring-1 ring-purple-500/30"
          : "bg-zinc-900/80 border-zinc-800/90 hover:border-zinc-700/90"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
          Hall of Fame · #{entry.rank}
        </span>
        {isCurrent && (
          <span className="px-1.5 py-0.2 rounded bg-purple-400/20 text-purple-300 text-[9px] font-black uppercase">
            You
          </span>
        )}
      </div>

      <div className="flex items-center justify-between gap-2.5">
        <div className="flex items-center space-x-2.5 min-w-0">
          <div className="w-10 h-10 rounded-xl overflow-hidden bg-zinc-800 border border-zinc-700/80 shrink-0">
            <AvatarContent name={entry.display_name} url={entry.avatar_url} />
          </div>
          <div className="min-w-0">
            <h4 className="text-xs sm:text-sm font-bold text-zinc-100 truncate">
              {entry.display_name}
            </h4>
            <span className="text-[10px] text-zinc-400 block truncate">
              {totalHours} finalized study duration
            </span>
          </div>
        </div>

        {/* Distinct Achiever Token Pill */}
        <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-300 text-xs font-black shrink-0 font-mono">
          <Trophy className="w-3.5 h-3.5 text-purple-400" />
          <span>×{entry.achiever_count}</span>
        </div>
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
