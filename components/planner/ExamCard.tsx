"use client";

import React, { memo, useState } from "react";
import { ExamPlanWithSlots, PreparationSlot } from "@/lib/supabase/types";
import {
  calculateExamCountdown,
  calculateScheduleCoverage,
  formatReadableDate,
  formatIndianDate,
  differenceInCalendarDays,
} from "@/lib/planner/calculations";
import { PRESET_SLOT_CATEGORIES } from "@/lib/planner/types";
import { SlotList } from "./SlotList";
import {
  ChevronDown,
  ChevronUp,
  Lock,
  Unlock,
  Calendar,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  GripVertical,
  ArrowUp,
  ArrowDown,
  Hourglass,
  GraduationCap,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";

interface ExamCardProps {
  plan: ExamPlanWithSlots;
  index: number;
  totalPlans: number;
  onEditExam: (plan: ExamPlanWithSlots) => void;
  onDeleteExam: (plan: ExamPlanWithSlots) => void;
  onToggleLock: (plan: ExamPlanWithSlots) => void;
  onToggleStreaksVisibility: (plan: ExamPlanWithSlots) => void;
  onAddSlot: (plan: ExamPlanWithSlots) => void;
  onEditSlot: (plan: ExamPlanWithSlots, slot: PreparationSlot) => void;
  onDeleteSlot: (plan: ExamPlanWithSlots, slot: PreparationSlot) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  isDragging?: boolean;
}

const EXAM_THEMES = [
  {
    name: "indigo",
    cardBg: "bg-gradient-to-br from-[#101b38] via-[#161f42]/70 to-[#0b1021]",
    cardBorder: "border-indigo-500/40 hover:border-indigo-400/70",
    gradient: "bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-500",
    avatarBg: "bg-indigo-500/25 border-indigo-400/50 text-indigo-200 shadow-[0_0_15px_rgba(99,102,241,0.3)]",
    tagBg: "bg-indigo-500/20 text-indigo-200 border-indigo-500/35",
    glow: "bg-indigo-500/15",
    borderHover: "hover:border-indigo-500/60",
  },
  {
    name: "emerald",
    cardBg: "bg-gradient-to-br from-[#09261f] via-[#0d332d]/70 to-[#061513]",
    cardBorder: "border-emerald-500/40 hover:border-emerald-400/70",
    gradient: "bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500",
    avatarBg: "bg-emerald-500/25 border-emerald-400/50 text-emerald-200 shadow-[0_0_15px_rgba(16,185,129,0.3)]",
    tagBg: "bg-emerald-500/20 text-emerald-200 border-emerald-500/35",
    glow: "bg-emerald-500/15",
    borderHover: "hover:border-emerald-500/60",
  },
  {
    name: "purple",
    cardBg: "bg-gradient-to-br from-[#24103a] via-[#2d1448]/70 to-[#12081d]",
    cardBorder: "border-purple-500/40 hover:border-purple-400/70",
    gradient: "bg-gradient-to-r from-purple-500 via-fuchsia-500 to-pink-500",
    avatarBg: "bg-purple-500/25 border-purple-400/50 text-purple-200 shadow-[0_0_15px_rgba(168,85,247,0.3)]",
    tagBg: "bg-purple-500/20 text-purple-200 border-purple-500/35",
    glow: "bg-purple-500/15",
    borderHover: "hover:border-purple-500/60",
  },
  {
    name: "amber",
    cardBg: "bg-gradient-to-br from-[#2d1a08] via-[#3a2007]/70 to-[#170c03]",
    cardBorder: "border-amber-500/40 hover:border-amber-400/70",
    gradient: "bg-gradient-to-r from-amber-500 via-orange-500 to-yellow-500",
    avatarBg: "bg-amber-500/25 border-amber-400/50 text-amber-200 shadow-[0_0_15px_rgba(245,158,11,0.3)]",
    tagBg: "bg-amber-500/20 text-amber-200 border-amber-500/35",
    glow: "bg-amber-500/15",
    borderHover: "hover:border-amber-500/60",
  },
  {
    name: "rose",
    cardBg: "bg-gradient-to-br from-[#300c1c] via-[#3d0f23]/70 to-[#17050d]",
    cardBorder: "border-rose-500/40 hover:border-rose-400/70",
    gradient: "bg-gradient-to-r from-rose-500 via-pink-500 to-red-500",
    avatarBg: "bg-rose-500/25 border-rose-400/50 text-rose-200 shadow-[0_0_15px_rgba(244,63,94,0.3)]",
    tagBg: "bg-rose-500/20 text-rose-200 border-rose-500/35",
    glow: "bg-rose-500/15",
    borderHover: "hover:border-rose-500/60",
  },
];

export const ExamCard = memo(function ExamCard({
  plan,
  index,
  totalPlans,
  onEditExam,
  onDeleteExam,
  onToggleLock,
  onToggleStreaksVisibility,
  onAddSlot,
  onEditSlot,
  onDeleteSlot,
  onMoveUp,
  onMoveDown,
  onDragStart,
  onDragOver,
  onDrop,
  isDragging = false,
}: ExamCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const countdown = calculateExamCountdown(plan.exam_date);
  const coverage = calculateScheduleCoverage(plan.exam_date, plan.slots);

  const theme = EXAM_THEMES[index % EXAM_THEMES.length];

  const countdownBadgeStyle =
    countdown.status === "future"
      ? countdown.daysRemaining <= 7
        ? "bg-rose-500/20 text-rose-300 border-rose-500/30"
        : countdown.daysRemaining <= 30
        ? "bg-amber-500/20 text-amber-300 border-amber-500/30"
        : "bg-blue-500/20 text-blue-300 border-blue-500/30"
      : countdown.status === "today"
      ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30 animate-pulse"
      : "bg-zinc-800/60 text-zinc-400 border-zinc-700/60";

  return (
    <div
      draggable={!plan.is_locked && Boolean(onDragStart)}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`group relative rounded-2xl border transition-all duration-200 backdrop-blur-md overflow-hidden ${theme.cardBg} ${
        isDragging
          ? "border-amber-400/80 opacity-60 scale-[0.99] shadow-2xl"
          : isExpanded
          ? "border-zinc-500/80 shadow-2xl ring-1 ring-white/10"
          : `${theme.cardBorder} shadow-lg`
      }`}
    >
      {/* Ambient background glow graphic */}
      <div
        className={`absolute -top-14 -right-14 w-48 h-48 rounded-full blur-3xl pointer-events-none transition-opacity duration-300 opacity-60 group-hover:opacity-90 ${theme.glow}`}
      />

      {/* Top Accent Strip with Deterministic Theme Palette */}
      <div
        className={`h-1.5 w-full transition-colors ${
          plan.is_locked
            ? "bg-amber-500/70"
            : countdown.status === "today"
            ? "bg-emerald-500"
            : theme.gradient
        }`}
      />

      <div className="p-3.5 sm:p-5 space-y-3">
        {/* ROW 1: Drag handle + Themed Avatar + Exam Title (left) & Prominent Large Countdown Counter (right) */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center space-x-2.5 min-w-0 flex-1">
            {/* Drag & Move Reorder Controls (when unlocked) */}
            {!plan.is_locked && (
              <div className="flex items-center space-x-0.5 select-none shrink-0 text-zinc-400">
                <div
                  title="Drag to reorder priority"
                  className="cursor-grab active:cursor-grabbing p-1 rounded hover:bg-white/10 hover:text-white transition-colors"
                >
                  <GripVertical className="w-4 h-4" />
                </div>
                <div className="flex flex-col -space-y-0.5">
                  {onMoveUp && index > 0 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onMoveUp();
                      }}
                      title="Move Up"
                      aria-label="Move Up"
                      className="p-0.5 rounded text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                    >
                      <ArrowUp className="w-3 h-3" />
                    </button>
                  )}
                  {onMoveDown && index < totalPlans - 1 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onMoveDown();
                      }}
                      title="Move Down"
                      aria-label="Move Down"
                      className="p-0.5 rounded text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                    >
                      <ArrowDown className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Deterministic Themed Academic Avatar Badge */}
            <div
              className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 border shadow-inner ${
                plan.is_locked
                  ? "bg-amber-950/40 border-amber-500/40 text-amber-300"
                  : countdown.status === "today"
                  ? "bg-emerald-950/40 border-emerald-500/40 text-emerald-300"
                  : theme.avatarBg
              }`}
            >
              <GraduationCap className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>

            {/* Exam Name - Prominent and NEVER squeezed out */}
            <div className="min-w-0 flex-1">
              <h3 className="text-base sm:text-lg md:text-xl font-black text-white tracking-tight truncate">
                {plan.exam_name}
              </h3>
            </div>
          </div>

          {/* Prominent Large Countdown Number in Bold Shadowy Red-White on Top Right */}
          <div className="flex flex-col items-end text-right shrink-0 select-none">
            <span
              className="text-2xl sm:text-3xl md:text-4xl font-black tabular-nums tracking-tight text-white leading-none"
              style={{
                textShadow:
                  countdown.status === "today"
                    ? "0 0 16px rgba(16,185,129,0.85), 0 2px 4px rgba(0,0,0,0.9)"
                    : "0 0 18px rgba(244,63,94,0.75), 0 0 35px rgba(239,68,68,0.45), 0 2px 5px rgba(0,0,0,0.95)",
              }}
            >
              {countdown.status === "today"
                ? "TODAY"
                : countdown.status === "future"
                ? countdown.daysRemaining
                : `${Math.abs(countdown.daysRemaining)}`}
            </span>
            <span className="text-[9.5px] sm:text-[10px] font-extrabold uppercase tracking-wider text-rose-300/90 drop-shadow-sm mt-0.5">
              {countdown.status === "today"
                ? "exam day"
                : countdown.status === "past"
                ? "days ago"
                : countdown.daysRemaining === 1
                ? "day remaining"
                : "days remaining"}
            </span>
          </div>
        </div>

        {/* ROW 2: Priority tag, Exam Date, Slots count, Scheduled days, Status pills (No collision!) */}
        <div className="flex items-center space-x-2 text-[11px] sm:text-xs text-zinc-300 flex-wrap gap-y-1.5 pt-0.5">
          <span className={`text-[9.5px] sm:text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg border tabular-nums ${theme.tagBg}`}>
            Priority #{index + 1}
          </span>

          <div className="flex items-center space-x-1.5 text-zinc-200 font-semibold bg-black/30 border border-white/10 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg">
            <Calendar className="w-3 h-3 text-amber-400 shrink-0" />
            <span>Exam: {formatIndianDate(plan.exam_date)}</span>
            <span className="text-[10px] sm:text-[11px] text-zinc-400 font-normal">
              ({formatReadableDate(plan.exam_date, { monthFormat: "short" })})
            </span>
          </div>

          <span className="bg-black/25 px-2 py-0.5 sm:py-1 rounded-lg border border-white/10 font-medium">
            {plan.slots.length} {plan.slots.length === 1 ? "slot" : "slots"}
          </span>

          <span className="bg-black/25 px-2 py-0.5 sm:py-1 rounded-lg border border-white/10 font-medium">
            {coverage.scheduledDays} {coverage.scheduledDays === 1 ? "day scheduled" : "days scheduled"}
          </span>

          {plan.is_locked && (
            <span
              title="Plan is locked against accidental edits"
              className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40"
            >
              <Lock className="w-2.5 h-2.5" />
              <span>Locked</span>
            </span>
          )}

          {plan.show_in_streaks ? (
            <span
              title="Visible in Streaks calendar map"
              className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40"
            >
              <Eye className="w-2.5 h-2.5" />
              <span>In Streaks</span>
            </span>
          ) : (
            <span
              title="Hidden from Streaks calendar map"
              className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-bold bg-black/40 text-zinc-400 border border-white/10"
            >
              <EyeOff className="w-2.5 h-2.5" />
              <span>Hidden</span>
            </span>
          )}
        </div>

        {/* PLANNED SLOTS: Multi-segment Slotted Progress Bar as per respective slot colors & days */}
        <div className="space-y-1.5 pt-0.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-zinc-300 font-semibold tracking-wide">Planned Slots</span>
            <span className="text-white font-bold tabular-nums text-[11px] sm:text-xs">
              {coverage.scheduledDays} of {coverage.totalEligibleDays} days
            </span>
          </div>

          {/* Slotted multi-segment progress bar */}
          <div className="w-full h-2 sm:h-2.5 rounded-full bg-black/40 overflow-hidden border border-white/10 flex">
            {plan.slots.length > 0 ? (
              plan.slots.map((slot) => {
                const slotDays = differenceInCalendarDays(slot.start_date, slot.end_date) + 1;
                const slotPct = Math.min(100, (slotDays / Math.max(1, coverage.totalEligibleDays)) * 100);
                const categoryMeta =
                  PRESET_SLOT_CATEGORIES[slot.category as keyof typeof PRESET_SLOT_CATEGORIES] ||
                  PRESET_SLOT_CATEGORIES.custom;
                const slotColor = slot.color || categoryMeta.defaultColor;

                return (
                  <div
                    key={slot.id}
                    className="h-full first:rounded-l-full last:rounded-r-full transition-all duration-300 border-r border-black/40 last:border-r-0"
                    style={{
                      width: `${slotPct}%`,
                      backgroundColor: slotColor,
                    }}
                    title={`${slot.title}: ${slotDays}d (${formatIndianDate(slot.start_date)} – ${formatIndianDate(slot.end_date)})`}
                  />
                );
              })
            ) : (
              <div className="w-0 h-full" />
            )}
          </div>

          {/* Footer of card: Unassigned note (left) & Expand button moved to bottom right over margin */}
          <div className="flex items-center justify-between gap-2 pt-0.5">
            <div className="min-w-0 flex-1">
              {coverage.hasGaps ? (
                <p className="text-[10px] sm:text-[11px] text-zinc-400 flex items-center space-x-1 truncate">
                  <AlertCircle className="w-3 h-3 text-zinc-400 shrink-0" />
                  <span>{coverage.gapDaysCount} unassigned preparation days remaining before exam</span>
                </p>
              ) : coverage.scheduledDays > 0 ? (
                <p className="text-[10px] sm:text-[11px] text-emerald-400 flex items-center space-x-1 truncate">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                  <span>All preparation days slotted before exam</span>
                </p>
              ) : (
                <p className="text-[10px] sm:text-[11px] text-zinc-500 italic truncate">
                  No preparation slots defined yet
                </p>
              )}
            </div>

            {/* Expand/Collapse Arrow Button on Bottom Right */}
            <button
              type="button"
              onClick={() => setIsExpanded((prev) => !prev)}
              aria-label={isExpanded ? "Collapse plan" : "Expand plan"}
              aria-expanded={isExpanded}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-black/40 hover:bg-black/60 text-zinc-200 hover:text-white border border-white/10 transition-all cursor-pointer select-none shrink-0 shadow-sm text-xs font-bold"
            >
              <span>{isExpanded ? "Less" : "Details"}</span>
              {isExpanded ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>

        {/* EXPANDED WORKSPACE SECTIONS */}
        {isExpanded && (
          <div className="pt-3.5 border-t border-white/10 space-y-3.5 animate-in fade-in-50 duration-200">
            {/* SECTION 1: EXAM DETAILS */}
            <div className="rounded-xl bg-black/40 border border-white/10 p-3.5 sm:p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-zinc-300">
                  Exam Details
                </h4>
                {!plan.is_locked && (
                  <button
                    type="button"
                    onClick={() => onEditExam(plan)}
                    className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-all cursor-pointer border border-white/10"
                  >
                    <Pencil className="w-3 h-3" />
                    <span>Edit Exam</span>
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                <div>
                  <span className="block text-[10px] uppercase font-bold text-zinc-400">
                    Exam Target
                  </span>
                  <span className="font-bold text-white text-xs sm:text-sm">
                    {plan.exam_name}
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] uppercase font-bold text-zinc-400">
                    Exam Date (DD/MM/YYYY)
                  </span>
                  <span className="font-bold text-white text-xs sm:text-sm">
                    {formatIndianDate(plan.exam_date)}{" "}
                    <span className="text-[11px] sm:text-xs text-zinc-300 font-normal">
                      ({formatReadableDate(plan.exam_date, { monthFormat: "long" })})
                    </span>
                  </span>
                </div>
                {plan.description && (
                  <div className="sm:col-span-2 pt-1 border-t border-white/10">
                    <span className="block text-[10px] uppercase font-bold text-zinc-400">
                      Notes / Description
                    </span>
                    <p className="text-zinc-200 leading-relaxed mt-0.5 text-xs">
                      {plan.description}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* SECTION 2: PLAN SETTINGS & PROTECTION (Integrated IMMEDIATELY after Exam Details) */}
            <div className="rounded-xl bg-black/40 border border-white/10 p-3 sm:p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-zinc-300">
                  Plan Controls & Protection
                </h4>
                <span className="text-[10px] text-zinc-400">Quick Actions</span>
              </div>

              {/* Compact 3-element control bar: Toggle, Lock, and Delete in same row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {/* 1. Streaks Calendar Visibility */}
                <div className="rounded-xl bg-black/35 border border-white/10 p-2.5 flex items-center justify-between gap-2 shadow-sm">
                  <div className="min-w-0">
                    <div className="flex items-center space-x-1.5">
                      {plan.show_in_streaks ? (
                        <Eye className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                      ) : (
                        <EyeOff className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                      )}
                      <span className="text-xs font-bold text-zinc-200 truncate">
                        Show Calendar in Streaks
                      </span>
                    </div>
                    <span className="text-[10px] text-zinc-400 block truncate mt-0.5">
                      {plan.show_in_streaks ? "Active on Streaks" : "Hidden from Streaks"}
                    </span>
                  </div>

                  <button
                    type="button"
                    disabled={plan.is_locked}
                    onClick={() => onToggleStreaksVisibility(plan)}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none disabled:opacity-40 disabled:cursor-not-allowed ${
                      plan.show_in_streaks ? "bg-amber-500" : "bg-zinc-700"
                    }`}
                    role="switch"
                    aria-checked={plan.show_in_streaks}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        plan.show_in_streaks ? "translate-x-4" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>

                {/* 2. Plan Locking / Protection */}
                <div className="rounded-xl bg-black/35 border border-white/10 p-2.5 flex items-center justify-between gap-2 shadow-sm">
                  <div className="min-w-0">
                    <div className="flex items-center space-x-1.5">
                      {plan.is_locked ? (
                        <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      ) : (
                        <Unlock className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                      )}
                      <span className="text-xs font-bold text-zinc-200 truncate">
                        {plan.is_locked ? "Plan Locked" : "Plan Editable"}
                      </span>
                    </div>
                    <span className="text-[10px] text-zinc-400 block truncate mt-0.5">
                      {plan.is_locked ? "Edits protected" : "Changes allowed"}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => onToggleLock(plan)}
                    className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer shrink-0 select-none ${
                      plan.is_locked
                        ? "bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40"
                        : "bg-white/10 hover:bg-white/15 text-zinc-200 border border-white/15"
                    }`}
                  >
                    {plan.is_locked ? (
                      <>
                        <Unlock className="w-3 h-3" />
                        <span>Unlock Plan</span>
                      </>
                    ) : (
                      <>
                        <Lock className="w-3 h-3" />
                        <span>Lock Plan</span>
                      </>
                    )}
                  </button>
                </div>

                {/* 3. Delete Plan */}
                <div className="rounded-xl bg-black/35 border border-white/10 p-2.5 flex items-center justify-between gap-2 shadow-sm">
                  <div className="min-w-0">
                    <div className="flex items-center space-x-1.5">
                      <Trash2 className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                      <span className="text-xs font-bold text-rose-300 truncate">
                        Delete Plan
                      </span>
                    </div>
                    <span className="text-[10px] text-zinc-400 block truncate mt-0.5">
                      {plan.is_locked ? "Unlock to delete" : "Permanent removal"}
                    </span>
                  </div>

                  <button
                    type="button"
                    disabled={plan.is_locked}
                    onClick={() => onDeleteExam(plan)}
                    className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg text-rose-400 hover:bg-rose-950/50 hover:text-rose-300 border border-rose-900/60 text-xs font-bold transition-all cursor-pointer select-none shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Delete Plan</span>
                  </button>
                </div>
              </div>
            </div>

            {/* SECTION 3: PREPARATION SLOTS (Subsections nested under the exam) */}
            <SlotList
              slots={plan.slots}
              isLocked={plan.is_locked}
              onAddSlot={() => onAddSlot(plan)}
              onEditSlot={(slot) => onEditSlot(plan, slot)}
              onDeleteSlot={(slot) => onDeleteSlot(plan, slot)}
            />
          </div>
        )}
      </div>
    </div>
  );
});
