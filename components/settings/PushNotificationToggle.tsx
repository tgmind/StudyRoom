"use client";

import React from "react";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { Bell, BellOff, CheckCircle2, AlertCircle, Sparkles, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/Button";

export function PushNotificationToggle() {
  const {
    isSupported,
    permission,
    isSubscribed,
    loading,
    error,
    subscribe,
    unsubscribe,
  } = usePushNotifications();

  const handleToggle = async () => {
    if (isSubscribed) {
      await unsubscribe();
    } else {
      await subscribe();
    }
  };

  if (!isSupported) {
    return (
      <div className="w-full bg-zinc-900/70 border border-zinc-800/90 rounded-2xl p-4 sm:p-5 shadow-xl space-y-3 backdrop-blur-md">
        <div className="flex items-center space-x-3">
          <div className="p-2 sm:p-2.5 rounded-xl bg-zinc-800 text-zinc-400 shrink-0">
            <BellOff className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-xs sm:text-sm font-extrabold text-zinc-300">
              Study Reminders & Check-ins
            </h2>
            <p className="text-[10px] sm:text-xs text-zinc-500 mt-0.5">
              Push notifications are not supported in this browser.
            </p>
          </div>
        </div>
        <div className="p-3 bg-zinc-950/60 border border-zinc-800 rounded-xl text-[11px] text-zinc-400 flex items-start space-x-2">
          <Smartphone className="w-4 h-4 shrink-0 text-violet-400 mt-0.5" />
          <span>
            For iOS users, install StudyRoom to your Home Screen first (tap <strong>Share</strong> $\rightarrow$ <strong>Add to Home Screen</strong>), then open the app to enable notifications.
          </span>
        </div>
      </div>
    );
  }

  const isDenied = permission === "denied";

  return (
    <div className="w-full bg-zinc-900/70 border border-zinc-800/90 rounded-2xl p-4 sm:p-5 shadow-xl space-y-4 backdrop-blur-md">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
        <div className="flex items-center space-x-2.5 sm:space-x-3 min-w-0">
          <div
            className={`p-2 sm:p-2.5 rounded-xl border shrink-0 transition-colors ${
              isSubscribed
                ? "bg-violet-500/10 border-violet-500/25 text-violet-300"
                : "bg-zinc-800/80 border-zinc-700/60 text-zinc-400"
            }`}
          >
            {isSubscribed ? (
              <Bell className="w-4 h-4 sm:w-5 sm:h-5" />
            ) : (
              <BellOff className="w-4 h-4 sm:w-5 sm:h-5" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-xs sm:text-sm font-extrabold text-zinc-100 uppercase tracking-wider">
              Study Reminders
            </h2>
            <p className="text-[10px] sm:text-xs text-zinc-400 mt-0.5">
              Background accountability alerts on Android & iPhone
            </p>
          </div>
        </div>

        {/* Status Pill */}
        <span
          className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border shrink-0 ${
            isSubscribed
              ? "bg-violet-500/15 text-violet-300 border-violet-500/30"
              : isDenied
              ? "bg-rose-500/15 text-rose-300 border-rose-500/30"
              : "bg-amber-500/15 text-amber-300 border-amber-500/30"
          }`}
        >
          {isSubscribed ? "Active" : isDenied ? "Blocked" : "Required"}
        </span>
      </div>

      {/* Feature Bullet Points */}
      <div className="space-y-2 text-xs text-zinc-300/90 pl-1">
        <div className="flex items-start space-x-2">
          <CheckCircle2 className="w-3.5 h-3.5 text-violet-400 shrink-0 mt-0.5" />
          <span>
            <strong>3-Hour Live Check-in:</strong> If studying for 3 hours, a push asks <em>&quot;Are you still Studying?&quot;</em> with <strong>YES</strong> and <strong>NO</strong> buttons. Tapping <strong>NO</strong> safely stops the timer in the database.
          </span>
        </div>
        <div className="flex items-start space-x-2">
          <CheckCircle2 className="w-3.5 h-3.5 text-fuchsia-400 shrink-0 mt-0.5" />
          <span>
            <strong>24-Hour Absence Reminder:</strong> Gentle reminder sent if you have been offline for 24 hours to help keep your streak alive.
          </span>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-rose-950/40 border border-rose-800/80 rounded-xl text-xs font-medium text-rose-200 flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {isDenied && (
        <div className="p-3 bg-amber-950/40 border border-amber-700/80 rounded-xl text-xs font-medium text-amber-200 space-y-1.5">
          <div className="flex items-center space-x-2 text-amber-300 font-bold">
            <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
            <span>Notifications are blocked in your browser</span>
          </div>
          <p className="text-[11px] text-zinc-300">
            To unblock: Tap the <strong>Lock (🔒) icon</strong> in the address bar at the top, switch <strong>Notifications</strong> to <strong>Allow</strong>, then tap the button below.
          </p>
        </div>
      )}

      {/* Action Button or Active Badge */}
      <div className="pt-1">
        {isSubscribed ? (
          <div className="p-3.5 bg-violet-500/10 border border-violet-500/25 rounded-2xl flex items-center space-x-3 text-violet-200">
            <CheckCircle2 className="w-5 h-5 text-violet-400 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-violet-200">
                Mandatory Study Reminders Active
              </p>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Notifications are compulsory for all StudyRoom members to ensure active timer honesty.
              </p>
            </div>
          </div>
        ) : (
          <Button
            type="button"
            variant="primary"
            size="md"
            isLoading={loading}
            onClick={subscribe}
            className="w-full font-extrabold text-xs sm:text-sm space-x-1.5 shadow-md"
          >
            <Sparkles className="w-4 h-4" />
            <span>{isDenied ? "I've Allowed — Verify & Enable" : "Enable Mandatory Reminders"}</span>
          </Button>
        )}
      </div>
    </div>
  );
}
