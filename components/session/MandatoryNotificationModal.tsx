"use client";

import React, { useState, useEffect } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import {
  Bell,
  CheckCircle2,
  AlertCircle,
  Smartphone,
  Sparkles,
  RefreshCw,
  Settings,
} from "lucide-react";

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
  const {
    isSupported,
    permission,
    subscribe,
    loading,
    error,
    refreshPermission,
  } = usePushNotifications();
  const [requestError, setRequestError] = useState<string | null>(null);

  const isDenied = permission === "denied";

  // When user returns after unblocking in site settings, clear error
  useEffect(() => {
    if (permission === "granted") {
      setRequestError(null);
    }
  }, [permission]);

  const handleEnable = async () => {
    setRequestError(null);
    refreshPermission();

    const success = await subscribe();
    if (success) {
      onPermissionGranted();
      onClose();
    } else {
      const current = refreshPermission();
      if (current === "denied") {
        setRequestError(
          "Notifications are still marked as Blocked by your phone. Please turn on Allow Notifications in App Info / Phone Settings, then tap here again."
        );
      }
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
        <div className="space-y-2 bg-zinc-950/60 border border-zinc-800/80 rounded-2xl p-3 text-xs text-zinc-300">
          <div className="flex items-start space-x-2">
            <CheckCircle2 className="w-4 h-4 text-violet-400 shrink-0 mt-0.5" />
            <span>
              <strong>3-Hour Live Check-in:</strong> Asks <em>&quot;Are you still Studying?&quot;</em> with YES/NO buttons.
            </span>
          </div>
          <div className="flex items-start space-x-2">
            <CheckCircle2 className="w-4 h-4 text-fuchsia-400 shrink-0 mt-0.5" />
            <span>
              <strong>24-Hour Absence Alerts:</strong> Protects your study streak if offline.
            </span>
          </div>
        </div>

        {/* Actionable Unblock Guide for Phone App Settings if Denied */}
        {isDenied ? (
          <div className="p-3.5 bg-amber-950/40 border border-amber-700/80 rounded-2xl text-xs text-amber-200 space-y-2.5">
            <div className="flex items-center space-x-2 font-extrabold text-amber-300">
              <Settings className="w-4 h-4 shrink-0 text-amber-400" />
              <span>Allow Notifications in Phone App Settings:</span>
            </div>
            <p className="text-[11px] text-zinc-300 leading-snug">
              Android does not re-open the popup once denied. Please enable notifications in your phone&apos;s app settings:
            </p>
            <div className="space-y-2 text-[11px] text-zinc-200 bg-zinc-950/60 p-2.5 rounded-xl border border-zinc-800">
              <div className="flex items-start space-x-2">
                <span className="font-bold text-amber-400 shrink-0">1.</span>
                <span>
                  <strong>Long-press</strong> the <strong>StudyRoom</strong> icon on your phone home screen → tap <strong>App Info (ⓘ)</strong>.
                  <br />
                  <span className="text-[10px] text-zinc-400">
                    (Or open phone <strong>Settings → Apps → StudyRoom</strong>)
                  </span>
                </span>
              </div>
              <div className="flex items-start space-x-2">
                <span className="font-bold text-amber-400 shrink-0">2.</span>
                <span>
                  Tap <strong>Notifications</strong> → Turn <strong>Allow Notifications</strong> to <strong>ON</strong>.
                </span>
              </div>
              <div className="flex items-start space-x-2">
                <span className="font-bold text-amber-400 shrink-0">3.</span>
                <span>
                  Switch back to StudyRoom and tap <strong>&quot;I&apos;ve Allowed — Continue&quot;</strong> below!
                </span>
              </div>
            </div>
          </div>
        ) : null}

        {permission === "granted" && (
          <div className="p-3 bg-emerald-950/40 border border-emerald-700/80 rounded-2xl text-xs text-emerald-200 flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Notification permission granted! Tap below to start studying.</span>
          </div>
        )}

        {!isSupported && (
          <div className="p-3 bg-amber-950/30 border border-amber-800/50 rounded-xl text-xs text-amber-300/90 flex items-start space-x-2">
            <Smartphone className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
            <span>
              On iPhone / iPad: Tap <strong>Share</strong> → <strong>Add to Home Screen</strong>, then launch the app from your Home Screen to enable notifications.
            </span>
          </div>
        )}

        {(error || requestError) && (
          <div className="p-3 bg-rose-950/40 border border-rose-800/80 rounded-xl text-xs font-medium text-rose-200 flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{requestError || error}</span>
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
            disabled={!isSupported}
            className="flex-1 font-extrabold text-xs sm:text-sm space-x-1.5 shadow-md"
          >
            {isDenied ? (
              <>
                <RefreshCw className="w-4 h-4" />
                <span>I&apos;ve Allowed — Continue</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Enable & Continue</span>
              </>
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
