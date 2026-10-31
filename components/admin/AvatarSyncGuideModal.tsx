"use client";

import React, { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import {
  HelpCircle,
  Copy,
  Check,
  Terminal,
  DownloadCloud,
  Database,
  HardDrive,
  RefreshCw,
  Sparkles,
  ShieldAlert,
  ArrowRight,
} from "lucide-react";

interface AvatarSyncGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  pendingCloudCount?: number;
  onTriggerSync?: () => void;
  isSyncing?: boolean;
}

function CopyableCodeBlock({ command, label }: { command: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // fallback
    }
  };

  return (
    <div className="space-y-1">
      {label && (
        <span className="text-[11px] font-semibold text-zinc-400 block">{label}</span>
      )}
      <div className="relative flex items-center justify-between p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 font-mono text-xs text-zinc-200 group">
        <div className="flex items-center space-x-2 min-w-0 pr-2 overflow-x-auto">
          <span className="text-violet-400 select-none font-bold">$</span>
          <span className="truncate">{command}</span>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className={`px-2.5 py-1 rounded-lg text-[11px] font-sans font-bold flex items-center space-x-1.5 transition-all shrink-0 cursor-pointer ${
            copied
              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
              : "bg-zinc-850 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-700/60"
          }`}
          title="Copy command to clipboard"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span>Copied!</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-200" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}

export function AvatarSyncGuideModal({
  isOpen,
  onClose,
  pendingCloudCount = 0,
  onTriggerSync,
  isSyncing = false,
}: AvatarSyncGuideModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Avatar Cloud Sync & Recovery Handbook"
      subtitle="How cloud-to-local synchronization works and how to rebuild from scratch"
      maxWidth="2xl"
    >
      <div className="space-y-4 text-xs text-zinc-300 leading-relaxed max-h-[75vh] overflow-y-auto pr-1">
        {/* Intro Banner */}
        <div className="p-3.5 rounded-2xl bg-gradient-to-r from-violet-500/15 via-purple-500/10 to-zinc-900/80 border border-violet-500/25 flex items-start space-x-3 shadow-sm">
          <div className="p-2 rounded-xl bg-violet-500/20 text-violet-300 shrink-0 mt-0.5">
            <DownloadCloud className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="space-y-1">
            <h3 className="font-extrabold text-xs sm:text-sm text-violet-200">
              Why Sync from Cloud to Local?
            </h3>
            <p className="text-zinc-400 text-[11px] leading-relaxed">
              When administrators upload or replace an avatar at runtime, it is temporarily stored in Supabase Storage. Syncing downloads those optimized WebP images into your repository&apos;s <code className="text-violet-300 font-mono bg-violet-950/60 px-1 py-0.5 rounded">public/avatars/optimized/</code> directory for <strong>0ms local CDN speed</strong>, <strong>offline PWA support</strong>, and <strong>100% cloud storage cleanup</strong>.
            </p>
          </div>
        </div>

        {/* Pending Sync Alert */}
        {pendingCloudCount > 0 && (
          <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-3">
            <div className="flex items-center space-x-2.5 min-w-0">
              <span className="relative flex h-2.5 w-2.5 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-400" />
              </span>
              <span className="text-xs font-bold text-amber-200 truncate">
                {pendingCloudCount} avatar{pendingCloudCount > 1 ? "s" : ""} waiting in Supabase Storage
              </span>
            </div>
            {onTriggerSync && (
              <button
                type="button"
                onClick={onTriggerSync}
                disabled={isSyncing}
                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-zinc-950 transition-all shrink-0 cursor-pointer shadow-md"
              >
                {isSyncing ? "Syncing..." : "Sync Now"}
              </button>
            )}
          </div>
        )}

        {/* Section 1: The 1-Click Sync Process */}
        <div className="p-4 bg-zinc-900/80 border border-zinc-800 rounded-2xl space-y-3 shadow-sm">
          <div className="flex items-center space-x-2.5 text-zinc-100 font-bold text-xs sm:text-sm">
            <div className="p-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 shrink-0">
              <RefreshCw className="w-4 h-4" />
            </div>
            <h4>1. Everyday Synchronization (Two Ways)</h4>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-800/80 space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-violet-400 block">
                Method A: From This Portal
              </span>
              <p className="text-[11px] text-zinc-400 leading-normal">
                Simply click the <strong className="text-zinc-200">Sync to Local</strong> button on the top toolbar. It downloads all avatars and cleans up Supabase storage in one click.
              </p>
            </div>

            <div className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-800/80 space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 block">
                Method B: From Terminal
              </span>
              <p className="text-[11px] text-zinc-400 leading-normal">
                Whenever you want to pull down cloud avatars from your command line, run:
              </p>
              <CopyableCodeBlock command="npm run avatars:sync" />
            </div>
          </div>
        </div>

        {/* Section 2: Complete Project Disaster Recovery Guide */}
        <div className="p-4 bg-zinc-900/80 border border-violet-500/25 rounded-2xl space-y-3.5 shadow-md">
          <div className="flex items-center space-x-2.5 text-zinc-100 font-bold text-xs sm:text-sm">
            <div className="p-1.5 rounded-lg bg-violet-500/15 border border-violet-500/30 text-violet-400 shrink-0">
              <Terminal className="w-4 h-4" />
            </div>
            <h4>2. Disaster Recovery: If the Project is Ever Deleted</h4>
          </div>

          <p className="text-[11px] text-zinc-400">
            If you delete the project directory or set up StudyRoom on a new machine, follow these 4 simple steps to restore everything:
          </p>

          <div className="space-y-3">
            {/* Step 1 */}
            <div className="p-3 rounded-xl bg-zinc-950/70 border border-zinc-800/80 space-y-2">
              <div className="flex items-center space-x-2">
                <span className="w-5 h-5 rounded-full bg-violet-500/20 text-violet-300 font-bold text-[10px] flex items-center justify-center border border-violet-500/40">
                  1
                </span>
                <span className="text-xs font-bold text-zinc-200">Install Project Dependencies</span>
              </div>
              <CopyableCodeBlock command="npm install" />
            </div>

            {/* Step 2 */}
            <div className="p-3 rounded-xl bg-zinc-950/70 border border-zinc-800/80 space-y-2">
              <div className="flex items-center space-x-2">
                <span className="w-5 h-5 rounded-full bg-violet-500/20 text-violet-300 font-bold text-[10px] flex items-center justify-center border border-violet-500/40">
                  2
                </span>
                <span className="text-xs font-bold text-zinc-200">Verify Supabase Keys in .env.local</span>
              </div>
              <p className="text-[11px] text-zinc-400">
                Ensure your <code className="text-zinc-300 font-mono">.env.local</code> has the database connection credentials:
              </p>
              <div className="p-2 rounded-lg bg-zinc-950 border border-zinc-800/80 font-mono text-[11px] text-zinc-400 space-y-1">
                <div>NEXT_PUBLIC_SUPABASE_URL=https://&lt;your-project&gt;.supabase.co</div>
                <div>SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...</div>
              </div>
            </div>

            {/* Step 3 */}
            <div className="p-3 rounded-xl bg-zinc-950/70 border border-zinc-800/80 space-y-2">
              <div className="flex items-center space-x-2">
                <span className="w-5 h-5 rounded-full bg-violet-500/20 text-violet-300 font-bold text-[10px] flex items-center justify-center border border-violet-500/40">
                  3
                </span>
                <span className="text-xs font-bold text-zinc-200">Synchronize All Cloud Avatars & Rebuild Manifests</span>
              </div>
              <p className="text-[11px] text-zinc-400">
                Run the authoritative sync script. It reads your database, regenerates <code className="text-violet-300 font-mono">manifest.json</code> and <code className="text-violet-300 font-mono">manifest.ts</code>, and copies any cloud-uploaded WebPs:
              </p>
              <CopyableCodeBlock command="npm run avatars:sync" />
            </div>

            {/* Step 4 */}
            <div className="p-3 rounded-xl bg-zinc-950/70 border border-zinc-800/80 space-y-2">
              <div className="flex items-center space-x-2">
                <span className="w-5 h-5 rounded-full bg-violet-500/20 text-violet-300 font-bold text-[10px] flex items-center justify-center border border-violet-500/40">
                  4
                </span>
                <span className="text-xs font-bold text-zinc-200">Start Development or Run Production Build</span>
              </div>
              <CopyableCodeBlock command="npm run dev" label="For development server:" />
              <CopyableCodeBlock command="npm run build" label="For production verification:" />
            </div>
          </div>
        </div>

        {/* Section 3: Summary of Guarantees */}
        <div className="p-3.5 rounded-2xl bg-zinc-900/60 border border-zinc-800 text-[11px] text-zinc-400 space-y-1.5">
          <div className="font-bold text-zinc-200 flex items-center space-x-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Automatic Protections in Place:</span>
          </div>
          <ul className="list-disc list-inside space-y-1 pl-1">
            <li><strong>0ms Browser Rendering:</strong> Bundled WebP images load instantly from phone memory without Supabase latency.</li>
            <li><strong>Zero Storage Bloat:</strong> After syncing, Supabase Storage is wiped 100% clean so you never hit storage fees.</li>
            <li><strong>PWA Offline Safe:</strong> Users retain full offline avatar visibility even during network drops.</li>
          </ul>
        </div>

        {/* Footer */}
        <div className="pt-2 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors cursor-pointer"
          >
            Got it, Close Guide
          </button>
        </div>
      </div>
    </Modal>
  );
}
