"use client";

import React from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Clock, Play, CheckCircle2 } from "lucide-react";
import { formatDurationSeconds } from "@/lib/time/format";

interface BreakExpiredModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartNewSession?: () => void;
  savedStudySeconds?: number;
}

export function BreakExpiredModal({
  isOpen,
  onClose,
  onStartNewSession,
  savedStudySeconds = 0,
}: BreakExpiredModalProps) {
  const handleStartNew = () => {
    onClose();
    if (onStartNewSession) {
      onStartNewSession();
    }
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
          <div className="space-y-1">
            <p className="text-sm font-bold text-amber-200">
              You stayed on break for more than 1 hour. Session has been stopped. Start a new session.
            </p>
            <p className="text-xs text-zinc-400 leading-relaxed">
              To maintain strict accountability and avoid idle sessions, breaks are limited to a maximum of 1 hour.
            </p>
          </div>
        </div>

        {/* Saved Study Time Confirmation */}
        <div className="p-3.5 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-violet-400 shrink-0" />
            <span className="text-xs text-zinc-300 font-medium">Study Time Saved</span>
          </div>
          <span className="font-mono text-xs font-black text-violet-400 px-2.5 py-1 rounded-full bg-violet-950/40 border border-violet-500/30">
            {formatDurationSeconds(savedStudySeconds)}
          </span>
        </div>

        {/* Action Buttons */}
        <div className="pt-2 flex flex-col sm:flex-row items-center justify-end space-y-2 sm:space-y-0 sm:space-x-3">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            className="w-full sm:w-auto text-xs font-bold"
          >
            Dismiss
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={handleStartNew}
            className="w-full sm:w-auto text-xs font-extrabold space-x-2 shadow-lg px-5 bg-zinc-100 text-zinc-950 hover:bg-white"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Start New Session</span>
          </Button>
        </div>
      </div>
    </Modal>
  );
}
