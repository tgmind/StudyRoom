"use client";

import React, { useState, useEffect, useRef, memo, useMemo, useCallback } from "react";
import { RivalryWinEvent } from "@/lib/time/rivalry";
import { RIVALRY_CONFIG } from "@/lib/time/rivalryConfig";
import { Trophy, X, Swords, Crown, Flame } from "lucide-react";
import { triggerHapticFeedback } from "@/lib/utils/haptics";

interface RivalryWinCelebrationProps {
  winEvents?: RivalryWinEvent[] | null;
  winEvent?: RivalryWinEvent | null; // Backward-compatible single event
  onDismiss?: (eventId: string) => void;
}

const PERSISTENCE_DURATION_MS = RIVALRY_CONFIG.EVENT_TTL_MS; // 15 minutes (900,000ms)
const LIVE_POPUP_MAX_AGE_MS = RIVALRY_CONFIG.LIVE_POPUP_DURATION_MS; // 10 seconds (10,000ms)

function checkIsEventDismissed(evt: RivalryWinEvent): boolean {
  if (typeof window === "undefined") return false;
  try {
    const eventKey = evt.resolutionId || evt.id;
    if (localStorage.getItem(`studyroom_win_dismissed_${eventKey}`)) return true;
    if (evt.id && localStorage.getItem(`studyroom_win_dismissed_${evt.id}`)) return true;
    if (evt.winnerName && evt.loserName) {
      const pairVal = localStorage.getItem(`studyroom_win_dismissed_pair_${evt.winnerName}_${evt.loserName}`);
      if (pairVal) {
        const dismissedAt = parseInt(pairVal, 10);
        if (Date.now() - dismissedAt < PERSISTENCE_DURATION_MS) {
          return true;
        }
      }
    }
  } catch {}
  return false;
}

export const RivalryWinCelebration = memo(function RivalryWinCelebration({
  winEvents,
  winEvent,
  onDismiss,
}: RivalryWinCelebrationProps) {
  // Set of locally dismissed event IDs (resolutionIds)
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => {
    const set = new Set<string>();
    if (typeof window !== "undefined") {
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith("studyroom_win_dismissed_")) {
            const id = key.replace("studyroom_win_dismissed_", "");
            set.add(id);
          }
        }
      } catch {}
    }
    return set;
  });

  // Normalize events list: combine winEvents array or single winEvent
  const allEvents = useMemo(() => {
    const list: RivalryWinEvent[] = [];
    if (Array.isArray(winEvents)) {
      list.push(...winEvents);
    }
    if (winEvent && !list.some((e) => (e.resolutionId || e.id) === (winEvent.resolutionId || winEvent.id))) {
      list.push(winEvent);
    }
    // Filter by strict 15-minute TTL from occurrence timestamp and dismissal
    const now = Date.now();
    return list
      .filter((e) => e && e.timestamp && now - e.timestamp < PERSISTENCE_DURATION_MS)
      .filter((e) => {
        const eventKey = e.resolutionId || e.id;
        if (dismissedIds.has(eventKey) || (e.id && dismissedIds.has(e.id))) return false;
        return !checkIsEventDismissed(e);
      })
      .sort((a, b) => b.timestamp - a.timestamp); // Newest first
  }, [winEvents, winEvent, dismissedIds]);

  // Active event currently displayed in the 10-second live centered popup (null if no live popup)
  const [activePopupEvent, setActivePopupEvent] = useState<RivalryWinEvent | null>(null);

  // Track event IDs that have already shown the live popup in this session
  const shownPopupIdsRef = useRef<Set<string>>(new Set());

  // Check for newly arriving fresh events to show live 10-second centered celebration
  useEffect(() => {
    if (allEvents.length === 0) {
      setActivePopupEvent(null);
      return;
    }

    const now = Date.now();

    // Look for the newest event that is genuinely fresh (< 10s old) and hasn't been celebrated yet
    for (const evt of allEvents) {
      const eventKey = evt.resolutionId || evt.id;
      const elapsed = now - evt.timestamp;

      // Online Live Celebration Rule: Only show centered popup if event is fresh (< 10s)
      // Users returning offline after 10s will NOT see the live popup!
      if (elapsed < LIVE_POPUP_MAX_AGE_MS && !dismissedIds.has(eventKey)) {
        let sessionCelebrated = false;
        try {
          sessionCelebrated = Boolean(sessionStorage.getItem(`studyroom_win_celebrated_${eventKey}`));
        } catch {}

        if (!shownPopupIdsRef.current.has(eventKey) && !sessionCelebrated) {
          shownPopupIdsRef.current.add(eventKey);
          try {
            sessionStorage.setItem(`studyroom_win_celebrated_${eventKey}`, "true");
          } catch {}

          setActivePopupEvent(evt);
          triggerHapticFeedback([30, 40, 50]);

          const timer = setTimeout(() => {
            setActivePopupEvent((current) => {
              if (current && (current.resolutionId || current.id) === eventKey) {
                return null;
              }
              return current;
            });
          }, LIVE_POPUP_MAX_AGE_MS);

          return () => clearTimeout(timer);
        }
      }
    }
  }, [allEvents, dismissedIds]);

  // Master 2-second tick to keep TTL countdown timers and auto-expiration accurate
  const [, setTick] = useState(0);
  useEffect(() => {
    if (allEvents.length === 0) return;
    const interval = setInterval(() => setTick((t) => t + 1), 2000);
    return () => clearInterval(interval);
  }, [allEvents.length]);

  // Filter unexpired and undismissed events for compact banner display
  const activeBannerEvents = useMemo(() => {
    const now = Date.now();
    return allEvents.filter((e) => {
      const eventKey = e.resolutionId || e.id;
      const isDismissed = dismissedIds.has(eventKey);
      const isStillValid = now - e.timestamp < PERSISTENCE_DURATION_MS;
      return !isDismissed && isStillValid;
    });
  }, [allEvents, dismissedIds]);

  const handleDismissEvent = useCallback((eventToDismiss: RivalryWinEvent) => {
    const eventKey = eventToDismiss.resolutionId || eventToDismiss.id;
    setDismissedIds((prev) => {
      const next = new Set(prev);
      next.add(eventKey);
      if (eventToDismiss.id) next.add(eventToDismiss.id);
      return next;
    });

    setActivePopupEvent((current) => {
      if (current && (current.resolutionId || current.id) === eventKey) {
        return null;
      }
      return current;
    });

    triggerHapticFeedback(15);

    try {
      localStorage.setItem(`studyroom_win_dismissed_${eventKey}`, "true");
      if (eventToDismiss.id) {
        localStorage.setItem(`studyroom_win_dismissed_${eventToDismiss.id}`, "true");
      }
      if (eventToDismiss.winnerName && eventToDismiss.loserName) {
        const pairKey = `studyroom_win_dismissed_pair_${eventToDismiss.winnerName}_${eventToDismiss.loserName}`;
        localStorage.setItem(pairKey, Date.now().toString());
      }
      // Clean up legacy keys
      localStorage.removeItem("studyroom_active_rivalry_win");
    } catch {}

    if (onDismiss) {
      onDismiss(eventKey);
    }
  }, [onDismiss]);

  const handleDismissPopup = useCallback(() => {
    if (activePopupEvent) {
      handleDismissEvent(activePopupEvent);
    }
  }, [activePopupEvent, handleDismissEvent]);

  // Keyboard accessibility: dismiss live popup modal when Escape key is pressed
  useEffect(() => {
    if (!activePopupEvent) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleDismissPopup();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activePopupEvent, handleDismissPopup]);

  // Helper to format opponents string gracefully for trios vs pairs
  const formatOpponents = (evt: RivalryWinEvent) => {
    if (evt.finalStandings && evt.finalStandings.length >= 3) {
      const runnersUp = evt.finalStandings
        .filter((s) => s.userId !== evt.winnerId && s.name !== evt.winnerName)
        .map((s) => s.name);
      if (runnersUp.length >= 2) {
        return `${runnersUp[0]} & ${runnersUp[1]}`;
      }
    }
    return evt.loserName;
  };

  return (
    <>
      {/* 1. Centered Live Popup Overlay (Online Users Only, 10s auto-minimize)
          IMPORTANT: NOT fullscreen! Global live StudyRoom remains visible behind it */}
      {activePopupEvent && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Rivalry Winner Announcement"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              handleDismissPopup();
            }
          }}
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/40 backdrop-blur-[2px] animate-in fade-in duration-200 pointer-events-auto select-none cursor-pointer"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-sm sm:max-w-md p-5 sm:p-6 rounded-2xl sm:rounded-3xl bg-gradient-to-b from-[#221008] via-[#150a06] to-[#0a0504] border-2 border-amber-500/70 shadow-[0_12px_45px_rgba(0,0,0,0.85),_0_0_30px_rgba(245,158,11,0.25)] text-center space-y-3.5 animate-in zoom-in-95 duration-250 cursor-default"
          >
            {/* Subtle top amber highlight beam */}
            <div className="absolute top-0 left-1/4 right-1/4 h-[2px] bg-gradient-to-r from-transparent via-amber-400 to-transparent shadow-[0_0_15px_rgba(251,191,36,0.9)] pointer-events-none" />

            {/* Accessible Floating Close Button */}
            <button
              onClick={handleDismissPopup}
              className="absolute top-3 right-3 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-zinc-900/80 border border-zinc-700/80 text-zinc-400 hover:text-white hover:border-amber-500/50 transition-all active:scale-95 z-20 touch-manipulation focus:outline-none focus:ring-2 focus:ring-amber-500"
              title="Dismiss celebration"
              aria-label="Dismiss celebration"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Trophy Crest Badge */}
            <div className="relative mx-auto w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-tr from-amber-500 via-yellow-400 to-amber-300 flex items-center justify-center text-zinc-950 shadow-[0_0_25px_rgba(245,158,11,0.6)] animate-bounce motion-reduce:animate-none">
              <Trophy className="w-7 h-7 sm:w-8 sm:h-8 fill-current drop-shadow-sm" />
              <Crown className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-950 fill-amber-950 absolute -top-1 left-1/2 -translate-x-1/2" />
            </div>

            {/* Headline */}
            <div className="space-y-1 relative z-10">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[10px] font-black uppercase tracking-widest">
                <Swords className="w-3 h-3 text-amber-400" />
                <span>{activePopupEvent.mode === "RANK_CLASH" ? "Rank Clash Victorious" : "Rivalry Victorious"}</span>
              </div>
              <h2 className="text-lg sm:text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-yellow-100 to-amber-300 tracking-tight">
                Victory Claimed!
              </h2>
            </div>

            {/* Victory Announcement Box */}
            <div className="relative z-10 p-3 sm:p-3.5 rounded-xl bg-zinc-950/80 border border-amber-500/40 shadow-inner space-y-1">
              <p className="text-xs sm:text-sm font-extrabold text-zinc-100 leading-snug break-words">
                <span className="text-amber-300 underline decoration-amber-500/60 decoration-2 font-black">
                  {activePopupEvent.winnerName}
                </span>{" "}
                defeated{" "}
                <span className="text-rose-300 font-bold">{formatOpponents(activePopupEvent)}</span> 🎉
              </p>
              <div className="flex items-center justify-center gap-1.5 text-[10px] text-amber-300/90 font-semibold pt-0.5 flex-wrap">
                <Flame className="w-3 h-3 text-amber-400 fill-amber-400 shrink-0" />
                <span>
                  {activePopupEvent.mode === "RANK_CLASH"
                    ? "Extended leaderboard score lead in Live Study!"
                    : "Extended weekly study lead in Live Study!"}
                </span>
              </div>
            </div>

            <p className="text-[10px] text-zinc-400 font-medium">
              Auto-minimizing in 10s • Stays pinned above Studying for 15m
            </p>
          </div>
        </div>
      )}

      {/* 2. Persistent Compact Banners Hooked Above 'Studying' Section
          Multiple wins display newest to oldest. 15-minute TTL enforced strictly. */}
      {activeBannerEvents.length > 0 && (
        <div className="space-y-2 mb-3">
          {activeBannerEvents.map((evt) => {
            const eventKey = evt.resolutionId || evt.id;
            const remainingMs = Math.max(0, PERSISTENCE_DURATION_MS - (Date.now() - evt.timestamp));
            const remainingMinutes = Math.max(1, Math.ceil(remainingMs / 60000));
            const progressPercent = Math.max(0, Math.min(100, (remainingMs / PERSISTENCE_DURATION_MS) * 100));

            return (
              <div
                key={`banner-${eventKey}`}
                className="relative w-full rounded-xl bg-gradient-to-r from-[#200f06]/95 via-[#160d13]/95 to-[#1c080e]/95 border border-amber-500/40 shadow-[0_4px_20px_rgba(245,158,11,0.12)] backdrop-blur-md flex items-center justify-between gap-2 p-2 sm:p-2.5 overflow-hidden transition-all duration-300 select-none animate-in fade-in slide-in-from-top-1"
              >
                <div className="relative z-10 flex items-center gap-2 min-w-0 flex-1">
                  {/* Indicator Bar */}
                  <div className="w-1 self-stretch rounded-full bg-gradient-to-b from-amber-400 via-yellow-300 to-rose-500 shrink-0 shadow-[0_0_6px_rgba(245,158,11,0.7)]" />

                  {/* Trophy Icon */}
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-amber-500 to-yellow-400 flex items-center justify-center text-zinc-950 shadow-[0_0_10px_rgba(245,158,11,0.4)] shrink-0">
                    <Trophy className="w-3.5 h-3.5 fill-current" />
                  </div>

                  <div className="flex flex-col min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[8px] sm:text-[8.5px] font-black uppercase tracking-wider px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/35 shrink-0">
                        {evt.mode === "RANK_CLASH" ? "Rank Clash Victor" : "Rivalry Victor"}
                      </span>
                      <span className="text-[8.5px] text-zinc-400 font-mono font-medium shrink-0">
                        • {remainingMinutes}m left
                      </span>
                    </div>
                    <p className="text-xs sm:text-[13px] font-extrabold text-zinc-100 leading-tight mt-0.5 break-words">
                      <span className="text-amber-300 font-black">{evt.winnerName}</span>{" "}
                      won against{" "}
                      <span className="text-rose-300 font-bold">{formatOpponents(evt)}</span> 🎉
                    </p>
                  </div>
                </div>

                {/* Dismiss Button [X] */}
                <button
                  onClick={() => handleDismissEvent(evt)}
                  className="relative z-10 min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800/80 border border-transparent hover:border-amber-500/30 transition-all active:scale-95 shrink-0 touch-manipulation focus:outline-none focus:ring-1 focus:ring-amber-500"
                  title="Dismiss result notice"
                  aria-label="Dismiss result notice"
                >
                  <X className="w-3.5 h-3.5" />
                </button>

                {/* 15-Minute Countdown Bottom Progress Line */}
                <div
                  className="absolute bottom-0 left-0 h-[1.5px] bg-gradient-to-r from-amber-400 via-rose-500 to-amber-300 transition-all duration-1000 shadow-[0_0_4px_rgba(245,158,11,0.8)]"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            );
          })}
        </div>
      )}
    </>
  );
});
