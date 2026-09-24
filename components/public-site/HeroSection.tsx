"use client";

import React, { useState, useEffect } from "react";
import { PublicWebsiteHero } from "@/lib/public-website/types";
import { ArrowRight, Clock, Users, Target, Flame, Sparkles, CheckCircle2, Share2, Check } from "lucide-react";
import { sharePublicSite } from "@/lib/public-website/driveUtils";

interface HeroSectionProps {
  hero: PublicWebsiteHero;
  onJoinClick: () => void;
}

export function HeroSection({ hero, onJoinClick }: HeroSectionProps) {
  // Live ticking visual timer for the hero card demonstration
  const [seconds, setSeconds] = useState(6138); // 01:42:18 initial
  const [copiedShare, setCopiedShare] = useState(false);

  const handleShare = async () => {
    const result = await sharePublicSite();
    if (result === "copied") {
      setCopiedShare(true);
      setTimeout(() => setCopiedShare(false), 2500);
    }
  };

  useEffect(() => {
    const interval = setInterval(() => {
      setSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatTimer = (totalSec: number) => {
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  return (
    <section id="top" className="relative overflow-hidden border-b border-blue-200/80 bg-gradient-to-b from-[#eef6ff] via-[#f7fbff] to-[#edf5ff] py-12 sm:py-16 md:py-20 lg:py-24 scroll-mt-20">
      {/* Background ambient dot grid */}
      <div
        className="absolute inset-0 pointer-events-none opacity-40"
        style={{
          backgroundImage: "radial-gradient(rgba(11,115,230,0.15) 1px, transparent 1px)",
          backgroundSize: "20px 20px",
        }}
      />

      <div className="relative w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-10 lg:gap-14 lg:grid-cols-[1.1fr_0.9fr]">
          {/* Left Column: Heading and Value Proposition */}
          <div className="w-full">
            <div className="inline-flex items-center gap-2 rounded-full bg-[#eaf5ff] px-3.5 py-1.5 text-xs font-black uppercase tracking-wider text-[#07458f] shadow-sm mb-5 sm:mb-6">
              <span className="flex h-2 w-2 rounded-full bg-[#0b73e6] animate-pulse" />
              <span>{hero.badge || "SERIOUS SELF-STUDY • GROUP ENVIRONMENT"}</span>
            </div>

            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight text-[#071a3a] leading-[1.1] sm:leading-[1.08]">
              {hero.headlineMain || "LIVE GROUP STUDY,"}{" "}
              <span className="text-[#0b73e6]">{hero.headlineHighlight || "BUILT FOR CONSISTENCY."}</span>
            </h1>

            <p className="mt-5 sm:mt-6 max-w-xl text-sm sm:text-base lg:text-lg font-semibold leading-relaxed text-[#1b3d6f]">
              {hero.description ||
                "A focused virtual study platform for serious students who want accountability, live synchronization, and real study-time tracking — without talking, discussion, or video-call distractions."}
            </p>

            {/* Call to action buttons: Flex Screen Optimized */}
            <div className="mt-7 sm:mt-8 flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3 sm:gap-3.5">
              <button
                type="button"
                onClick={onJoinClick}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#ef3340] to-[#cf1e38] px-5 sm:px-7 py-3.5 sm:py-4 text-sm font-black text-white shadow-xl shadow-red-500/25 transition-all hover:-translate-y-0.5 hover:shadow-2xl active:scale-95 cursor-pointer"
              >
                <span>{hero.ctaPrimaryText ? hero.ctaPrimaryText.replace(/→/g, "").trim() : "Join Study Room — ₹50"}</span>
                <ArrowRight className="h-4 w-4 shrink-0" />
              </button>

              <a
                href="#features"
                className="inline-flex items-center justify-center gap-2 rounded-2xl border-2 border-blue-100 bg-white px-5 sm:px-6 py-3.5 text-sm font-black text-[#0b73e6] shadow-sm transition-all hover:bg-blue-50/60 text-center"
              >
                {hero.ctaSecondaryText || "Explore Features"}
              </a>

              <button
                type="button"
                onClick={handleShare}
                aria-label="Share StudyRoom direct link with friends"
                title="Share StudyRoom direct link with friends"
                className="inline-flex items-center justify-center gap-2 rounded-2xl border-2 border-slate-200 bg-white px-4 sm:px-5 py-3.5 text-sm font-black text-slate-700 shadow-sm transition-all hover:bg-slate-50 hover:border-slate-300 text-center cursor-pointer active:scale-95"
              >
                {copiedShare ? (
                  <>
                    <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                    <span className="text-emerald-700 font-black">Link Copied!</span>
                  </>
                ) : (
                  <>
                    <Share2 className="h-4 w-4 text-[#0b73e6] shrink-0" />
                    <span>Share With Friends</span>
                  </>
                )}
              </button>
            </div>

            {/* Feature Pills */}
            <div className="mt-8 sm:mt-9 flex flex-wrap gap-2 text-xs font-bold text-[#071a3a]">
              {(hero.pills && hero.pills.length > 0
                ? hero.pills
                : ["🎯 20-Hour Goals", "⏱️ Server-Synced Timer", "⚔️ Rivalry Arena", "📈 Weekly Leaderboard", "🔥 Streak Heatmap"]
              ).map((pill, idx) => (
                <span
                  key={idx}
                  className="rounded-full bg-white border border-blue-100 px-3 py-1.5 shadow-sm text-[11px] sm:text-xs"
                >
                  {pill}
                </span>
              ))}
            </div>

            <p className="mt-4 text-[11px] font-bold text-slate-400">
              ⚡ Instant enrollment • Zero monthly subscription • ₹50 one-time lifetime access
            </p>
          </div>

          {/* Right Column: Dynamic Live Study Room Demonstration Card */}
          <div className="relative mx-auto w-full max-w-[480px] lg:max-w-none">
            {/* Ambient sticker badges */}
            <div className="absolute -left-4 -top-3 z-20 hidden rounded-xl bg-amber-100/90 border border-amber-200 px-3.5 py-2 text-xs font-black text-[#071a3a] shadow-lg -rotate-3 sm:block">
              Discipline Today <br />
              <span className="text-[#0b73e6]">Success Tomorrow ✌</span>
            </div>

            <div className="absolute -right-3 -bottom-3 z-20 hidden rounded-xl bg-white border border-blue-100 px-3.5 py-2 text-xs font-black text-[#071a3a] shadow-xl rotate-3 sm:block">
              Different Desks • <span className="text-[#18a96b]">Same Focus</span>
            </div>

            {/* Main Interactive Demo Mockup */}
            <div className="relative overflow-hidden rounded-[28px] sm:rounded-[32px] border border-blue-100/80 bg-white p-3 sm:p-4 shadow-2xl shadow-blue-500/10">
              <div className="rounded-[22px] sm:rounded-[24px] bg-gradient-to-br from-[#eaf5ff] via-white to-blue-50 p-4 sm:p-5">
                {/* Header of the mock card */}
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 sm:px-3 py-1 text-[11px] sm:text-xs font-black text-[#0b73e6] shadow-sm">
                    <span className="h-2 w-2 rounded-full bg-[#0b73e6] animate-ping" />
                    <span>● LIVE STUDY ROOM</span>
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 sm:px-2.5 py-0.5 text-[10px] sm:text-[11px] font-black text-green-700">
                    <CheckCircle2 className="w-3 h-3 text-green-600 shrink-0" />
                    <span>SERVER SYNCED</span>
                  </span>
                </div>

                {/* Active Member Study Card (Real App Style) */}
                <div className="mt-4 sm:mt-5 rounded-2xl bg-white p-3 sm:p-4 shadow-sm border border-blue-50">
                  <div className="flex items-center justify-between gap-2 sm:gap-3">
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                      <div className="relative flex h-9 w-9 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-full bg-zinc-900 border-2 border-fuchsia-500 font-black text-white text-[11px] sm:text-xs ring-2 ring-fuchsia-500/30">
                        <span>SP</span>
                        <span className="absolute bottom-0 right-0 h-2.5 w-2.5 sm:h-3 sm:w-3 rounded-full border-2 border-white bg-fuchsia-500" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-xs sm:text-base font-black text-[#071a3a] whitespace-nowrap">Student P.</p>
                          <span className="rounded-full bg-fuchsia-50 px-1.5 sm:px-2 py-0.5 text-[8px] sm:text-[9px] font-black uppercase text-fuchsia-700">Studying</span>
                        </div>
                        {/* Weekly study time and sessions taken as in the platform screenshot */}
                        <div className="mt-0.5 flex items-center gap-1 sm:gap-1.5 text-[9.5px] xs:text-[10.5px] sm:text-xs text-slate-500 font-bold flex-wrap">
                          <span className="flex items-center gap-0.5 sm:gap-1 text-slate-700 whitespace-nowrap">
                            <Clock className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-fuchsia-500 shrink-0" />
                            <span>20h 55m <span className="text-[9px] sm:text-[10px] text-slate-400">/wk</span></span>
                          </span>
                          <span className="text-slate-300">•</span>
                          <span className="text-slate-700 whitespace-nowrap">15 sess</span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="font-mono text-[10px] xs:text-[11px] sm:text-sm font-black text-fuchsia-600 bg-fuchsia-50 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full border border-fuchsia-200 tabular-nums">
                        ● {formatTimer(seconds)}
                      </div>
                    </div>

                  </div>

                  {/* Progress bar */}
                  <div className="mt-3.5 sm:mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full w-[78%] rounded-full bg-gradient-to-r from-fuchsia-500 to-[#0b73e6] transition-all" />
                  </div>

                  <div className="mt-2 flex items-center justify-between text-[11px] font-bold text-slate-500">
                    <span>Active Session Progress</span>
                    <span className="text-fuchsia-600 font-black">78% to 20h Goal</span>
                  </div>
                </div>

                {/* Micro Stat Cards: Flex Screen 3-Column */}
                <div className="mt-3 sm:mt-3.5 grid grid-cols-3 gap-2 sm:gap-2.5">
                  <div className="rounded-xl bg-white p-2.5 sm:p-3 text-center shadow-sm border border-blue-50/50">
                    <Users className="mx-auto h-3.5 sm:h-4 w-3.5 sm:w-4 text-[#0b73e6]" />
                    <b className="mt-1 block text-sm sm:text-base font-black text-[#071a3a]">128</b>
                    <span className="text-[9px] sm:text-[10px] font-bold text-slate-400">Studying</span>
                  </div>
                  <div className="rounded-xl bg-white p-2.5 sm:p-3 text-center shadow-sm border border-blue-50/50">
                    <Target className="mx-auto h-3.5 sm:h-4 w-3.5 sm:w-4 text-[#ef3340]" />
                    <b className="mt-1 block text-sm sm:text-base font-black text-[#071a3a]">4/5</b>
                    <span className="text-[9px] sm:text-[10px] font-bold text-slate-400">Goals</span>
                  </div>
                  <div className="rounded-xl bg-white p-2.5 sm:p-3 text-center shadow-sm border border-blue-50/50">
                    <Flame className="mx-auto h-3.5 sm:h-4 w-3.5 sm:w-4 text-amber-500" />
                    <b className="mt-1 block text-sm sm:text-base font-black text-[#071a3a]">12</b>
                    <span className="text-[9px] sm:text-[10px] font-bold text-slate-400">Streak</span>
                  </div>
                </div>

                {/* 20-Hour Goal Banner */}
                <div className="mt-3 sm:mt-3.5 rounded-xl bg-[#071a3a] p-3.5 sm:p-4 text-white shadow-md">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-blue-200 font-bold text-[11px] sm:text-xs">Next 20-Hour Goal</span>
                    <span className="text-amber-400 text-[11px] sm:text-xs font-black">🎯 In Progress</span>
                  </div>
                  <p className="mt-1 text-xs sm:text-sm font-black truncate">Maths — 30 Advanced Integral Questions</p>
                  <div className="mt-2.5 h-1.5 rounded-full bg-white/20">
                    <div className="h-full w-[72%] rounded-full bg-amber-400" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
