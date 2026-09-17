"use client";

import React from "react";
import { Clock, X } from "lucide-react";
import { formatDurationSeconds } from "@/lib/time/format";

interface TenMinuteWarningBannerProps {
  type: "session" | "break";
  remainingSeconds: number;
  onDismiss: () => void;
}

export function TenMinuteWarningBanner({
  type,
  remainingSeconds,
  onDismiss,
}: TenMinuteWarningBannerProps) {
  const isBreak = type === "break";
  const formattedTime = formatDurationSeconds(remainingSeconds);

  return (
    <div
      role="alert"
      className={`relative w-full px-3 py-2 sm:px-3.5 sm:py-2.5 rounded-xl border backdrop-blur-md transition-all duration-200 shadow-sm flex items-center justify-between gap-2 animate-in fade-in slide-in-from-top-1 ${
        isBreak
          ? "bg-amber-500/10 border-amber-500/25 text-amber-200 shadow-amber-500/5"
          : "bg-rose-500/10 border-rose-500/25 text-rose-200 shadow-rose-500/5"
      }`}
    >
      {/* Icon & Minimal Message */}
      <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 flex-1">
        <Clock
          className={`w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 animate-pulse ${
            isBreak ? "text-amber-400" : "text-rose-400"
          }`}
        />

        <div className="flex items-center flex-wrap gap-x-1.5 gap-y-0.5 text-xs min-w-0 leading-tight">
          <span className="font-semibold text-zinc-100">
            {isBreak ? "Break expires in" : "Session limit in"}
          </span>

          <span
            className={`font-mono font-bold px-1.5 py-0.5 rounded text-[11px] tabular-nums ${
              isBreak
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                : "bg-rose-500/20 text-rose-300 border border-rose-500/30"
            }`}
          >
            {formattedTime}
          </span>

          <span className="text-zinc-400 text-[11px] truncate">
            {isBreak ? "• Resume soon" : "• Wrap up goals"}
          </span>
        </div>
      </div>

      {/* Close button */}
      <button
        type="button"
        onClick={onDismiss}
        className="p-1 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/80 transition-colors shrink-0 -mr-0.5"
        title="Dismiss alert"
        aria-label="Dismiss alert"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

