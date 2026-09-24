"use client";

import React from "react";
import { Check, X, ShieldAlert, Sparkles, EyeOff, VolumeX, ShieldCheck, Compass } from "lucide-react";

export function WhatIsSection() {
  return (
    <section id="what-is" className="py-14 sm:py-20 lg:py-24 bg-white border-b border-slate-200/80 scroll-mt-20">
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-[#eaf5ff] px-3.5 py-1 text-xs font-black uppercase tracking-wider text-[#07458f]">
            <Compass className="w-3.5 h-3.5" />
            <span>01 — PLATFORM PURPOSE</span>
          </div>
          <h2 className="mt-3.5 text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-[#071a3a] leading-tight">
            What is <span className="text-[#0b73e6]">Study Room</span>?
          </h2>
          <p className="mt-4 text-sm sm:text-base lg:text-lg font-medium leading-relaxed text-slate-600">
            Study Room is an independent live virtual study platform created for students who need serious focus.
            Instead of video calls or chat groups that distract you, Study Room provides real-time peer accountability
            through synchronized study timers and ambient presence.
          </p>
        </div>

        {/* 2-Column Comparison: The Problem with Common Solutions vs The Study Room Method */}
        <div className="mt-10 sm:mt-14 grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
          {/* Traditional Study Groups / Video Calls (The Problem) */}
          <div className="flex flex-col justify-between rounded-3xl border border-red-100 bg-red-50/30 p-6 sm:p-8">
            <div>
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-red-100 text-red-600 shadow-sm">
                  <ShieldAlert className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-lg sm:text-xl font-black text-[#071a3a]">Traditional Video/Voice Rooms</h3>
                  <p className="text-xs font-bold text-red-600 uppercase tracking-wider">Distracting • Social Fatigue</p>
                </div>
              </div>

              <ul className="mt-6 space-y-3.5 text-xs sm:text-sm font-semibold text-slate-700">
                <li className="flex items-start gap-3">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600 text-xs font-black">✕</span>
                  <span><strong>Camera fatigue:</strong> Constant pressure to look productive on webcam video streams.</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600 text-xs font-black">✕</span>
                  <span><strong>Voice interruptions:</strong> People talking, mic static, or unmoderated audio discussions.</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600 text-xs font-black">✕</span>
                  <span><strong>False attendance:</strong> Leaving browser tabs open without doing genuine study.</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600 text-xs font-black">✕</span>
                  <span><strong>Unsynced clocks:</strong> Stopwatches that can be artificially manipulated by device time.</span>
                </li>
              </ul>
            </div>

            <div className="mt-6 pt-4 border-t border-red-100/60 text-xs font-bold text-red-700">
              Result: Burnout and scattered attention
            </div>
          </div>

          {/* Study Room Approach (The Solution) */}
          <div className="flex flex-col justify-between rounded-3xl border border-blue-200 bg-gradient-to-br from-white via-white to-[#eaf5ff]/60 p-6 sm:p-8 shadow-xl shadow-blue-500/5">
            <div>
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#071a3a] text-white shadow-md">
                  <Sparkles className="h-6 w-6 text-amber-400" />
                </div>
                <div>
                  <h3 className="text-lg sm:text-xl font-black text-[#071a3a]">The Study Room Standard</h3>
                  <p className="text-xs font-bold text-[#0b73e6] uppercase tracking-wider">Silent • Synchronized • Genuine</p>
                </div>
              </div>

              <ul className="mt-6 space-y-3.5 text-xs sm:text-sm font-semibold text-slate-700">
                <li className="flex items-start gap-3">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-700 text-xs font-black">✓</span>
                  <span><strong>Zero Video &amp; Zero Voice:</strong> 100% privacy-preserving silent deep study space.</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-700 text-xs font-black">✓</span>
                  <span><strong>Atomic Server Clock Sync:</strong> Timestamps verified against server time via /api/time.</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-700 text-xs font-black">✓</span>
                  <span><strong>Live Rivalry Arena:</strong> Matchmaking duels when weekly hours converge within 10 minutes.</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-700 text-xs font-black">✓</span>
                  <span><strong>Rolling 20-Hour Goals:</strong> Milestone targets built for sustainable human consistency.</span>
                </li>
              </ul>
            </div>

            <div className="mt-6 pt-4 border-t border-blue-100 text-xs font-bold text-[#0b73e6]">
              Result: Calm, sustained deep-work hours
            </div>
          </div>
        </div>

        {/* 3 Core Pillars Cards — Flex Screen Adaptive */}
        <div id="why-us" className="mt-10 sm:mt-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          <div className="rounded-3xl border border-blue-100 bg-white p-6 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-2xl shadow-sm">
              🤫
            </div>
            <h4 className="mt-4 text-base sm:text-lg font-black text-[#071a3a]">Silent Group Focus</h4>
            <p className="mt-2 text-xs sm:text-sm font-medium leading-relaxed text-slate-600">
              Feel the presence of dozens of dedicated students studying alongside you without noise or distraction.
            </p>
          </div>

          <div className="rounded-3xl border border-blue-100 bg-white p-6 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-2xl shadow-sm">
              🛡️
            </div>
            <h4 className="mt-4 text-base sm:text-lg font-black text-[#071a3a]">Genuine Hours Only</h4>
            <p className="mt-2 text-xs sm:text-sm font-medium leading-relaxed text-slate-600">
              Take structured breaks with the Break timer. Every logged minute represents authentic desk study.
            </p>
          </div>

          <div className="rounded-3xl border border-blue-100 bg-white p-6 shadow-sm hover:shadow-md transition-shadow sm:col-span-2 lg:col-span-1">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-2xl shadow-sm">
              🔥
            </div>
            <h4 className="mt-4 text-base sm:text-lg font-black text-[#071a3a]">Sustainable Habits</h4>
            <p className="mt-2 text-xs sm:text-sm font-medium leading-relaxed text-slate-600">
              Build daily habits through streaks, weekly rankings, and the Monday Achiever Title competition.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
