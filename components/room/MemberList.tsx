"use client";

import React, {
  memo,
  useEffect,
  useLayoutEffect,
  useState,
  useMemo,
  useRef,
  useCallback,
} from "react";
import { UserProfile } from "@/lib/supabase/types";
import { MemberCard } from "@/components/room/MemberCard";
import { RivalryArena } from "./RivalryArena";
import { detectLiveRivalries, RivalryState, RivalryWinEvent } from "@/lib/time/rivalry";
import { RivalryWinCelebration } from "./RivalryWinCelebration";
import { Users, WifiOff, Flame, Coffee } from "lucide-react";
import { calculateMemberElapsedStudySeconds } from "@/lib/time/format";
import { getEffectiveMemberStatus } from "@/lib/time/break";
import { getServerNow } from "@/lib/time/clockSync";

const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

interface MemberListProps {
  members: UserProfile[];
  currentUserId?: string;
  currentUserElapsedSeconds?: number;
  isLoading?: boolean;
  winEvent?: RivalryWinEvent | null;
  onRivalryWin?: (event: RivalryWinEvent) => void;
  onDismissWinEvent?: () => void;
}

export const MemberList = memo(function MemberList({
  members = [],
  currentUserId,
  currentUserElapsedSeconds,
  isLoading = false,
  winEvent,
  onRivalryWin,
  onDismissWinEvent,
}: MemberListProps) {
  // Single shared master tick for all room member cards (calibrated to atomic server clock)
  const [currentTimestamp, setCurrentTimestamp] = useState(() => getServerNow());

  const hasAnyActiveOrBreak = (members || []).some(
    (m) => m.current_status === "studying" || m.current_status === "break"
  );

  useEffect(() => {
    const tick = () => setCurrentTimestamp(getServerNow());
    tick();
    // 1s interval when active/break members present; 5s interval when all are offline to update minute counters
    const intervalMs = hasAnyActiveOrBreak ? 1000 : 5000;
    const intervalId = setInterval(tick, intervalMs);

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
  }, [hasAnyActiveOrBreak]);

  // Memoize filtered member groupings based on authoritative live effective status
  const studyingMembers = useMemo(
    () => (members || []).filter((m) => getEffectiveMemberStatus(m, currentTimestamp) === "studying"),
    [members, currentTimestamp]
  );
  const breakMembers = useMemo(
    () => (members || []).filter((m) => getEffectiveMemberStatus(m, currentTimestamp) === "break"),
    [members, currentTimestamp]
  );
  const activeMembers = useMemo(
    () => [...studyingMembers, ...breakMembers],
    [studyingMembers, breakMembers]
  );
  const offlineMembers = useMemo(
    () => (members || []).filter((m) => getEffectiveMemberStatus(m, currentTimestamp) === "offline"),
    [members, currentTimestamp]
  );

  // Authoritative dynamic study duration for global ranking
  const getMemberStudySeconds = useCallback(
    (member: UserProfile, now: Date): number => {
      if (member.id === currentUserId && currentUserElapsedSeconds !== undefined) {
        return currentUserElapsedSeconds;
      }
      return calculateMemberElapsedStudySeconds(member, now);
    },
    [currentUserId, currentUserElapsedSeconds]
  );

  // Sorted in decreasing order of active study session time in Global view
  const sortedActiveMembers = useMemo(() => {
    return [...activeMembers].sort((a, b) => {
      const elapsedA = getMemberStudySeconds(a, currentTimestamp);
      const elapsedB = getMemberStudySeconds(b, currentTimestamp);

      // 1. Decreasing order of active study session time (highest study time first)
      if (elapsedB !== elapsedA) {
        return elapsedB - elapsedA;
      }

      // 2. Active studying before break
      const statusA = getEffectiveMemberStatus(a, currentTimestamp);
      const statusB = getEffectiveMemberStatus(b, currentTimestamp);
      if (statusA !== statusB) {
        return statusA === "studying" ? -1 : 1;
      }

      // 3. Alphabetical tie-breaker
      return (a.display_name || "").localeCompare(b.display_name || "");
    });
  }, [activeMembers, currentTimestamp, getMemberStudySeconds]);

  // Real-time Multi-Rivalry Detection: triggers when 2 or 3 active members come within <= 1 hour in weekly study time
  const rivalries = useMemo(() => {
    return detectLiveRivalries(
      activeMembers,
      currentTimestamp,
      currentUserId,
      currentUserElapsedSeconds
    );
  }, [activeMembers, currentTimestamp, currentUserId, currentUserElapsedSeconds]);

  const rivalMemberIds = useMemo(() => {
    const set = new Set<string>();
    rivalries.forEach((r) => r.rivalMembers.forEach((m) => set.add(m.id)));
    return set;
  }, [rivalries]);

  const nonRivalActiveMembers = useMemo(() => {
    if (rivalries.length === 0) return sortedActiveMembers;
    return sortedActiveMembers.filter((m) => !rivalMemberIds.has(m.id));
  }, [sortedActiveMembers, rivalries, rivalMemberIds]);

  // Track resolved rivalries to trigger celebratory win announcements
  const prevRivalriesRef = useRef<RivalryState[]>([]);
  useEffect(() => {
    const prevRivalries = prevRivalriesRef.current;
    if (prevRivalries.length > 0) {
      for (const prev of prevRivalries) {
        const stillActive = rivalries.some((r) => r.id === prev.id);
        if (!stillActive && prev.rivalMembers.length >= 2) {
          const winner = prev.rivalMembers[0];
          const loser = prev.rivalMembers[1];
          // If they are still rivals in another group (e.g. trio to pair), don't declare victory yet
          const stillRivalsTogether = rivalries.some(
            (r) =>
              r.rivalMembers.some((m) => m.id === winner.id) &&
              r.rivalMembers.some((m) => m.id === loser.id)
          );
          if (stillRivalsTogether) continue;

          if (winner?.display_name && loser?.display_name) {
            const winMinute = Math.floor(Date.now() / 60000);
            const winEvent: RivalryWinEvent = {
              id: `win-${winner.id}-${loser.id}-${winMinute}`,
              winnerName: winner.display_name,
              loserName: loser.display_name,
              timestamp: Date.now(),
            };
            if (onRivalryWin) {
              onRivalryWin(winEvent);
            }
          }
        }
      }
    }
    prevRivalriesRef.current = rivalries;
  }, [rivalries, onRivalryWin]);

  // Refs for tracking DOM card elements and their bounding rectangles across re-orders
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const prevRectsRef = useRef<Map<string, DOMRect>>(new Map());
  const prevOrderRef = useRef<string[]>([]);

  const setCardRef = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) {
      cardRefs.current.set(id, el);
    } else {
      cardRefs.current.delete(id);
    }
  }, []);

  // Synchronous layout effect before paint to animate smooth position transitions (FLIP)
  useIsomorphicLayoutEffect(() => {
    const prevRects = prevRectsRef.current;
    const currentOrder = sortedActiveMembers.map((m) => m.id);
    const hasOrderChanged =
      prevOrderRef.current.length > 0 &&
      (prevOrderRef.current.length !== currentOrder.length ||
        prevOrderRef.current.some((id, idx) => id !== currentOrder[idx]));

    if (hasOrderChanged && prevRects.size > 0) {
      sortedActiveMembers.forEach((member) => {
        const el = cardRefs.current.get(member.id);
        const prevRect = prevRects.get(member.id);

        if (el && prevRect) {
          const currentRect = el.getBoundingClientRect();
          const deltaX = prevRect.left - currentRect.left;
          const deltaY = prevRect.top - currentRect.top;

          if (deltaX !== 0 || deltaY !== 0) {
            // Cancel any ongoing transition to ensure fluid overtaking
            el.getAnimations?.().forEach((anim) => anim.cancel());

            // Smooth satisfying overtaking transition
            el.animate(
              [
                {
                  transform: `translate3d(${deltaX}px, ${deltaY}px, 0) scale(1.02)`,
                  zIndex: 20,
                  boxShadow: "0 10px 28px -4px rgba(217, 70, 239, 0.3)",
                },
                {
                  transform: "translate3d(0, 0, 0) scale(1)",
                  zIndex: 1,
                  boxShadow: "none",
                },
              ],
              {
                duration: 650,
                easing: "cubic-bezier(0.25, 1.15, 0.35, 1)", // Satisfying smooth spring curve
              }
            );
          }
        }
      });
    }

    // Capture current rects & order for the next transition check
    const nextRects = new Map<string, DOMRect>();
    sortedActiveMembers.forEach((member) => {
      const el = cardRefs.current.get(member.id);
      if (el) {
        nextRects.set(member.id, el.getBoundingClientRect());
      }
    });
    prevRectsRef.current = nextRects;
    prevOrderRef.current = currentOrder;
  }, [sortedActiveMembers]);

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
      {/* 1. Live Rivalry Arenas (rendered below Study Timer in descending order of weekly study time) */}
      {rivalries.length > 0 && (
        <div className="space-y-3 transition-all duration-400 ease-out">
          {rivalries.map((rivalry) => (
            <RivalryArena
              key={rivalry.id}
              rivalry={rivalry}
              currentTimestamp={currentTimestamp}
              currentUserId={currentUserId}
              currentUserElapsedSeconds={currentUserElapsedSeconds}
              setCardRef={setCardRef}
            />
          ))}
        </div>
      )}

      {/* Rivalry Winner Celebration (Overlapping popup & 15m persistent compact banner) */}
      <RivalryWinCelebration winEvent={winEvent} onDismiss={onDismissWinEvent} />

      {/* 2. Active Studying & On Break Members Section */}
      {(nonRivalActiveMembers.length > 0 || rivalries.length === 0) && (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-1.5">
                <Flame className="w-4 h-4 text-fuchsia-400 fill-fuchsia-400" />
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-zinc-200">
                  Studying{" "}
                  <span className="text-fuchsia-400 font-mono">
                    ({studyingMembers.length})
                  </span>
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
              <span className="w-1.5 h-1.5 rounded-full bg-fuchsia-400" />
              <span>Live Sync</span>
            </div>
          </div>

          {nonRivalActiveMembers.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3.5">
              {nonRivalActiveMembers.map((member) => (
                <div
                  key={member.id}
                  ref={(el) => setCardRef(member.id, el)}
                  className="will-change-transform h-full flex flex-col"
                >
                  <MemberCard
                    member={member}
                    isCurrentUser={member.id === currentUserId}
                    customElapsedSeconds={
                      member.id === currentUserId ? currentUserElapsedSeconds : undefined
                    }
                    currentTimestamp={currentTimestamp}
                  />
                </div>
              ))}
            </div>
          ) : rivalries.length === 0 ? (
            <div className="p-5 rounded-2xl border border-dashed border-zinc-800/80 bg-zinc-950/40 text-center text-xs text-zinc-500 space-y-1">
              <p className="font-semibold text-zinc-400">No members actively studying right now</p>
              <p className="text-[11px]">Press <strong>Start Studying</strong> above to lead the session!</p>
            </div>
          ) : null}
        </div>
      )}

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
              <div key={member.id} className="h-full flex flex-col">
                <MemberCard
                  member={member}
                  isCurrentUser={member.id === currentUserId}
                  customElapsedSeconds={
                    member.id === currentUserId ? currentUserElapsedSeconds : undefined
                  }
                  currentTimestamp={currentTimestamp}
                />
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
});
