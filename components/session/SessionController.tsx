"use client";

import React, { useState, memo } from "react";
import { Button } from "@/components/ui/Button";
import { ActiveTimer } from "@/components/session/ActiveTimer";
import { CreateGoalModal } from "@/components/goals/CreateGoalModal";
import { UserStatus, DailyGoal } from "@/lib/supabase/types";
import { GoalCountdownResult } from "@/lib/time/countdown";
import { Play, Pause, Square, RotateCcw } from "lucide-react";
import { requestNotificationPermission } from "@/hooks/useActiveSession";

interface SessionControllerProps {
  status: UserStatus;
  focus?: string | null;
  elapsedSeconds: number;
  breakStartedAt?: string | null;
  onStartSession: () => Promise<void>;
  onPauseSession: () => Promise<void>;
  onResumeSession: () => Promise<void>;
  onFinishSession: (completedTaskIds?: string[]) => Promise<void>;
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
  const [isGoalSetupModalOpen, setIsGoalSetupModalOpen] = useState(false);

  const isIdle = status === "offline";
  const isStudying = status === "studying";
  const isBreak = status === "break";

  const isGoalMissingOrExpired = !activeGoal || countdown.isExpired;

  // Direct Start Studying Flow - immediately starts or prompts for goal setup
  const handleStartStudyingClick = async () => {
    // Request notification permission during direct user gesture
    requestNotificationPermission().catch(() => {});
    try {
      if (isGoalMissingOrExpired) {
        setIsGoalSetupModalOpen(true);
      } else {
        await onStartSession();
      }
    } catch {
      // handled by parent error state
    }
  };

  const handleStop = async () => {
    try {
      await onFinishSession([]);
    } catch {
      // handled by parent
    }
  };

  const handleGoalCreated = async (tasks: string[]) => {
    try {
      await onCreateGoal(tasks);
      setIsGoalSetupModalOpen(false);
      // Directly launch session after goals locked
      await onStartSession();
    } catch {
      // handled by parent error state
    }
  };

  const handlePause = React.useCallback(async () => {
    try {
      await onPauseSession();
    } catch {
      // handled by parent
    }
  }, [onPauseSession]);

  const handleResume = React.useCallback(async () => {
    try {
      await onResumeSession();
    } catch {
      // handled by parent
    }
  }, [onResumeSession]);

  React.useEffect(() => {
    if (isBreak) {
      (window as unknown as { __studyRoomResumeSession?: () => Promise<void> }).__studyRoomResumeSession = handleResume;
      return () => {
        delete (window as unknown as { __studyRoomResumeSession?: () => Promise<void> }).__studyRoomResumeSession;
      };
    } else if (isStudying) {
      (window as unknown as { __studyRoomTakeBreak?: () => Promise<void> }).__studyRoomTakeBreak = handlePause;
      return () => {
        delete (window as unknown as { __studyRoomTakeBreak?: () => Promise<void> }).__studyRoomTakeBreak;
      };
    }
  }, [isBreak, isStudying, handleResume, handlePause]);

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
              onClick={handlePause}
              className="flex-1 space-x-2 border-amber-500/30 text-amber-300 hover:bg-amber-500/10 font-bold"
            >
              <Pause className="w-4 h-4 fill-current" />
              <span>Pause</span>
            </Button>
            <Button
              size="md"
              variant="danger"
              onClick={handleStop}
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
              onClick={handleResume}
              className="flex-1 space-x-2 font-extrabold"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Resume</span>
            </Button>
            <Button
              size="md"
              variant="danger"
              onClick={handleStop}
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
    </div>
  );
});
