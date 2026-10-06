"use client";

import React, { memo, useMemo } from "react";
import { ConsistencyEntry, LowPerformerEntry } from "@/lib/supabase/types";
import { calculateConsistencyRanking } from "@/lib/analytics/consistency";
import { formatMinutesToHours } from "@/lib/time/format";
import { TrendingUp, Clock } from "lucide-react";

interface ConsistencyRhythmMatrixProps {
  entries: (ConsistencyEntry | LowPerformerEntry)[];
  currentUserId?: string;
}

export const ConsistencyRhythmMatrix = memo(function ConsistencyRhythmMatrix({
  entries,
  currentUserId,
}: ConsistencyRhythmMatrixProps) {
  // Enforce canonical Consistency Ranking order:
  // Primary: active_study_days DESC, Secondary: total_study_minutes DESC, Tertiary: score DESC
  const rankedEntries = useMemo(() => {
    return calculateConsistencyRanking(entries);
  }, [entries]);

  if (rankedEntries.length === 0) {
    return (
      <div className="p-8 text-center rounded-3xl bg-zinc-900/40 border border-dashed border-zinc-800 text-xs text-zinc-500">
        No student consistency records for this period.
      </div>
    );
  }

  return (
    <div className="w-full space-y-3">
      {/* Informational Guidance */}
      <div className="px-1 text-[11px] text-zinc-400 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-sky-300/90 font-medium">
          <TrendingUp className="w-3.5 h-3.5 text-sky-400 shrink-0" />
          <span>Top Consistent Students • 7-Day Habit Continuity</span>
        </span>
        <span className="text-zinc-500 font-mono text-[10px]">
          Target: 7 / 7 active days
        </span>
      </div>

      {/* Grid of Habit Stability Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {rankedEntries.map((entry) => {
          const isCurrent = entry.user_id === currentUserId;
          const dailyHours = (entry.daily_average_minutes / 60).toFixed(1);
          const totalHours = formatMinutesToHours(entry.total_study_minutes);
          const activeDaysClamped = Math.min(7, Math.max(0, entry.active_study_days));
          const continuityPct = Math.round((activeDaysClamped / 7) * 100);
          const runwayDays = 7 - activeDaysClamped;

          return (
            <div
              key={entry.user_id}
              className={`w-full rounded-2xl p-3.5 sm:p-4 border transition-all duration-200 space-y-3 ${
                isCurrent
                  ? "bg-sky-500/10 border-sky-500/40 shadow-[0_0_20px_rgba(56,189,248,0.15)] ring-1 ring-sky-500/30"
                  : "bg-zinc-900/80 border-zinc-800/90 hover:border-zinc-700/90"
              }`}
            >
              {/* Header: Rank + Name + Optional "You" */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center space-x-2.5 min-w-0">
                  <span className="font-mono text-xs font-black text-sky-400/90 shrink-0">
                    #{entry.rank}
                  </span>
                  <div className="w-8 h-8 rounded-xl overflow-hidden bg-zinc-800 border border-zinc-700/80 shrink-0">
                    <AvatarContent
                      name={entry.display_name}
                      url={entry.avatar_url}
                    />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-xs sm:text-sm font-bold text-zinc-100 truncate">
                      {entry.display_name}
                    </h4>
                    <span className="text-[10px] text-zinc-400 block truncate">
                      {activeDaysClamped >= 6 ? "Flawless daily study habit" : activeDaysClamped >= 4 ? "Strong weekly study rhythm" : "Active study habit"}
                    </span>
                  </div>
                </div>

                {isCurrent && (
                  <span className="px-2 py-0.5 rounded-full bg-sky-400/20 text-sky-300 text-[9px] font-black uppercase shrink-0">
                    You
                  </span>
                )}
              </div>

              {/* 7-Segment Period Continuity Track (Count-based, no fabricated weekdays) */}
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between text-[10px] font-mono">
                  <span className="text-zinc-400">
                    Active Study Days:{" "}
                    <strong className="text-sky-300">
                      {activeDaysClamped} / 7
                    </strong>{" "}
                    active days
                  </span>
                  <span className="text-zinc-500 font-semibold">
                    {continuityPct}% Continuity
                  </span>
                </div>

                {/* 7 Discrete Segment Indicators */}
                <div
                  className="flex items-center gap-1.5"
                  aria-label={`${activeDaysClamped} of 7 active study days recorded`}
                >
                  {Array.from({ length: 7 }).map((_, idx) => {
                    const isActive = idx < activeDaysClamped;
                    return (
                      <div
                        key={idx}
                        className={`h-2 flex-1 rounded-full transition-all duration-300 ${
                          isActive
                            ? "bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.5)]"
                            : "bg-zinc-800/80 border border-dashed border-zinc-700/60"
                        }`}
                        title={
                          isActive
                            ? `Active count: ${idx + 1} of 7 days recorded`
                            : `Inactive count: ${idx + 1} of 7`
                        }
                      />
                    );
                  })}
                </div>
              </div>

              {/* Velocity & Growth Runway */}
              <div className="pt-1 border-t border-zinc-800/70 flex items-center justify-between text-[10.5px]">
                <div className="flex items-center space-x-1.5 text-zinc-300 font-mono">
                  <Clock className="w-3 h-3 text-sky-400 shrink-0" />
                  <span>
                    {dailyHours}h/day{" "}
                    <span className="text-zinc-500 font-sans">
                      ({totalHours} total)
                    </span>
                  </span>
                </div>

                <span className="text-[10px] text-sky-300/80 font-medium">
                  {runwayDays > 0
                    ? `+${runwayDays}d runway`
                    : "Complete 7d rhythm"}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

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
