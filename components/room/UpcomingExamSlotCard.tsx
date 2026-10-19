"use client";

import React, { memo, useMemo } from "react";
import Link from "next/link";
import { GraduationCap, Calendar, ArrowUpRight, Clock, CheckCircle2 } from "lucide-react";
import { useExamPlans } from "@/hooks/useExamPlans";
import {
  calculateExamCountdown,
  differenceInCalendarDays,
  formatIndianDate,
  formatReadableDate,
  parseDateISO,
} from "@/lib/planner/calculations";
import { PRESET_SLOT_CATEGORIES } from "@/lib/planner/types";
import { getDateInTimezone } from "@/lib/scoring/streak";
import { getServerNow } from "@/lib/time/clockSync";
import { ExamPlanWithSlots, PreparationSlot } from "@/lib/supabase/types";
import { useUpcomingExamCardPreference } from "@/hooks/useUpcomingExamCardPreference";

export interface UpcomingExamSlotCardProps {
  userId?: string;
  isTimerActive: boolean;
  className?: string;
  showCard?: boolean;
}

interface ActiveSlotAnalysis {
  state: "active" | "upcoming" | "gap" | "completed" | "none";
  activeSlot: PreparationSlot | null;
  phaseNumber: number;
  phaseRemainingDays: number;
  phaseTotalDays: number;
  upcomingSlot: PreparationSlot | null;
  upcomingDaysUntil: number;
  upcomingPhaseNumber: number;
}

/**
 * Evaluates the preparation slots for an exam relative to today's date in Asia/Kolkata timezone.
 * Returns the exact current phase state (active, upcoming, gap, all completed, or none).
 */
export function analyzeExamSlots(
  slots: PreparationSlot[] | undefined,
  todayISO: string,
  examDateISO: string
): ActiveSlotAnalysis {
  if (!slots || slots.length === 0) {
    return {
      state: "none",
      activeSlot: null,
      phaseNumber: 0,
      phaseRemainingDays: 0,
      phaseTotalDays: 0,
      upcomingSlot: null,
      upcomingDaysUntil: 0,
      upcomingPhaseNumber: 0,
    };
  }

  // Filter out any slot with malformed or impossible dates (e.g. invalid leap years)
  const validSlots = slots.filter((slot) => {
    if (!slot.start_date || !slot.end_date) return false;
    const start = parseDateISO(slot.start_date);
    const end = parseDateISO(slot.end_date);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return false;
    return slot.start_date <= slot.end_date;
  });

  if (validSlots.length === 0) {
    return {
      state: "none",
      activeSlot: null,
      phaseNumber: 0,
      phaseRemainingDays: 0,
      phaseTotalDays: 0,
      upcomingSlot: null,
      upcomingDaysUntil: 0,
      upcomingPhaseNumber: 0,
    };
  }

  // Deterministic sort: start_date ASC, sort_order ASC, created_at ASC
  const sorted = [...validSlots].sort((a, b) => {
    if (a.start_date !== b.start_date) {
      return a.start_date.localeCompare(b.start_date);
    }
    if (a.sort_order !== b.sort_order) {
      return a.sort_order - b.sort_order;
    }
    return (a.created_at || "").localeCompare(b.created_at || "");
  });

  // 1. Check for slot active today: start_date <= today <= end_date
  const activeIndex = sorted.findIndex(
    (s) => s.start_date <= todayISO && todayISO <= s.end_date
  );

  if (activeIndex !== -1) {
    const activeSlot = sorted[activeIndex];
    const phaseTotalDays = Math.max(
      1,
      differenceInCalendarDays(activeSlot.start_date, activeSlot.end_date) + 1
    );
    const phaseRemainingDays = Math.max(
      0,
      differenceInCalendarDays(todayISO, activeSlot.end_date)
    );

    return {
      state: "active",
      activeSlot,
      phaseNumber: activeIndex + 1,
      phaseRemainingDays,
      phaseTotalDays,
      upcomingSlot: null,
      upcomingDaysUntil: 0,
      upcomingPhaseNumber: 0,
    };
  }

  // 2. No slot covers today. Check if there are future slots: start_date > todayISO
  const upcomingIndex = sorted.findIndex((s) => s.start_date > todayISO);

  if (upcomingIndex !== -1) {
    const upcomingSlot = sorted[upcomingIndex];
    const upcomingDaysUntil = Math.max(
      1,
      differenceInCalendarDays(todayISO, upcomingSlot.start_date)
    );

    // If there were earlier slots before today, it's a gap; if this is slot 0, it's before prep starts
    const isGap = upcomingIndex > 0;

    return {
      state: isGap ? "gap" : "upcoming",
      activeSlot: null,
      phaseNumber: 0,
      phaseRemainingDays: 0,
      phaseTotalDays: 0,
      upcomingSlot,
      upcomingDaysUntil,
      upcomingPhaseNumber: upcomingIndex + 1,
    };
  }

  // 3. All slots are in the past relative to today, but exam is today or in future
  return {
    state: "completed",
    activeSlot: null,
    phaseNumber: 0,
    phaseRemainingDays: 0,
    phaseTotalDays: 0,
    upcomingSlot: null,
    upcomingDaysUntil: 0,
    upcomingPhaseNumber: 0,
  };
}

/**
 * Finds the nearest upcoming exam from a list of plans.
 * Evaluates in Asia/Kolkata timezone and sorts by closest exam_date ASC, then sort_order ASC.
 */
export function findNearestUpcomingExam(
  plans: ExamPlanWithSlots[],
  todayISO: string
): { nearestExam: ExamPlanWithSlots; daysRemaining: number } | null {
  if (!plans || plans.length === 0) return null;

  const upcomingList: { plan: ExamPlanWithSlots; daysRemaining: number }[] = [];

  for (const plan of plans) {
    if (!plan.exam_date) continue;
    const parsed = parseDateISO(plan.exam_date);
    if (isNaN(parsed.getTime())) continue;

    const diff = differenceInCalendarDays(todayISO, plan.exam_date);
    // diff >= 0 means exam is today (0) or in the future (> 0)
    if (diff >= 0) {
      upcomingList.push({ plan, daysRemaining: diff });
    }
  }

  if (upcomingList.length === 0) return null;

  // Sort by daysRemaining ASC (nearest first), tie breaker: sort_order ASC, created_at DESC
  upcomingList.sort((a, b) => {
    if (a.daysRemaining !== b.daysRemaining) {
      return a.daysRemaining - b.daysRemaining;
    }
    if (a.plan.sort_order !== b.plan.sort_order) {
      return a.plan.sort_order - b.plan.sort_order;
    }
    return (b.plan.created_at || "").localeCompare(a.plan.created_at || "");
  });

  return {
    nearestExam: upcomingList[0].plan,
    daysRemaining: upcomingList[0].daysRemaining,
  };
}

export const UpcomingExamSlotCard = memo(function UpcomingExamSlotCard({
  userId,
  isTimerActive,
  className = "",
  showCard,
}: UpcomingExamSlotCardProps) {
  const { showRoomUpcomingCard } = useUpcomingExamCardPreference();
  const isCardEnabled = showCard !== undefined ? showCard : showRoomUpcomingCard;

  const { plans, loading } = useExamPlans(userId);

  // App timezone-aware today date (Asia/Kolkata by default)
  const timezone = process.env.NEXT_PUBLIC_APP_TIMEZONE || "Asia/Kolkata";
  const now = getServerNow();
  const todayISO = getDateInTimezone(now, timezone);

  // Find nearest upcoming exam
  const nearestResult = useMemo(() => {
    return findNearestUpcomingExam(plans, todayISO);
  }, [plans, todayISO]);

  // If user disabled card in settings, or loading with no cache, or no upcoming exams, render nothing
  if (!isCardEnabled || (loading && plans.length === 0) || !nearestResult) {
    return null;
  }

  const { nearestExam } = nearestResult;
  const countdown = calculateExamCountdown(nearestExam.exam_date, now, timezone);
  const isToday = countdown.status === "today";

  // Evaluate active slot
  const slotAnalysis = analyzeExamSlots(nearestExam.slots, todayISO, nearestExam.exam_date);

  const categoryMeta = slotAnalysis.activeSlot
    ? PRESET_SLOT_CATEGORIES[
        slotAnalysis.activeSlot.category as keyof typeof PRESET_SLOT_CATEGORIES
      ] || PRESET_SLOT_CATEGORIES.custom
    : null;

  return (
    <div
      className={`overflow-hidden transition-[max-height,opacity,transform,margin] duration-300 ease-in-out motion-reduce:transition-none ${
        isTimerActive
          ? "max-h-0 opacity-0 -translate-y-2 scale-[0.98] pointer-events-none mb-0"
          : "max-h-52 opacity-100 translate-y-0 scale-100 pointer-events-auto mb-3 sm:mb-3.5"
      } ${className}`}
      aria-hidden={isTimerActive}
      data-testid="upcoming-exam-slot-card-container"
    >
      <div
        className="relative block w-full rounded-2xl bg-gradient-to-br from-[#101b38] via-[#161f42]/90 to-[#0b1021] border border-indigo-500/35 shadow-lg backdrop-blur-md overflow-hidden select-none"
      >
        {/* Subtle Ambient background glow graphic */}
        <div
          aria-hidden="true"
          className="absolute -top-10 -right-10 w-36 h-36 rounded-full blur-2xl pointer-events-none bg-indigo-500/15"
        />

        {/* Top Accent Strip */}
        <div
          aria-hidden="true"
          className={`h-1 w-full transition-colors ${
            nearestExam.is_locked
              ? "bg-amber-500/70"
              : isToday
              ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.7)]"
              : "bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-500"
          }`}
        />

        <div className="p-3 sm:p-3.5 space-y-2">
          {/* LEVEL 1: Academic Icon + Exam Title & Date (Left) | Alarming Countdown (Right) */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center space-x-2.5 min-w-0 flex-1">
              <div
                className={`w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center shrink-0 border shadow-inner ${
                  isToday
                    ? "bg-emerald-950/40 border-emerald-500/40 text-emerald-300"
                    : "bg-indigo-500/20 border-indigo-500/40 text-indigo-300"
                }`}
              >
                <GraduationCap className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
              </div>

              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex items-center min-w-0">
                  <Link
                    href="/planner"
                    className="group/title inline-flex items-center space-x-1.5 min-w-0 max-w-full rounded-md py-0.5 pr-1.5 -ml-0.5 pl-0.5 hover:bg-white/[0.06] transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                    title={`View ${nearestExam.exam_name} in Planner`}
                    aria-label={`Upcoming exam: ${nearestExam.exam_name}, ${
                      isToday ? "Exam is today" : `${countdown.daysRemaining} days remaining`
                    }. View in Planner`}
                  >
                    <h3 className="text-sm sm:text-base font-black text-white tracking-tight truncate group-hover/title:text-indigo-200 transition-colors underline decoration-transparent hover:decoration-indigo-400/60 underline-offset-4">
                      {nearestExam.exam_name}
                    </h3>
                    <ArrowUpRight className="w-3.5 h-3.5 text-indigo-400/80 group-hover/title:text-indigo-200 group-hover/title:translate-x-0.5 group-hover/title:-translate-y-0.5 transition-all shrink-0" />
                  </Link>
                </div>

                <div className="flex items-center space-x-1.5 text-[11px] sm:text-xs text-zinc-400 font-medium">
                  <Calendar className="w-3 h-3 text-amber-400/80 shrink-0" />
                  <span>Exam: {formatIndianDate(nearestExam.exam_date)}</span>
                  <span className="text-[10px] sm:text-[11px] text-zinc-500 font-normal hidden xs:inline">
                    ({formatReadableDate(nearestExam.exam_date, { monthFormat: "short" })})
                  </span>
                </div>
              </div>
            </div>

            {/* Right: Alarming Countdown Number in Bold Glowing Style matching Planner */}
            <div className="flex flex-col items-end text-right shrink-0 select-none pl-1">
              <span
                data-testid="countdown-number"
                className="text-2xl sm:text-3xl font-black tabular-nums tracking-tight text-white leading-none"
                style={{
                  textShadow: isToday
                    ? "0 0 16px rgba(16,185,129,0.85), 0 2px 4px rgba(0,0,0,0.9)"
                    : "0 0 16px rgba(244,63,94,0.75), 0 0 32px rgba(239,68,68,0.45), 0 2px 4px rgba(0,0,0,0.95)",
                }}
              >
                {isToday ? "TODAY" : countdown.daysRemaining}
              </span>
              <span
                data-testid="countdown-label"
                className="text-[8.5px] sm:text-[9.5px] font-extrabold uppercase tracking-wider text-rose-300/90 drop-shadow-sm mt-0.5"
              >
                {isToday
                  ? "exam day"
                  : countdown.daysRemaining === 1
                  ? "day remaining"
                  : "days remaining"}
              </span>
            </div>
          </div>

          {/* LEVEL 2: Stylized Active Slot Information (Full-width, clean typography, NO truncation!) */}
          {slotAnalysis.state === "active" && slotAnalysis.activeSlot && categoryMeta && (
            <div className="pt-2 border-t border-white/[0.08] flex items-center justify-between gap-2 text-xs min-w-0">
              <div className="flex items-center space-x-1.5 min-w-0 flex-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
                <span className="text-sky-300 font-bold uppercase tracking-wider text-[10.5px] sm:text-[11px] shrink-0">
                  Phase #{slotAnalysis.phaseNumber}
                </span>
                <span className="text-zinc-600 font-bold">•</span>
                <span className={`font-bold text-[11px] sm:text-xs ${categoryMeta.badgeText} truncate max-w-[120px] xs:max-w-[180px] sm:max-w-md`}>
                  {categoryMeta.label}
                </span>
                {slotAnalysis.activeSlot.title.toLowerCase() !== categoryMeta.label.toLowerCase() && (
                  <>
                    <span className="text-zinc-600 font-bold hidden sm:inline">•</span>
                    <span className="text-zinc-200 font-medium truncate max-w-[160px] hidden sm:inline text-[11px]">
                      {slotAnalysis.activeSlot.title}
                    </span>
                  </>
                )}
                <span className="text-zinc-600 font-bold hidden sm:inline">•</span>
                <span className="text-zinc-400 tabular-nums hidden sm:inline shrink-0 text-[11px]">
                  {formatIndianDate(slotAnalysis.activeSlot.start_date)} –{" "}
                  {formatIndianDate(slotAnalysis.activeSlot.end_date)}
                </span>
              </div>

              <div className="text-[10.5px] sm:text-xs font-bold text-emerald-400 tabular-nums shrink-0">
                {slotAnalysis.phaseRemainingDays === 0
                  ? "Ends today"
                  : `${slotAnalysis.phaseRemainingDays}d left in phase`}
              </div>
            </div>
          )}

          {/* UPCOMING PHASE FALLBACK */}
          {slotAnalysis.state === "upcoming" && slotAnalysis.upcomingSlot && (
            <div className="pt-2 border-t border-white/[0.08] flex items-center justify-between gap-2 text-xs min-w-0">
              <div className="flex items-center space-x-1.5 min-w-0 flex-1 truncate">
                <Clock className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <span className="text-sky-300 font-bold uppercase tracking-wider text-[10.5px] shrink-0">
                  Phase #{slotAnalysis.upcomingPhaseNumber}
                </span>
                <span className="text-zinc-600 font-bold">•</span>
                <span className="text-zinc-300 truncate">
                  Next: <span className="font-bold text-white">{slotAnalysis.upcomingSlot.title}</span> starts in{" "}
                  <span className="font-bold text-sky-300 tabular-nums">
                    {slotAnalysis.upcomingDaysUntil} {slotAnalysis.upcomingDaysUntil === 1 ? "day" : "days"}
                  </span>
                </span>
              </div>
              <span className="text-[10.5px] text-zinc-500 font-medium shrink-0">
                {formatIndianDate(slotAnalysis.upcomingSlot.start_date)}
              </span>
            </div>
          )}

          {/* GAP BETWEEN PHASES FALLBACK */}
          {slotAnalysis.state === "gap" && slotAnalysis.upcomingSlot && (
            <div className="pt-2 border-t border-white/[0.08] flex items-center justify-between gap-2 text-xs min-w-0">
              <div className="flex items-center space-x-1.5 min-w-0 flex-1 truncate">
                <Calendar className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span className="text-amber-400 font-medium shrink-0">No phase active today</span>
                <span className="text-zinc-600 font-bold">•</span>
                <span className="text-zinc-300 truncate">
                  Next: <span className="font-bold text-white">{slotAnalysis.upcomingSlot.title}</span> in{" "}
                  <span className="font-bold text-amber-300 tabular-nums">{slotAnalysis.upcomingDaysUntil}d</span>
                </span>
              </div>
              <span className="text-[10.5px] text-zinc-500 font-medium shrink-0">
                Open Planner →
              </span>
            </div>
          )}

          {/* ALL PHASES COMPLETED FALLBACK */}
          {slotAnalysis.state === "completed" && (
            <div className="pt-2 border-t border-white/[0.08] flex items-center justify-between gap-2 text-xs min-w-0">
              <div className="flex items-center space-x-1.5 min-w-0 truncate">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="text-emerald-400 font-medium">All scheduled preparation phases completed</span>
              </div>
              <span className="text-[10.5px] text-zinc-500 font-medium shrink-0">
                Open Planner →
              </span>
            </div>
          )}

          {/* NO PHASES CONFIGURED FALLBACK */}
          {slotAnalysis.state === "none" && (
            <div className="pt-2 border-t border-white/[0.08] flex items-center justify-between gap-2 text-xs min-w-0">
              <div className="flex items-center space-x-1.5 min-w-0 truncate text-zinc-400">
                <Calendar className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                <span>No preparation phases scheduled yet</span>
              </div>
              <span className="text-[10.5px] text-indigo-300 font-semibold shrink-0">
                Set up in Planner →
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
