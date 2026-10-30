"use client";

import React from "react";
import { Sparkles, RefreshCw, X, ShieldCheck, Zap, Loader2, ArrowRight } from "lucide-react";
import { useAppUpdate } from "@/hooks/useAppUpdate";

export function AppUpdateModal() {
  const {
    hasUpdate,
    isRefreshing,
    isDismissed,
    latestBuildId,
    latestBuildTime,
    refreshPlatform,
    dismissUpdate,
    reopenUpdateModal,
  } = useAppUpdate();

  if (!hasUpdate) return null;

  // Render dismissed floating pill if snoozed
  if (isDismissed) {
    return (
      <aside
        aria-label="Platform update ready"
        className="fixed bottom-20 sm:bottom-6 right-3 sm:right-6 z-[99999] animate-fade-in"
      >
        <div className="bg-zinc-950/90 hover:bg-zinc-900 border border-violet-500/40 shadow-xl shadow-violet-500/10 rounded-2xl p-2.5 sm:px-4 sm:py-2.5 backdrop-blur-md flex items-center space-x-3 transition-all duration-200">
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-bold text-zinc-100 hidden sm:inline">
              Update Ready
            </span>
          </div>

          <button
            type="button"
            onClick={reopenUpdateModal}
            className="text-[11px] font-bold text-violet-300 hover:text-violet-200 flex items-center space-x-1 px-2.5 py-1 rounded-xl bg-violet-500/15 border border-violet-500/30 hover:bg-violet-500/25 transition-all"
          >
            <span>Review & Refresh</span>
            <ArrowRight className="w-3 h-3 ml-0.5" />
          </button>

          <button
            type="button"
            onClick={() => refreshPlatform()}
            disabled={isRefreshing}
            className="p-1 text-zinc-400 hover:text-zinc-200 transition-colors"
            title="Refresh immediately"
            aria-label="Refresh immediately"
          >
            {isRefreshing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-400" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </aside>
    );
  }

  // Render beautiful full update window
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="update-modal-title"
      className="fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in"
    >
      <div
        className="w-full max-w-md bg-zinc-950 border border-zinc-800 hover:border-violet-500/30 rounded-3xl shadow-2xl shadow-violet-500/10 overflow-hidden flex flex-col focus:outline-none transition-all duration-300 relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Subtle decorative glowing background gradient */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-24 bg-gradient-to-b from-violet-600/15 via-fuchsia-600/10 to-transparent blur-2xl pointer-events-none" />

        {/* Modal Header */}
        <div className="flex items-start justify-between px-6 pt-6 pb-2 relative">
          <div className="flex items-center space-x-3">
            <div className="p-3 rounded-2xl bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 border border-violet-500/30 text-violet-400 shadow-inner">
              <Sparkles className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[10px] font-mono font-bold tracking-wider text-emerald-400 uppercase bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                  NEW UPDATE PUBLISHED
                </span>
              </div>
              <h2
                id="update-modal-title"
                className="text-lg font-black text-zinc-100 tracking-tight mt-1"
              >
                StudyRoom Updated
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={dismissUpdate}
            disabled={isRefreshing}
            aria-label="Dismiss update modal for now"
            className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 rounded-xl transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center -mr-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="px-6 py-4 space-y-4 relative">
          <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
            A fresh deployment of StudyRoom is now published. Refresh the platform to activate the latest features, speed improvements, and UI enhancements.
          </p>

          {/* Value Props & Safeguards */}
          <div className="space-y-2.5">
            <div className="p-3 rounded-2xl bg-zinc-900/70 border border-zinc-800/80 flex items-start space-x-3">
              <Zap className="w-4 h-4 text-violet-400 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-xs font-bold text-zinc-100">Clean Cache Refresh</h3>
                <p className="text-[11px] text-zinc-400 leading-snug mt-0.5">
                  Evicts outdated JavaScript chunks and loads 100% fresh code from Netlify.
                </p>
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-zinc-900/70 border border-zinc-800/80 flex items-start space-x-3">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-xs font-bold text-zinc-100">Zero Data Loss</h3>
                <p className="text-[11px] text-zinc-400 leading-snug mt-0.5">
                  Your active study sessions, timers, streak, goals, and login remain safe.
                </p>
              </div>
            </div>
          </div>

          {/* Build meta pill */}
          {latestBuildId && (
            <div className="flex items-center justify-between text-[10px] text-zinc-500 font-mono pt-1">
              <span>Deploy Build: {latestBuildId.slice(0, 8)}</span>
              {latestBuildTime && (
                <span>{new Date(latestBuildTime).toLocaleDateString()}</span>
              )}
            </div>
          )}
        </div>

        {/* Modal Actions */}
        <div className="px-6 pb-6 pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={dismissUpdate}
            disabled={isRefreshing}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs font-bold text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 transition-colors order-2 sm:order-1"
          >
            Later
          </button>

          <button
            type="button"
            onClick={() => refreshPlatform()}
            disabled={isRefreshing}
            className="w-full sm:w-auto px-6 py-2.5 rounded-xl text-xs font-extrabold bg-gradient-to-r from-violet-600 via-violet-500 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white shadow-lg shadow-violet-500/25 flex items-center justify-center space-x-2 transition-all transform active:scale-[0.98] order-1 sm:order-2 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isRefreshing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-white" />
                <span>Refreshing Platform...</span>
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4" />
                <span>Refresh Platform</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
