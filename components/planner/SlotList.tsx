"use client";

import React, { memo } from "react";
import { PreparationSlot } from "@/lib/supabase/types";
import { PRESET_SLOT_CATEGORIES } from "@/lib/planner/types";
import {
  differenceInCalendarDays,
  formatReadableDate,
  formatIndianDate,
} from "@/lib/planner/calculations";
import {
  Plus,
  Pencil,
  Trash2,
  Calendar,
  Layers,
  Lock,
} from "lucide-react";

interface SlotListProps {
  slots: PreparationSlot[];
  isLocked: boolean;
  onAddSlot: () => void;
  onEditSlot: (slot: PreparationSlot) => void;
  onDeleteSlot: (slot: PreparationSlot) => void;
}

const SLOT_SUBSECTION_THEMES = [
  {
    border: "border-sky-500/40 hover:border-sky-400/70",
    bg: "bg-gradient-to-r from-sky-950/30 via-slate-900/35 to-black/40 hover:from-sky-950/45",
    phaseBadge: "bg-sky-500/20 text-sky-300 border-sky-500/40",
    dot: "bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.5)]",
    dotColor: "#38bdf8",
  },
  {
    border: "border-emerald-500/40 hover:border-emerald-400/70",
    bg: "bg-gradient-to-r from-emerald-950/30 via-slate-900/35 to-black/40 hover:from-emerald-950/45",
    phaseBadge: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
    dot: "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]",
    dotColor: "#34d399",
  },
  {
    border: "border-purple-500/40 hover:border-purple-400/70",
    bg: "bg-gradient-to-r from-purple-950/30 via-slate-900/35 to-black/40 hover:from-purple-950/45",
    phaseBadge: "bg-purple-500/20 text-purple-300 border-purple-500/40",
    dot: "bg-purple-400 shadow-[0_0_8px_rgba(192,132,252,0.5)]",
    dotColor: "#c084fc",
  },
  {
    border: "border-amber-500/40 hover:border-amber-400/70",
    bg: "bg-gradient-to-r from-amber-950/30 via-slate-900/35 to-black/40 hover:from-amber-950/45",
    phaseBadge: "bg-amber-500/20 text-amber-300 border-amber-500/40",
    dot: "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.5)]",
    dotColor: "#fbbf24",
  },
  {
    border: "border-rose-500/40 hover:border-rose-400/70",
    bg: "bg-gradient-to-r from-rose-950/30 via-slate-900/35 to-black/40 hover:from-rose-950/45",
    phaseBadge: "bg-rose-500/20 text-rose-300 border-rose-500/40",
    dot: "bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.5)]",
    dotColor: "#fb7185",
  },
  {
    border: "border-cyan-500/40 hover:border-cyan-400/70",
    bg: "bg-gradient-to-r from-cyan-950/30 via-slate-900/35 to-black/40 hover:from-cyan-950/45",
    phaseBadge: "bg-cyan-500/20 text-cyan-300 border-cyan-500/40",
    dot: "bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.5)]",
    dotColor: "#22d3ee",
  },
];

export const SlotList = memo(function SlotList({
  slots,
  isLocked,
  onAddSlot,
  onEditSlot,
  onDeleteSlot,
}: SlotListProps) {
  if (slots.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-800 p-5 text-center space-y-2.5 bg-black/30">
        <div className="mx-auto w-8 h-8 rounded-xl bg-zinc-900 flex items-center justify-center text-zinc-500">
          <Layers className="w-4 h-4" />
        </div>
        <div className="space-y-0.5">
          <p className="text-xs sm:text-sm font-bold text-zinc-300">
            No preparation slots defined yet
          </p>
          <p className="text-[11px] text-zinc-500 max-w-sm mx-auto">
            Divide your preparation timeline into dedicated phases such as Syllabus Coverage, Revision, Practice, and Mock Tests.
          </p>
        </div>
        {!isLocked && (
          <button
            type="button"
            onClick={onAddSlot}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white text-xs font-bold transition-all cursor-pointer select-none border border-white/15"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add First Preparation Slot</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-extrabold uppercase tracking-wider text-zinc-300">
          Preparation Slots ({slots.length})
        </h4>
        {!isLocked && (
          <button
            type="button"
            onClick={onAddSlot}
            className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/15 border border-white/15 text-white text-[11px] font-bold transition-all cursor-pointer select-none"
          >
            <Plus className="w-3 h-3" />
            <span>Add Slot</span>
          </button>
        )}
      </div>

      <div className="space-y-2">
        {slots.map((slot, idx) => {
          const categoryMeta =
            PRESET_SLOT_CATEGORIES[
              slot.category as keyof typeof PRESET_SLOT_CATEGORIES
            ] || PRESET_SLOT_CATEGORIES.custom;

          const theme = SLOT_SUBSECTION_THEMES[idx % SLOT_SUBSECTION_THEMES.length];
          const slotColor = slot.color || theme.dotColor;
          const daysCount = differenceInCalendarDays(slot.start_date, slot.end_date) + 1;

          return (
            <div
              key={slot.id}
              className={`group relative rounded-xl border transition-all duration-200 p-2.5 sm:p-3 shadow-md backdrop-blur-sm ${theme.border} ${theme.bg}`}
            >
              {/* LINE 1: Phase pill + Dot + Title + Category + Days count + Action controls */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center space-x-2 min-w-0 flex-1 flex-wrap gap-y-1">
                  <span
                    className={`px-1.5 py-0.5 rounded text-[9.5px] font-black uppercase tracking-wider border shrink-0 ${theme.phaseBadge}`}
                  >
                    Phase #{idx + 1}
                  </span>

                  <span
                    className="w-2 h-2 rounded-full shrink-0 shadow-sm"
                    style={{ backgroundColor: slotColor }}
                  />

                  <h5 className="text-xs sm:text-sm font-black text-white truncate max-w-[160px] sm:max-w-xs">
                    {slot.title}
                  </h5>

                  <span
                    className={`px-1.5 py-0.2 rounded text-[9px] font-bold uppercase tracking-wider border shrink-0 ${categoryMeta.badgeBg} ${categoryMeta.badgeText} ${categoryMeta.badgeBorder}`}
                  >
                    {categoryMeta.label}
                  </span>

                  <span className="px-1.5 py-0.2 rounded text-[9.5px] font-extrabold text-zinc-300 bg-black/40 border border-white/10 tabular-nums shrink-0">
                    {daysCount} {daysCount === 1 ? "day" : "days"}
                  </span>
                </div>

                {!isLocked && (
                  <div className="flex items-center space-x-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => onEditSlot(slot)}
                      aria-label={`Edit slot ${slot.title}`}
                      className="p-1 sm:p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteSlot(slot)}
                      aria-label={`Delete slot ${slot.title}`}
                      className="p-1 sm:p-1.5 rounded-lg text-zinc-400 hover:text-rose-400 hover:bg-rose-950/40 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
                {isLocked && (
                  <div className="p-1 text-zinc-500 shrink-0" title="Slot locked">
                    <Lock className="w-3 h-3" />
                  </div>
                )}
              </div>

              {/* LINE 2: Calendar date range in Indian format + optional description note */}
              <div className="flex items-center space-x-1.5 text-[11px] text-zinc-300 pt-1.5 flex-wrap gap-y-1">
                <div className="flex items-center space-x-1 font-semibold text-zinc-200 shrink-0">
                  <Calendar className="w-3 h-3 text-amber-400 shrink-0" />
                  <span className="tabular-nums">
                    {formatIndianDate(slot.start_date)} – {formatIndianDate(slot.end_date)}
                  </span>
                </div>

                {slot.description && (
                  <>
                    <span className="text-zinc-600 hidden sm:inline">•</span>
                    <span className="text-zinc-400 truncate max-w-sm sm:max-w-md">
                      {slot.description}
                    </span>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});
