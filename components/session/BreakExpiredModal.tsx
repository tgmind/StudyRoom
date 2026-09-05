"use client";

import React from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Clock, Play, CheckCircle2, Target } from "lucide-react";
import { formatDurationSeconds } from "@/lib/time/format";

interface BreakExpiredModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartNewSession?: () => void;
  onProceedToGoals?: (startNewSession: boolean) => void;
  savedStudySeconds?: number;
  hasActiveGoals?: boolean;
}

export function BreakExpiredModal({
  isOpen,
  onClose,
  onStartNewSession,
  onProceedToGoals,
  savedStudySeconds = 0,
  hasActiveGoals = true,
}: BreakExpiredModalProps) {
  const handleStartNew = () => {
    onClose();
    if (onProceedToGoals && hasActiveGoals) {
      onProceedToGoals(true);
    } else if (onStartNewSession) {
      onStartNewSession();
    }
  };

  const handleUpdateGoals = () => {
    onClose();
    if (onProceedToGoals) {
      onProceedToGoals(false);
    }
  };

  const handleDismiss = () => {
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Session Automatically Ended"
      subtitle="Break duration limit reached"
    >
      <div className="space-y-5 py-1">
        {/* Main Alert Banner */}
        <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-500/30 flex items-start space-x-3.5">
          <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400 shrink-0 mt-0.5">
            <Clock className="w-5 h-5" />
          </div>
          <div className="space-y-1 min-w-0 flex-1">
            <p className="text-sm font-bold text-amber-200 break-words leading-snug">
              You stayed on break for more than 1 hour. Session has been stopped. Start a new session.
            </p>
            <p className="text-xs text-zinc-400 leading-relaxed break-words">
              To maintain strict accountability and avoid idle sessions, breaks are limited to a maximum of 1 hour.
            </p>
          </div>
        </div>

        {/* Saved Study Time Confirmation */}
        <div className="p-3.5 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center space-x-2 min-w-0">
            <CheckCircle2 className="w-4 h-4 text-violet-400 shrink-0" />
            <span className="text-xs text-zinc-300 font-medium">Study Time Saved</span>
          </div>
          <span className="font-mono text-xs font-black text-violet-400 px-2.5 py-1 rounded-full bg-violet-950/40 border border-violet-500/30 shrink-0 tabular-nums whitespace-nowrap">
            {formatDurationSeconds(savedStudySeconds)}
          </span>
        </div>

        {/* Action Buttons */}
        <div className="pt-2 flex flex-col sm:flex-row items-center justify-end gap-2 sm:gap-2.5">
          <Button
            type="button"
            variant="secondary"
            onClick={handleDismiss}
            className="w-full sm:w-auto text-xs font-bold text-zinc-400 hover:text-zinc-200"
          >
            Dismiss
          </Button>

          {hasActiveGoals && onProceedToGoals && (
            <Button
              type="button"
              variant="secondary"
              onClick={handleUpdateGoals}
              className="w-full sm:w-auto text-xs font-bold space-x-1.5 bg-violet-950/40 text-violet-300 border-violet-700/60 hover:bg-violet-900/50"
            >
              <Target className="w-3.5 h-3.5 text-violet-400" />
              <span>Update Goals</span>
            </Button>
          )}

          <Button
            type="button"
            variant="primary"
            onClick={handleStartNew}
            className="w-full sm:w-auto text-xs font-extrabold space-x-2 shadow-lg px-5 bg-zinc-100 text-zinc-950 hover:bg-white border-white"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Start New Session</span>
          </Button>
        </div>
      </div>
    </Modal>
  );
}
