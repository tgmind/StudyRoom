"use client";

import React, { useState, memo } from "react";
import { Button } from "@/components/ui/Button";
import { ActiveTimer } from "@/components/session/ActiveTimer";
import { StopHookModal } from "@/components/session/StopHookModal";
import { CreateGoalModal } from "@/components/goals/CreateGoalModal";
import { UserStatus, DailyGoal } from "@/lib/supabase/types";
import { GoalCountdownResult } from "@/lib/time/countdown";
import { Play, Pause, Square, RotateCcw } from "lucide-react";

interface SessionControllerProps {
  status: UserStatus;
  focus?: string | null;
  elapsedSeconds: number;
  breakStartedAt?: string | null;
  onStartSession: (focusTag?: string | null) => Promise<void>;
  onPauseSession: () => Promise<void>;
  onResumeSession: () => Promise<void>;
  onFinishSession: (completedTaskIds: string[]) => Promise<void>;
  onCreateGoal: (tasks: string[]) => Promise<void>;
  activeGoal: DailyGoal | null;
  countdown: GoalCountdownResult;
  isLoading?: boolean;
}

export const SessionController = memo(function SessionController({
  status,
  elapsedSeconds,
  breakStartedAt,
  onStartSession,
  onPauseSession,
  onResumeSession,
  onFinishSession,
  onCreateGoal,
  activeGoal,
  countdown,
  isLoading = false,
}: SessionControllerProps) {
  const [isStopModalOpen, setIsStopModalOpen] = useState(false);
  const [isGoalSetupModalOpen, setIsGoalSetupModalOpen] = useState(false);

  const isIdle = status === "offline";
  const isStudying = status === "studying";
  const isBreak = status === "break";

  const isGoalMissingOrExpired = !activeGoal || countdown.isExpired;

  // Direct Start Studying Flow
  const handleStartStudyingClick = async () => {
    if (isGoalMissingOrExpired) {
      setIsGoalSetupModalOpen(true);
    } else {
      await onStartSession(null);
    }
  };

  const handleGoalCreated = async (tasks: string[]) => {
    await onCreateGoal(tasks);
    setIsGoalSetupModalOpen(false);
    // Directly launch session after goals locked
    await onStartSession(null);
  };

  return (
    <div className="w-full bg-zinc-900/70 border border-zinc-800/90 rounded-2xl p-4 sm:p-5 shadow-xl space-y-4 backdrop-blur-md">
      {/* Session Timer */}
      {!isIdle && (
        <div className="space-y-2">
          <ActiveTimer
            elapsedSeconds={elapsedSeconds}
            status={status}
            breakStartedAt={breakStartedAt}
          />
        </div>
      )}

      {/* Action Controls */}
      <div className="flex items-center justify-center space-x-3">
        {isIdle && (
          <Button
            size="lg"
            variant="primary"
            onClick={handleStartStudyingClick}
            isLoading={isLoading}
            className="w-full font-extrabold text-xs sm:text-sm py-3.5 space-x-2 shadow-lg"
          >
            <Play className="w-4 h-4 sm:w-5 sm:h-5 fill-current text-zinc-950" />
            <span>Start Studying</span>
          </Button>
        )}

        {isStudying && (
          <>
            <Button
              size="md"
              variant="secondary"
              onClick={onPauseSession}
              isLoading={isLoading}
              className="flex-1 space-x-2 border-amber-500/30 text-amber-300 hover:bg-amber-500/10 font-bold"
            >
              <Pause className="w-4 h-4 fill-current" />
              <span>Pause</span>
            </Button>
            <Button
              size="md"
              variant="danger"
              onClick={() => setIsStopModalOpen(true)}
              isLoading={isLoading}
              className="flex-1 space-x-2 font-bold"
            >
              <Square className="w-4 h-4 fill-current" />
              <span>Stop</span>
            </Button>
          </>
        )}

        {isBreak && (
          <>
            <Button
              size="md"
              variant="primary"
              onClick={onResumeSession}
              isLoading={isLoading}
              className="flex-1 space-x-2 font-extrabold"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Resume</span>
            </Button>
            <Button
              size="md"
              variant="danger"
              onClick={() => setIsStopModalOpen(true)}
              isLoading={isLoading}
              className="flex-1 space-x-2 font-bold"
            >
              <Square className="w-4 h-4 fill-current" />
              <span>Stop</span>
            </Button>
          </>
        )}
      </div>

      {/* Goal Setup Prompt Modal */}
      <CreateGoalModal
        isOpen={isGoalSetupModalOpen}
        onClose={() => setIsGoalSetupModalOpen(false)}
        onConfirmCreate={handleGoalCreated}
        isLoading={isLoading}
      />

      {/* Stop Hook Modal */}
      <StopHookModal
        isOpen={isStopModalOpen}
        onClose={() => setIsStopModalOpen(false)}
        onConfirmFinish={onFinishSession}
        activeGoal={activeGoal}
        elapsedSeconds={elapsedSeconds}
        isLoading={isLoading}
      />
    </div>
  );
});
