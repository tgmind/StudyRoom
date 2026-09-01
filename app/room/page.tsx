"use client";

import React, { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useLiveRoom } from "@/hooks/useLiveRoom";
import { useActiveSession } from "@/hooks/useActiveSession";
import { useDailyGoals } from "@/hooks/useDailyGoals";
import { TopHeader } from "@/components/navigation/TopHeader";
import { BottomNav } from "@/components/navigation/BottomNav";
import { SessionController } from "@/components/session/SessionController";
import { MemberList } from "@/components/room/MemberList";
import { BreakExpiredModal } from "@/components/session/BreakExpiredModal";
import { CreateGoalModal } from "@/components/goals/CreateGoalModal";

export default function RoomPage() {
  const { user, profile, refreshProfile } = useAuth();
  const { members, loading: roomLoading, isRealtimeConnected, refreshMembers } = useLiveRoom(
    user?.id
  );

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
  } = useActiveSession(profile, () => {
    refreshProfile();
    refreshMembers();
  });

  const { activeGoal, countdown, createGoal, refreshGoals } = useDailyGoals(user?.id);
  const [isGoalSetupModalOpen, setIsGoalSetupModalOpen] = useState(false);

  const handleFinishSession = async (completedTaskIds: string[]) => {
    await finishSession(completedTaskIds);
    await Promise.allSettled([refreshGoals(), refreshProfile(), refreshMembers()]);
  };

  const handleCreateGoal = async (tasks: string[]) => {
    await createGoal(tasks);
  };

  const handleStartNewSessionAfterBreak = async () => {
    closeBreakExpiredNotice();
    const isGoalMissingOrExpired = !activeGoal || countdown.isExpired;
    if (isGoalMissingOrExpired) {
      setIsGoalSetupModalOpen(true);
    } else {
      await startSession(null);
    }
  };

  const handleGoalCreatedFromModal = async (tasks: string[]) => {
    await handleCreateGoal(tasks);
    setIsGoalSetupModalOpen(false);
    await startSession(null);
  };

  return (
    <div className="flex-1 flex flex-col min-h-screen pb-24 bg-[#090a0f] text-zinc-100">
      <TopHeader
        memberCount={members.length}
        isRealtimeConnected={isRealtimeConnected}
        profile={profile}
      />

      <main className="flex-1 w-full max-w-2xl sm:max-w-3xl px-3.5 sm:px-6 py-4 mx-auto space-y-4 sm:space-y-6">
        {/* Session Controller Panel */}
        <section aria-label="Session Controller">
          <SessionController
            status={status}
            focus={focus}
            elapsedSeconds={elapsedStudySeconds}
            breakStartedAt={breakStartedAt}
            onStartSession={startSession}
            onPauseSession={pauseSession}
            onResumeSession={resumeSession}
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
        savedStudySeconds={savedStudySecondsOnBreakExpiry}
      />

      {/* Goal Setup Modal when starting after break */}
      <CreateGoalModal
        isOpen={isGoalSetupModalOpen}
        onClose={() => setIsGoalSetupModalOpen(false)}
        onConfirmCreate={handleGoalCreatedFromModal}
        isLoading={actionLoading}
      />

      <BottomNav />
    </div>
  );
}
