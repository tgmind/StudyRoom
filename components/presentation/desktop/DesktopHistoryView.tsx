"use client";

import React, { memo } from "react";
import { DesktopAppLayout } from "./DesktopAppLayout";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { formatMinutesToHours, formatSessionTime } from "@/lib/time/format";
import { StudySession, UserProfile, DailyGoal } from "@/lib/supabase/types";
import {
  History,
  Trash2,
  Clock,
  Calendar,
  Flame,
  ArrowRight,
  Sparkles,
  CheckCircle2,
  Archive,
  ChevronDown,
  ChevronUp,
  Loader2,
  Coffee,
} from "lucide-react";
import { LapsedGoalHistoryCard } from "@/components/goals/LapsedGoalHistoryCard";
import { LapsedGoalWindow } from "@/hooks/useStudyHistory";

export interface DesktopHistoryViewProps {
  profile: UserProfile | null;
  loading: boolean;
  error: string | null;
  totalSessionsCount: number;
  totalStudyMinutes: number;
  pastWeeksCount: number;
  pastWeeksMinutes: number;
  currentWeekDateLabels: string[];
  currentWeekSessions: { [dateLabel: string]: StudySession[] };
  currentWeekLapsedGoals: { [dateLabel: string]: LapsedGoalWindow[] };
  pastWeekDateLabels: string[];
  pastWeekSessions: { [dateLabel: string]: StudySession[] };
  pastWeeksLapsedGoals: { [dateLabel: string]: LapsedGoalWindow[] };
  isPastWeeksExpanded: boolean;
  setIsPastWeeksExpanded: (expanded: boolean) => void;
  isPastLoading: boolean;
  isClearModalOpen: boolean;
  setIsClearModalOpen: (open: boolean) => void;
  actionLoading: boolean;
  handleConfirmClear: () => Promise<void>;
  handleTogglePastWeeks: () => Promise<void>;
  archiveTopRef: React.RefObject<HTMLDivElement | null>;
  onNavigateRoom: () => void;
}

export const DesktopHistoryView = memo(function DesktopHistoryView({
  profile,
  loading,
  error,
  totalSessionsCount,
  totalStudyMinutes,
  pastWeeksCount,
  pastWeeksMinutes,
  currentWeekDateLabels,
  currentWeekSessions,
  currentWeekLapsedGoals,
  pastWeekDateLabels,
  pastWeekSessions,
  pastWeeksLapsedGoals,
  isPastWeeksExpanded,
  setIsPastWeeksExpanded,
  isPastLoading,
  isClearModalOpen,
  setIsClearModalOpen,
  actionLoading,
  handleConfirmClear,
  handleTogglePastWeeks,
  archiveTopRef,
  onNavigateRoom,
}: DesktopHistoryViewProps) {
  return (
    <DesktopAppLayout profile={profile}>
      <main className="w-full px-6 lg:px-8 xl:px-12 py-6 space-y-6">
        {/* Desktop Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800/80 pb-5">
          <div className="flex items-start space-x-3.5 min-w-0 flex-1">
            <div className="p-2.5 rounded-xl bg-violet-500/10 border border-violet-500/25 text-violet-300 shrink-0 shadow-inner mt-0.5">
              <History className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight leading-tight">
                Study Session Archive & History
              </h1>
              <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed max-w-3xl">
                Authoritative timestamp session archives • Automatically pruned after 90 days
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3 shrink-0 self-start md:self-auto">
            {totalSessionsCount > 0 && (
              <button
                type="button"
                onClick={() => setIsClearModalOpen(true)}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-rose-300 bg-rose-500/10 border border-rose-500/25 hover:bg-rose-500/20 hover:text-rose-200 transition-all shadow-sm"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear History</span>
              </button>
            )}
          </div>
        </div>

        {/* 1. TOP 50/50 BALANCED METRIC DECK */}
        <div className="grid grid-cols-2 gap-6 items-stretch">
          {/* Left Wing: Total Hours Metric */}
          <div className="flex items-center space-x-4 p-5 rounded-2xl bg-zinc-900/70 border border-amber-500/20 shadow-xl backdrop-blur-md">
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-300 shrink-0">
              <Flame className="w-6 h-6" />
            </div>
            <div>
              <span className="text-xs text-zinc-400 block font-bold uppercase tracking-wider">
                Total Study Time
              </span>
              <span className="font-mono font-black text-amber-100 text-2xl block tabular-nums">
                {formatMinutesToHours(totalStudyMinutes)}
              </span>
            </div>
          </div>

          {/* Right Wing: Total Completed Sessions Metric */}
          <div className="flex items-center space-x-4 p-5 rounded-2xl bg-zinc-900/70 border border-violet-500/20 shadow-xl backdrop-blur-md">
            <div className="p-3 rounded-xl bg-violet-500/10 border border-violet-500/25 text-violet-300 shrink-0">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <span className="text-xs text-zinc-400 block font-bold uppercase tracking-wider">
                Verified Sessions
              </span>
              <div className="flex items-baseline space-x-2">
                <span className="font-mono font-black text-violet-100 text-2xl tabular-nums">
                  {totalSessionsCount}
                </span>
                <span className="text-xs text-zinc-400 font-medium">
                  {totalSessionsCount === 1 ? "session recorded" : "sessions recorded"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="p-4 bg-rose-950/40 border border-rose-800/80 rounded-2xl text-xs font-medium text-rose-200">
            {error}
          </div>
        )}

        {/* Loading State */}
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((idx) => (
              <div
                key={idx}
                className="w-full h-24 bg-zinc-900/40 border border-zinc-800/60 rounded-2xl animate-pulse"
              />
            ))}
          </div>
        ) : totalSessionsCount === 0 ? (
          <div className="text-center py-16 px-6 rounded-3xl border border-dashed border-zinc-800 bg-zinc-900/20 space-y-4">
            <History className="w-12 h-12 text-zinc-600 mx-auto" />
            <h3 className="text-sm font-bold text-zinc-200">
              No study session records yet
            </h3>
            <p className="text-xs text-zinc-400 max-w-sm mx-auto">
              Complete a live study session in the Room to record your study hours and completed goals!
            </p>
            <div className="pt-2">
              <Button
                variant="primary"
                size="md"
                onClick={onNavigateRoom}
                className="space-x-2 font-extrabold text-xs"
              >
                <span>Enter Live Room</span>
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            {/* 1. Current Week Sessions */}
            <div className="space-y-5">
              <div className="flex items-center space-x-2 text-xs font-black uppercase tracking-wider text-zinc-400">
                <span className="w-2.5 h-2.5 rounded-full bg-violet-400" />
                <span>This Week</span>
              </div>

              {currentWeekDateLabels.length > 0 ? (
                currentWeekDateLabels.map((dateLabel) => {
                  const dateSessions = currentWeekSessions[dateLabel] || [];
                  const dayLapsedGoals = currentWeekLapsedGoals[dateLabel] || [];
                  const dayMinutes = dateSessions.reduce((acc, s) => acc + s.duration_minutes, 0);

                  return (
                    <section key={dateLabel} className="space-y-3">
                      <div className="flex items-center justify-between px-1 text-xs gap-2 border-b border-zinc-800/80 pb-2">
                        <div className="flex items-center space-x-2 font-bold uppercase tracking-wider text-zinc-300">
                          <Calendar className="w-4 h-4 text-violet-400 shrink-0" />
                          <span>{dateLabel}</span>
                        </div>
                        <span className="font-mono text-xs text-zinc-400 font-semibold tabular-nums">
                          {dateSessions.length} {dateSessions.length === 1 ? "session" : "sessions"} • {formatMinutesToHours(dayMinutes)}
                        </span>
                      </div>

                      <div className="space-y-3 pl-6 relative before:absolute before:top-2 before:bottom-2 before:left-2 before:w-px before:bg-zinc-800">
                        {dateSessions.map((session) => {
                          const completedTasks = session.completed_tasks || [];
                          const durationMinutes = session.duration_minutes || 0;
                          const durationStr = formatMinutesToHours(durationMinutes);
                          const rawBreakDiff = Math.floor((new Date(session.end_time).getTime() - new Date(session.start_time).getTime()) / 60000) - durationMinutes;
                          const breakMinutes = typeof session.break_minutes === "number"
                            ? session.break_minutes
                            : (rawBreakDiff >= 2 ? rawBreakDiff : 0);
                          const startTimeStr = formatSessionTime(session.start_time);
                          const endTimeStr = formatSessionTime(session.end_time);
                          const isZeroDuration = durationMinutes === 0;

                          return (
                            <div key={session.id} className="relative">
                              <div className="absolute -left-6 top-4 -translate-x-1/2 w-3 h-3 rounded-full bg-zinc-700 border-2 border-zinc-950 shadow-sm" />

                              <div className="bg-zinc-900/80 border border-zinc-800/90 hover:border-zinc-700 rounded-2xl p-4 shadow-sm transition-all space-y-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex items-center space-x-3 min-w-0 flex-wrap gap-y-1">
                                    <span className="px-3 py-1 rounded-xl bg-violet-500/10 border border-violet-500/25 text-violet-200 font-mono text-xs font-black shadow-sm shrink-0 tabular-nums">
                                      {durationStr}
                                    </span>

                                    {breakMinutes > 0 && (
                                      <span className="px-2 py-0.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 font-mono text-xs font-semibold shrink-0 flex items-center space-x-1">
                                        <Coffee className="w-3 h-3 text-amber-400 shrink-0" />
                                        <span>+{formatMinutesToHours(breakMinutes)} break</span>
                                      </span>
                                    )}

                                    <div className="text-xs text-zinc-300 font-mono flex items-center space-x-1.5 whitespace-nowrap tabular-nums">
                                      <Clock className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                                      <span>
                                        {isZeroDuration || startTimeStr === endTimeStr
                                          ? startTimeStr
                                          : `${startTimeStr} → ${endTimeStr}`}
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                {completedTasks.length > 0 && (
                                  <div className="pt-2 border-t border-zinc-800/70 flex flex-wrap gap-2 items-center">
                                    <span className="text-xs font-bold uppercase tracking-wider text-zinc-400 mr-1 flex items-center space-x-1 shrink-0">
                                      <CheckCircle2 className="w-3.5 h-3.5 text-violet-400" />
                                      <span>Goals:</span>
                                    </span>
                                    {completedTasks.map((t) => (
                                      <span
                                        key={t.id}
                                        className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-200 text-xs font-medium max-w-full shadow-sm"
                                      >
                                        <span className="text-violet-400 font-bold shrink-0">✓</span>
                                        <span className="break-words">{t.task}</span>
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}

                        {dayLapsedGoals.map((lapsedGoal) => (
                          <LapsedGoalHistoryCard key={lapsedGoal.id} lapsedGoal={lapsedGoal} />
                        ))}
                      </div>
                    </section>
                  );
                })
              ) : (
                <div className="p-5 rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/40 text-center text-xs text-zinc-400">
                  No sessions completed yet for the current week.
                </div>
              )}
            </div>

            {/* 2. Past Weeks Accordion Section */}
            {pastWeeksCount > 0 && (
              <div ref={archiveTopRef} className="pt-4 border-t border-zinc-800/80 space-y-4">
                <button
                  type="button"
                  onClick={handleTogglePastWeeks}
                  disabled={isPastLoading}
                  className="w-full flex items-center justify-between p-4 rounded-2xl bg-zinc-900/60 hover:bg-zinc-900/90 border border-zinc-800/80 hover:border-zinc-700/80 transition-all text-left group"
                >
                  <div className="flex items-center space-x-3 min-w-0">
                    <div className="p-2 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-400 group-hover:text-zinc-200 shrink-0">
                      <Archive className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-sm font-bold text-zinc-200 group-hover:text-white block truncate">
                        Past Weeks Archive ({pastWeeksCount} {pastWeeksCount === 1 ? "week" : "weeks"})
                      </span>
                      <span className="text-xs text-zinc-500 font-mono block">
                        {formatMinutesToHours(pastWeeksMinutes)} historical study
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 text-xs text-zinc-400 group-hover:text-zinc-200 font-semibold shrink-0">
                    {isPastLoading ? (
                      <Loader2 className="w-4 h-4 text-violet-400 animate-spin" />
                    ) : isPastWeeksExpanded ? (
                      <>
                        <span>Collapse Archive</span>
                        <ChevronUp className="w-4 h-4" />
                      </>
                    ) : (
                      <>
                        <span>Expand Archive</span>
                        <ChevronDown className="w-4 h-4" />
                      </>
                    )}
                  </div>
                </button>

                {isPastWeeksExpanded && (
                  <div className="space-y-4 pt-2">
                    {pastWeekDateLabels.length > 0 ? (
                      pastWeekDateLabels.map((dateLabel) => {
                        const dateSessions = pastWeekSessions[dateLabel] || [];
                        const dayLapsedGoals = pastWeeksLapsedGoals[dateLabel] || [];
                        const dayMinutes = dateSessions.reduce((acc, s) => acc + s.duration_minutes, 0);

                        return (
                          <section key={dateLabel} className="space-y-3 opacity-90 hover:opacity-100 transition-opacity">
                            <div className="flex items-center justify-between px-1 text-xs gap-2 border-b border-zinc-800/60 pb-2">
                              <div className="flex items-center space-x-2 font-bold uppercase tracking-wider text-zinc-400">
                                <Calendar className="w-4 h-4 text-zinc-500 shrink-0" />
                                <span>{dateLabel}</span>
                              </div>
                              <span className="font-mono text-xs text-zinc-500 font-semibold tabular-nums">
                                {dateSessions.length} {dateSessions.length === 1 ? "session" : "sessions"} • {formatMinutesToHours(dayMinutes)}
                              </span>
                            </div>

                            <div className="space-y-3 pl-6 relative before:absolute before:top-2 before:bottom-2 before:left-2 before:w-px before:bg-zinc-800">
                              {dateSessions.map((session) => {
                                const completedTasks = session.completed_tasks || [];
                                const durationMinutes = session.duration_minutes || 0;
                                const durationStr = formatMinutesToHours(durationMinutes);
                                const rawBreakDiff = Math.floor((new Date(session.end_time).getTime() - new Date(session.start_time).getTime()) / 60000) - durationMinutes;
                                const breakMinutes = typeof session.break_minutes === "number"
                                  ? session.break_minutes
                                  : (rawBreakDiff >= 2 ? rawBreakDiff : 0);
                                const startTimeStr = formatSessionTime(session.start_time);
                                const endTimeStr = formatSessionTime(session.end_time);
                                const isZeroDuration = durationMinutes === 0;

                                return (
                                  <div key={session.id} className="relative">
                                    <div className="absolute -left-6 top-4 -translate-x-1/2 w-3 h-3 rounded-full bg-zinc-700 border-2 border-zinc-950 shadow-sm" />

                                    <div className="bg-zinc-900/80 border border-zinc-800/90 hover:border-zinc-700 rounded-2xl p-4 shadow-sm transition-all space-y-3">
                                      <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div className="flex items-center space-x-3 min-w-0 flex-wrap gap-y-1">
                                          <span className="px-3 py-1 rounded-xl bg-violet-500/10 border border-violet-500/25 text-violet-200 font-mono text-xs font-black shadow-sm shrink-0 tabular-nums">
                                            {durationStr}
                                          </span>

                                          {breakMinutes > 0 && (
                                            <span className="px-2 py-0.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 font-mono text-xs font-semibold shrink-0 flex items-center space-x-1">
                                              <Coffee className="w-3 h-3 text-amber-400 shrink-0" />
                                              <span>+{formatMinutesToHours(breakMinutes)} break</span>
                                            </span>
                                          )}

                                          <div className="text-xs text-zinc-300 font-mono flex items-center space-x-1.5 whitespace-nowrap tabular-nums">
                                            <Clock className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                                            <span>
                                              {isZeroDuration || startTimeStr === endTimeStr
                                                ? startTimeStr
                                                : `${startTimeStr} → ${endTimeStr}`}
                                            </span>
                                          </div>
                                        </div>
                                      </div>

                                      {completedTasks.length > 0 && (
                                        <div className="pt-2 border-t border-zinc-800/70 flex flex-wrap gap-2 items-center">
                                          <span className="text-xs font-bold uppercase tracking-wider text-zinc-400 mr-1 flex items-center space-x-1 shrink-0">
                                            <CheckCircle2 className="w-3.5 h-3.5 text-violet-400" />
                                            <span>Goals:</span>
                                          </span>
                                          {completedTasks.map((t) => (
                                            <span
                                              key={t.id}
                                              className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-200 text-xs font-medium max-w-full shadow-sm"
                                            >
                                              <span className="text-violet-400 font-bold shrink-0">✓</span>
                                              <span className="break-words">{t.task}</span>
                                            </span>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}

                              {dayLapsedGoals.map((lapsedGoal) => (
                                <LapsedGoalHistoryCard key={lapsedGoal.id} lapsedGoal={lapsedGoal} />
                              ))}
                            </div>
                          </section>
                        );
                      })
                    ) : (
                      <div className="p-4 rounded-xl border border-dashed border-zinc-800 bg-zinc-950/40 text-center text-xs text-zinc-400">
                        No previous weeks logs recorded.
                      </div>
                    )}

                    <div className="pt-4 flex justify-center">
                      <button
                        type="button"
                        onClick={() => {
                          setIsPastWeeksExpanded(false);
                          archiveTopRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                        }}
                        className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200 text-xs font-semibold transition-all shadow-sm"
                      >
                        <ChevronUp className="w-4 h-4 text-zinc-400" />
                        <span>Collapse Archive</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Clear History Confirmation Modal */}
      <Modal
        isOpen={isClearModalOpen}
        onClose={() => setIsClearModalOpen(false)}
        title="Clear Study History"
        subtitle="Are you sure you want to delete your study session logs? This action cannot be undone."
      >
        <div className="space-y-4 pt-1">
          <div className="p-4 bg-rose-950/40 border border-rose-800/80 rounded-2xl text-xs sm:text-sm text-rose-200 space-y-1">
            <p className="font-bold">⚠️ Irreversible Action</p>
            <p>
              Clearing history will permanently remove all your past session logs and task completion records from your device and database.
            </p>
          </div>

          <div className="flex items-center justify-end space-x-3 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsClearModalOpen(false)}
              disabled={actionLoading}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={handleConfirmClear}
              isLoading={actionLoading}
              className="font-extrabold"
            >
              Yes, Clear All History
            </Button>
          </div>
        </div>
      </Modal>
    </DesktopAppLayout>
  );
});
