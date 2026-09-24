"use client";

import React, { useState, useEffect } from "react";
import {
  Users,
  Clock,
  BookOpen,
  Crown,
  Star,
  Wifi,
  Flame,
  Coffee,
  Moon,
  Sun,
  Trophy,
  Target,
  History,
  Settings,
  EyeOff,
} from "lucide-react";

interface RealMemberMock {
  id: string;
  name: string;
  initials: string;
  status: "studying" | "break" | "offline";
  weeklyTime: string;
  sessions: number;
  timerSeconds?: number;
  breakSeconds?: number;
  offlineText?: string;
  isAchiever?: boolean;
  timeTag?: "night" | "early";
  isYou?: boolean;
}

const REAL_MEMBERS: RealMemberMock[] = [
  {
    id: "m-1",
    name: "Student P.",
    initials: "SP",
    status: "studying",
    weeklyTime: "20h 55m",
    sessions: 15,
    timerSeconds: 7703, // 02:08:23
    isYou: true,
  },
  {
    id: "m-2",
    name: "Student A.",
    initials: "SA",
    status: "studying",
    weeklyTime: "18h 30m",
    sessions: 14,
    timerSeconds: 6312, // 01:45:12
    timeTag: "early",
  },
  {
    id: "m-3",
    name: "Student K.",
    initials: "SK",
    status: "break",
    weeklyTime: "16h 12m",
    sessions: 11,
    timerSeconds: 5660, // 01:34:20 session duration
    breakSeconds: 525, // 08:45 on break
    timeTag: "night",
  },
  {
    id: "m-4",
    name: "Student R.",
    initials: "SR",
    status: "offline",
    weeklyTime: "20h 4m",
    sessions: 23,
    offlineText: "OFFLINE 1H",
    isAchiever: true,
  },
  {
    id: "m-5",
    name: "Student M.",
    initials: "SM",
    status: "offline",
    weeklyTime: "6h 0m",
    sessions: 2,
    offlineText: "OFFLINE 3H",
  },
];

export function MemberStatusSection() {
  const [ticker, setTicker] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setTicker((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatTimer = (totalSec: number) => {
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  const activeMembers = REAL_MEMBERS.filter((m) => m.status === "studying" || m.status === "break");
  const offlineMembers = REAL_MEMBERS.filter((m) => m.status === "offline");

  return (
    <section id="member-status" className="py-12 sm:py-20 lg:py-24 bg-gradient-to-b from-[#ecfeff] via-[#f0fdfa] to-[#cffafe]/40 border-b border-cyan-200/60 scroll-mt-20">
      <div className="w-full max-w-7xl mx-auto px-3.5 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-[#eaf5ff] px-3.5 py-1 text-xs font-black uppercase tracking-wider text-[#07458f]">
            <Users className="w-3.5 h-3.5" />
            <span>08 — PEER ACTIVITY &amp; STATUS</span>
          </div>
          <h2 className="mt-3.5 text-2xl xs:text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-[#071a3a] leading-tight">
            Live Peer <span className="text-[#0b73e6]">Presence</span>
          </h2>
          <p className="mt-3 sm:mt-4 text-xs sm:text-base lg:text-lg font-medium leading-relaxed text-slate-600">
            Real Study Room interface preview: live synchronized study clocks, active break timers,
            weekly study times, and session tallies — with zero webcam or audio intrusion.
          </p>

          {/* Privacy Guarantee Pill */}
          <div className="mt-3.5 inline-flex items-center gap-2 rounded-full bg-emerald-50 border border-emerald-200 px-3.5 py-1 text-[11px] sm:text-xs font-bold text-emerald-800 shadow-sm">
            <EyeOff className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>Privacy-Safe Preview: Real student names &amp; personal IDs are masked (Student P., Student A., etc.)</span>
          </div>
        </div>

        {/* Authentic Study Room Interface Preview Box */}
        <div className="mt-8 sm:mt-12 max-w-5xl mx-auto rounded-2xl sm:rounded-[32px] border border-zinc-800 bg-[#090a0f] p-3 sm:p-6 lg:p-7 shadow-2xl text-white overflow-hidden">
          {/* Room Top Bar matching real platform */}
          <div className="flex flex-wrap items-center justify-between border-b border-zinc-800/80 pb-3 sm:pb-4 gap-2">
            <div className="flex items-center gap-2.5 sm:gap-3">
              <div className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white font-black text-xs sm:text-sm shadow-md">
                SR
              </div>
              <div>
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <h3 className="text-sm sm:text-lg font-black tracking-tight text-white leading-none">
                    StudyRoom
                  </h3>
                  <span className="flex items-center gap-1 rounded-full bg-emerald-950/80 border border-emerald-500/40 px-2 py-0.5 text-[9px] sm:text-[10px] font-black text-emerald-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span>13 members</span>
                  </span>
                </div>
                <span className="text-[10px] sm:text-[11px] font-bold text-zinc-400 mt-0.5 sm:mt-1 block">
                  • Expected peak: 11 AM - 2 PM
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-900 border border-zinc-800 px-2.5 py-1 text-[11px] sm:text-xs font-bold text-zinc-400">
                <Wifi className="h-3 w-3 text-emerald-400" />
                <span>Synchronized</span>
              </span>
            </div>
          </div>

          {/* 1. ACTIVE MEMBERS Group (Studying & On Break) */}
          <div className="mt-5 sm:mt-6">
            <div className="flex items-center justify-between mb-2.5 sm:mb-3 px-1">
              <div className="flex items-center gap-2 text-xs sm:text-sm font-black uppercase tracking-wider text-rose-300">
                <Flame className="w-4 h-4 text-rose-500 fill-rose-500" />
                <span>ACTIVE MEMBERS ({activeMembers.length})</span>
              </div>
              <span className="inline-flex items-center gap-1 text-[10px] sm:text-[11px] font-bold text-fuchsia-400 bg-fuchsia-950/60 border border-fuchsia-500/30 px-2.5 py-0.5 rounded-full">
                <span className="h-1.5 w-1.5 rounded-full bg-fuchsia-400 animate-ping" />
                <span>Live Sync</span>
              </span>
            </div>

            {/* Flex Grid: 2 columns on mobile (xs) and 3 on tablet/desktop */}
            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 gap-2 sm:gap-3.5">
              {activeMembers.map((member) => {
                const isStudying = member.status === "studying";

                return (
                  <div
                    key={member.id}
                    className={`relative isolate flex flex-col items-center justify-between p-2 xs:p-2.5 sm:p-4 rounded-xl sm:rounded-2xl border transition-all select-none min-w-0 ${
                      isStudying
                        ? "bg-gradient-to-b from-zinc-900/90 to-zinc-950/95 border-fuchsia-500/40 ring-1 ring-fuchsia-500/20 shadow-[0_4px_20px_rgba(217,70,239,0.15)]"
                        : "bg-gradient-to-b from-amber-950/30 via-zinc-900/90 to-zinc-950/95 border-amber-500/50 ring-1 ring-amber-500/30 shadow-[0_4px_20px_rgba(245,158,11,0.12)]"
                    }`}
                  >
                    {/* Floating Status Badge (Top-Left) */}
                    {isStudying ? (
                      <span className="absolute top-1 left-1 xs:top-1.5 xs:left-1.5 sm:top-2.5 sm:left-2.5 text-[7.5px] xs:text-[8px] sm:text-[9px] px-1.5 py-0.5 flex items-center space-x-1 rounded-full bg-fuchsia-950/80 border border-fuchsia-500/40 text-fuchsia-300 font-black uppercase tracking-wider shadow-sm">
                        <span className="w-1.5 h-1.5 rounded-full bg-fuchsia-400 shadow-[0_0_6px_rgba(217,70,239,0.8)]" />
                        <span>Studying</span>
                      </span>
                    ) : (
                      <span className="absolute top-1 left-1 xs:top-1.5 xs:left-1.5 sm:top-2.5 sm:left-2.5 text-[7.5px] xs:text-[8px] sm:text-[9px] px-1.5 py-0.5 flex items-center space-x-1 rounded-full bg-amber-950/90 border border-amber-500/60 text-amber-300 font-extrabold uppercase tracking-wider shadow-sm">
                        <Coffee className="w-2.5 h-2.5 text-amber-400" />
                        <span>On Break</span>
                      </span>
                    )}

                    {/* Floating YOU Badge (Top-Right) */}
                    {member.isYou && (
                      <span className="absolute top-1 right-1 xs:top-1.5 xs:right-1.5 sm:top-2.5 sm:right-2.5 text-[7.5px] xs:text-[8px] sm:text-[9px] px-1.5 py-0.2 uppercase font-black tracking-wider rounded-full bg-zinc-800 text-zinc-200 border border-zinc-700 shadow-sm">
                        You
                      </span>
                    )}

                    {/* Avatar DP */}
                    <div className="relative mt-2 sm:mt-2.5">
                      <div
                        className={`w-10 h-10 xs:w-11 xs:h-11 sm:w-14 sm:h-14 rounded-full bg-zinc-800 border-2 flex items-center justify-center font-extrabold text-xs sm:text-sm text-zinc-100 shadow-md ${
                          isStudying
                            ? "border-fuchsia-500 ring-2 ring-fuchsia-500/40 shadow-[0_0_15px_rgba(217,70,239,0.25)]"
                            : "border-amber-500 ring-2 ring-amber-500/40 shadow-[0_0_15px_rgba(245,158,11,0.2)]"
                        }`}
                      >
                        {member.initials}
                      </div>
                      {/* Live Pulse Dot on Avatar */}
                      <span
                        className={`absolute bottom-0 right-0 w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 rounded-full border-2 border-zinc-950 ${
                          isStudying ? "bg-fuchsia-500 shadow-sm" : "bg-amber-500"
                        }`}
                      />
                    </div>

                    {/* Masked User Name & Time Badges */}
                    <div className="w-full text-center mt-1 sm:mt-2 min-w-0">
                      <h4 className="text-xs sm:text-sm font-black text-zinc-100 truncate px-1">
                        {member.name}
                      </h4>

                      {/* Time-of-Day Indicator Tags from real app */}
                      <div className="h-4 flex items-center justify-center gap-1 mt-0.5">
                        {member.timeTag === "night" && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[8px] xs:text-[9px] sm:text-[10px] font-medium bg-purple-950/60 border border-purple-800/40 text-purple-300">
                            <Moon className="w-2.5 h-2.5 text-purple-400" />
                            <span>Deep Night</span>
                          </span>
                        )}
                        {member.timeTag === "early" && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[8px] xs:text-[9px] sm:text-[10px] font-medium bg-fuchsia-950/60 border border-fuchsia-800/40 text-fuchsia-300">
                            <Sun className="w-2.5 h-2.5 text-fuchsia-400" />
                            <span>Early Bird</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Weekly Total Study Duration + Sessions Count */}
                    <div className="w-full flex items-center justify-center gap-1 sm:gap-1.5 mt-1 sm:mt-1.5 py-1 border-t border-zinc-800/40 text-zinc-400 text-[8.5px] xs:text-[9.5px] sm:text-[11px] min-w-0">
                      <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
                        <Clock className="w-2.5 h-2.5 text-fuchsia-400 shrink-0" />
                        <span className="font-bold text-zinc-200 tabular-nums">
                          {member.weeklyTime}
                        </span>
                        <span className="text-[7.5px] xs:text-[8px] sm:text-[8.5px] text-zinc-500 font-medium">/wk</span>
                      </div>

                      <span className="text-zinc-700 font-bold select-none">•</span>

                      <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
                        <BookOpen className="w-2.5 h-2.5 text-violet-400 shrink-0" />
                        <span className="font-bold text-zinc-200 tabular-nums">
                          {member.sessions}
                        </span>
                        <span className="text-[7.5px] xs:text-[8px] sm:text-[8.5px] text-zinc-500 font-medium">sess</span>
                      </div>
                    </div>

                    {/* Live Digital Timer Readout Pill */}
                    <div className="w-full mt-1.5 pt-1.5 border-t border-zinc-800/60 flex flex-col justify-center items-center min-h-[38px] sm:min-h-[46px]">
                      {isStudying ? (
                        <>
                          <div className="font-mono text-[9px] xs:text-[10px] sm:text-xs px-1.5 xs:px-2 sm:px-3 py-0.5 sm:py-1 font-black tracking-tight rounded-full border shadow-inner flex items-center space-x-1 sm:space-x-1.5 bg-fuchsia-950/40 text-fuchsia-300 border-fuchsia-500/30 tabular-nums">
                            <span className="w-1.5 h-1.5 rounded-full bg-fuchsia-400 shadow-[0_0_6px_rgba(217,70,239,0.8)] animate-pulse" />
                            <span>{formatTimer((member.timerSeconds || 0) + ticker)}</span>
                          </div>
                          <div className="h-2 sm:h-3" aria-hidden="true" />
                        </>
                      ) : (
                        <>
                          <div className="font-mono text-[9px] xs:text-[10px] sm:text-xs px-1.5 xs:px-2 sm:px-2.5 py-0.5 sm:py-1 font-black tracking-tight rounded-full border shadow-inner flex items-center space-x-1 bg-amber-950/60 text-amber-300 border-amber-500/50 tabular-nums">
                            <Coffee className="w-2.5 h-2.5 text-amber-400 shrink-0" />
                            <span>Break {formatTimer((member.breakSeconds || 0) + ticker)}</span>
                          </div>
                          <div className="text-[8px] sm:text-[9.5px] flex items-center justify-center gap-1 text-zinc-400 font-medium tabular-nums mt-0.5">
                            <span>Study:</span>
                            <span className="font-mono font-bold text-zinc-200">
                              {formatTimer(member.timerSeconds || 0)}
                            </span>
                          </div>
                        </>
                      )}
                    </div>

                  </div>
                );
              })}
            </div>
          </div>

          {/* 2. OFFLINE MEMBERS Group (with Weekly Achiever) */}
          <div className="mt-6 sm:mt-7">
            <div className="flex items-center gap-2 mb-2.5 sm:mb-3 px-1 text-xs sm:text-sm font-black uppercase tracking-wider text-zinc-400">
              <span>💤 OFFLINE MEMBERS ({offlineMembers.length + 8})</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 gap-2 sm:gap-3.5">
              {offlineMembers.map((member) => (
                <div
                  key={member.id}
                  className={`relative isolate flex flex-col items-center justify-between p-2 xs:p-2.5 sm:p-4 rounded-xl sm:rounded-2xl border transition-all select-none min-w-0 ${
                    member.isAchiever
                      ? "bg-gradient-to-b from-amber-950/40 via-zinc-900/95 to-zinc-950 border-amber-400/60 ring-1 ring-amber-400/30 shadow-[0_4px_25px_rgba(251,191,36,0.18)]"
                      : "bg-zinc-950/60 border-zinc-900/80 opacity-75 hover:opacity-100"
                  }`}
                >
                  {/* Floating Badge */}
                  {member.isAchiever ? (
                    <span className="absolute top-1 left-1 xs:top-1.5 xs:left-1.5 sm:top-2.5 sm:left-2.5 text-[7.5px] xs:text-[8px] sm:text-[9px] px-1.5 py-0.5 flex items-center space-x-1 rounded-full bg-gradient-to-r from-amber-400 via-amber-300 to-amber-500 text-zinc-950 font-black uppercase tracking-wider shadow-md">
                      <Crown className="w-2.5 h-2.5 fill-zinc-950" />
                      <span>Achiever</span>
                    </span>
                  ) : null}

                  {/* Avatar DP with crown if Achiever */}
                  <div className={`relative ${member.isAchiever ? "mt-2 sm:mt-2.5" : "mt-1 sm:mt-1.5"}`}>
                    {member.isAchiever && (
                      <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 animate-bounce">
                        <Crown className="w-3.5 h-3.5 sm:w-5 sm:h-5 text-amber-400 fill-amber-400 filter drop-shadow-[0_0_8px_rgba(245,158,11,0.9)]" />
                      </div>
                    )}
                    <div
                      className={`w-10 h-10 xs:w-11 xs:h-11 sm:w-14 sm:h-14 rounded-full bg-zinc-800 border-2 flex items-center justify-center font-extrabold text-xs sm:text-sm text-zinc-100 shadow-md ${
                        member.isAchiever
                          ? "border-amber-400 ring-2 ring-amber-400/50 shadow-[0_0_15px_rgba(251,191,36,0.3)]"
                          : "border-zinc-800"
                      }`}
                    >
                      {member.initials}
                    </div>
                  </div>

                  {/* Masked User Name */}
                  <div className="w-full text-center mt-1 sm:mt-2 flex items-center justify-center gap-1 min-w-0 px-1">
                    <h4
                      className={`text-xs sm:text-sm font-black truncate ${
                        member.isAchiever ? "text-amber-200" : "text-zinc-100"
                      }`}
                    >
                      {member.name}
                    </h4>
                    {member.isAchiever && (
                      <Star className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-400 fill-amber-400 shrink-0" />
                    )}
                  </div>

                  {/* Achiever tag placeholder to align card height */}
                  <div className="h-4 flex items-center justify-center">
                    {member.isAchiever && (
                      <span className="text-[8.5px] xs:text-[9px] font-bold text-amber-400/90">
                        Week #1 Winner
                      </span>
                    )}
                  </div>

                  {/* Weekly Total Study Duration + Sessions Count */}
                  <div className="w-full flex items-center justify-center gap-1 sm:gap-1.5 mt-1 sm:mt-1.5 py-1 border-t border-zinc-800/40 text-zinc-400 text-[8.5px] xs:text-[9.5px] sm:text-[11px] min-w-0">
                    <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
                      <Clock className="w-2.5 h-2.5 text-fuchsia-400 shrink-0" />
                      <span className="font-bold text-zinc-200 tabular-nums">
                        {member.weeklyTime}
                      </span>
                      <span className="text-[7.5px] xs:text-[8px] sm:text-[8.5px] text-zinc-500 font-medium">/wk</span>
                    </div>

                    <span className="text-zinc-700 font-bold select-none">•</span>

                    <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
                      <BookOpen className="w-2.5 h-2.5 text-violet-400 shrink-0" />
                      <span className="font-bold text-zinc-200 tabular-nums">
                        {member.sessions}
                      </span>
                      <span className="text-[7.5px] xs:text-[8px] sm:text-[8.5px] text-zinc-500 font-medium">sess</span>
                    </div>
                  </div>

                  {/* Offline Status Pill */}
                  <div className="w-full mt-1.5 pt-1.5 border-t border-zinc-800/60 flex flex-col justify-center items-center min-h-[38px] sm:min-h-[46px]">
                    <span className="rounded-full bg-zinc-900 border border-zinc-800 px-2 xs:px-2.5 sm:px-3 py-0.5 text-[8.5px] xs:text-[9px] sm:text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                      {member.offlineText}
                    </span>
                    <div className="h-2 sm:h-3" aria-hidden="true" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Authentic App Bottom Navigation Bar Replica */}
          <div className="mt-6 sm:mt-8 pt-3 border-t border-zinc-800/90">
            <div className="max-w-md mx-auto flex items-center justify-around rounded-2xl bg-zinc-950/90 border border-zinc-800/80 p-0.5 xs:p-1 shadow-inner">
              <div className="flex flex-col items-center justify-center px-1.5 xs:px-2 py-1 rounded-xl text-[8px] xs:text-[9px] sm:text-[10px] font-extrabold bg-zinc-900 text-zinc-100 border border-zinc-700 shadow-sm cursor-default">
                <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-zinc-100 mb-0.5" />
                <span>Room</span>
              </div>
              <div className="flex flex-col items-center justify-center px-1.5 xs:px-2 py-1 rounded-xl text-[8px] xs:text-[9px] sm:text-[10px] font-bold text-zinc-500 cursor-default">
                <Trophy className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-zinc-500 mb-0.5" />
                <span>Rankings</span>
              </div>
              <div className="flex flex-col items-center justify-center px-1.5 xs:px-2 py-1 rounded-xl text-[8px] xs:text-[9px] sm:text-[10px] font-bold text-zinc-500 cursor-default">
                <Flame className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-500/80 mb-0.5" />
                <span>Streak</span>
              </div>
              <div className="flex flex-col items-center justify-center px-1.5 xs:px-2 py-1 rounded-xl text-[8px] xs:text-[9px] sm:text-[10px] font-bold text-zinc-500 cursor-default">
                <Target className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-zinc-500 mb-0.5" />
                <span>Goals</span>
              </div>
              <div className="flex flex-col items-center justify-center px-1.5 xs:px-2 py-1 rounded-xl text-[8px] xs:text-[9px] sm:text-[10px] font-bold text-zinc-500 cursor-default">
                <History className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-zinc-500 mb-0.5" />
                <span>History</span>
              </div>
              <div className="flex flex-col items-center justify-center px-1.5 xs:px-2 py-1 rounded-xl text-[8px] xs:text-[9px] sm:text-[10px] font-bold text-zinc-500 cursor-default">
                <Settings className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-zinc-500 mb-0.5" />
                <span>Settings</span>
              </div>
            </div>

            <p className="text-center text-[10px] sm:text-[11px] font-bold text-zinc-500 mt-2">
              Authentic Study Room Navigation: Instant switching between Room, Rankings, Streaks, 20h Goals, &amp; History
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

