"use client";

import React, { useState, useEffect } from "react";
import { Play, Pause, Square, RotateCcw, Clock, ShieldCheck, Zap, BookOpen } from "lucide-react";

export function LiveTimerDemo() {
  const [timerSeconds, setTimerSeconds] = useState(2537); // 00:42:17
  const [timerState, setTimerState] = useState<"studying" | "break" | "stopped">("studying");
  const [breakSeconds, setBreakSeconds] = useState(300); // 5 min break

  useEffect(() => {
    let interval: any = null;
    if (timerState === "studying") {
      interval = setInterval(() => {
        setTimerSeconds((prev) => prev + 1);
      }, 1000);
    } else if (timerState === "break") {
      interval = setInterval(() => {
        setBreakSeconds((prev) => Math.max(0, prev - 1));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [timerState]);

  const formatTimer = (totalSec: number) => {
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  const handlePause = () => {
    setTimerState("break");
    setBreakSeconds(300);
  };

  const handleResume = () => {
    setTimerState("studying");
  };

  const handleStop = () => {
    setTimerState("stopped");
  };

  const handleRestart = () => {
    setTimerSeconds(2537);
    setTimerState("studying");
  };

  return (
    <section id="live-timer" className="py-14 sm:py-20 lg:py-24 bg-gradient-to-b from-[#f5f3ff] via-[#f8f6ff] to-[#ede9fe]/50 border-b border-purple-200/60 scroll-mt-20">
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-10 lg:gap-14 lg:grid-cols-2">
          {/* Left Column: Explanatory Content */}
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-[#eaf5ff] px-3.5 py-1 text-xs font-black uppercase tracking-wider text-[#07458f]">
              <span>05 — LIVE STUDY EXPERIENCE</span>
            </div>
            <h2 className="mt-3.5 text-2xl xs:text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-[#071a3a]">
              Server-Authoritative <br />
              <span className="text-[#0b73e6]">Live Study Timer</span>
            </h2>
            <p className="mt-4 sm:mt-5 text-sm sm:text-base lg:text-lg font-medium leading-relaxed text-slate-600">
              Unlike generic stopwatch apps that rely on your phone&apos;s local clock (which can drift or be cheated),
              Study Room timestamps every session start, pause, and stop against our atomic server clock via{" "}
              <code className="rounded bg-blue-50 px-1.5 py-0.5 font-mono text-xs font-bold text-[#0b73e6]">/api/time</code>.
            </p>

            <div className="mt-7 sm:mt-8 space-y-3.5 sm:space-y-4 text-sm font-semibold text-slate-700">
              <div className="flex items-start gap-3 rounded-2xl bg-white p-4 border border-blue-100 shadow-sm">
                <ShieldCheck className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-black text-[#071a3a] text-sm sm:text-base">Clock Manipulation Protection</h4>
                  <p className="mt-1 text-xs text-slate-500 leading-normal">
                    Changing your phone time zone or device clock does not inflate study hours. Leaderboard integrity is completely preserved.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-2xl bg-white p-4 border border-blue-100 shadow-sm">
                <Zap className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-black text-[#071a3a] text-sm sm:text-base">Zero-Data-Loss Background Resiliency</h4>
                  <p className="mt-1 text-xs text-slate-500 leading-normal">
                    Locking your screen, receiving a phone call, or losing Wi-Fi does not cancel your session. Time is calculated from authenticated server timestamps upon return.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Interactive Live Timer Widget */}
          <div className="mx-auto w-full max-w-md">
            <div className="overflow-hidden rounded-3xl sm:rounded-[32px] border-2 border-blue-100 bg-white p-5 sm:p-7 shadow-xl sm:shadow-2xl shadow-blue-500/10">
              {/* Header Badge */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] sm:text-xs font-black uppercase tracking-widest text-slate-400">
                  Realtime Chronometer
                </span>
                <span
                  className={`rounded-full px-2.5 sm:px-3 py-1 text-[11px] sm:text-xs font-black uppercase tracking-wider transition-colors ${
                    timerState === "studying"
                      ? "bg-green-100 text-green-700 animate-pulse"
                      : timerState === "break"
                      ? "bg-amber-100 text-amber-700"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  ● {timerState === "studying" ? "STUDYING" : timerState === "break" ? "ON BREAK" : "STOPPED"}
                </span>
              </div>

              {/* Weekly Stats Pill replacing Focus tag */}
              <div className="mt-5 sm:mt-6 text-center">
                <div className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                  <Clock className="w-3.5 h-3.5 text-fuchsia-600" />
                  <span>20h 55m /wk</span>
                  <span className="text-slate-400">•</span>
                  <BookOpen className="w-3.5 h-3.5 text-violet-600" />
                  <span>15 sess</span>
                </div>

                {/* Big Chronometer Display with responsive font size for 320px screens */}
                <div className="mt-5 sm:mt-6 font-mono text-4xl xs:text-5xl sm:text-6xl font-black tracking-tight text-[#071a3a] tabular-nums select-none">
                  {formatTimer(timerSeconds)}
                </div>

                {timerState === "break" && (
                  <p className="mt-2 text-xs font-bold text-amber-600">
                    Break countdown: {formatTimer(breakSeconds)} remaining
                  </p>
                )}

                {timerState === "studying" && (
                  <p className="mt-2 text-xs font-bold text-slate-400">
                    Active session ticking with atomic server sync
                  </p>
                )}

                {timerState === "stopped" && (
                  <p className="mt-2 text-xs font-bold text-slate-500">
                    Session saved to study history
                  </p>
                )}
              </div>

              {/* Action Buttons - Stack on narrow screens, side-by-side on xs+ */}
              <div className="mt-7 sm:mt-8 flex flex-col xs:flex-row items-stretch xs:items-center justify-center gap-2.5 sm:gap-3">
                {timerState === "studying" ? (
                  <>
                    <button
                      type="button"
                      onClick={handlePause}
                      className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl sm:rounded-2xl bg-amber-500 hover:bg-amber-600 py-3 sm:py-3.5 px-4 text-xs font-black text-white shadow-md shadow-amber-500/20 transition-all active:scale-95"
                    >
                      <Pause className="h-4 w-4" />
                      <span>Take Break</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleStop}
                      className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl sm:rounded-2xl bg-slate-800 hover:bg-slate-900 py-3 sm:py-3.5 px-4 text-xs font-black text-white shadow-md transition-all active:scale-95"
                    >
                      <Square className="h-4 w-4" />
                      <span>Stop Session</span>
                    </button>
                  </>
                ) : timerState === "break" ? (
                  <>
                    <button
                      type="button"
                      onClick={handleResume}
                      className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl sm:rounded-2xl bg-green-600 hover:bg-green-700 py-3 sm:py-3.5 px-4 text-xs font-black text-white shadow-md shadow-green-600/20 transition-all active:scale-95"
                    >
                      <Play className="h-4 w-4 fill-white" />
                      <span>Resume Study</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleStop}
                      className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl sm:rounded-2xl bg-slate-800 hover:bg-slate-900 py-3 sm:py-3.5 px-4 text-xs font-black text-white shadow-md transition-all active:scale-95"
                    >
                      <Square className="h-4 w-4" />
                      <span>Stop</span>
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={handleRestart}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl sm:rounded-2xl bg-[#0b73e6] hover:bg-blue-600 py-3.5 px-4 text-xs font-black text-white shadow-md transition-all active:scale-95"
                  >
                    <RotateCcw className="h-4 w-4" />
                    <span>Start New Session</span>
                  </button>
                )}
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-[10px] sm:text-[11px] font-bold text-slate-400">
                <span>Heartbeat: Synchronized</span>
                <span>Latency: ~18ms</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
