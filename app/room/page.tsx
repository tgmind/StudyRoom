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
import { CreateGoalModal } from "@/components/goals/CreateGoalModal";

export default function RoomPage() {
  const { user, profile, refreshProfile } = useAuth();
  const {
    members,
    loading: roomLoading,
    isRealtimeConnected,
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

  const handleStartSession = async (focusTag?: string | null) => {
    await startSession(focusTag ?? null);
    if (user) {
      broadcastStatusChange({
        id: user.id,
        current_status: "studying",
        session_start_time: new Date().toISOString(),
        break_started_at: null,
        current_focus: focusTag ?? null,
      });
    }
  };

  const handlePauseSession = async () => {
    await pauseSession();
    if (user) {
      broadcastStatusChange({
        id: user.id,
        current_status: "break",
        break_started_at: new Date().toISOString(),
      });
    }
  };

  const handleResumeSession = async () => {
    const res = await resumeSession();
    if (user && res?.success) {
      broadcastStatusChange({
        id: user.id,
        current_status: "studying",
        break_started_at: null,
      });
    } else if (user && res?.expired) {
      broadcastStatusChange({
        id: user.id,
        current_status: "offline",
        session_start_time: null,
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
          await handleStartSession(null);
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
      await handleStartSession(null);
    }
  };

  const handleGoalCreatedFromModal = async (tasks: string[]) => {
    await handleCreateGoal(tasks);
    setIsGoalSetupModalOpen(false);
    await handleStartSession(null);
  };

  return (
    <div className="flex-1 flex flex-col min-h-screen pb-24 bg-[#090a0f] text-zinc-100">
      <TopHeader
        memberCount={members.length}
        isRealtimeConnected={isRealtimeConnected}
        profile={effectiveProfile}
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
          />
        </section>
      </main>

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
