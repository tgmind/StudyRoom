"use client";

import React, { memo } from "react";
import { DesktopAppLayout } from "./DesktopAppLayout";
import { FeatureGuideCards } from "@/components/guide/FeatureGuideCards";
import { Button } from "@/components/ui/Button";
import { BookOpen, ArrowRight, Sparkles } from "lucide-react";
import { UserProfile } from "@/lib/supabase/types";

export interface DesktopGuideViewProps {
  profile: UserProfile | null;
  isWelcome: boolean;
  onEnterRoom: () => void;
}

export const DesktopGuideView = memo(function DesktopGuideView({
  profile,
  isWelcome,
  onEnterRoom,
}: DesktopGuideViewProps) {
  return (
    <DesktopAppLayout profile={profile}>
      <main className="w-full px-6 lg:px-8 xl:px-12 py-6 space-y-6">
        {/* Welcome Header Banner for New Users */}
        {isWelcome && (
          <div className="p-6 bg-violet-500/10 border border-violet-500/30 rounded-3xl space-y-3 text-violet-100 shadow-xl backdrop-blur-md">
            <div className="flex items-center space-x-2.5">
              <Sparkles className="w-5 h-5 text-violet-400" />
              <h1 className="text-base font-extrabold text-violet-200">
                Welcome to StudyRoom Desktop!
              </h1>
            </div>
            <p className="text-xs text-violet-200/90 leading-relaxed max-w-2xl">
              Explore how StudyRoom ensures accountability through timestamp-based timers, rolling 20-hour goals, and consistent leaderboard scoring.
            </p>
            <div className="pt-1">
              <Button
                variant="primary"
                size="md"
                onClick={onEnterRoom}
                className="font-extrabold text-xs space-x-2 bg-violet-600 text-white hover:bg-violet-500 shadow-md shadow-violet-600/20"
              >
                <span>Enter Live Study Room</span>
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Desktop Header */}
        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="p-2.5 rounded-xl bg-violet-500/10 border border-violet-500/25 text-violet-300 shrink-0 shadow-inner">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-black text-zinc-100 tracking-tight">
                App Guide & Feature Handbook
              </h1>
              <p className="text-xs text-zinc-400">
                Comprehensive guide to StudyRoom features, 50/30/20 dual-pillar scoring, and study sessions
              </p>
            </div>
          </div>

          <Button
            variant="primary"
            size="md"
            onClick={onEnterRoom}
            className="space-x-2 font-bold text-xs shadow-md"
          >
            <span>Enter Study Room</span>
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>

        {/* Feature Breakdown & How-To-Use Cards (Full Width) */}
        <div className="w-full">
          <FeatureGuideCards />
        </div>
      </main>
    </DesktopAppLayout>
  );
});
