"use client";

import React, { useEffect, useState, useMemo } from "react";
import { formatDurationSeconds } from "@/lib/time/format";
import { UserStatus } from "@/lib/supabase/types";
import { calculateBreakStatus } from "@/lib/time/break";
import { Coffee, AlertCircle, Clock } from "lucide-react";

interface ActiveTimerProps {
  elapsedSeconds: number;
  status: UserStatus;
  breakStartedAt?: string | null;
}

export function ActiveTimer({
  elapsedSeconds,
  status,
  breakStartedAt,
}: ActiveTimerProps) {
  const isStudying = status === "studying";
  const isBreak = status === "break";

  // Strict realtime clock for live break countdown
  const [currentTimestamp, setCurrentTimestamp] = useState(() => new Date());

  useEffect(() => {
    if (!isBreak) return;

    // Immediately sync timestamp on status switch
    setCurrentTimestamp(new Date());

    const intervalId = setInterval(() => {
      setCurrentTimestamp(new Date());
    }, 1000);

    return () => clearInterval(intervalId);
  }, [isBreak, breakStartedAt]);

  const breakStatus = useMemo(() => {
    if (!isBreak) return null;
    return calculateBreakStatus(breakStartedAt, currentTimestamp);
  }, [isBreak, breakStartedAt, currentTimestamp]);

  const isBreakWarningZone = breakStatus ? breakStatus.remainingBreakSeconds <= 600 : false; // Under 10m left

  return (
    <div className="w-full flex flex-col items-center justify-center py-1 space-y-3">
      {/* Primary Study Clock Display Frame */}
      <div
        className={`relative w-full max-w-sm px-6 py-4 rounded-2xl bg-gradient-to-b from-zinc-900/90 via-zinc-950 to-zinc-950 border transition-all duration-300 flex flex-col items-center ${
          isStudying
            ? "border-emerald-500/40 ring-1 ring-emerald-500/20 shadow-[0_0_30px_rgba(16,185,129,0.15)]"
            : isBreak
            ? "border-amber-500/40 ring-1 ring-amber-500/20 shadow-[0_0_30px_rgba(245,158,11,0.15)]"
            : "border-zinc-800/80"
        }`}
      >
        {/* Status Label Header */}
        <div className="text-[10px] font-extrabold uppercase tracking-wider mb-1">
          {isStudying ? (
            <span className="text-emerald-400 flex items-center space-x-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
              <span>Active Live Study</span>
            </span>
          ) : isBreak ? (
            <span className="text-amber-400/90 flex items-center space-x-1.5">
              <span>Active Study (Paused)</span>
            </span>
          ) : (
            <span className="text-zinc-500">Offline</span>
          )}
        </div>

        {/* Big Authoritative Study Time */}
        <div className="font-mono text-5xl sm:text-6xl font-black tracking-tight text-zinc-100 filter drop-shadow-md select-none text-center tabular-nums">
          {formatDurationSeconds(elapsedSeconds)}
        </div>
      </div>

      {/* Dedicated Separate Live Break Countdown Box */}
      {isBreak && breakStatus && (
        <div
          className={`w-full max-w-sm p-3.5 rounded-xl border transition-all duration-300 backdrop-blur-md ${
            isBreakWarningZone
              ? "bg-rose-950/40 border-rose-500/50 shadow-[0_0_20px_rgba(244,63,94,0.15)] animate-pulse"
              : "bg-amber-950/30 border-amber-500/40 shadow-sm"
          }`}
        >
          {/* Top Bar: Title & Remaining Countdown */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div
                className={`p-1.5 rounded-lg ${
                  isBreakWarningZone
                    ? "bg-rose-500/20 text-rose-300"
                    : "bg-amber-500/20 text-amber-300"
                }`}
              >
                <Coffee className="w-4 h-4" />
              </div>
              <div>
                <span className="text-xs font-bold text-zinc-200 block leading-tight">
                  Break Countdown
                </span>
                <span className="text-[10px] text-zinc-400 font-medium">
                  {breakStatus.formattedElapsed} elapsed / 1h max
                </span>
              </div>
            </div>

            {/* Live Countdown Readout Pill */}
            <div
              className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-full border font-mono text-xs font-extrabold tabular-nums shadow-inner ${
                isBreakWarningZone
                  ? "bg-rose-900/80 text-rose-200 border-rose-400/60"
                  : "bg-amber-900/70 text-amber-200 border-amber-400/50"
              }`}
            >
              {isBreakWarningZone ? (
                <AlertCircle className="w-3.5 h-3.5 text-rose-300 animate-bounce" />
              ) : (
                <Clock className="w-3.5 h-3.5 text-amber-300 animate-spin-slow" />
              )}
              <span>{breakStatus.formattedRemaining} left</span>
            </div>
          </div>

          {/* Realtime Break Progress Bar */}
          <div className="w-full bg-zinc-900/90 rounded-full h-1.5 mt-3 overflow-hidden border border-zinc-800">
            <div
              className={`h-full transition-all duration-1000 ease-linear rounded-full ${
                isBreakWarningZone
                  ? "bg-gradient-to-r from-amber-500 to-rose-500"
                  : "bg-gradient-to-r from-amber-400 to-amber-500"
              }`}
              style={{ width: `${breakStatus.progressPercent}%` }}
            />
          </div>

          {/* Bottom Footnote Info */}
          <div className="flex items-center justify-between text-[10px] text-zinc-400 mt-2 px-0.5">
            <span>Automatic stop after 1 hour</span>
            <span className="font-mono text-zinc-400 font-semibold">
              {breakStatus.progressPercent}% used
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
