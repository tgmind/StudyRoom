"use client";

import React, { memo, useState } from "react";
import { GlobalAnalyticsRankings } from "@/lib/supabase/types";
import {
  AnalyticsLensSelector,
  AnalyticsLensType,
} from "@/components/analytics/AnalyticsLensSelector";
import { StudyVolumeSpectrum } from "@/components/analytics/StudyVolumeSpectrum";
import { ConsistencyRhythmMatrix } from "@/components/analytics/ConsistencyRhythmMatrix";
import { AchieversHallOfFame } from "@/components/analytics/AchieversHallOfFame";
import { GoalExecutionGauges } from "@/components/analytics/GoalExecutionGauges";
import { Compass } from "lucide-react";

interface AnalyticsRankingSectionProps {
  rankings: GlobalAnalyticsRankings;
  currentUserId?: string;
  weekStart?: string;
  weekEnd?: string;
}

export const OBSERVATORY_LENS_ORDER: AnalyticsLensType[] = [
  "most_studying",
  "consistency_boost",
  "achievers",
  "goal_chasers",
];

export const AnalyticsRankingSection = memo(function AnalyticsRankingSection({
  rankings,
  currentUserId,
  weekStart,
  weekEnd,
}: AnalyticsRankingSectionProps) {
  const [activeLens, setActiveLens] =
    useState<AnalyticsLensType>("most_studying");
  const [turnDirection, setTurnDirection] = useState<"next" | "prev" | null>(null);
  const [animKey, setAnimKey] = useState<number>(0);

  const navigateLens = React.useCallback(
    (direction: "next" | "prev") => {
      setActiveLens((current) => {
        const idx = OBSERVATORY_LENS_ORDER.indexOf(current);
        const nextIdx =
          direction === "next"
            ? (idx + 1) % OBSERVATORY_LENS_ORDER.length
            : (idx - 1 + OBSERVATORY_LENS_ORDER.length) % OBSERVATORY_LENS_ORDER.length;
        return OBSERVATORY_LENS_ORDER[nextIdx];
      });
      setTurnDirection(direction);
      setAnimKey((prev) => prev + 1);

      if (typeof navigator !== "undefined" && navigator.vibrate) {
        try {
          navigator.vibrate(12);
        } catch {
          // ignore
        }
      }
    },
    []
  );

  const handleSelectLens = React.useCallback((lens: AnalyticsLensType) => {
    setActiveLens((current) => {
      if (current === lens) return current;
      const currentIdx = OBSERVATORY_LENS_ORDER.indexOf(current);
      const targetIdx = OBSERVATORY_LENS_ORDER.indexOf(lens);
      setTurnDirection(targetIdx > currentIdx ? "next" : "prev");
      setAnimKey((prev) => prev + 1);
      return lens;
    });
  }, []);

  // Gesture Recognition Refs
  const touchStartX = React.useRef<number | null>(null);
  const touchStartY = React.useRef<number | null>(null);
  const touchStartTime = React.useRef<number>(0);
  const isHorizontalSwipe = React.useRef<boolean>(false);
  const isVerticalScroll = React.useRef<boolean>(false);

  const onCancel = React.useCallback(() => {
    touchStartX.current = null;
    touchStartY.current = null;
    isHorizontalSwipe.current = false;
    isVerticalScroll.current = false;
  }, []);

  const onTouchStart = React.useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    touchStartX.current = touch.clientX;
    touchStartY.current = touch.clientY;
    touchStartTime.current = Date.now();
    isHorizontalSwipe.current = false;
    isVerticalScroll.current = false;
  }, []);

  const onTouchMove = React.useCallback((e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const touch = e.touches[0];
    const diffX = touch.clientX - touchStartX.current;
    const diffY = touch.clientY - touchStartY.current;

    if (isVerticalScroll.current) return;

    if (!isHorizontalSwipe.current) {
      if (Math.abs(diffY) > 8 && Math.abs(diffY) >= Math.abs(diffX)) {
        isVerticalScroll.current = true;
        return;
      }
      if (Math.abs(diffX) > 10 && Math.abs(diffX) > Math.abs(diffY)) {
        isHorizontalSwipe.current = true;
      }
    }
  }, []);

  const onTouchEnd = React.useCallback((e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const touch = e.changedTouches[0];
    const diffX = touch.clientX - touchStartX.current;
    const elapsed = Date.now() - touchStartTime.current;

    const isFlick = elapsed < 320 && Math.abs(diffX) > 28;
    const isDrag = Math.abs(diffX) > 45;

    if (!isVerticalScroll.current && isHorizontalSwipe.current && (isFlick || isDrag)) {
      if (diffX < 0) {
        navigateLens("next");
      } else {
        navigateLens("prev");
      }
    }

    onCancel();
  }, [navigateLens, onCancel]);

  // Pointer Events (Mouse/Trackpad drag)
  const onPointerDown = React.useCallback((e: React.PointerEvent) => {
    if (typeof e.button === "number" && e.button !== 0 && e.pointerType === "mouse") return;
    const x = e.clientX ?? e.pageX ?? 0;
    const y = e.clientY ?? e.pageY ?? 0;
    touchStartX.current = x;
    touchStartY.current = y;
    touchStartTime.current = Date.now();
    isHorizontalSwipe.current = false;
    isVerticalScroll.current = false;
  }, []);

  const onPointerMove = React.useCallback((e: React.PointerEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const x = e.clientX ?? e.pageX ?? 0;
    const y = e.clientY ?? e.pageY ?? 0;
    const diffX = x - touchStartX.current;
    const diffY = y - touchStartY.current;

    if (isVerticalScroll.current) return;

    if (!isHorizontalSwipe.current) {
      if (Math.abs(diffY) > 8 && Math.abs(diffY) >= Math.abs(diffX)) {
        isVerticalScroll.current = true;
        return;
      }
      if (Math.abs(diffX) > 12 && Math.abs(diffX) > Math.abs(diffY)) {
        isHorizontalSwipe.current = true;
      }
    }
  }, []);

  const onPointerUp = React.useCallback((e: React.PointerEvent) => {
    if (touchStartX.current === null) return;
    const x = e.clientX ?? e.pageX ?? 0;
    const diffX = x - touchStartX.current;
    const elapsed = Date.now() - touchStartTime.current;

    const isFlick = elapsed < 320 && Math.abs(diffX) > 28;
    const isDrag = Math.abs(diffX) > 45;

    if (!isVerticalScroll.current && isHorizontalSwipe.current && (isFlick || isDrag)) {
      if (diffX < 0) {
        navigateLens("next");
      } else {
        navigateLens("prev");
      }
    }

    onCancel();
  }, [navigateLens, onCancel]);

  return (
    <section
      aria-label="Global Analytics Observatory"
      className="relative w-full pt-3 pb-4 sm:pb-6 pr-3 sm:pr-4 transition-all duration-300"
    >
      {/* Scoped Apple Page Turn CSS Animations with GPU Acceleration */}
      <style>{`
        @keyframes applePageTurnNext {
          0% {
            opacity: 0.35;
            transform: perspective(1400px) rotateY(16deg) translateX(24px) scale(0.975);
            filter: brightness(0.92);
          }
          65% {
            opacity: 0.95;
            transform: perspective(1400px) rotateY(-2.5deg) translateX(-3px) scale(0.998);
            filter: brightness(1.02);
          }
          100% {
            opacity: 1;
            transform: perspective(1400px) rotateY(0deg) translateX(0) scale(1);
            filter: brightness(1);
          }
        }

        @keyframes applePageTurnPrev {
          0% {
            opacity: 0.35;
            transform: perspective(1400px) rotateY(-16deg) translateX(-24px) scale(0.975);
            filter: brightness(0.92);
          }
          65% {
            opacity: 0.95;
            transform: perspective(1400px) rotateY(2.5deg) translateX(3px) scale(0.998);
            filter: brightness(1.02);
          }
          100% {
            opacity: 1;
            transform: perspective(1400px) rotateY(0deg) translateX(0) scale(1);
            filter: brightness(1);
          }
        }

        @keyframes appleShadowSweep {
          0% {
            opacity: 0.55;
            transform: scaleX(1);
          }
          100% {
            opacity: 0;
            transform: scaleX(0.05);
          }
        }

        .animate-apple-page-next {
          animation: applePageTurnNext 400ms cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
          transform-origin: left center;
          will-change: transform, opacity;
          backface-visibility: hidden;
          transform-style: preserve-3d;
        }

        .animate-apple-page-prev {
          animation: applePageTurnPrev 400ms cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
          transform-origin: right center;
          will-change: transform, opacity;
          backface-visibility: hidden;
          transform-style: preserve-3d;
        }

        .animate-apple-shadow-sweep {
          animation: appleShadowSweep 400ms ease-out forwards;
          will-change: transform, opacity;
        }

        @media (prefers-reduced-motion: reduce) {
          .animate-apple-page-next,
          .animate-apple-page-prev,
          .animate-apple-shadow-sweep {
            animation: none !important;
            transform: none !important;
          }
        }
      `}</style>

      <div className="relative w-full">
        {/* Layer 5: Deepest Underlying Page (Backing / Sheet 5) */}
        <div
          className="absolute inset-0 translate-x-3 sm:translate-x-4 translate-y-6 sm:translate-y-8 rounded-3xl bg-[#0a0c12] border border-white/[0.08] shadow-sm pointer-events-none"
          aria-hidden="true"
        />

        {/* Layer 4: Underlying Sheet 4 */}
        <div
          className="absolute inset-0 translate-x-2.5 sm:translate-x-3 translate-y-4.5 sm:translate-y-6 rounded-3xl bg-[#0d0f17] border border-white/[0.12] shadow-md pointer-events-none"
          aria-hidden="true"
        />

        {/* Layer 3: Underlying Sheet 3 */}
        <div
          className="absolute inset-0 translate-x-2 sm:translate-x-2.5 translate-y-3 sm:translate-y-4 rounded-3xl bg-[#11131d] border border-white/[0.16] shadow-md pointer-events-none"
          aria-hidden="true"
        />

        {/* Layer 2: Underlying Sheet 2 */}
        <div
          className="absolute inset-0 translate-x-1 sm:translate-x-1.5 translate-y-1.5 sm:translate-y-2 rounded-3xl bg-[#151724] border border-white/[0.22] shadow-lg pointer-events-none"
          aria-hidden="true"
        />

        {/* Layer 1: Top Active Notepad Card Sheet with Swipe Touch/Pointer/Mouse Listeners */}
        <div
          className="relative z-10 w-full rounded-3xl bg-gradient-to-b from-[#181b26] via-[#141620] to-[#0f1118] border border-white/[0.28] p-4 sm:p-6 shadow-[0_20px_50px_-10px_rgba(0,0,0,0.85)] space-y-4 sm:space-y-5 select-none touch-pan-y"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onCancel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onCancel}
          onMouseDown={onPointerDown as unknown as React.MouseEventHandler}
          onMouseMove={onPointerMove as unknown as React.MouseEventHandler}
          onMouseUp={onPointerUp as unknown as React.MouseEventHandler}
        >
          {/* Vertical Spiral Binding Header */}
          <div
            className="relative -mt-4 sm:-mt-6 -mx-4 sm:-mx-6 mb-3 px-4 sm:px-6 pt-2 pb-3 bg-gradient-to-b from-[#202534] via-[#1a1e2b] to-[#151822] border-b border-white/[0.07] rounded-t-3xl select-none"
            aria-hidden="true"
          >
            {/* Row of Realistic Spiral Wire Rings & Punch Slots */}
            <div className="flex justify-between items-center px-1 sm:px-3">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="relative flex flex-col items-center">
                  {/* 3D Metallic Spiral Wire Loop (protrudes over top edge) */}
                  <div className="w-2.5 sm:w-3.5 h-6 sm:h-7 -mt-5 sm:-mt-6 rounded-full border-[2px] sm:border-[2.5px] border-slate-300 shadow-[0_3px_6px_rgba(0,0,0,0.85),inset_0_1px_2px_rgba(255,255,255,0.9)] bg-gradient-to-r from-slate-400 via-slate-100 to-slate-600" />
                  {/* Rectangular Punched Perforation Slot in Cardstock */}
                  <div className="w-2 sm:w-2.5 h-3 sm:h-3.5 -mt-1.5 rounded-[2px] bg-[#07080c] shadow-[inset_0_2px_3px_rgba(0,0,0,0.95)] border border-white/[0.08]" />
                </div>
              ))}
            </div>

            {/* Micro-Perforated Tear-Off Rule */}
            <div className="w-full mt-3 border-b border-dashed border-white/[0.12]" />
          </div>

          {/* Dedicated Observatory Section Header */}
          <div className="relative z-10 flex items-center justify-between pb-3 sm:pb-3.5 border-b border-white/[0.06]">
            <div className="flex items-center space-x-3 min-w-0">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-indigo-500/20 via-indigo-500/10 to-violet-500/10 border border-indigo-400/30 flex items-center justify-center text-indigo-300 shadow-[0_0_16px_rgba(99,102,241,0.2)] shrink-0">
                <Compass className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-300" />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm sm:text-base font-extrabold tracking-tight text-white">
                  Study Ecosystem Observatory
                </h2>
                <p className="text-[11px] sm:text-xs font-medium text-zinc-400 tracking-wide mt-0.5">
                  Top 5 Telemetry
                </p>
              </div>
            </div>
          </div>

          {/* 2. Interactive Mobile-First Analytics Lens Selector */}
          <AnalyticsLensSelector
            activeLens={activeLens}
            onSelectLens={handleSelectLens}
          />

          {/* 3. Responsive Analytical Subtitle & 3D Page Indicator */}
          <div className="px-1 flex items-center justify-between text-xs text-zinc-400">
            <div>
              <span className="text-[10px] uppercase font-mono font-bold tracking-wider text-zinc-500 block">
                {activeLens === "most_studying" && "TOP 5 · INTENSITY"}
                {activeLens === "consistency_boost" && "GROWTH RUNWAY · DISCIPLINE"}
                {activeLens === "achievers" && "HALL OF FAME · EXCELLENCE"}
                {activeLens === "goal_chasers" && "TASK PRECISION · EXECUTION"}
              </span>
              <h3 className="text-xs sm:text-sm font-extrabold text-zinc-200">
                <span className="sm:hidden">
                  {activeLens === "most_studying" && "Highest Daily Study Velocity"}
                  {activeLens === "consistency_boost" && "7-Day Habit Continuity"}
                  {activeLens === "achievers" && "Multi-Week Title Winners"}
                  {activeLens === "goal_chasers" && "Highest Goal Follow-Through"}
                </span>
                <span className="hidden sm:inline">
                  {activeLens === "most_studying" &&
                    "Top 5 students with the highest daily average study time"}
                  {activeLens === "consistency_boost" &&
                    "Top 5 students demonstrating the most consistent daily study habits"}
                  {activeLens === "achievers" &&
                    "Hall of Fame: Students with the most weekly Achiever badge distinctions"}
                  {activeLens === "goal_chasers" &&
                    "Top 5 students with the highest weekly goal follow-through rate"}
                </span>
              </h3>
            </div>

            {/* 3D Notepad Page Counter & Swipe Indicator */}
            <div className="flex items-center space-x-2 shrink-0 select-none">
              <span className="hidden sm:inline text-[9px] font-mono text-zinc-500 uppercase tracking-widest">
                Swipe ‹ ›
              </span>
              <div className="flex items-center space-x-1.5 px-2 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.08] text-[10px] font-mono text-zinc-300">
                <span>
                  Page {OBSERVATORY_LENS_ORDER.indexOf(activeLens) + 1}/
                  {OBSERVATORY_LENS_ORDER.length}
                </span>
                <div className="flex items-center space-x-1 ml-0.5">
                  {OBSERVATORY_LENS_ORDER.map((lens) => (
                    <span
                      key={lens}
                      className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${
                        activeLens === lens
                          ? "bg-amber-400 scale-125 shadow-[0_0_6px_rgba(251,191,36,0.8)]"
                          : "bg-zinc-600/70"
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 4. Domain-Specific Analytical Visualizer with Apple Page Turn Transition */}
          <div
            key={`${activeLens}-${animKey}`}
            role="tabpanel"
            id={`lens-panel-${activeLens}`}
            aria-labelledby={`lens-tab-${activeLens}`}
            className={`w-full pt-1 relative ${
              turnDirection === "next"
                ? "animate-apple-page-next"
                : turnDirection === "prev"
                ? "animate-apple-page-prev"
                : ""
            }`}
          >
            {/* Apple Dynamic Crease Shadow Sweep during turn */}
            {turnDirection && (
              <div
                className="pointer-events-none absolute inset-0 z-30 bg-gradient-to-r from-black/20 via-transparent to-black/15 animate-apple-shadow-sweep"
                aria-hidden="true"
              />
            )}

            {activeLens === "most_studying" && (
              <StudyVolumeSpectrum
                entries={rankings.most_studying || []}
                currentUserId={currentUserId}
                weekStart={weekStart}
                weekEnd={weekEnd}
              />
            )}
            {activeLens === "consistency_boost" && (
              <ConsistencyRhythmMatrix
                entries={rankings.consistency_rhythm_matrix || []}
                currentUserId={currentUserId}
              />
            )}
            {activeLens === "achievers" && (
              <AchieversHallOfFame
                entries={rankings.achiever_winners || []}
                currentUserId={currentUserId}
              />
            )}
            {activeLens === "goal_chasers" && (
              <GoalExecutionGauges
                entries={rankings.goal_chasers || []}
                currentUserId={currentUserId}
              />
            )}
          </div>
        </div>
      </div>

      {/* Subtle white text in the background below the card */}
      <p className="mt-9 sm:mt-11 text-center text-xs text-white/40 font-medium tracking-wide select-none pointer-events-none">
        Swipe Horizontally to flip the page.
      </p>
    </section>
  );
});
