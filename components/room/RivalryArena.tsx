"use client";

import React, { memo } from "react";
import { UserProfile } from "@/lib/supabase/types";
import { MemberCard } from "@/components/room/MemberCard";
import { RivalryBadge } from "./RivalryBadge";
import { RivalryState, formatWeeklyHours, getLiveMemberWeeklySeconds } from "@/lib/time/rivalry";
import { Swords, Flame } from "lucide-react";

interface RivalryArenaProps {
  rivalry: RivalryState;
  currentTimestamp: Date;
  currentUserId?: string;
  currentUserElapsedSeconds?: number;
  setCardRef: (id: string, el: HTMLDivElement | null) => void;
}

export const RivalryArena = memo(function RivalryArena({
  rivalry,
  currentTimestamp,
  currentUserId,
  currentUserElapsedSeconds,
  setCardRef,
}: RivalryArenaProps) {
  const { rivalMembers, formattedGap, isTrio } = rivalry;

  return (
    <section
      aria-label="Live Rivalry Arena"
      className="relative w-full rounded-2xl p-2 sm:p-3 bg-gradient-to-b from-[#2a060d] via-[#1a0408] to-[#0c0204] border border-rose-500/50 ring-1 ring-rose-500/30 shadow-[0_6px_35px_rgba(225,29,72,0.28),_0_0_20px_rgba(244,63,94,0.18)] overflow-hidden transition-all duration-400 ease-out"
    >
      {/* Shadowy Red Ambient Glow & Laser Beam */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(244,63,94,0.25),_transparent_75%)] pointer-events-none" />
      <div className="absolute top-0 left-1/4 right-1/4 h-[1.5px] bg-gradient-to-r from-transparent via-rose-500 to-transparent shadow-[0_0_15px_rgba(244,63,94,1)] pointer-events-none" />

      {/* Ultra-Compact Minimalist Battle Header */}
      <div className="relative z-10 flex items-center justify-between gap-2 mb-1.5 px-0.5">
        <div className="flex items-center gap-1.5">
          <div className="flex items-center justify-center w-5 h-5 rounded-md bg-rose-500/20 border border-rose-500/40 text-rose-400 shrink-0">
            <Swords className="w-3 h-3" />
          </div>
          <div className="flex items-center gap-1">
            <h2 className="text-[11px] sm:text-xs font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-rose-300 via-amber-200 to-rose-400 uppercase">
              {isTrio ? "Tri-Clash Arena" : "Rivalry Arena"}
            </h2>
            <span className="text-[8px] sm:text-[9px] font-black uppercase px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40">
              {isTrio ? "3-Way" : "≤10m Clash"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 text-[9px] sm:text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
          <Flame className="w-3 h-3 text-amber-400 fill-amber-400" />
          <span className="text-zinc-300">{isTrio ? "3 Contenders" : "Weekly Duel"}</span>
        </div>
      </div>

      {/* Grid of Rival Cards with Centered Overlapping V/S Emblem */}
      <div
        className={`relative z-10 grid gap-2 sm:gap-3 ${
          isTrio ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2"
        }`}
      >
        {rivalMembers.map((member, idx) => {
          const weeklySeconds = getLiveMemberWeeklySeconds(
            member,
            currentTimestamp,
            currentUserId,
            currentUserElapsedSeconds
          );

          const roleLabel =
            idx === 0
              ? { title: "LEADER", border: "border-rose-500/40", bg: "bg-rose-950/60", text: "text-rose-300" }
              : idx === 1
              ? { title: "CHALLENGER", border: "border-amber-500/40", bg: "bg-amber-950/60", text: "text-amber-300" }
              : { title: "CONTENDER", border: "border-violet-500/40", bg: "bg-violet-950/60", text: "text-violet-300" };

          return (
            <div
              key={`rival-${member.id}`}
              ref={(el) => setCardRef(member.id, el)}
              className={`transition-transform duration-300 flex flex-col ${
                isTrio && idx === 2
                  ? "col-span-2 max-w-[calc(50%-0.25rem)] sm:max-w-none mx-auto w-full sm:col-span-1"
                  : ""
              }`}
            >
              {/* Minimalist Micro Leaderboard Strip */}
              <div
                className={`flex items-center justify-between px-1.5 py-0.5 mb-1 rounded-md border text-[8px] sm:text-[9px] font-black uppercase tracking-tight shadow-sm ${roleLabel.border} ${roleLabel.bg} ${roleLabel.text}`}
              >
                <span className="truncate">{roleLabel.title}</span>
                <span className="font-mono text-zinc-200 font-bold ml-1">
                  {formatWeeklyHours(weeklySeconds)}
                </span>
              </div>

              {/* Compact MemberCard */}
              <div className="flex-1 flex flex-col">
                <MemberCard
                  member={member}
                  isCurrentUser={currentUserId === member.id}
                  customElapsedSeconds={
                    currentUserId === member.id ? currentUserElapsedSeconds : undefined
                  }
                  currentTimestamp={currentTimestamp}
                  compact={true}
                />
              </div>
            </div>
          );
        })}

        {/* For 2 Members: Single Centered Overlapping V/S Badge */}
        {!isTrio && (
          <RivalryBadge formattedGap={formattedGap} isTrio={false} />
        )}

        {/* For 3 Members: Responsive Positioning */}
        {isTrio && (
          <>
            {/* Mobile Trio Badge: Centered in Row 1 between Card 1 and Card 2 */}
            <div className="sm:hidden absolute left-1/2 top-[28%] -translate-x-1/2 -translate-y-1/2 pointer-events-none z-20">
              <RivalryBadge formattedGap={formattedGap} isTrio={true} />
            </div>

            {/* Desktop Trio Badge: Positioned between Card 1 and Card 2 */}
            <div className="hidden sm:block absolute left-[33.3%] top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-20">
              <RivalryBadge formattedGap={formattedGap} isTrio={true} />
            </div>
          </>
        )}
      </div>
    </section>
  );
});
