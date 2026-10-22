"use client";

import React, { memo } from "react";
import { DesktopSidebar } from "@/components/navigation/DesktopSidebar";
import { UserProfile } from "@/lib/supabase/types";

interface DesktopAppLayoutProps {
  children: React.ReactNode;
  profile?: UserProfile | null;
  memberCount?: number;
  expectedPeakHours?: string | null;
  isRealtimeConnected?: boolean;
  connectionState?: "connecting" | "connected" | "reconnecting" | "offline";
}

export const DesktopAppLayout = memo(function DesktopAppLayout({
  children,
  memberCount,
  expectedPeakHours,
  isRealtimeConnected = true,
  connectionState,
}: DesktopAppLayoutProps) {
  const isReconnecting = connectionState === "reconnecting";
  const isConnecting = connectionState === "connecting";
  const isOffline = connectionState === "offline" || (!connectionState && !isRealtimeConnected);
  const isConnected = connectionState === "connected" || (isRealtimeConnected && !isReconnecting && !isConnecting && !isOffline);

  return (
    <div className="min-h-screen flex bg-[#090a0f] text-zinc-100 selection:bg-zinc-800 selection:text-zinc-100">
      {/* Persistent Left Sidebar */}
      <DesktopSidebar />

      {/* Main Content Workspace taking entire visible display width */}
      <div className="flex-1 flex flex-col min-w-0 lg:pl-64 xl:pl-72">
        {/* Persistent Desktop Utility Bar for Realtime Connectivity & Peaks */}
        <header
          role="banner"
          aria-label="Desktop Utility Bar"
          className="h-12 px-6 lg:px-8 xl:px-12 border-b border-zinc-800/60 bg-zinc-950/60 backdrop-blur-md flex items-center justify-between text-xs shrink-0 select-none"
        >
          <div className="flex items-center space-x-3">
            {memberCount !== undefined ? (
              <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-[11px] font-bold text-zinc-300">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isReconnecting
                      ? "bg-amber-400 animate-pulse"
                      : isConnecting
                      ? "bg-cyan-400 animate-pulse"
                      : isConnected
                      ? "bg-fuchsia-500 animate-pulse"
                      : "bg-zinc-600"
                  }`}
                />
                <span>
                  {memberCount} {memberCount === 1 ? "peer in room" : "peers in room"}
                  {isReconnecting && " (reconnecting...)"}
                </span>
              </div>
            ) : (
              <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-zinc-900/80 border border-zinc-800 text-[11px] font-medium text-zinc-400">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isReconnecting
                      ? "bg-amber-400 animate-pulse"
                      : isConnecting
                      ? "bg-cyan-400 animate-pulse"
                      : isConnected
                      ? "bg-emerald-400 animate-pulse"
                      : "bg-zinc-600"
                  }`}
                />
                <span>
                  {isReconnecting
                    ? "Reconnecting to live sync..."
                    : isConnecting
                    ? "Connecting to live sync..."
                    : isConnected
                    ? "Live Cloud Sync Active"
                    : "Offline Mode"}
                </span>
              </div>
            )}

            {expectedPeakHours && (
              <div className="hidden sm:flex items-center space-x-1.5 text-zinc-400 text-[11px] font-medium">
                <span className="w-1 h-1 rounded-full bg-zinc-600" />
                <span>
                  Expected peak: <strong className="text-zinc-200">{expectedPeakHours}</strong>
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center space-x-2 text-[11px] text-zinc-400 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>StudyRoom Pro Desktop</span>
          </div>
        </header>

        {/* Fluid Desktop Viewport */}
        <div className="flex-1 w-full">
          {children}
        </div>
      </div>
    </div>
  );
});
