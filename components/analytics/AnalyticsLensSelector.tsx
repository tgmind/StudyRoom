"use client";

import React, { memo, useCallback } from "react";
import { Flame, TrendingUp, Award, Target } from "lucide-react";

export type AnalyticsLensType =
  | "most_studying"
  | "consistency_boost"
  | "achievers"
  | "goal_chasers";

export interface LensConfig {
  id: AnalyticsLensType;
  title: string;
  mobileTitle: string;
  descriptor: string;
  icon: React.ComponentType<{ className?: string }>;
  accentColor: string;
  activeClasses: string;
  inactiveClasses: string;
}

export const LENSES: LensConfig[] = [
  {
    id: "most_studying",
    title: "Study Volume",
    mobileTitle: "Study",
    descriptor: "Daily study velocity & volume intensity",
    icon: Flame,
    accentColor: "text-amber-400",
    activeClasses:
      "bg-amber-500/15 border-amber-500/50 text-amber-300 shadow-[0_0_16px_rgba(245,158,11,0.18)] ring-1 ring-amber-500/30",
    inactiveClasses:
      "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60 border-zinc-800/80 bg-zinc-900/40",
  },
  {
    id: "consistency_boost",
    title: "Consistency",
    mobileTitle: "Consistency",
    descriptor: "7-Day habit rhythm & discipline continuity",
    icon: TrendingUp,
    accentColor: "text-sky-400",
    activeClasses:
      "bg-sky-500/15 border-sky-500/50 text-sky-300 shadow-[0_0_16px_rgba(56,189,248,0.18)] ring-1 ring-sky-500/30",
    inactiveClasses:
      "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60 border-zinc-800/80 bg-zinc-900/40",
  },
  {
    id: "achievers",
    title: "Achievers",
    mobileTitle: "Achievers",
    descriptor: "Hall of Fame & multi-week distinction titles",
    icon: Award,
    accentColor: "text-purple-400",
    activeClasses:
      "bg-purple-500/15 border-purple-500/50 text-purple-300 shadow-[0_0_16px_rgba(168,85,247,0.18)] ring-1 ring-purple-500/30",
    inactiveClasses:
      "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60 border-zinc-800/80 bg-zinc-900/40",
  },
  {
    id: "goal_chasers",
    title: "Goals",
    mobileTitle: "Goals",
    descriptor: "Execution rate & task follow-through precision",
    icon: Target,
    accentColor: "text-emerald-400",
    activeClasses:
      "bg-emerald-500/15 border-emerald-500/50 text-emerald-300 shadow-[0_0_16px_rgba(16,185,129,0.18)] ring-1 ring-emerald-500/30",
    inactiveClasses:
      "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60 border-zinc-800/80 bg-zinc-900/40",
  },
];

interface AnalyticsLensSelectorProps {
  activeLens: AnalyticsLensType;
  onSelectLens: (lens: AnalyticsLensType) => void;
  counts?: Partial<Record<AnalyticsLensType, number>>;
}

export const AnalyticsLensSelector = memo(function AnalyticsLensSelector({
  activeLens,
  onSelectLens,
}: AnalyticsLensSelectorProps) {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const currentIndex = LENSES.findIndex((l) => l.id === activeLens);
      if (currentIndex === -1) return;

      if (e.key === "ArrowRight") {
        e.preventDefault();
        const nextIndex = (currentIndex + 1) % LENSES.length;
        onSelectLens(LENSES[nextIndex].id);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        const prevIndex = (currentIndex - 1 + LENSES.length) % LENSES.length;
        onSelectLens(LENSES[prevIndex].id);
      } else if (e.key === "Home") {
        e.preventDefault();
        onSelectLens(LENSES[0].id);
      } else if (e.key === "End") {
        e.preventDefault();
        onSelectLens(LENSES[LENSES.length - 1].id);
      }
    },
    [activeLens, onSelectLens]
  );

  const activeConfig =
    LENSES.find((l) => l.id === activeLens) || LENSES[0];
  const ActiveIcon = activeConfig.icon;

  return (
    <div className="w-full space-y-2">
      {/* 2x2 on Mobile (<sm), 4-column Segmented Bar on Tablet/Desktop (sm+) */}
      <div
        role="tablist"
        aria-label="Global Analytics Lenses"
        onKeyDown={handleKeyDown}
        className="w-full grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1 rounded-2xl bg-zinc-900/80 border border-zinc-800/90 backdrop-blur-md"
      >
        {LENSES.map((lens) => {
          const Icon = lens.icon;
          const isActive = activeLens === lens.id;

          return (
            <button
              key={lens.id}
              role="tab"
              id={`lens-tab-${lens.id}`}
              aria-controls={`lens-panel-${lens.id}`}
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              type="button"
              onClick={() => onSelectLens(lens.id)}
              className={`min-h-[44px] py-2 px-2.5 sm:px-3 rounded-xl border transition-all duration-200 select-none touch-manipulation focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 flex items-center justify-center space-x-1.5 ${
                isActive ? lens.activeClasses : lens.inactiveClasses
              }`}
            >
              <Icon
                className={`w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 transition-transform ${
                  isActive ? `${lens.accentColor} scale-110` : "text-zinc-500"
                }`}
              />
              <span className="text-xs sm:text-xs font-black tracking-tight whitespace-nowrap">
                <span className="sm:hidden">{lens.mobileTitle}</span>
                <span className="hidden sm:inline">{lens.title}</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Analytical Descriptor Subtitle for Active Lens */}
      <div className="px-1 flex items-center space-x-1.5 text-[11px] text-zinc-400 font-medium">
        <ActiveIcon className={`w-3.5 h-3.5 shrink-0 ${activeConfig.accentColor}`} />
        <span className="text-zinc-300 font-semibold">{activeConfig.title}</span>
        <span className="text-zinc-500">•</span>
        <span className="truncate">{activeConfig.descriptor}</span>
      </div>
    </div>
  );
});
