"use client";

import React, { useState, useEffect } from "react";
import { Server, ArrowDown, ArrowUp, RefreshCw, Zap, Wifi } from "lucide-react";

export function RealtimeArchitectureSection() {
  const [pulseIndex, setPulseIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setPulseIndex((prev) => (prev + 1) % 3);
    }, 2400);
    return () => clearInterval(timer);
  }, []);

  return (
    <section id="realtime-sync" className="py-14 sm:py-20 lg:py-24 bg-gradient-to-b from-[#f0fdf4] via-[#f6fef9] to-[#e6fcf0] border-b border-emerald-200/60 scroll-mt-20">
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-[#eaf5ff] px-3.5 py-1 text-xs font-black uppercase tracking-wider text-[#07458f]">
            <span>06 — REALTIME SYSTEM</span>
          </div>
          <h2 className="mt-3.5 text-2xl xs:text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-[#071a3a]">
            Live Peer <span className="text-[#0b73e6]">Synchronization</span>
          </h2>
          <p className="mt-3.5 sm:mt-4 text-sm sm:text-base lg:text-lg font-medium leading-relaxed text-slate-600">
            When one member starts studying, pauses for a break, or reaches a milestone, their updated status
            is propagated live to every other active member in milliseconds.
          </p>
        </div>

        {/* Realtime Architecture Interactive Diagram */}
        <div className="mt-10 sm:mt-14 max-w-4xl mx-auto rounded-3xl border border-blue-100 bg-[#f8fcff] p-5 sm:p-8 md:p-10 shadow-lg shadow-blue-500/5">
          <div className="grid gap-6 sm:gap-8 md:grid-cols-3 items-center text-center">
            {/* User A Card */}
            <div className={`rounded-2xl border bg-white p-4 sm:p-5 shadow-sm transition-all ${pulseIndex === 0 ? "border-[#0b73e6] shadow-blue-200 shadow-md ring-2 ring-blue-100" : "border-slate-200"}`}>
              <div className="mx-auto flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-2xl bg-blue-50 text-2xl">
                👨‍🎓
              </div>
              <h4 className="mt-2.5 sm:mt-3 text-sm sm:text-base font-black text-[#071a3a]">Student A (You)</h4>
              <p className="text-xs font-bold text-green-600">● Starts Session</p>
              <div className="mt-2.5 sm:mt-3 rounded-lg bg-slate-50 p-2 text-[10px] sm:text-[11px] font-mono text-slate-500 break-words">
                Action: status = &quot;studying&quot;
              </div>
            </div>

            {/* Central Server Node */}
            <div className="flex flex-col items-center">
              {/* Mobile Connector Arrow */}
              <div className="flex md:hidden items-center justify-center text-[#0b73e6] my-1">
                <ArrowDown className="h-5 w-5 animate-bounce" />
              </div>

              <div className="hidden md:flex items-center text-[#0b73e6] space-x-1 mb-2">
                <span className="h-2 w-2 rounded-full bg-[#0b73e6] animate-ping" />
                <span className="text-[10px] font-black uppercase tracking-wider">Sub-second Broadcast</span>
              </div>

              <div className="rounded-2xl sm:rounded-3xl border-2 border-blue-200 bg-[#071a3a] p-5 sm:p-6 text-white shadow-xl shadow-blue-900/20 w-full max-w-[240px]">
                <Server className="mx-auto h-6 w-6 sm:h-7 sm:w-7 text-blue-400" />
                <h4 className="mt-2 text-xs sm:text-sm font-black tracking-wide">Realtime Engine</h4>
                <p className="mt-1 text-[9px] sm:text-[10px] font-bold text-blue-200 uppercase tracking-widest">
                  Room Channel
                </p>
                <div className="mt-2.5 sm:mt-3 flex items-center justify-center gap-1.5 text-[9px] sm:text-[10px] font-mono text-emerald-400">
                  <Wifi className="h-3 w-3 shrink-0" />
                  <span>Broadcast: Active</span>
                </div>
              </div>

              <p className="mt-2 text-[10px] sm:text-[11px] font-bold text-slate-400">
                Atomic State Hub
              </p>

              {/* Mobile Connector Arrow */}
              <div className="flex md:hidden items-center justify-center text-[#0b73e6] my-1">
                <ArrowDown className="h-5 w-5 animate-bounce" />
              </div>
            </div>

            {/* Other Members (Users B & C) */}
            <div className={`rounded-2xl border bg-white p-4 sm:p-5 shadow-sm transition-all ${pulseIndex >= 1 ? "border-emerald-500 shadow-emerald-100 shadow-md ring-2 ring-emerald-50" : "border-slate-200"}`}>
              <div className="mx-auto flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-2xl bg-emerald-50 text-2xl">
                👩‍🎓
              </div>
              <h4 className="mt-2.5 sm:mt-3 text-sm sm:text-base font-black text-[#071a3a]">Students B &amp; C</h4>
              <p className="text-xs font-bold text-[#0b73e6]">Instant Peer Update</p>
              <div className="mt-2.5 sm:mt-3 rounded-lg bg-slate-50 p-2 text-[10px] sm:text-[11px] font-mono text-slate-500 break-words">
                Render: Peer Glowing Active
              </div>
            </div>
          </div>

          <div className="mt-6 sm:mt-8 rounded-2xl bg-white p-3.5 sm:p-4 border border-blue-100/70 text-center text-xs font-medium text-slate-600">
            <span className="font-bold text-[#071a3a]">How it works:</span> State changes travel through encrypted WebSocket broadcast channels. No page refreshing is ever required to see who is active in the room.
          </div>
        </div>
      </div>
    </section>
  );
}
