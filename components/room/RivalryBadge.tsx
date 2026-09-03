"use client";

import React, { memo } from "react";
import { Zap } from "lucide-react";

interface RivalryBadgeProps {
  formattedGap: string;
  isTrio?: boolean;
}

export const RivalryBadge = memo(function RivalryBadge({
  formattedGap,
  isTrio = false,
}: RivalryBadgeProps) {
  return (
    <div
      className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none flex flex-col items-center justify-center select-none"
      aria-hidden="true"
    >
      {/* High-Voltage Horizontal Energy Laser connecting the rival cards */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 sm:w-28 h-[1px] bg-gradient-to-r from-transparent via-amber-400/80 to-transparent pointer-events-none filter drop-shadow-[0_0_6px_rgba(251,191,36,0.8)]" />

      {/* Modern Diamond/Hex Battle Crest Emblem */}
      <div className="relative group flex items-center justify-center">
        {/* Soft Ambient Energy Aura */}
        <div className="absolute -inset-1 rounded-full bg-gradient-to-r from-rose-600/30 via-amber-500/30 to-rose-600/30 blur-sm pointer-events-none" />

        {/* Outer Metallic Shield Ring */}
        <div className="relative flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-xl rotate-45 border border-amber-300/90 bg-zinc-950 shadow-[0_0_16px_rgba(244,63,94,0.45)] ring-1 ring-rose-500/40">
          {/* Inner Beveled Plate */}
          <div className="absolute inset-0.5 rounded-lg bg-gradient-to-br from-zinc-900 via-rose-950/70 to-zinc-950 border border-zinc-700/50 flex items-center justify-center">
            {/* Ultra-Crisp VS Typography (Unrotated back to horizontal) */}
            <span className="-rotate-45 text-[11px] sm:text-xs font-black italic tracking-tighter bg-gradient-to-r from-amber-100 via-amber-300 to-rose-300 bg-clip-text text-transparent drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
              VS
            </span>
          </div>
        </div>
      </div>

      {/* Sleek Monospace Gap Badge */}
      <div className="mt-1.5 flex items-center gap-1 px-2 py-0.5 rounded-full bg-zinc-950/95 border border-amber-400/40 shadow-[0_4px_12px_rgba(0,0,0,0.7)] backdrop-blur-md">
        <Zap className="w-2.5 h-2.5 text-amber-400 shrink-0 fill-amber-400" />
        <span className="text-[9px] sm:text-[10px] font-extrabold text-amber-200 tracking-tight font-mono whitespace-nowrap">
          {formattedGap} {isTrio ? "span" : "diff"}
        </span>
      </div>
    </div>
  );
});
