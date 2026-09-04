"use client";

import React, { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useStudyHistory } from "@/hooks/useStudyHistory";
import { TopHeader } from "@/components/navigation/TopHeader";
import { BottomNav } from "@/components/navigation/BottomNav";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { formatMinutesToHours, formatSessionTime, formatSessionDate, getWeekStartTimestamp } from "@/lib/time/format";
import { getServerNow } from "@/lib/time/clockSync";
import { StudySession } from "@/lib/supabase/types";
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
} from "lucide-react";

export default function HistoryPage() {
  const { user, profile } = useAuth();
  const {
    currentWeekSessions: rawCurrentWeekSessions,
    pastSessions: rawPastSessions,
    totalSummary,
    loading,
    isPastLoading,
    isPastLoaded,
    fetchPastSessions,
    clearHistory,
    error,
  } = useStudyHistory(user?.id);
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [isPastWeeksExpanded, setIsPastWeeksExpanded] = useState(false);
  const archiveTopRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const handleConfirmClear = async () => {
    try {
      setActionLoading(true);
      await clearHistory();
      setIsClearModalOpen(false);
    } finally {
      setActionLoading(false);
    }
  };

  const handleTogglePastWeeks = async () => {
    if (!isPastWeeksExpanded && !isPastLoaded) {
      const ok = await fetchPastSessions();
      if (!ok) return;
    }
    setIsPastWeeksExpanded((prev) => !prev);
  };

  // Group current week sessions by date
  const currentWeekSessions: { [dateLabel: string]: StudySession[] } = {};
  for (const s of rawCurrentWeekSessions) {
    const label = formatSessionDate(s.start_time);
    if (!currentWeekSessions[label]) {
      currentWeekSessions[label] = [];
    }
    currentWeekSessions[label].push(s);
  }

  // Group loaded past week sessions by date
  const pastWeekSessions: { [dateLabel: string]: StudySession[] } = {};
  for (const s of rawPastSessions) {
    const label = formatSessionDate(s.start_time);
    if (!pastWeekSessions[label]) {
      pastWeekSessions[label] = [];
    }
    pastWeekSessions[label].push(s);
  }

  const currentWeekEntries = Object.entries(currentWeekSessions);
  const pastWeekEntries = Object.entries(pastWeekSessions);

  const pastWeeksCount = totalSummary.pastWeeksCount;
  const pastWeeksMinutes = totalSummary.pastWeeksMinutes;
  const totalStudyMinutes = totalSummary.totalMinutes;
  const totalSessionsCount = totalSummary.totalSessions;

  return (
    <div className="flex-1 flex flex-col min-h-screen pb-24 bg-[#090a0f] text-zinc-100">
      <TopHeader profile={profile} />

      {/* Fluid Screen Container */}
      <main className="flex-1 w-full max-w-2xl sm:max-w-3xl px-3.5 sm:px-6 py-4 mx-auto space-y-4 sm:space-y-6">
        {/* Main Hero Header Card with Soft Faded Accents */}
        <div className="w-full bg-zinc-900/70 border border-zinc-800/90 rounded-2xl p-3.5 sm:p-5 shadow-xl space-y-3.5 backdrop-blur-md">
          {/* Header Row: Title & Clear Action */}
          <div className="flex flex-row items-center justify-between gap-2">
            <div className="flex items-center space-x-2.5 sm:space-x-3 min-w-0 flex-1">
              <div className="p-2 sm:p-2.5 rounded-xl bg-violet-500/10 border border-violet-500/25 text-violet-300 shrink-0">
                <History className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="text-sm sm:text-base font-extrabold text-zinc-100 tracking-tight leading-snug">
                  Study Log & History
                </h1>
                <p className="text-[10px] sm:text-xs text-zinc-400 mt-0.5 leading-snug">
                  Authoritative timestamp session archives
                </p>
              </div>
            </div>

            {totalSessionsCount > 0 && (
              <button
                type="button"
                onClick={() => setIsClearModalOpen(true)}
                className="flex items-center space-x-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold text-rose-300/90 bg-rose-500/10 border border-rose-500/25 hover:bg-rose-500/20 hover:text-rose-200 transition-all touch-manipulation shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear</span>
              </button>
            )}
          </div>

          {/* Embedded Subtitle Auto-Pruning Notice */}
          <div className="text-[10px] sm:text-xs text-zinc-400/90 flex items-center space-x-1.5 pl-0.5">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-violet-400/60 shrink-0" />
            <span>
              <strong className="text-zinc-300 font-semibold">Auto-Pruning:</strong> Logs are automatically purged after 3 months (90 days).
            </span>
          </div>

          {/* Responsive Metrics Bar (Non-breaking layout for narrow 320px-360px screens) */}
          <div className="grid grid-cols-2 gap-2 sm:gap-3.5 pt-2 border-t border-zinc-800/80">
            {/* Total Time Metric */}
            <div className="flex items-center space-x-2.5 sm:space-x-3 p-2.5 sm:p-3 rounded-xl bg-zinc-950/60 border border-amber-500/15 min-w-0">
              <div className="p-1.5 sm:p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 shrink-0">
                <Flame className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[9px] sm:text-[10px] text-zinc-400 block font-semibold uppercase tracking-wider truncate">
                  Total Time
                </span>
                <span className="font-mono font-extrabold text-amber-100 text-xs sm:text-base truncate block">
                  {formatMinutesToHours(totalStudyMinutes)}
                </span>
              </div>
            </div>

            {/* Total Sessions Metric */}
            <div className="flex items-center space-x-2.5 sm:space-x-3 p-2.5 sm:p-3 rounded-xl bg-zinc-950/60 border border-violet-500/15 min-w-0">
              <div className="p-1.5 sm:p-2 rounded-lg bg-violet-500/10 border border-violet-500/20 text-violet-300 shrink-0">
                <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[9px] sm:text-[10px] text-zinc-400 block font-semibold uppercase tracking-wider truncate">
                  Sessions
                </span>
                <div className="flex items-baseline space-x-1 truncate">
                  <span className="font-mono font-extrabold text-violet-100 text-xs sm:text-base">
                    {totalSessionsCount}
                  </span>
                  <span className="text-[9px] sm:text-[10px] text-zinc-400 font-medium">
                    {totalSessionsCount === 1 ? "session" : "sessions"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="p-3.5 bg-rose-950/40 border border-rose-800/80 rounded-xl text-xs sm:text-sm font-medium text-rose-200">
            {error}
          </div>
        )}

        {/* Loading State */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((idx) => (
              <div
                key={idx}
                className="w-full h-20 bg-zinc-900/40 border border-zinc-800/60 rounded-xl animate-pulse"
              />
            ))}
          </div>
        ) : totalSessionsCount === 0 ? (
          <div className="text-center py-14 px-4 rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/20 space-y-3.5">
            <History className="w-10 h-10 text-zinc-600 mx-auto" />
            <h3 className="text-sm font-semibold text-zinc-300">
              No study session records yet
            </h3>
            <p className="text-xs text-zinc-400 max-w-sm mx-auto">
              Complete a live study session in the Room to record your study hours and completed goals!
            </p>
            <div className="pt-2">
              <Button
                variant="primary"
                size="md"
                onClick={() => router.push("/room")}
                className="space-x-2 font-extrabold text-xs sm:text-sm"
              >
                <span>Enter Live Room</span>
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* 1. Current Week Sessions (Occupies screen by default) */}
            {currentWeekEntries.length > 0 ? (
              currentWeekEntries.map(([dateLabel, dateSessions]) => {
                const dayMinutes = dateSessions.reduce((acc, s) => acc + s.duration_minutes, 0);

                return (
                  <section key={dateLabel} className="space-y-3">
                    {/* Date Section Header */}
                    <div className="flex items-center justify-between px-1 text-xs sm:text-sm gap-2">
                      <div className="flex items-center space-x-1.5 font-bold uppercase tracking-wider text-zinc-300 text-[11px] sm:text-xs truncate min-w-0">
                        <Calendar className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                        <span className="truncate">{dateLabel}</span>
                      </div>
                      <span className="font-mono text-[10px] sm:text-[11px] text-zinc-400 font-semibold whitespace-nowrap shrink-0">
                        {dateSessions.length} {dateSessions.length === 1 ? "session" : "sessions"} • {formatMinutesToHours(dayMinutes)}
                      </span>
                    </div>

                    {/* Responsive Flexible Session Cards */}
                    <div className="space-y-2.5 relative pl-4 sm:pl-6 before:absolute before:top-2 before:bottom-2 before:left-1.5 sm:before:left-2.5 before:w-px before:bg-zinc-800">
                      {dateSessions.map((session) => {
                        const completedTasks = session.completed_tasks || [];
                        const durationStr = formatMinutesToHours(session.duration_minutes);

                        return (
                          <div
                            key={session.id}
                            className="relative"
                          >
                            {/* Timeline Node Dot (Faded Slate/Violet) */}
                            <div className="absolute -left-4 sm:-left-6 top-4 -translate-x-1/2 w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-zinc-700 border-2 border-zinc-950 shadow-sm" />

                            <div className="bg-zinc-900/80 border border-zinc-800/90 hover:border-zinc-700 rounded-xl p-3 sm:p-4 shadow-sm transition-all space-y-2">
                              {/* Top Line: Duration Pill + Time Interval */}
                              <div className="flex flex-wrap items-center justify-between gap-1.5 sm:gap-2">
                                <div className="flex items-center space-x-2 sm:space-x-2.5 min-w-0">
                                  {/* Soft Faded Violet Duration Badge */}
                                  <span className="px-2 py-0.5 sm:px-2.5 sm:py-0.5 rounded-lg bg-violet-500/10 border border-violet-500/25 text-violet-200 font-mono text-xs sm:text-sm font-black shadow-sm shrink-0">
                                    {durationStr}
                                  </span>

                                  <div className="text-xs sm:text-sm text-zinc-300 font-mono flex items-center space-x-1.5 whitespace-nowrap truncate">
                                    <Clock className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                                    <span>
                                      {formatSessionTime(session.start_time)} → {formatSessionTime(session.end_time)}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              {/* Bottom Line: Completed Goal Chips */}
                              {completedTasks.length > 0 && (
                                <div className="pt-1.5 border-t border-zinc-800/70 flex flex-wrap gap-1.5 items-center">
                                  <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-zinc-400 mr-1 flex items-center space-x-1 shrink-0">
                                    <CheckCircle2 className="w-3 h-3 text-violet-400" />
                                    <span>Goals:</span>
                                  </span>
                                  {completedTasks.map((t) => (
                                    <span
                                      key={t.id}
                                      className="inline-flex items-center space-x-1 px-2 py-0.5 sm:px-2.5 sm:py-0.5 rounded-md bg-violet-500/10 border border-violet-500/20 text-violet-200 text-[11px] sm:text-xs font-medium max-w-full truncate shadow-sm"
                                    >
                                      <span className="text-violet-400 font-bold">✓</span>
                                      <span className="truncate">{t.task}</span>
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                );
              })
            ) : (pastWeeksCount > 0 || pastWeekEntries.length > 0) ? (
              <div className="p-4 rounded-2xl bg-zinc-900/40 border border-zinc-800/70 text-center space-y-1">
                <p className="text-xs font-bold text-zinc-300">
                  No study sessions recorded yet for this week
                </p>
                <p className="text-[11px] text-zinc-500">
                  Start studying in the Live Room to begin your new weekly log.
                </p>
              </div>
            ) : null}

            {/* 2. Past Weeks Collapsible Archive (Ultra-compact space-saving banner) */}
            {(pastWeeksCount > 0 || pastWeekEntries.length > 0) && (
              <div ref={archiveTopRef} className="pt-2 border-t border-zinc-800/80 space-y-3">
                <button
                  type="button"
                  onClick={handleTogglePastWeeks}
                  disabled={isPastLoading}
                  className="w-full flex items-center justify-between py-2 px-3 sm:py-2.5 sm:px-3.5 rounded-xl bg-zinc-900/50 hover:bg-zinc-900/90 border border-zinc-800/70 hover:border-zinc-700/80 transition-all text-left group shadow-sm select-none touch-manipulation min-h-[36px]"
                  aria-expanded={isPastWeeksExpanded}
                  title={isPastWeeksExpanded ? "Click to collapse older weeks" : "Click to view older weeks"}
                >
                  <div className="flex items-center space-x-2 min-w-0 flex-1">
                    {isPastLoading ? (
                      <Loader2 className="w-3.5 h-3.5 text-violet-400 animate-spin shrink-0" />
                    ) : (
                      <Archive className="w-3.5 h-3.5 text-zinc-400 group-hover:text-violet-400 transition-colors shrink-0" />
                    )}
                    <span className="text-[11px] sm:text-xs font-bold text-zinc-300 group-hover:text-zinc-100 tracking-tight shrink-0">
                      Earlier Weeks
                    </span>
                    <span className="text-zinc-600 text-[10px] select-none shrink-0">•</span>
                    <span className="font-mono text-[10px] sm:text-[11px] text-zinc-400 truncate">
                      {pastWeeksCount} {pastWeeksCount === 1 ? "sess" : "sess"} ({formatMinutesToHours(pastWeeksMinutes)})
                    </span>
                  </div>

                  <div className="flex items-center space-x-1 text-[10px] sm:text-[11px] font-semibold text-zinc-400 group-hover:text-zinc-200 shrink-0 ml-2">
                    <span className="hidden xs:inline text-zinc-500 group-hover:text-zinc-300">
                      {isPastLoading ? "Loading..." : isPastWeeksExpanded ? "Collapse" : "Expand"}
                    </span>
                    <ChevronDown
                      className={`w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-200 transition-transform duration-200 ${
                        isPastWeeksExpanded ? "rotate-180" : ""
                      }`}
                    />
                  </div>
                </button>

                {/* Collapsible Content */}
                {isPastLoading && !isPastLoaded && (
                  <div className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800/60 text-center flex items-center justify-center space-x-2 text-xs text-zinc-400">
                    <Loader2 className="w-4 h-4 text-violet-400 animate-spin" />
                    <span>Loading previous study sessions...</span>
                  </div>
                )}

                {isPastWeeksExpanded && isPastLoaded && (
                  <div className="space-y-6 pt-1 animate-in fade-in slide-in-from-top-2 duration-200">
                    {pastWeekEntries.map(([dateLabel, dateSessions]) => {
                      const dayMinutes = dateSessions.reduce((acc, s) => acc + s.duration_minutes, 0);

                      return (
                        <section key={dateLabel} className="space-y-3">
                          {/* Date Section Header */}
                          <div className="flex items-center justify-between px-1 text-xs sm:text-sm gap-2">
                            <div className="flex items-center space-x-1.5 font-bold uppercase tracking-wider text-zinc-300 text-[11px] sm:text-xs truncate min-w-0">
                              <Calendar className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                              <span className="truncate">{dateLabel}</span>
                            </div>
                            <span className="font-mono text-[10px] sm:text-[11px] text-zinc-400 font-semibold whitespace-nowrap shrink-0">
                              {dateSessions.length} {dateSessions.length === 1 ? "session" : "sessions"} • {formatMinutesToHours(dayMinutes)}
                            </span>
                          </div>

                          {/* Responsive Flexible Session Cards */}
                          <div className="space-y-2.5 relative pl-4 sm:pl-6 before:absolute before:top-2 before:bottom-2 before:left-1.5 sm:before:left-2.5 before:w-px before:bg-zinc-800">
                            {dateSessions.map((session) => {
                              const completedTasks = session.completed_tasks || [];
                              const durationStr = formatMinutesToHours(session.duration_minutes);

                              return (
                                <div
                                  key={session.id}
                                  className="relative"
                                >
                                  {/* Timeline Node Dot (Faded Slate/Violet) */}
                                  <div className="absolute -left-4 sm:-left-6 top-4 -translate-x-1/2 w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-zinc-700 border-2 border-zinc-950 shadow-sm" />

                                  <div className="bg-zinc-900/80 border border-zinc-800/90 hover:border-zinc-700 rounded-xl p-3 sm:p-4 shadow-sm transition-all space-y-2">
                                    {/* Top Line: Duration Pill + Time Interval */}
                                    <div className="flex flex-wrap items-center justify-between gap-1.5 sm:gap-2">
                                      <div className="flex items-center space-x-2 sm:space-x-2.5 min-w-0">
                                        {/* Soft Faded Violet Duration Badge */}
                                        <span className="px-2 py-0.5 sm:px-2.5 sm:py-0.5 rounded-lg bg-violet-500/10 border border-violet-500/25 text-violet-200 font-mono text-xs sm:text-sm font-black shadow-sm shrink-0">
                                          {durationStr}
                                        </span>

                                        <div className="text-xs sm:text-sm text-zinc-300 font-mono flex items-center space-x-1.5 whitespace-nowrap truncate">
                                          <Clock className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                                          <span>
                                            {formatSessionTime(session.start_time)} → {formatSessionTime(session.end_time)}
                                          </span>
                                        </div>
                                      </div>
                                    </div>

                                    {/* Bottom Line: Completed Goal Chips */}
                                    {completedTasks.length > 0 && (
                                      <div className="pt-1.5 border-t border-zinc-800/70 flex flex-wrap gap-1.5 items-center">
                                        <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-zinc-400 mr-1 flex items-center space-x-1 shrink-0">
                                          <CheckCircle2 className="w-3 h-3 text-violet-400" />
                                          <span>Goals:</span>
                                        </span>
                                        {completedTasks.map((t) => (
                                          <span
                                            key={t.id}
                                            className="inline-flex items-center space-x-1 px-2 py-0.5 sm:px-2.5 sm:py-0.5 rounded-md bg-violet-500/10 border border-violet-500/20 text-violet-200 text-[11px] sm:text-xs font-medium max-w-full truncate shadow-sm"
                                          >
                                            <span className="text-violet-400 font-bold">✓</span>
                                            <span className="truncate">{t.task}</span>
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </section>
                      );
                    })}

                    {/* Bottom Quick-Collapse Affordance */}
                    <div className="pt-2 flex justify-center">
                      <button
                        type="button"
                        onClick={() => {
                          setIsPastWeeksExpanded(false);
                          archiveTopRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                        }}
                        className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200 text-[10px] sm:text-xs font-semibold transition-all touch-manipulation shadow-sm"
                      >
                        <ChevronUp className="w-3.5 h-3.5 text-zinc-400" />
                        <span>Collapse Archive & Return to This Week</span>
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
          <div className="p-3.5 bg-rose-950/40 border border-rose-800/80 rounded-xl text-xs sm:text-sm text-rose-200 space-y-1">
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

      <BottomNav />
    </div>
  );
}
