"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useLiveRoom } from "@/hooks/useLiveRoom";
import { useActiveSession, requestNotificationPermission } from "@/hooks/useActiveSession";
import { useDailyGoals } from "@/hooks/useDailyGoals";
import { TopHeader } from "@/components/navigation/TopHeader";
import { BottomNav } from "@/components/navigation/BottomNav";
import { SessionController } from "@/components/session/SessionController";
import { MemberList } from "@/components/room/MemberList";
import { SessionGoalUpdateModal } from "@/components/session/SessionGoalUpdateModal";
import { CreateGoalModal } from "@/components/goals/CreateGoalModal";
import { TenMinuteWarningBanner } from "@/components/session/TenMinuteWarningBanner";
import { getServerNow } from "@/lib/time/clockSync";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

export default function RoomPage() {
  const isOnline = useOnlineStatus();
  const { user, profile, refreshProfile } = useAuth();
  const {
    members,
    loading: roomLoading,
    isRealtimeConnected,
    expectedPeakHours,
    activeWinEvent,
    broadcastRivalryWin,
    dismissWinEvent,
    refreshMembers,
    broadcastStatusChange,
  } = useLiveRoom(user?.id);

  // Own profile is always the canonical source for session state.
  // members[] carries realtime data for OTHER users (room list rendering).
  // Picking own profile from members[] caused buttons to revert: after a button
  // press, Supabase realtime echoes the OLD pre-action server state back into
  // members[] (~200–800 ms), making effectiveProfile appear "offline" and wiping
  // the optimistic localStatusOverride. Using the AuthProvider profile directly
  // avoids this race entirely while preserving all cross-device sync for others.
  const effectiveProfile = profile;

  const {
    status,
    focus,
    elapsedStudySeconds,
    breakStartedAt,
    actionLoading,
    isBreakExpiredNoticeOpen,
    savedStudySecondsOnBreakExpiry,
    closeBreakExpiredNotice,
    isSessionLimitNoticeOpen,
    savedStudySecondsOnLimit,
    closeSessionLimitNotice,
    isGoalUpdateModalOpen,
    pendingGoalSessionId,
    pendingGoalSeconds,
    pendingGoalReason,
    completeSessionGoals,
    closeGoalUpdateModal,
    tenMinuteWarning,
    dismissTenMinuteWarning,
    startSession,
    pauseSession,
    resumeSession,
    finishSession,
  } = useActiveSession(effectiveProfile, (newStatus, details) => {
    if (user && newStatus) {
      broadcastStatusChange({
        id: user.id,
        current_status: newStatus,
        session_start_time: newStatus === "offline" ? null : undefined,
        break_started_at: newStatus === "break" ? getServerNow().toISOString() : null,
        current_focus: newStatus === "offline" ? null : undefined,
        ...details,
      });
    }
  });

  useEffect(() => {
    requestNotificationPermission();
  }, []);


  const [isGoalSetupModalOpen, setIsGoalSetupModalOpen] = useState(false);

  // Mid-Session Goal Grace: Preserve active goals while user is studying, on break, or updating goals post-session
  const isSessionActive =
    status !== "offline" ||
    isBreakExpiredNoticeOpen ||
    isSessionLimitNoticeOpen ||
    isGoalUpdateModalOpen ||
    Boolean(pendingGoalSessionId);
  const sessionStartTime = effectiveProfile?.session_start_time || null;

  const {
    activeGoal,
    countdown,
    createGoal,
    completeGoalTasks,
    refreshGoals,
    actionLoading: goalActionLoading,
  } = useDailyGoals(user?.id, sessionStartTime, isSessionActive);

  const hasPendingGoals = Boolean(activeGoal?.tasks && activeGoal.tasks.some((t) => !t.completed));

  const handleStartSession = async () => {
    await startSession();
  };

  const handlePauseSession = async () => {
    await pauseSession();
  };

  const handleResumeSession = async () => {
    await resumeSession();
  };

  const handleFinishSession = async (completedTaskIds: string[] = []) => {
    await finishSession(completedTaskIds, "manual_stop");
    await Promise.allSettled([refreshGoals(), refreshProfile(), refreshMembers()]);
  };

  const handleCreateGoal = async (tasks: string[]) => {
    await createGoal(tasks);
  };

  const handleGoalCreatedFromModal = async (tasks: string[]) => {
    await handleCreateGoal(tasks);
    setIsGoalSetupModalOpen(false);
    await handleStartSession();
  };

  return (
    <div className="flex-1 flex flex-col min-h-screen pb-24 bg-[#090a0f] text-zinc-100">
      <TopHeader
        memberCount={members.length}
        isRealtimeConnected={isRealtimeConnected}
        profile={effectiveProfile}
        expectedPeakHours={expectedPeakHours}
      />

      <main className="flex-1 w-full max-w-2xl sm:max-w-3xl px-3.5 sm:px-6 py-4 mx-auto space-y-4 sm:space-y-6">
        {/* Subtle Offline Mode Indicator */}
        {!isOnline && (
          <div className="flex items-center justify-between px-3.5 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-medium animate-in fade-in duration-200 shadow-sm">
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              <span>Offline Mode • Live timer is saving to disk</span>
            </div>
            <span className="text-[10px] text-amber-400/80 font-semibold uppercase tracking-wider">
              Syncs on reconnect
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

        {/* Session Controller Panel */}
        <section aria-label="Session Controller">
          <SessionController
            status={status}
            focus={focus}
            elapsedSeconds={elapsedStudySeconds}
            breakStartedAt={breakStartedAt}
            onStartSession={handleStartSession}
            onPauseSession={handlePauseSession}
            onResumeSession={handleResumeSession}
            onFinishSession={handleFinishSession}
            onCreateGoal={handleCreateGoal}
            activeGoal={activeGoal}
            countdown={countdown}
            isLoading={actionLoading}
          />
        </section>

        {/* Group Members List */}
        <section aria-label="Group Members">
          <MemberList
            members={members}
            currentUserId={user?.id}
            currentUserElapsedSeconds={elapsedStudySeconds}
            isLoading={roomLoading}
            winEvent={activeWinEvent}
            onRivalryWin={broadcastRivalryWin}
            onDismissWinEvent={dismissWinEvent}
          />
        </section>
      </main>

      {/* Realtime Unified Cross-Device Goal Update Popup */}
      <SessionGoalUpdateModal
        isOpen={isGoalUpdateModalOpen || isSessionLimitNoticeOpen || isBreakExpiredNoticeOpen}
        onClose={async () => {
          await closeGoalUpdateModal();
          if (isBreakExpiredNoticeOpen) await closeBreakExpiredNotice();
          if (isSessionLimitNoticeOpen) closeSessionLimitNotice();
          if (user) {
            broadcastStatusChange({
              id: user.id,
              pending_goal_session_id: null,
            });
          }
          await Promise.allSettled([refreshGoals(), refreshProfile(), refreshMembers()]);
        }}
        onConfirmSaveGoals={async (completedTaskIds) => {
          if (pendingGoalSessionId) {
            await completeSessionGoals(pendingGoalSessionId, completedTaskIds);
          } else if (completedTaskIds.length > 0) {
            await completeGoalTasks(completedTaskIds);
          }
          if (isBreakExpiredNoticeOpen) await closeBreakExpiredNotice();
          if (isSessionLimitNoticeOpen) closeSessionLimitNotice();
          if (user) {
            broadcastStatusChange({
              id: user.id,
              pending_goal_session_id: null,
            });
          }
          await Promise.allSettled([refreshGoals(), refreshProfile(), refreshMembers()]);
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

      <BottomNav />
    </div>
  );
}
