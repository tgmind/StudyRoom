"use client";

import React, { memo, useEffect, useState, useMemo } from "react";
import { UserProfile } from "@/lib/supabase/types";
import { MemberCard } from "@/components/room/MemberCard";
import { Users, WifiOff, Flame, Coffee } from "lucide-react";

interface MemberListProps {
  members: UserProfile[];
  currentUserId?: string;
  currentUserElapsedSeconds?: number;
  isLoading?: boolean;
}

export const MemberList = memo(function MemberList({
  members = [],
  currentUserId,
  currentUserElapsedSeconds,
  isLoading = false,
}: MemberListProps) {
  // Memoize filtered member groupings directly from members array
  const studyingMembers = useMemo(
    () => (members || []).filter((m) => m.current_status === "studying"),
    [members]
  );
  const breakMembers = useMemo(
    () => (members || []).filter((m) => m.current_status === "break"),
    [members]
  );
  const activeMembers = useMemo(
    () => [...studyingMembers, ...breakMembers],
    [studyingMembers, breakMembers]
  );
  const offlineMembers = useMemo(
    () => (members || []).filter((m) => m.current_status === "offline"),
    [members]
  );

  // Single shared master tick for all room member cards
  const [currentTimestamp, setCurrentTimestamp] = useState(new Date());

  useEffect(() => {
    if (studyingMembers.length === 0) return;

    const intervalId = setInterval(() => {
      setCurrentTimestamp(new Date());
    }, 1000);

    return () => clearInterval(intervalId);
  }, [studyingMembers.length]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3.5">
        {[1, 2, 3, 4].map((idx) => (
          <div
            key={idx}
            className="w-full h-44 bg-zinc-900/50 border border-zinc-800/80 rounded-2xl animate-pulse"
          />
        ))}
      </div>
    );
  }

  if ((members || []).length === 0) {
    return (
      <div className="text-center py-10 px-4 rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/40 space-y-2">
        <Users className="w-8 h-8 text-zinc-600 mx-auto" />
        <h3 className="text-xs font-semibold text-zinc-300">
          No room members found
        </h3>
        <p className="text-[11px] text-zinc-500 max-w-xs mx-auto">
          Start a live study session to invite peer motivation!
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Active Studying & On Break Members Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-1.5">
              <Flame className="w-4 h-4 text-emerald-400 fill-emerald-400" />
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-zinc-200">
                Studying <span className="text-emerald-400 font-mono">({studyingMembers.length})</span>
              </h3>
            </div>

            {breakMembers.length > 0 && (
              <div className="flex items-center space-x-1 px-2 py-0.5 rounded-full bg-amber-950/40 border border-amber-500/30 text-[10px] font-bold text-amber-300">
                <Coffee className="w-3 h-3 text-amber-400" />
                <span>{breakMembers.length} on break</span>
              </div>
            )}
          </div>

          <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-[10px] font-bold text-zinc-300 shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
            <span>Live Sync</span>
          </div>
        </div>

        {activeMembers.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3.5">
            {activeMembers.map((member) => (
              <MemberCard
                key={member.id}
                member={member}
                isCurrentUser={member.id === currentUserId}
                customElapsedSeconds={
                  member.id === currentUserId ? currentUserElapsedSeconds : undefined
                }
                currentTimestamp={currentTimestamp}
              />
            ))}
          </div>
        ) : (
          <div className="p-5 rounded-2xl border border-dashed border-zinc-800/80 bg-zinc-950/40 text-center text-xs text-zinc-500 space-y-1">
            <p className="font-semibold text-zinc-400">No members actively studying right now</p>
            <p className="text-[11px]">Press <strong>Start Studying</strong> above to lead the session!</p>
          </div>
        )}
      </div>

      {/* Offline Group Members Section */}
      {offlineMembers.length > 0 && (
        <div className="space-y-3 pt-3 border-t border-zinc-900">
          <div className="flex items-center space-x-2 text-zinc-500 px-1">
            <WifiOff className="w-3.5 h-3.5" />
            <h3 className="text-[11px] font-extrabold uppercase tracking-wider text-zinc-500">
              Offline Members ({offlineMembers.length})
            </h3>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3.5">
            {offlineMembers.map((member) => (
              <MemberCard
                key={member.id}
                member={member}
                isCurrentUser={member.id === currentUserId}
                customElapsedSeconds={
                  member.id === currentUserId ? currentUserElapsedSeconds : undefined
                }
                currentTimestamp={currentTimestamp}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
});
