"use client";

import React, { memo, useMemo, useCallback } from "react";
import { DesktopAppLayout } from "./DesktopAppLayout";
import { SessionController } from "@/components/session/SessionController";
import { MemberList } from "@/components/room/MemberList";
import { RoomMissionCompanion } from "@/components/room/RoomMissionCompanion";
import { UpcomingExamSlotCard } from "@/components/room/UpcomingExamSlotCard";
import { SessionGoalUpdateModal } from "@/components/session/SessionGoalUpdateModal";
import { CreateGoalModal } from "@/components/goals/CreateGoalModal";
import { TenMinuteWarningBanner } from "@/components/session/TenMinuteWarningBanner";
import { GlobalAnalyticsAlert } from "@/components/analytics/GlobalAnalyticsAlert";
import { UserProfile, DailyGoal } from "@/lib/supabase/types";
import { Users, WifiOff } from "lucide-react";
import { useUserStreak } from "@/hooks/useUserStreak";

export interface DesktopRoomViewProps {
  members: UserProfile[];
  reconciledMembers: UserProfile[];
  isRealtimeConnected: boolean;
  connectionState?: "connecting" | "connected" | "reconnecting" | "offline";
  effectiveProfile: UserProfile | null;
  expectedPeakHours: string | null;
  status: UserProfile["current_status"];
  focus: string | null;
  elapsedStudySeconds: number;
  breakStartedAt: string | null;
  syncStatus: any;
  handleStartSession: () => Promise<void>;
  handlePauseSession: () => Promise<void>;
  handleResumeSession: () => Promise<void>;
  handleFinishSession: (completedTaskIds?: string[]) => Promise<void>;
  handleCreateGoal: (tasks: string[]) => Promise<void>;
  activeGoal: DailyGoal | null;
  countdown: any;
  actionLoading: boolean;
  mutationPending: any;
  authLoading: boolean;
  forceSynchronizeSession: () => Promise<void>;
  roomLoading: boolean;
  roomReconciling: boolean;
  hasInitialSnapshot: boolean;
  roomError: string | null;
  activeWinEvent: any;
  activeWinEvents: any;
  broadcastRivalryWin: any;
  dismissWinEvent: (id?: string) => void;
  isOnline: boolean;
  tenMinuteWarning: any;
  dismissTenMinuteWarning: () => void;
  user: any;
  nearestExamName?: string | null;
  nearestExamDaysRemaining?: number | null;
  // Modals
  isGoalUpdateModalOpen: boolean;
  isSessionLimitNoticeOpen: boolean;
  isBreakExpiredNoticeOpen: boolean;
  closeGoalUpdateModal: () => Promise<void> | void;
  closeBreakExpiredNotice: () => Promise<void> | void;
  closeSessionLimitNotice: () => void;
  pendingGoalSessionId: string | null;
  pendingGoalSeconds: number;
  savedStudySecondsOnLimit: number;
  savedStudySecondsOnBreakExpiry: number;
  pendingGoalReason: string | null;
  goalActionLoading: boolean;
  completeSessionGoals: (sessionId: string, taskIds: string[]) => Promise<void>;
  completeGoalTasks: (taskIds: string[]) => Promise<void>;
  broadcastStatusChange: (payload: any) => void;
  refreshGoals: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  refreshMembers: () => Promise<void>;
  isGoalSetupModalOpen: boolean;
  setIsGoalSetupModalOpen: (open: boolean) => void;
  handleGoalCreatedFromModal: (tasks: string[]) => Promise<void>;
}

export const DesktopRoomView = memo(function DesktopRoomView({
  members,
  reconciledMembers,
  isRealtimeConnected,
  connectionState,
  effectiveProfile,
  expectedPeakHours,
  status,
  focus,
  elapsedStudySeconds,
  breakStartedAt,
  syncStatus,
  handleStartSession,
  handlePauseSession,
  handleResumeSession,
  handleFinishSession,
  handleCreateGoal,
  activeGoal,
  countdown,
  actionLoading,
  mutationPending,
  authLoading,
  forceSynchronizeSession,
  roomLoading,
  roomReconciling,
  hasInitialSnapshot,
  roomError,
  activeWinEvent,
  activeWinEvents,
  broadcastRivalryWin,
  dismissWinEvent,
  isOnline,
  tenMinuteWarning,
  dismissTenMinuteWarning,
  user,
  nearestExamName,
  nearestExamDaysRemaining,
  isGoalUpdateModalOpen,
  isSessionLimitNoticeOpen,
  isBreakExpiredNoticeOpen,
  closeGoalUpdateModal,
  closeBreakExpiredNotice,
  closeSessionLimitNotice,
  pendingGoalSessionId,
  pendingGoalSeconds,
  savedStudySecondsOnLimit,
  savedStudySecondsOnBreakExpiry,
  pendingGoalReason,
  goalActionLoading,
  completeSessionGoals,
  completeGoalTasks,
  broadcastStatusChange,
  refreshGoals,
  refreshProfile,
  refreshMembers,
  isGoalSetupModalOpen,
  setIsGoalSetupModalOpen,
  handleGoalCreatedFromModal,
}: DesktopRoomViewProps) {
  const isStudyingOrBreak = status === "studying" || status === "break";

  // Active study minutes in current session for live heatmap and streak qualifying progression
  const elapsedMinutes = Math.floor(elapsedStudySeconds / 60);
  const liveActiveMinutes = useMemo(() => {
    if (status === "studying") {
      return elapsedMinutes;
    }
    return 0;
  }, [status, elapsedMinutes]);

  // Canonical streak and weekly study duration engine (fetched from study_sessions matching /streak)
  const {
    stats: streakStats,
    loading: streakLoading,
    refreshStreak,
  } = useUserStreak(user?.id, liveActiveMinutes);

  const effectiveStreakDays = useMemo(() => {
    if (streakStats && !streakLoading) {
      return streakStats.currentStreak;
    }
    return streakStats?.currentStreak ?? (effectiveProfile?.streak_days || 0);
  }, [streakStats, streakLoading, effectiveProfile?.streak_days]);

  const effectiveWeeklyStudySeconds = useMemo(() => {
    if (streakStats) {
      const liveSecondsRemainder = status === "studying" ? (elapsedStudySeconds % 60) : 0;
      return (streakStats.weeklyTotalMinutes * 60) + liveSecondsRemainder;
    }
    return effectiveProfile?.weekly_study_seconds || 0;
  }, [streakStats, status, elapsedStudySeconds, effectiveProfile?.weekly_study_seconds]);

  const handleFinishSessionWithStreak = useCallback(
    async (completedTaskIds?: string[]) => {
      await handleFinishSession(completedTaskIds);
      await refreshStreak();
    },
    [handleFinishSession, refreshStreak]
  );

  return (
    <DesktopAppLayout
      profile={effectiveProfile}
      memberCount={members.length}
      expectedPeakHours={expectedPeakHours}
      isRealtimeConnected={isRealtimeConnected}
      connectionState={connectionState}
      isSessionActive={isStudyingOrBreak}
    >
      <main className="w-full px-6 lg:px-8 xl:px-12 py-6 space-y-6">
        {/* Offline Notification */}
        {!isOnline && (
          <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-medium shadow-sm">
            <div className="flex items-center space-x-2.5">
              <WifiOff className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Offline Mode • Live timer is backed up locally and will synchronize upon reconnecting.</span>
            </div>
            <span className="text-[11px] text-amber-400/80 font-bold uppercase tracking-wider">
              Local Persistence Active
            </span>
          </div>
        )}

        {/* 10-Minute Earlier Warning Banner */}
        {tenMinuteWarning && tenMinuteWarning.active && (
          <TenMinuteWarningBanner
            type={tenMinuteWarning.type}
            remainingSeconds={tenMinuteWarning.remainingSeconds}
            onDismiss={dismissTenMinuteWarning}
          />
        )}

        {/* Monday Global Analytics Notification Card */}
        <GlobalAnalyticsAlert userId={user?.id} />

        {/* Wide Exam Planner Banner (Full-width across desktop UI, collapses when session runs, reappears when idle) */}
        <UpcomingExamSlotCard
          userId={user?.id}
          isTimerActive={isStudyingOrBreak}
        />

        {/* 1. TOP COMMAND DECK (Compact Live Study Cockpit Grid, Zero Stretch on Break or Goals) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 items-start transition-all duration-300">
          {/* Left Wing: Study Session Controller (Compact 195px during active session) */}
          <div className={`${isStudyingOrBreak ? "h-[195px]" : "h-[310px]"} w-full transition-all duration-300`}>
            <section aria-label="Session Controller" className="h-full w-full">
              <SessionController
                status={status}
                focus={focus}
                elapsedSeconds={elapsedStudySeconds}
                breakStartedAt={breakStartedAt}
                syncStatus={syncStatus}
                onStartSession={handleStartSession}
                onPauseSession={handlePauseSession}
                onResumeSession={handleResumeSession}
                onFinishSession={handleFinishSessionWithStreak}
                onCreateGoal={handleCreateGoal}
                activeGoal={activeGoal}
                countdown={countdown}
                isLoading={actionLoading || mutationPending !== null}
                isHydrating={authLoading && status === "offline"}
                onForceSync={forceSynchronizeSession}
                showPreparationRules={true}
                className="h-full"
                compact={isStudyingOrBreak}
              />
            </section>
          </div>

          {/* Right Wing: Room Mission Companion with Goals Slider (Compact 195px during active session) */}
          <div className={`${isStudyingOrBreak ? "h-[195px]" : "h-[310px]"} w-full transition-all duration-300`}>
            <RoomMissionCompanion
              activeGoal={activeGoal}
              isStudying={isStudyingOrBreak}
              onCompleteTask={async (taskId) => {
                await completeGoalTasks([taskId]);
                await Promise.allSettled([refreshGoals(), refreshProfile(), refreshStreak()]);
              }}
              streakDays={effectiveStreakDays}
              weeklyStudySeconds={effectiveWeeklyStudySeconds}
              streakLoading={streakLoading && !streakStats}
              nearestExamName={nearestExamName}
              nearestExamDaysRemaining={nearestExamDaysRemaining}
              onOpenCreateGoal={() => setIsGoalSetupModalOpen(true)}
              className="h-full"
              compact={isStudyingOrBreak}
            />
          </div>
        </div>

        {/* 2. BOTTOM PEER STUDIO (Expansive Full Display Area) */}
        <div className="w-full pt-2 space-y-3">
          <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
            <div className="flex items-center space-x-2">
              <div className="p-1.5 rounded-lg bg-zinc-800/80 border border-zinc-700/80 text-zinc-300">
                <Users className="w-4 h-4" />
              </div>
              <h2 className="text-sm font-black tracking-tight text-zinc-100 uppercase">
                Peer Study Studio
              </h2>
              <span className="text-xs text-zinc-400 font-medium">
                • {reconciledMembers.length} active and recent members
              </span>
            </div>
          </div>

          <section aria-label="Group Members" className="w-full">
            <MemberList
              members={reconciledMembers}
              currentUserId={user?.id}
              currentUserElapsedSeconds={elapsedStudySeconds}
              isLoading={roomLoading}
              isReconciling={roomReconciling}
              isRealtimeConnected={isRealtimeConnected}
              hasInitialSnapshot={hasInitialSnapshot}
              roomError={roomError}
              connectionState={connectionState}
              syncStatus={syncStatus}
              winEvent={activeWinEvent}
              winEvents={activeWinEvents}
              onRivalryWin={broadcastRivalryWin}
              onDismissWinEvent={dismissWinEvent}
              onStartSession={handleStartSession}
            />
          </section>
        </div>
      </main>

      {/* Realtime Unified Cross-Device Goal Update Popup */}
      <SessionGoalUpdateModal
        isOpen={isGoalUpdateModalOpen || isSessionLimitNoticeOpen || isBreakExpiredNoticeOpen}
        onClose={async () => {
          await closeGoalUpdateModal();
          if (isBreakExpiredNoticeOpen) await closeBreakExpiredNotice();
          if (isSessionLimitNoticeOpen) closeSessionLimitNotice();
          await Promise.allSettled([refreshGoals(), refreshProfile(), refreshMembers(), refreshStreak()]);
        }}
        onConfirmSaveGoals={async (completedTaskIds) => {
          try {
            if (pendingGoalSessionId) {
              await completeSessionGoals(pendingGoalSessionId, completedTaskIds);
            } else if (completedTaskIds.length > 0) {
              await completeGoalTasks(completedTaskIds);
            }
          } catch (err) {
            console.error("Save goals error in desktop room page:", err);
          } finally {
            await closeGoalUpdateModal();
            if (isBreakExpiredNoticeOpen) await closeBreakExpiredNotice();
            if (isSessionLimitNoticeOpen) closeSessionLimitNotice();
            if (user) {
              broadcastStatusChange({
                id: user.id,
                current_status: status,
                session_start_time: status === "offline" ? null : effectiveProfile?.session_start_time,
                break_started_at: status === "break" ? (breakStartedAt || effectiveProfile?.break_started_at) : null,
                pending_goal_session_id: null,
              });
            }
            await Promise.allSettled([refreshGoals(), refreshProfile(), refreshMembers(), refreshStreak()]);
          }
        }}
        activeGoal={activeGoal}
        savedStudySeconds={
          pendingGoalSeconds || savedStudySecondsOnLimit || savedStudySecondsOnBreakExpiry
        }
        reason={
          (pendingGoalReason as "manual_stop" | "session_limit" | "break_expired") ||
          (isSessionLimitNoticeOpen
            ? "session_limit"
            : isBreakExpiredNoticeOpen
            ? "break_expired"
            : "manual_stop")
        }
        isLoading={goalActionLoading || actionLoading}
      />

      {/* Goal Setup Modal when starting after break */}
      <CreateGoalModal
        isOpen={isGoalSetupModalOpen}
        onClose={() => setIsGoalSetupModalOpen(false)}
        onConfirmCreate={handleGoalCreatedFromModal}
        isLoading={goalActionLoading || actionLoading}
      />
    </DesktopAppLayout>
  );
});
