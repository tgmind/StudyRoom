"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useLiveRoom } from "@/hooks/useLiveRoom";
import { useActiveSession } from "@/hooks/useActiveSession";
import { useDailyGoals } from "@/hooks/useDailyGoals";
import { TopHeader } from "@/components/navigation/TopHeader";
import { BottomNav } from "@/components/navigation/BottomNav";
import { SessionController } from "@/components/session/SessionController";
import { MemberList } from "@/components/room/MemberList";
import { BreakExpiredModal } from "@/components/session/BreakExpiredModal";
import { BreakGoalUpdateModal } from "@/components/session/BreakGoalUpdateModal";
import { SessionLimitModal } from "@/components/session/SessionLimitModal";
import { CreateGoalModal } from "@/components/goals/CreateGoalModal";
import { getServerNow } from "@/lib/time/clockSync";

export default function RoomPage() {
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

  const effectiveProfile = useMemo(() => {
    if (!profile) return null;
    const liveMatch = members.find((m) => m.id === profile.id);
    return liveMatch || profile;
  }, [profile, members]);

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
    startSession,
    pauseSession,
    resumeSession,
    finishSession,
  } = useActiveSession(effectiveProfile, (newStatus) => {
    if (user && newStatus) {
      broadcastStatusChange({
        id: user.id,
        current_status: newStatus,
        session_start_time: newStatus === "offline" ? null : undefined,
        break_started_at: newStatus === "break" ? new Date().toISOString() : null,
        current_focus: newStatus === "offline" ? null : undefined,
      });
    }
    refreshProfile();
    refreshMembers();
  });

  // Handle 1-tap notification resume action (?action=resume)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("action") === "resume" && effectiveProfile?.current_status === "break") {
        resumeSession();
        window.history.replaceState({}, "", "/room");
      }
    }
  }, [effectiveProfile?.current_status, resumeSession]);

  const {
    activeGoal,
    countdown,
    createGoal,
    completeGoalTasks,
    refreshGoals,
    actionLoading: goalActionLoading,
  } = useDailyGoals(user?.id);
  const [isGoalSetupModalOpen, setIsGoalSetupModalOpen] = useState(false);
  const [isBreakGoalModalOpen, setIsBreakGoalModalOpen] = useState(false);
  const [isPendingStartNewAfterBreak, setIsPendingStartNewAfterBreak] = useState(false);

  const hasPendingGoals = Boolean(activeGoal?.tasks && activeGoal.tasks.some((t) => !t.completed));

  const handleStartSession = async () => {
    const nowIso = getServerNow().toISOString();
    await startSession();
    if (user) {
      broadcastStatusChange({
        id: user.id,
        current_status: "studying",
        session_start_time: nowIso,
        last_resumed_at: nowIso,
        break_started_at: null,
        active_study_seconds_snapshot: 0,
        current_focus: null,
      });
    }
  };

  const handlePauseSession = async () => {
    const accruedBeforePause = elapsedStudySeconds;
    const nowIso = getServerNow().toISOString();
    await pauseSession();
    if (user) {
      broadcastStatusChange({
        id: user.id,
        current_status: "break",
        break_started_at: nowIso,
        active_study_seconds_snapshot: accruedBeforePause,
      });
    }
  };

  const handleResumeSession = async () => {
    const res = await resumeSession();
    const nowIso = getServerNow().toISOString();
    if (user && res?.success) {
      broadcastStatusChange({
        id: user.id,
        current_status: "studying",
        break_started_at: null,
        last_resumed_at: nowIso,
      });
    } else if (user && res?.expired) {
      broadcastStatusChange({
        id: user.id,
        current_status: "offline",
        session_start_time: null,
        last_resumed_at: null,
        break_started_at: null,
        current_focus: null,
      });
    }
  };

  const handleFinishSession = async (completedTaskIds: string[]) => {
    await finishSession(completedTaskIds);
    if (user) {
      broadcastStatusChange({
        id: user.id,
        current_status: "offline",
        session_start_time: null,
        last_resumed_at: null,
        break_started_at: null,
        current_focus: null,
      });
    }
    await Promise.allSettled([refreshGoals(), refreshProfile(), refreshMembers()]);
  };

  const handleCreateGoal = async (tasks: string[]) => {
    await createGoal(tasks);
  };

  const handleProceedFromBreakNotice = (startNewSession: boolean) => {
    closeBreakExpiredNotice();
    setIsPendingStartNewAfterBreak(startNewSession);

    if (hasPendingGoals) {
      setIsBreakGoalModalOpen(true);
    } else if (startNewSession) {
      handleStartNewSessionAfterBreak();
    }
  };

  const handleSaveGoalsAfterBreak = async (completedTaskIds: string[]) => {
    try {
      if (completedTaskIds.length > 0) {
        await completeGoalTasks(completedTaskIds);
        await Promise.allSettled([refreshGoals(), refreshProfile(), refreshMembers()]);
      }
    } catch (err) {
      console.error("Failed to save goals after break:", err);
    } finally {
      setIsBreakGoalModalOpen(false);

      if (isPendingStartNewAfterBreak) {
        setIsPendingStartNewAfterBreak(false);
        const isGoalMissingOrExpired = !activeGoal || countdown.isExpired;
        if (isGoalMissingOrExpired) {
          setIsGoalSetupModalOpen(true);
        } else {
          await handleStartSession();
        }
      }
    }
  };

  const handleStartNewSessionAfterBreak = async () => {
    closeBreakExpiredNotice();
    const isGoalMissingOrExpired = !activeGoal || countdown.isExpired;
    if (isGoalMissingOrExpired) {
      setIsGoalSetupModalOpen(true);
    } else {
      await handleStartSession();
    }
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

      {/* 3-Hour Maximum Session Limit Reached Modal */}
      <SessionLimitModal
        isOpen={isSessionLimitNoticeOpen}
        onClose={closeSessionLimitNotice}
        onConfirmSaveGoals={async (completedTaskIds) => {
          closeSessionLimitNotice();
          if (completedTaskIds.length > 0) {
            await completeGoalTasks(completedTaskIds);
            await Promise.allSettled([refreshGoals(), refreshProfile(), refreshMembers()]);
          }
        }}
        activeGoal={activeGoal}
        savedStudySeconds={savedStudySecondsOnLimit || 10800}
        isLoading={goalActionLoading}
      />

      {/* 1-Hour Break Inactivity Expiry Notice Modal */}
      <BreakExpiredModal
        isOpen={isBreakExpiredNoticeOpen}
        onClose={closeBreakExpiredNotice}
        onStartNewSession={handleStartNewSessionAfterBreak}
        onProceedToGoals={handleProceedFromBreakNotice}
        savedStudySeconds={savedStudySecondsOnBreakExpiry}
        hasActiveGoals={hasPendingGoals}
      />

      {/* Goal Updates Prompt Modal after 1-hour Break Expiry */}
      <BreakGoalUpdateModal
        isOpen={isBreakGoalModalOpen}
        onClose={() => {
          setIsBreakGoalModalOpen(false);
          setIsPendingStartNewAfterBreak(false);
        }}
        onConfirmSaveGoals={handleSaveGoalsAfterBreak}
        activeGoal={activeGoal}
        savedStudySeconds={savedStudySecondsOnBreakExpiry}
        isStartingNewSession={isPendingStartNewAfterBreak}
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
