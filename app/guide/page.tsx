"use client";

import React, { Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { TopHeader } from "@/components/navigation/TopHeader";
import { BottomNav } from "@/components/navigation/BottomNav";
import { FeatureGuideCards } from "@/components/guide/FeatureGuideCards";
import { Button } from "@/components/ui/Button";
import { BookOpen, ArrowRight, Sparkles } from "lucide-react";

function GuideContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { profile } = useAuth();
  const isWelcome = searchParams.get("welcome") === "true";

  return (
    <div className="flex-1 flex flex-col min-h-screen pb-24 bg-[#090a0f] text-zinc-100">
      <TopHeader profile={profile} />

      {/* Fluid Screen Container */}
      <main className="flex-1 w-full max-w-2xl sm:max-w-3xl px-3.5 sm:px-6 py-4 mx-auto space-y-4 sm:space-y-5">
        {/* Welcome Header Banner for New Users */}
        {isWelcome && (
          <div className="p-4 sm:p-5 bg-violet-500/10 border border-violet-500/30 rounded-2xl space-y-2.5 text-violet-100 shadow-xl backdrop-blur-md">
            <div className="flex items-center space-x-2">
              <Sparkles className="w-5 h-5 text-violet-400" />
              <h1 className="text-sm sm:text-base font-extrabold text-violet-200">
                Welcome to StudyRoom!
              </h1>
            </div>
            <p className="text-xs text-violet-200/90 leading-relaxed">
              Explore how StudyRoom ensures accountability through timestamp-based timers, rolling 24-hour goals, and consistent leaderboard scoring.
            </p>
            <div className="pt-1">
              <Button
                variant="primary"
                size="md"
                onClick={() => router.push("/room")}
                className="font-extrabold text-xs space-x-2 bg-violet-600 text-white hover:bg-violet-500 shadow-md shadow-violet-600/20"
              >
                <span>Enter Live Study Room</span>
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Hero Header Card */}
        <div className="w-full bg-zinc-900/70 border border-zinc-800/90 rounded-2xl p-4 sm:p-5 shadow-xl space-y-2 backdrop-blur-md">
          <div className="flex items-center space-x-3">
            <div className="p-2 sm:p-2.5 rounded-xl bg-violet-500/10 border border-violet-500/25 text-violet-300 shrink-0">
              <BookOpen className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-sm sm:text-base font-extrabold text-zinc-100 tracking-tight leading-snug">
                App Guide & Feature Handbook
              </h1>
              <p className="text-[10px] sm:text-xs text-zinc-400 mt-0.5 leading-snug">
                Learn feature mechanics, step-by-step usage, and scoring formulas
              </p>
            </div>
          </div>
        </div>

        {/* Feature Breakdown & How-To-Use Cards */}
        <FeatureGuideCards />

        {/* Enter Live Room Footer Action */}
        <div className="pt-2">
          <Button
            variant="primary"
            size="lg"
            onClick={() => router.push("/room")}
            className="w-full space-x-2 font-extrabold text-xs sm:text-sm py-3.5 shadow-md"
          >
            <span>Enter Live Study Room</span>
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </main>

      <BottomNav />
    </div>
  );
}

export default function GuidePage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center text-xs text-zinc-500">
          Loading Guide...
        </div>
      }
    >
      <GuideContent />
    </Suspense>
  );
}
