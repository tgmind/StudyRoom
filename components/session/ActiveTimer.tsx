"use client";

import React from "react";
import { formatDurationSeconds } from "@/lib/time/format";
import { UserStatus } from "@/lib/supabase/types";

interface ActiveTimerProps {
  elapsedSeconds: number;
  status: UserStatus;
}

export function ActiveTimer({ elapsedSeconds, status }: ActiveTimerProps) {
  const isStudying = status === "studying";
  const isBreak = status === "break";

  return (
    <div className="w-full flex flex-col items-center justify-center py-1">
      {/* Clock Display Frame */}
      <div
        className={`relative w-full max-w-sm px-6 py-4 rounded-2xl bg-gradient-to-b from-zinc-900/90 via-zinc-950 to-zinc-950 border transition-all duration-300 ${
          isStudying
            ? "border-emerald-500/40 ring-1 ring-emerald-500/20 shadow-[0_0_30px_rgba(16,185,129,0.15)]"
            : isBreak
            ? "border-amber-500/40 ring-1 ring-amber-500/20 shadow-[0_0_30px_rgba(245,158,11,0.15)]"
            : "border-zinc-800/80"
        }`}
      >
        <div className="font-mono text-5xl sm:text-6xl font-black tracking-tight text-zinc-100 filter drop-shadow-md select-none text-center tabular-nums">
          {formatDurationSeconds(elapsedSeconds)}
        </div>
      </div>
    </div>
  );
}
