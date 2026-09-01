"use client";

import React from "react";
import { useAuth } from "@/hooks/useAuth";
import { useLiveRoom } from "@/hooks/useLiveRoom";
import { useActiveSession } from "@/hooks/useActiveSession";
import { useDailyGoals } from "@/hooks/useDailyGoals";
import { TopHeader } from "@/components/navigation/TopHeader";
import { BottomNav } from "@/components/navigation/BottomNav";
import { SessionController } from "@/components/session/SessionController";
import { MemberList } from "@/components/room/MemberList";

export default function RoomPage() {
  const { user, profile, refreshProfile } = useAuth();
  const { members, loading: roomLoading, isRealtimeConnected, refreshMembers } = useLiveRoom(
    user?.id
  );

  const {
    status,
    focus,
    elapsedStudySeconds,
    actionLoading,
    startSession,
    pauseSession,
    resumeSession,
    finishSession,
  } = useActiveSession(profile, () => {
    refreshProfile();
    refreshMembers();
  });

  const { activeGoal, countdown, createGoal, refreshGoals } = useDailyGoals(user?.id);

  const handleFinishSession = async (completedTaskIds: string[]) => {
    await finishSession(completedTaskIds);
    await refreshGoals();
    await refreshProfile();
    await refreshMembers();
  };

  const handleCreateGoal = async (tasks: string[]) => {
    await createGoal(tasks);
    await refreshGoals();
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

      <BottomNav />
    </div>
  );
}
