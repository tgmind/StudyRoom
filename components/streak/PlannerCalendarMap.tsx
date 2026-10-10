"use client";

import React, { memo, useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { ExamPlanWithSlots, PreparationSlot } from "@/lib/supabase/types";
import { PRESET_SLOT_CATEGORIES } from "@/lib/planner/types";
import {
  calculateExamCountdown,
  differenceInCalendarDays,
  formatReadableDate,
  parseDateISO,
  formatDateISO,
} from "@/lib/planner/calculations";
import { getDateInTimezone, DailyStudySummary, QUALIFYING_MINUTES_THRESHOLD } from "@/lib/scoring/streak";
import { getServerNow } from "@/lib/time/clockSync";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Flag,
  Hourglass,
  Layers,
  ArrowRight,
  Sparkles,
  Info,
  X,
  Check,
} from "lucide-react";

interface PlannerCalendarMapProps {
  plans: ExamPlanWithSlots[];
  loading?: boolean;
  dailySummaries?: DailyStudySummary[];
}

export const PlannerCalendarMap = memo(function PlannerCalendarMap({
  plans,
  loading = false,
  dailySummaries = [],
}: PlannerCalendarMapProps) {
  // Map dateISO -> active study minutes for streak qualification checks (>= 30m)
  const studyMinutesMap = useMemo(() => {
    const map = new Map<string, number>();
    if (dailySummaries) {
      for (const s of dailySummaries) {
        map.set(s.dateISO, s.activeStudyMinutes);
      }
    }
    return map;
  }, [dailySummaries]);

  // Only plans enabled for Streaks
  const visiblePlans = useMemo(() => {
    return plans.filter((p) => p.show_in_streaks);
  }, [plans]);

  const [selectedPlanId, setSelectedPlanId] = useState<string>("");

  useEffect(() => {
    if (visiblePlans.length > 0) {
      if (!selectedPlanId || !visiblePlans.some((p) => p.id === selectedPlanId)) {
        setSelectedPlanId(visiblePlans[0].id);
      }
    } else {
      setSelectedPlanId("");
    }
  }, [visiblePlans, selectedPlanId]);

  const activePlan = useMemo(() => {
    return visiblePlans.find((p) => p.id === selectedPlanId) || visiblePlans[0] || null;
  }, [visiblePlans, selectedPlanId]);

  // Current calendar month view (year and 0-indexed month) in Indian Kolkata timezone
  const todayISO = useMemo(() => getDateInTimezone(getServerNow(), "Asia/Kolkata"), []);

  const [viewYearMonth, setViewYearMonth] = useState<{ year: number; month: number }>(() => {
    const today = parseDateISO(todayISO);
    return {
      year: isNaN(today.getTime()) ? 2026 : today.getUTCFullYear(),
      month: isNaN(today.getTime()) ? 9 : today.getUTCMonth(),
    };
  });

  // When active plan changes, default to current month or exam month
  useEffect(() => {
    if (activePlan) {
      const today = parseDateISO(todayISO);
      setViewYearMonth({
        year: today.getUTCFullYear(),
        month: today.getUTCMonth(),
      });
    }
  }, [activePlan, todayISO]);

  // Selected day for inspection
  const [inspectedDateISO, setInspectedDateISO] = useState<string | null>(null);

  // Month navigation handlers
  const handlePrevMonth = () => {
    setViewYearMonth((prev) => {
      if (prev.month === 0) {
        return { year: prev.year - 1, month: 11 };
      }
      return { year: prev.year, month: prev.month - 1 };
    });
  };

  const handleNextMonth = () => {
    setViewYearMonth((prev) => {
      if (prev.month === 11) {
        return { year: prev.year + 1, month: 0 };
      }
      return { year: prev.year, month: prev.month + 1 };
    });
  };

  const handleJumpToToday = () => {
    const today = parseDateISO(todayISO);
    setViewYearMonth({
      year: today.getUTCFullYear(),
      month: today.getUTCMonth(),
    });
  };

  const handleJumpToExam = () => {
    if (!activePlan) return;
    const examDate = parseDateISO(activePlan.exam_date);
    setViewYearMonth({
      year: examDate.getUTCFullYear(),
      month: examDate.getUTCMonth(),
    });
  };

  // Month grid calculation
  const monthData = useMemo(() => {
    const { year, month } = viewYearMonth;
    const firstDayOfMonth = new Date(Date.UTC(year, month, 1));
    const lastDayOfMonth = new Date(Date.UTC(year, month + 1, 0));

    // In UTC, get day of week (0 for Sun, 1 for Mon... 6 for Sat)
    // Convert to Monday-first: Mon=0, Tue=1 ... Sun=6
    const firstDayIndex = (firstDayOfMonth.getUTCDay() + 6) % 7;
    const daysInMonth = lastDayOfMonth.getUTCDate();

    // Days array
    const days: Array<{
      dateISO: string;
      dayNumber: number;
      isCurrentMonth: boolean;
      isToday: boolean;
      isPast: boolean;
      isExamDate: boolean;
      slot: PreparationSlot | null;
      studyMinutes: number;
      isStreakQualified: boolean;
    }> = [];

    // Leading padding from previous month
    const prevMonthLastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const d = prevMonthLastDay - i;
      const prevDate = new Date(Date.UTC(year, month - 1, d));
      const iso = formatDateISO(prevDate);
      days.push({
        dateISO: iso,
        dayNumber: d,
        isCurrentMonth: false,
        isToday: iso === todayISO,
        isPast: iso < todayISO,
        isExamDate: activePlan ? iso === activePlan.exam_date : false,
        slot: null,
        studyMinutes: 0,
        isStreakQualified: false,
      });
    }

    // Days in current month
    for (let d = 1; d <= daysInMonth; d++) {
      const currentDate = new Date(Date.UTC(year, month, d));
      const iso = formatDateISO(currentDate);

      // Find slot covering this date
      let matchingSlot: PreparationSlot | null = null;
      if (activePlan) {
        for (const slot of activePlan.slots) {
          if (iso >= slot.start_date && iso <= slot.end_date) {
            matchingSlot = slot;
            break;
          }
        }
      }

      const studyMinutes = studyMinutesMap.get(iso) || 0;
      const isStreakQualified = studyMinutes >= QUALIFYING_MINUTES_THRESHOLD;

      days.push({
        dateISO: iso,
        dayNumber: d,
        isCurrentMonth: true,
        isToday: iso === todayISO,
        isPast: iso < todayISO,
        isExamDate: activePlan ? iso === activePlan.exam_date : false,
        slot: matchingSlot,
        studyMinutes,
        isStreakQualified,
      });
    }

    // Trailing padding to fill complete weeks (multiples of 7)
    const remaining = (7 - (days.length % 7)) % 7;
    for (let d = 1; d <= remaining; d++) {
      const nextDate = new Date(Date.UTC(year, month + 1, d));
      const iso = formatDateISO(nextDate);
      days.push({
        dateISO: iso,
        dayNumber: d,
        isCurrentMonth: false,
        isToday: iso === todayISO,
        isPast: iso < todayISO,
        isExamDate: activePlan ? iso === activePlan.exam_date : false,
        slot: null,
        studyMinutes: 0,
        isStreakQualified: false,
      });
    }

    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ];

    return {
      monthTitle: `${monthNames[month]} ${year}`,
      days,
    };
  }, [viewYearMonth, activePlan, todayISO, studyMinutesMap]);

  // Details for inspected day
  const inspectedDayInfo = useMemo(() => {
    if (!inspectedDateISO || !activePlan) return null;

    let matchingSlot: PreparationSlot | null = null;
    for (const slot of activePlan.slots) {
      if (inspectedDateISO >= slot.start_date && inspectedDateISO <= slot.end_date) {
        matchingSlot = slot;
        break;
      }
    }

    const isExamDay = inspectedDateISO === activePlan.exam_date;
    const daysUntilExam = differenceInCalendarDays(inspectedDateISO, activePlan.exam_date);
    const studyMinutes = studyMinutesMap.get(inspectedDateISO) || 0;
    const isStreakQualified = studyMinutes >= QUALIFYING_MINUTES_THRESHOLD;

    return {
      dateISO: inspectedDateISO,
      isExamDay,
      daysUntilExam,
      slot: matchingSlot,
      examName: activePlan.exam_name,
      examDate: activePlan.exam_date,
      studyMinutes,
      isStreakQualified,
    };
  }, [inspectedDateISO, activePlan, studyMinutesMap]);

  if (loading) {
    return null;
  }

  // EMPTY STATE: No plans enabled for Streaks
  if (visiblePlans.length === 0) {
    return (
      <section
        aria-label="Exam Preparation Calendar Map"
        className="rounded-2xl bg-zinc-950/80 border border-zinc-800/90 p-5 sm:p-6 shadow-xl backdrop-blur-md space-y-4"
      >
        <div className="flex items-center space-x-2 text-zinc-100">
          <div className="p-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400">
            <CalendarDays className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-extrabold text-zinc-100 tracking-tight">
              Exam Preparation Timeline & Calendar Map
            </h2>
            <p className="text-[10px] sm:text-xs text-zinc-400">
              Project your exam preparation phases onto a unified timeline
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-dashed border-zinc-800 p-6 text-center space-y-3 bg-zinc-900/30">
          <div className="mx-auto w-10 h-10 rounded-xl bg-zinc-900 flex items-center justify-center text-zinc-500">
            <Layers className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <p className="text-xs sm:text-sm font-bold text-zinc-300">
              No exam plans enabled for Streaks
            </p>
            <p className="text-[11px] sm:text-xs text-zinc-500 max-w-sm mx-auto">
              Create an exam plan or toggle &quot;Show Calendar in Streaks: ON&quot; in the Planner to visualize your preparation roadmap here.
            </p>
          </div>
          <Link
            href="/planner"
            className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-zinc-200 text-zinc-950 text-xs font-black shadow transition-all active:scale-95 cursor-pointer"
          >
            <span>Open Study Planner</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </section>
    );
  }

  const activeCountdown = activePlan ? calculateExamCountdown(activePlan.exam_date) : null;

  return (
    <section
      aria-label="Exam Preparation Calendar Map"
      className="relative rounded-2xl bg-zinc-950/80 border border-zinc-800/90 p-3.5 sm:p-5 shadow-xl backdrop-blur-md space-y-4"
    >
      {/* SECTION HEADER & EXAM SELECTOR */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-850">
        <div className="flex items-center space-x-3 min-w-0">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-blue-500/20 to-indigo-500/10 border border-blue-500/30 text-blue-400 shrink-0 shadow-[0_0_15px_rgba(59,130,246,0.15)]">
            <CalendarDays className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base md:text-lg font-black text-zinc-100 tracking-tight flex items-center gap-2 flex-wrap">
              <span>Exam Preparation Calendar</span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/15 text-blue-300 border border-blue-500/30">
                Timeline
              </span>
            </h2>
            <p className="text-[11px] sm:text-xs text-zinc-400 truncate mt-0.5">
              Scheduled roadmap & phase timeline • Independent of actual streaks
            </p>
          </div>
        </div>

        <Link
          href="/planner"
          className="inline-flex items-center space-x-1.5 text-xs font-bold text-amber-400 hover:text-amber-300 transition-colors shrink-0 self-start sm:self-auto py-1.5 px-3 rounded-xl bg-zinc-900/90 hover:bg-zinc-850 border border-zinc-800 shadow-sm"
        >
          <span>Manage in Planner</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* MULTIPLE EXAMS SELECTOR CHIPS */}
      {visiblePlans.length > 1 && (
        <div className="space-y-1.5">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-500">
            Select Active Exam Schedule:
          </span>
          <div className="flex items-center space-x-2 overflow-x-auto no-scrollbar pb-1">
            {visiblePlans.map((plan) => {
              const isSelected = plan.id === activePlan?.id;
              const cd = calculateExamCountdown(plan.exam_date);
              return (
                <button
                  key={plan.id}
                  type="button"
                  onClick={() => {
                    setSelectedPlanId(plan.id);
                    setInspectedDateISO(null);
                  }}
                  className={`inline-flex items-center space-x-2 px-3 py-1.5 rounded-xl border text-xs font-bold whitespace-nowrap transition-all select-none touch-manipulation cursor-pointer ${
                    isSelected
                      ? "bg-white text-zinc-950 shadow-[0_2px_14px_rgba(255,255,255,0.22)] ring-1 ring-amber-400/40"
                      : "bg-zinc-900/80 text-zinc-400 border-zinc-800 hover:text-zinc-200 hover:border-zinc-700"
                  }`}
                >
                  <span className="truncate max-w-[140px] sm:max-w-[200px]">
                    {plan.exam_name}
                  </span>
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[9px] font-extrabold tabular-nums ${
                      isSelected
                        ? "bg-zinc-950 text-white"
                        : "bg-zinc-800 text-zinc-400"
                    }`}
                  >
                    {cd.displayText}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ACTIVE PLAN SUMMARY BANNER */}
      {activePlan && (
        <div className="rounded-xl bg-zinc-900/60 border border-zinc-800/80 p-3 sm:p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shadow-sm">
          <div className="flex items-center space-x-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-400 shrink-0">
              <Flag className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-xs sm:text-sm font-black text-zinc-100 truncate">
                {activePlan.exam_name}
              </h3>
              <p className="text-[11px] text-zinc-400 flex items-center space-x-1.5">
                <span>Target: {formatReadableDate(activePlan.exam_date, { monthFormat: "long" })}</span>
                <span className="text-zinc-600">•</span>
                <span>{activePlan.slots.length} preparation slots</span>
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            {activeCountdown && (
              <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-amber-500/15 text-amber-300 border border-amber-500/30 tabular-nums">
                <Hourglass className="w-3 h-3" />
                <span>{activeCountdown.displayText}</span>
              </span>
            )}
            <button
              type="button"
              onClick={handleJumpToExam}
              className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-750 text-zinc-300 text-[10px] font-bold transition-all cursor-pointer select-none"
            >
              View Exam Month
            </button>
          </div>
        </div>
      )}

      {/* MONTH NAVIGATION BAR */}
      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center space-x-2">
          <h4 className="text-sm sm:text-base font-black text-zinc-100 tracking-tight">
            {monthData.monthTitle}
          </h4>
          <button
            type="button"
            onClick={handleJumpToToday}
            className="px-2 py-0.5 rounded-full bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[10px] font-bold text-zinc-400 hover:text-zinc-200 transition-all cursor-pointer"
          >
            Today
          </button>
        </div>

        <div className="flex items-center space-x-1">
          <button
            type="button"
            onClick={handlePrevMonth}
            aria-label="Previous Month"
            className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 border border-zinc-800 transition-all cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleNextMonth}
            aria-label="Next Month"
            className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 border border-zinc-800 transition-all cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 7-COLUMN MONTHLY CALENDAR HEATMAP GRID */}
      <div className="space-y-1.5">
        {/* Weekday Labels Header */}
        <div className="grid grid-cols-7 gap-1 text-center">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((dayName) => (
            <span
              key={dayName}
              className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-zinc-500 py-0.5"
            >
              {dayName}
            </span>
          ))}
        </div>

        {/* Heatmap Day Cells Grid - Pure Color Representation, Zero Text in Cells */}
        <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
          {monthData.days.map((day) => {
            const isInspected = inspectedDateISO === day.dateISO;
            const categoryMeta = day.slot
              ? PRESET_SLOT_CATEGORIES[
                  day.slot.category as keyof typeof PRESET_SLOT_CATEGORIES
                ] || PRESET_SLOT_CATEGORIES.custom
              : null;
            const slotColor = day.slot?.color || categoryMeta?.defaultColor;

            // Streak & Missed indicators
            const isStreakQualified = day.isStreakQualified;
            const isMissedDay = !isStreakQualified && day.isCurrentMonth && day.isPast;

            return (
              <button
                key={day.dateISO}
                type="button"
                aria-label={`${day.dayNumber} ${day.isExamDate ? "Exam Day" : ""} ${day.slot ? day.slot.title : ""} ${isStreakQualified ? "Streak Qualified" : ""} ${isMissedDay ? "Streak Missed" : ""}`.trim()}
                onClick={() =>
                  setInspectedDateISO((prev) =>
                    prev === day.dateISO ? null : day.dateISO
                  )
                }
                className={`relative group flex flex-col items-center justify-between p-1 sm:p-1.5 h-11 sm:h-13 rounded-xl border transition-all duration-150 select-none touch-manipulation ${
                  !day.isCurrentMonth
                    ? "bg-zinc-950/20 border-zinc-900/30 text-zinc-700 opacity-25 cursor-default"
                    : day.isExamDate
                    ? "bg-rose-500/25 border-rose-400/90 text-rose-100 shadow-[0_0_15px_rgba(244,63,94,0.35)] ring-1 ring-rose-400/70"
                    : day.slot
                    ? "text-zinc-100 shadow-sm"
                    : day.isPast
                    ? "bg-zinc-900/40 border-zinc-800 text-zinc-300 hover:border-zinc-700 hover:text-zinc-100 shadow-sm"
                    : "bg-zinc-900/30 border-zinc-850/80 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                } ${
                  isInspected
                    ? "ring-2 ring-white scale-[1.05] z-10 shadow-xl"
                    : "hover:scale-[1.02] active:scale-95"
                } ${day.isToday && !day.isExamDate ? "ring-1 ring-amber-400" : ""}`}
                style={
                  day.isCurrentMonth && day.slot && !day.isExamDate
                    ? {
                        backgroundColor: `${slotColor}20`,
                        borderColor: `${slotColor}65`,
                      }
                    : undefined
                }
              >
                {/* Top: Day Number & Indicators (Flag on Exam, Dot on Today) */}
                <div className="w-full flex items-center justify-between px-0.5 z-20">
                  <span
                    className={`text-[11px] sm:text-xs font-black tabular-nums ${
                      day.isExamDate
                        ? "text-rose-200"
                        : day.isToday
                        ? "text-amber-400"
                        : day.isPast
                        ? "text-zinc-300"
                        : day.isCurrentMonth
                        ? "text-zinc-200"
                        : "text-zinc-600"
                    }`}
                  >
                    {day.dayNumber}
                  </span>

                  {day.isExamDate ? (
                    <Flag className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-rose-400 fill-rose-400 shrink-0" />
                  ) : day.isToday ? (
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
                  ) : null}
                </div>

                {/* Translucent Green Tick for Streak Qualified Days (>= 30 mins) */}
                {day.isCurrentMonth && isStreakQualified && (
                  <div
                    className="pointer-events-none absolute inset-0 flex items-center justify-center z-10"
                    aria-hidden="true"
                  >
                    <svg
                      className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-400/80 drop-shadow-[0_0_5px_rgba(52,211,153,0.55)] transition-transform group-hover:scale-110"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                )}

                {/* Soft Translucent Red Cross for Missed Streak Days in Past (< 30 mins) */}
                {day.isCurrentMonth && isMissedDay && (
                  <div
                    className="pointer-events-none absolute inset-0 flex items-center justify-center z-10"
                    aria-hidden="true"
                  >
                    <svg
                      className="w-5 h-5 sm:w-6 sm:h-6 text-rose-500/40 drop-shadow-[0_0_2px_rgba(244,63,94,0.3)] transition-transform group-hover:scale-110"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                    >
                      <line x1="5" y1="5" x2="19" y2="19" />
                      <line x1="19" y1="5" x2="5" y2="19" />
                    </svg>
                  </div>
                )}

                {/* Bottom: Pure Color Coding - Accent Bar/Dot (Zero Text Written) */}
                <div className="w-full flex items-center justify-center pb-0.5 z-20">
                  {day.isExamDate ? (
                    <span className="w-3.5 h-1 rounded-full bg-rose-400 shadow-[0_0_6px_rgba(244,63,94,0.7)]" />
                  ) : day.slot ? (
                    <span
                      className="w-3.5 h-1 rounded-full shadow-sm ring-1 ring-black/40"
                      style={{ backgroundColor: slotColor }}
                    />
                  ) : (
                    <span className="block h-1" />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* INSPECTED DAY DETAIL CARD */}
      {inspectedDayInfo && (
        <div className="rounded-xl bg-zinc-900 border border-zinc-700/80 p-3 sm:p-4 space-y-2.5 animate-in fade-in-50 duration-150 shadow-lg">
          <div className="flex items-start justify-between">
            <div className="space-y-0.5">
              <div className="flex items-center space-x-2">
                <span className="text-xs sm:text-sm font-black text-zinc-100">
                  {formatReadableDate(inspectedDayInfo.dateISO, { monthFormat: "long" })}
                </span>
                {inspectedDayInfo.isExamDay && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-rose-500/20 text-rose-300 border border-rose-500/40">
                    🎯 Target Examination Day
                  </span>
                )}
                {inspectedDayInfo.isStreakQualified ? (
                  <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                    <Check className="w-2.5 h-2.5 stroke-[2.5]" />
                    <span>Streak Qualified ({inspectedDayInfo.studyMinutes}m)</span>
                  </span>
                ) : inspectedDayInfo.dateISO < todayISO ? (
                  <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30">
                    <X className="w-2.5 h-2.5 stroke-[2.5]" />
                    <span>Streak Missed ({inspectedDayInfo.studyMinutes}m / 30m)</span>
                  </span>
                ) : inspectedDayInfo.dateISO === todayISO ? (
                  <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                    <span>Today ({inspectedDayInfo.studyMinutes}m / 30m goal)</span>
                  </span>
                ) : null}
              </div>
              <p className="text-[11px] text-zinc-400">
                Exam: <span className="text-zinc-200 font-semibold">{inspectedDayInfo.examName}</span>
                {inspectedDayInfo.daysUntilExam >= 0 ? (
                  <span> ({inspectedDayInfo.daysUntilExam === 0 ? "Today" : `${inspectedDayInfo.daysUntilExam} days away`})</span>
                ) : (
                  <span> (Completed)</span>
                )}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setInspectedDateISO(null)}
              className="p-1 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {inspectedDayInfo.slot ? (
            <div className="p-3 rounded-lg bg-zinc-950/70 border border-zinc-800 space-y-1.5">
              <div className="flex items-center space-x-2">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm"
                  style={{ backgroundColor: inspectedDayInfo.slot.color }}
                />
                <h5 className="text-xs sm:text-sm font-black text-zinc-100">
                  {inspectedDayInfo.slot.title}
                </h5>
                <span className="text-[9.5px] font-bold uppercase text-zinc-400 px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800">
                  {inspectedDayInfo.slot.category}
                </span>
              </div>
              <p className="text-[11px] text-zinc-400">
                Phase runs: <span className="text-zinc-300 font-semibold">{formatReadableDate(inspectedDayInfo.slot.start_date)}</span> through <span className="text-zinc-300 font-semibold">{formatReadableDate(inspectedDayInfo.slot.end_date)}</span>
              </p>
              {inspectedDayInfo.slot.description && (
                <p className="text-[11px] text-zinc-300 leading-relaxed pt-0.5 border-t border-zinc-855">
                  {inspectedDayInfo.slot.description}
                </p>
              )}
            </div>
          ) : !inspectedDayInfo.isExamDay ? (
            <p className="text-[11px] text-zinc-500 italic py-1">
              No preparation slot scheduled for this date (rest or flexible study window).
            </p>
          ) : null}
        </div>
      )}

      {/* DYNAMIC SLOT LEGEND */}
      {activePlan && (
        <div className="pt-2.5 border-t border-zinc-850 space-y-2">
          <div className="flex items-center justify-between text-[11px] text-zinc-400">
            <span className="font-extrabold uppercase tracking-wider text-zinc-500">
              Schedule Legend:
            </span>
            <span className="text-[10px] text-zinc-500 hidden sm:inline">
              Tap any date to inspect details
            </span>
          </div>

          <div className="flex items-center space-x-3 flex-wrap gap-y-2 text-xs">
            {/* Exam Day Marker */}
            <div className="flex items-center space-x-1.5">
              <span className="w-3.5 h-3.5 rounded-md bg-rose-500 flex items-center justify-center text-white text-[8px] font-black">
                <Flag className="w-2 h-2 fill-white" />
              </span>
              <span className="text-zinc-300 font-bold text-[11px]">Exam Day</span>
            </div>

            {/* Streak Qualified Marker */}
            <div className="flex items-center space-x-1.5">
              <span className="w-3.5 h-3.5 rounded-md bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                <Check className="w-2.5 h-2.5 stroke-[2.5]" />
              </span>
              <span className="text-zinc-300 font-bold text-[11px]">Streak (30m+)</span>
            </div>

            {/* Streak Missed Marker */}
            <div className="flex items-center space-x-1.5">
              <span className="w-3.5 h-3.5 rounded-md bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400">
                <X className="w-2.5 h-2.5 stroke-[2.5]" />
              </span>
              <span className="text-zinc-300 font-bold text-[11px]">Streak Missed</span>
            </div>

            {/* Actual Slots from Plan */}
            {activePlan.slots.map((slot) => (
              <div key={slot.id} className="flex items-center space-x-1.5">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm"
                  style={{ backgroundColor: slot.color }}
                />
                <span className="text-zinc-300 font-semibold text-[11px]">
                  {slot.title}
                </span>
                <span className="text-zinc-500 text-[10px] tabular-nums">
                  ({differenceInCalendarDays(slot.start_date, slot.end_date) + 1}d)
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
});
