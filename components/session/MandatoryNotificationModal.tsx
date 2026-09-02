"use client";

import React, { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { Bell, CheckCircle2, AlertCircle, Smartphone, Sparkles } from "lucide-react";

interface MandatoryNotificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPermissionGranted: () => void;
}

export function MandatoryNotificationModal({
  isOpen,
  onClose,
  onPermissionGranted,
}: MandatoryNotificationModalProps) {
  const { isSupported, permission, subscribe, loading, error } = usePushNotifications();
  const [requestError, setRequestError] = useState<string | null>(null);

  const isDenied = permission === "denied";

  const handleEnable = async () => {
    setRequestError(null);
    const success = await subscribe();
    if (success) {
      onPermissionGranted();
      onClose();
    } else if (permission === "denied") {
      setRequestError(
        "Notifications are blocked in your browser settings. Please allow notifications in your browser/phone site settings to continue."
      );
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Study Reminders Required"
      subtitle="Push notifications are compulsory for all StudyRoom members"
    >
      <div className="space-y-4 pt-2">
        {/* Hero icon banner */}
        <div className="p-3 bg-violet-500/10 border border-violet-500/20 rounded-2xl flex items-center space-x-3 text-violet-200">
          <div className="p-2 rounded-xl bg-violet-500/20 text-violet-300 shrink-0">
            <Bell className="w-5 h-5" />
          </div>
          <p className="text-xs leading-relaxed">
            To ensure session honesty and prevent unattended timers running for hours, background check-ins are compulsory for everyone.
          </p>
        </div>

        {/* Requirements list */}
        <div className="space-y-2.5 bg-zinc-950/60 border border-zinc-800/80 rounded-2xl p-3.5 text-xs text-zinc-300">
          <div className="flex items-start space-x-2">
            <CheckCircle2 className="w-4 h-4 text-violet-400 shrink-0 mt-0.5" />
            <span>
              <strong>3-Hour Live Check-in:</strong> If studying for 3 hours, a push asks <em>&quot;Are you still Studying?&quot;</em> with YES/NO buttons.
            </span>
          </div>
          <div className="flex items-start space-x-2">
            <CheckCircle2 className="w-4 h-4 text-fuchsia-400 shrink-0 mt-0.5" />
            <span>
              <strong>24-Hour Absence Alerts:</strong> Keeps your streak protected if you are absent for 24 hours.
            </span>
          </div>
        </div>

        {!isSupported && (
          <div className="p-3 bg-amber-950/30 border border-amber-800/50 rounded-xl text-xs text-amber-300/90 flex items-start space-x-2">
            <Smartphone className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
            <span>
              On iPhone / iPad: Tap <strong>Share</strong> $\rightarrow$ <strong>Add to Home Screen</strong>, then launch the app from your Home Screen to enable notifications.
            </span>
          </div>
        )}

        {(error || requestError) && (
          <div className="p-3 bg-rose-950/40 border border-rose-800/80 rounded-xl text-xs font-medium text-rose-200 flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{requestError || error}</span>
          </div>
        )}

        {isDenied && (
          <div className="p-3 bg-rose-950/40 border border-rose-800/80 rounded-xl text-xs font-medium text-rose-200 flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>
              Notification permission was denied. Please go to your browser or device site permissions and set notifications to <strong>Allow</strong>.
            </span>
          </div>
        )}

        <div className="flex items-center space-x-3 pt-2">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={loading}
            className="w-1/3 text-xs"
          >
            Cancel
          </Button>

          <Button
            type="button"
            variant="primary"
            onClick={handleEnable}
            isLoading={loading}
            disabled={isDenied || !isSupported}
            className="flex-1 font-extrabold text-xs sm:text-sm space-x-1.5 shadow-md"
          >
            <Sparkles className="w-4 h-4" />
            <span>Enable & Continue</span>
          </Button>
        </div>
      </div>
    </Modal>
  );
}
