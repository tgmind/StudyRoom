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
    <div className="flex-1 flex flex-col min-h-screen pb-20">
      <TopHeader
        memberCount={members.length}
        isRealtimeConnected={isRealtimeConnected}
        profile={profile}
      />

      <div className="flex-1 p-4 space-y-5 max-w-xl mx-auto w-full">
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
      </div>

      <BottomNav />
    </div>
  );
}
