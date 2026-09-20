"use client";

import React, { useState, memo } from "react";
import { Button } from "@/components/ui/Button";
import { ActiveTimer } from "@/components/session/ActiveTimer";
import { CreateGoalModal } from "@/components/goals/CreateGoalModal";
import { UserStatus, DailyGoal } from "@/lib/supabase/types";
import { GoalCountdownResult } from "@/lib/time/countdown";
import { Play, Pause, Square, RotateCcw } from "lucide-react";
import { requestNotificationPermission } from "@/hooks/useActiveSession";

import { SessionSyncStatus } from "@/hooks/useActiveSession";

export type SessionControllerState = "hydrating" | "idle" | "studying" | "break";

interface SessionControllerProps {
  status: UserStatus;
  focus?: string | null;
  elapsedSeconds: number;
  breakStartedAt?: string | null;
  syncStatus?: SessionSyncStatus;
  onStartSession: () => Promise<void>;
  onPauseSession: () => Promise<void>;
  onResumeSession: () => Promise<void>;
  onFinishSession: (completedTaskIds?: string[]) => Promise<void>;
  onCreateGoal: (tasks: string[]) => Promise<void>;
  activeGoal: DailyGoal | null;
  countdown: GoalCountdownResult;
  isLoading?: boolean;
  isHydrating?: boolean;
}

export const SessionController = memo(function SessionController({
  status,
  elapsedSeconds,
  breakStartedAt,
  syncStatus,
  onStartSession,
  onPauseSession,
  onResumeSession,
  onFinishSession,
  onCreateGoal,
  activeGoal,
  countdown,
  isLoading = false,
  isHydrating = false,
}: SessionControllerProps) {
  const [isGoalSetupModalOpen, setIsGoalSetupModalOpen] = useState(false);

  const controllerState: SessionControllerState = isHydrating
    ? "hydrating"
    : status === "studying"
    ? "studying"
    : status === "break"
    ? "break"
    : "idle";

  const isIdle = controllerState === "idle";
  const isStudying = controllerState === "studying";
  const isBreak = controllerState === "break";
  const isHydratingState = controllerState === "hydrating";

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
      {/* Session Hydration Skeleton (structural parity, prevents false Start button / timer flash) */}
      {isHydratingState && (
        <div className="w-full flex flex-col items-center justify-center py-2 space-y-3">
          <div className="w-full max-w-sm px-6 py-6 rounded-2xl bg-gradient-to-b from-zinc-900/90 via-zinc-950 to-zinc-950 border border-zinc-800/80 flex flex-col items-center justify-center space-y-3 shadow-[0_0_20px_rgba(0,0,0,0.4)]">
            <div className="w-24 h-3 bg-zinc-800/60 rounded-full animate-pulse" />
            <div className="w-36 h-9 bg-zinc-800/80 rounded-xl animate-pulse" />
            <div className="w-28 h-3 bg-zinc-800/40 rounded-full animate-pulse" />
          </div>
          <div className="w-full h-12 rounded-xl bg-zinc-800/60 animate-pulse" />
        </div>
      )}

      {/* Session Timer */}
      {!isIdle && !isHydratingState && (
        <div className="space-y-2">
          <ActiveTimer
            elapsedSeconds={elapsedSeconds}
            status={status}
            breakStartedAt={breakStartedAt}
            syncStatus={syncStatus}
          />
        </div>
      )}
      {isIdle && !isHydratingState && syncStatus && syncStatus !== "synced" && (
        <div className="flex items-center justify-end px-1 -mt-2 mb-1">
          <div className="flex items-center space-x-1 text-[9px] font-semibold tracking-normal select-none">
            {syncStatus === "syncing" && (
              <span className="text-amber-400 flex items-center space-x-1">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                <span>Syncing...</span>
              </span>
            )}
            {syncStatus === "reconnecting" && (
              <span className="text-amber-400 flex items-center space-x-1">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                <span>Reconnecting...</span>
              </span>
            )}
            {syncStatus === "no_network" && (
              <span className="text-zinc-400 flex items-center space-x-1">
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
                <span>No network</span>
              </span>
            )}
            {syncStatus === "error" && (
              <span className="text-rose-400 flex items-center space-x-1">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                <span>Action failed / Error</span>
              </span>
            )}
          </div>
        </div>
      )}

      {/* Action Controls */}
      {!isHydratingState && (
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
      )}

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
