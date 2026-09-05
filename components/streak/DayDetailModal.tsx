"use client";

import React, { memo } from "react";
import { HeatmapDay } from "@/lib/scoring/streak";
import { Modal } from "@/components/ui/Modal";
import { formatMinutesToHours, formatSessionTime } from "@/lib/time/format";
import {
  Flame,
  Clock,
  BookOpen,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/Button";

interface DayDetailModalProps {
  day: HeatmapDay | null;
  onClose: () => void;
}

export const DayDetailModal = memo(function DayDetailModal({
  day,
  onClose,
}: DayDetailModalProps) {
  if (!day) return null;

  return (
    <Modal
      isOpen={Boolean(day)}
      onClose={onClose}
      title={`${day.dayName}, ${day.monthName} ${day.dayNumber}`}
      subtitle={`Daily Study Breakdown • ${day.dateISO}`}
    >
      <div className="space-y-4 pt-1">
        {/* Qualification Status Banner */}
        <div
          className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 ${
            day.isFuture
              ? "bg-zinc-900/60 border-zinc-800 text-zinc-400"
              : day.isQualified
              ? "bg-emerald-950/40 border-emerald-500/30 text-emerald-200"
              : day.activeStudyMinutes > 0
              ? "bg-amber-950/40 border-amber-500/30 text-amber-200"
              : "bg-zinc-900/60 border-zinc-800 text-zinc-400"
          }`}
        >
          <div className="flex items-center space-x-2.5 min-w-0 flex-1">
            {day.isFuture ? (
              <Lock className="w-5 h-5 text-zinc-500 shrink-0" />
            ) : day.isQualified ? (
              <Flame className="w-5 h-5 text-amber-400 fill-amber-400 shrink-0" />
            ) : day.activeStudyMinutes > 0 ? (
              <AlertCircle className="w-5 h-5 text-amber-400 shrink-0" />
            ) : (
              <Calendar className="w-5 h-5 text-zinc-500 shrink-0" />
            )}
            <div className="min-w-0 flex-1">
              <h4 className="text-xs sm:text-sm font-black break-words leading-snug">
                {day.isFuture
                  ? "Upcoming Day"
                  : day.isQualified
                  ? "Streak Qualified Day! 🔥"
                  : day.activeStudyMinutes > 0
                  ? "Below 30m Threshold"
                  : "Rest / Unstudied Day"}
              </h4>
              <p className="text-[11px] opacity-80 break-words leading-relaxed mt-0.5">
                {day.isFuture
                  ? "This calendar day has not started yet"
                  : day.isQualified
                  ? "Met the 30-minute daily commitment requirement"
                  : day.activeStudyMinutes > 0
                  ? `${Math.max(0, 30 - day.activeStudyMinutes)}m more needed to qualify`
                  : "No study sessions logged for this day"}
              </p>
            </div>
          </div>

          <div className="text-right shrink-0">
            <span className="block text-base sm:text-lg font-black text-zinc-100 tabular-nums whitespace-nowrap">
              {day.isFuture ? "--" : formatMinutesToHours(day.activeStudyMinutes)}
            </span>
            <span className="block text-[10px] text-zinc-400 font-semibold tabular-nums whitespace-nowrap">
              {day.sessionCount} {day.sessionCount === 1 ? "Session" : "Sessions"}
            </span>
          </div>
        </div>

        {/* Sessions List */}
        {(() => {
          const completedMinutes = (day.sessions || []).reduce(
            (sum, s) => sum + (s.duration_minutes || 0),
            0
          );
          const liveInProgressMinutes = day.isToday
            ? Math.max(0, day.activeStudyMinutes - completedMinutes)
            : 0;
          const hasAnySessions =
            (day.sessions && day.sessions.length > 0) || liveInProgressMinutes > 0;

          return (
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider px-0.5">
                Recorded Sessions ({day.sessionCount})
              </h4>

              {hasAnySessions ? (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {/* Live Ongoing Session Card */}
                  {liveInProgressMinutes > 0 && (
                    <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-2.5 flex items-center justify-between text-xs shadow-sm">
                      <div className="flex items-center space-x-2.5 min-w-0 flex-1">
                        <div className="w-7 h-7 rounded-md bg-amber-500/20 text-amber-300 font-black flex items-center justify-center shrink-0">
                          <Flame className="w-3.5 h-3.5 fill-amber-400 text-amber-400 animate-pulse" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center space-x-1.5 flex-wrap">
                            <span className="font-bold text-amber-200 break-words">
                              Live Session In Progress
                            </span>
                            <span className="px-1.5 py-0.2 rounded-full bg-amber-400 text-zinc-950 text-[8px] font-black uppercase tracking-wider shrink-0">
                              Live
                            </span>
                          </div>
                          <p className="text-[11px] text-amber-300/80 mt-0.5 break-words leading-relaxed">
                            Active timer contributing to today&apos;s streak
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="font-extrabold text-amber-300 tabular-nums whitespace-nowrap">
                          {formatMinutesToHours(liveInProgressMinutes)}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Completed Sessions */}
                  {day.sessions &&
                    day.sessions.map((s, idx) => (
                      <div
                        key={s.id || idx}
                        className="rounded-lg bg-zinc-900/70 border border-zinc-800/80 p-2.5 flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center space-x-2.5 min-w-0 flex-1">
                          <div className="w-7 h-7 rounded-md bg-zinc-800 flex items-center justify-center text-zinc-300 font-bold shrink-0">
                            #{idx + 1}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center space-x-1.5">
                              <BookOpen className="w-3 h-3 text-amber-400 shrink-0" />
                              <span className="font-bold text-zinc-100 break-words line-clamp-2 leading-snug">
                                {`Session #${idx + 1}`}
                              </span>
                            </div>
                            <div className="flex items-center space-x-1 text-[11px] text-zinc-400 mt-0.5">
                              <Clock className="w-3 h-3 text-zinc-500 shrink-0" />
                              <span className="tabular-nums">
                                {formatSessionTime(s.start_time)}
                                {s.end_time ? ` – ${formatSessionTime(s.end_time)}` : " (Live)"}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <span className="font-extrabold text-amber-300 tabular-nums whitespace-nowrap">
                            {formatMinutesToHours(s.duration_minutes || 0)}
                          </span>
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <div className="p-4 rounded-lg bg-zinc-900/40 border border-zinc-800/50 text-center text-zinc-500 text-xs">
                  {day.isFuture
                    ? "No sessions recorded yet."
                    : "No study sessions recorded for this day."}
                </div>
              )}
            </div>
          );
        })()}

        {/* Action Button */}
        <div className="pt-2">
          <Button
            variant="secondary"
            className="w-full py-2 text-xs font-bold"
            onClick={onClose}
          >
            Close Breakdown
          </Button>
        </div>
      </div>
    </Modal>
  );
});
