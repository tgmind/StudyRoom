"use client";

import React from "react";
import { Clock, AlertTriangle, X } from "lucide-react";
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

  return (
    <div
      role="alert"
      className={`relative w-full p-3 sm:p-3.5 rounded-xl border transition-all duration-300 shadow-lg flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2 duration-300 ${
        isBreak
          ? "bg-gradient-to-r from-amber-950/60 via-zinc-900 to-amber-950/40 border-amber-500/50 shadow-amber-500/10"
          : "bg-gradient-to-r from-rose-950/60 via-zinc-900 to-rose-950/40 border-rose-500/50 shadow-rose-500/10"
      }`}
    >
      <div className="flex items-center space-x-2.5 sm:space-x-3 min-w-0 flex-1">
        <div
          className={`p-2 rounded-lg shrink-0 ${
            isBreak
              ? "bg-amber-500/20 border border-amber-500/40 text-amber-300"
              : "bg-rose-500/20 border border-rose-500/40 text-rose-300"
          }`}
        >
          <Clock className="w-4 h-4 animate-pulse" />
        </div>

        <div className="flex flex-col min-w-0 flex-1">
          <div className="flex items-center space-x-2">
            <span
              className={`text-xs font-black uppercase tracking-wider ${
                isBreak ? "text-amber-300" : "text-rose-300"
              }`}
            >
              {isBreak ? "Break Expiring Soon" : "Session Expiring Soon"}
            </span>
            <span
              className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border tabular-nums ${
                isBreak
                  ? "bg-amber-950/80 text-amber-200 border-amber-500/40"
                  : "bg-rose-950/80 text-rose-200 border-rose-500/40"
              }`}
            >
              {formatDurationSeconds(remainingSeconds)} left
            </span>
          </div>

          <p className="text-[11px] text-zinc-300 leading-snug mt-0.5 break-words">
            {isBreak
              ? "Your 1-hour break expires in 10 minutes. Resume now or your study session will finish automatically."
              : "Your 3-hour study session ends in 10 minutes. Wrap up your goals or take a break to save your streak!"}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={onDismiss}
        className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/80 transition-all shrink-0"
        title="Dismiss alert"
        aria-label="Dismiss alert"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
