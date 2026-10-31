"use client";

import React, { useEffect, useState, useMemo } from "react";
import { formatDurationSeconds } from "@/lib/time/format";
import { UserStatus } from "@/lib/supabase/types";
import { calculateBreakStatus } from "@/lib/time/break";
import { getServerNow } from "@/lib/time/clockSync";
import { Coffee, AlertCircle, Clock } from "lucide-react";

import { SessionSyncStatus } from "@/hooks/useActiveSession";

export interface ActiveTimerProps {
  elapsedSeconds: number;
  status: UserStatus;
  breakStartedAt?: string | null;
  syncStatus?: SessionSyncStatus;
  onForceSync?: () => Promise<void> | void;
  compact?: boolean;
}

export function ActiveTimer({
  elapsedSeconds,
  status,
  breakStartedAt,
  syncStatus,
  onForceSync,
  compact = false,
}: ActiveTimerProps) {
  const isStudying = status === "studying";
  const isBreak = status === "break";

  // Strict realtime clock for live break countdown (calibrated to atomic server clock)
  const [currentTimestamp, setCurrentTimestamp] = useState(() => getServerNow());

  useEffect(() => {
    if (!isBreak) return;

    // Immediately sync timestamp on status switch
    const tick = () => setCurrentTimestamp(getServerNow());
    tick();

    const intervalId = setInterval(tick, 1000);

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        tick();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleVisibility);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleVisibility);
    };
  }, [isBreak, breakStartedAt]);

  const breakStatus = useMemo(() => {
    if (!isBreak) return null;
    return calculateBreakStatus(breakStartedAt, currentTimestamp);
  }, [isBreak, breakStartedAt, currentTimestamp]);

  const isBreakWarningZone = breakStatus ? breakStatus.remainingBreakSeconds <= 600 : false; // Under 10m left

  // Reusable truthful sync status badge
  const renderSyncBadge = () => {
    if (!syncStatus) return null;
    return (
      <div
        className={`flex items-center space-x-1 text-[9px] font-semibold tracking-normal select-none ${
          onForceSync && (syncStatus === "syncing" || syncStatus === "reconciling" || syncStatus === "error")
            ? "cursor-pointer hover:opacity-80 active:scale-95 transition-all"
            : ""
        }`}
        onClick={() => {
          if (onForceSync && (syncStatus === "syncing" || syncStatus === "reconciling" || syncStatus === "error")) {
            onForceSync();
          }
        }}
        role={onForceSync && (syncStatus === "syncing" || syncStatus === "reconciling" || syncStatus === "error") ? "button" : undefined}
        tabIndex={onForceSync && (syncStatus === "syncing" || syncStatus === "reconciling" || syncStatus === "error") ? 0 : undefined}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            if (onForceSync && (syncStatus === "syncing" || syncStatus === "reconciling" || syncStatus === "error")) {
              onForceSync();
            }
          }
        }}
      >
        {syncStatus === "synced" && (
          <span className="text-emerald-400 flex items-center space-x-1" title="Authoritative session synchronized with server">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>Synced</span>
          </span>
        )}
        {syncStatus === "syncing" && (
          <span className="text-amber-400 flex items-center space-x-1" title="Synchronizing with server (Click to retry / force sync)">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
            <span>Syncing...</span>
          </span>
        )}
        {syncStatus === "reconciling" && (
          <span className="text-amber-400 flex items-center space-x-1" title="Reconciling with authoritative server session (Click to retry / force sync)">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            <span>Reconciling...</span>
          </span>
        )}
        {syncStatus === "reconnecting" && (
          <span className="text-amber-400 flex items-center space-x-1" title="Restoring realtime stream">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            <span>Reconnecting...</span>
          </span>
        )}
        {syncStatus === "no_network" && (
          <span className="text-zinc-400 flex items-center space-x-1" title="No network connection available">
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
            <span>No network</span>
          </span>
        )}
        {syncStatus === "error" && (
          <span className="text-rose-400 flex items-center space-x-1" title="Requested session mutation failed (Click to retry / force sync)">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
            <span>Action failed / Retry</span>
          </span>
        )}
      </div>
    );
  };

  // Compact Live Study Cockpit Layout (Designed for Desktop Live Sessions)
  if (compact) {
    if (isBreak && breakStatus) {
      return (
        <div className="w-full flex flex-col justify-between h-full space-y-1.5">
          {/* Top Bar: Active Study (Paused) + Elapsed Study Time + Truthful Sync Status */}
          <div className="w-full flex items-center justify-between text-[11px] font-bold px-0.5">
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              <span className="text-amber-300 uppercase tracking-wider font-extrabold text-[10.5px]">
                Active Study (Paused)
              </span>
              <span className="text-zinc-600 font-bold">•</span>
              <span className="text-zinc-300 font-mono text-[10.5px] font-semibold bg-zinc-950/80 px-2 py-0.5 rounded-md border border-zinc-800">
                Study: {formatDurationSeconds(Math.max(0, elapsedSeconds))}
              </span>
            </div>

            {renderSyncBadge()}
          </div>

          {/* Center: Integrated Split-Horizontal Break Countdown Cockpit */}
          <div
            className={`w-full p-2.5 rounded-xl border transition-all duration-300 backdrop-blur-md flex items-center justify-between gap-3 ${
              isBreakWarningZone
                ? "bg-rose-950/40 border-rose-500/50 shadow-[0_0_20px_rgba(244,63,94,0.15)] animate-pulse"
                : "bg-amber-950/25 border-amber-500/35 shadow-sm"
            }`}
          >
            {/* Left Wing: Big Glowing Break Countdown */}
            <div className="flex items-center space-x-2.5 shrink-0">
              <div
                className={`p-2 rounded-xl shrink-0 ${
                  isBreakWarningZone
                    ? "bg-rose-500/20 text-rose-300"
                    : "bg-amber-500/20 text-amber-300"
                }`}
              >
                <Coffee className="w-4 h-4" />
              </div>
              <div className="space-y-0.5">
                <div className="flex items-baseline space-x-1.5">
                  <span
                    className={`font-mono text-3xl font-black tabular-nums tracking-tight leading-none ${
                      isBreakWarningZone ? "text-rose-300" : "text-amber-300"
                    }`}
                  >
                    {breakStatus.formattedRemaining}
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400/90">
                    left
                  </span>
                </div>
                <div className="text-[10px] text-zinc-400 font-medium">
                  <span className="font-semibold text-zinc-300">Break Countdown</span> • {breakStatus.formattedElapsed} elapsed
                </div>
              </div>
            </div>

            {/* Right Wing: Realtime Progress Bar & Stats */}
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center justify-between text-[10px] text-zinc-400 font-medium">
                <span>Auto-stop at 1 hour</span>
                <span className="font-mono text-amber-300 font-bold tabular-nums">
                  {breakStatus.progressPercent}% used
                </span>
              </div>
              <div className="w-full bg-zinc-950/90 rounded-full h-1.5 overflow-hidden border border-zinc-800">
                <div
                  className={`h-full transition-all duration-1000 ease-linear rounded-full ${
                    isBreakWarningZone
                      ? "bg-gradient-to-r from-amber-500 to-rose-500"
                      : "bg-gradient-to-r from-amber-400 to-amber-500"
                  }`}
                  style={{ width: `${breakStatus.progressPercent}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      );
    }

    // Compact Active Studying View
    return (
      <div className="w-full flex flex-col justify-between h-full space-y-1 py-0.5">
        {/* Status + Sync Header */}
        <div className="w-full flex items-center justify-between text-[10px] font-extrabold uppercase tracking-wider px-0.5">
          <span className="text-fuchsia-400 flex items-center space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-fuchsia-400 animate-ping" />
            <span>Active Live Study</span>
          </span>
          {renderSyncBadge()}
        </div>

        {/* Big Authoritative Study Time */}
        <div className="font-mono text-4xl sm:text-5xl font-black tracking-tight text-zinc-100 filter drop-shadow-md select-none text-center tabular-nums leading-none py-1">
          {formatDurationSeconds(Math.max(0, elapsedSeconds))}
        </div>

        <div className="text-[10px] text-zinc-400 font-medium text-center">
          Distraction-free focus protocol active
        </div>
      </div>
    );
  }

  // Standard Full Display (Used on Mobile & expanded idle state)
  return (
    <div className="w-full flex flex-col items-center justify-center py-1 space-y-3">
      {/* Primary Study Clock Display Frame */}
      <div
        className={`relative w-full max-w-sm px-6 py-4 rounded-2xl bg-gradient-to-b from-zinc-900/90 via-zinc-950 to-zinc-950 border transition-all duration-300 flex flex-col items-center ${
          isStudying
            ? "border-fuchsia-500/40 ring-1 ring-fuchsia-500/20 shadow-[0_0_30px_rgba(217,70,239,0.2)]"
            : isBreak
            ? "border-amber-500/40 ring-1 ring-amber-500/20 shadow-[0_0_30px_rgba(245,158,11,0.15)]"
            : "border-zinc-800/80"
        }`}
      >
        {/* Status Label Header */}
        <div className="w-full flex items-center justify-between text-[10px] font-extrabold uppercase tracking-wider mb-1">
          <div>
            {isStudying ? (
              <span className="text-fuchsia-400 flex items-center space-x-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-fuchsia-400 animate-ping" />
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

          {/* Truthful Sync Status Badge */}
          {renderSyncBadge()}
        </div>

        {/* Big Authoritative Study Time */}
        <div className="font-mono text-5xl sm:text-6xl font-black tracking-tight text-zinc-100 filter drop-shadow-md select-none text-center tabular-nums">
          {formatDurationSeconds(Math.max(0, elapsedSeconds))}
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
