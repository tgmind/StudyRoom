"use client";

import React from "react";
import { WifiOff } from "lucide-react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

export function OfflineBanner() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="w-full bg-amber-950/80 border-b border-amber-800 text-amber-200 px-4 py-2 text-xs font-medium flex items-center justify-center space-x-2">
      <WifiOff className="w-4 h-4 shrink-0" />
      <span>
        You are currently offline. Realtime sync is paused until connectivity returns.
      </span>
    </div>
  );
}
