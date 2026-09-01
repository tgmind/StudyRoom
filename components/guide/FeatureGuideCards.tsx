"use client";

import React, { useState } from "react";
import {
  Clock,
  Target,
  CheckCircle2,
  Trophy,
  Flame,
  Moon,
  Sun,
  History,
  Smartphone,
  ShieldCheck,
  Play,
  Pause,
  Square,
  Sparkles,
  HelpCircle,
  Award,
} from "lucide-react";

export function FeatureGuideCards() {
  const [activeTab, setActiveTab] = useState<"how-to-use" | "features" | "scoring">("how-to-use");

  const steps = [
    {
      stepNumber: "01",
      icon: Target,
      title: "Set Your 24-Hour Goals",
      subtitle: "Add tasks to lock in your daily focus",
      description:
        "Navigate to the Goals tab and create your 24-hour goal window. Add 1 to 10 actionable tasks. Once created, your window runs for exactly 24 hours. You can append more goals anytime, but goals cannot be deleted to enforce real discipline.",
      badge: "Step 1",
      badgeColor: "bg-emerald-500/10 text-emerald-300 border-emerald-500/25",
    },
    {
      stepNumber: "02",
      icon: Play,
      title: "Start Live Study in Room",
      subtitle: "Authoritative tracking begins",
      description:
        "Head to the Room tab and tap 'Start Studying'. Your timer immediately begins tracking your focus time and your status is broadcast live to all peer study members in the room.",
      badge: "Step 2",
      badgeColor: "bg-teal-500/10 text-teal-300 border-teal-500/25",
    },
    {
      stepNumber: "03",
      icon: Pause,
      title: "Pause for Breaks & Resume",
      subtitle: "Screen locks never lose your time",
      description:
        "Need coffee or rest? Tap 'Pause'. Your study timer freezes precisely. When you tap 'Resume', study timing continues. Even if you close your browser or lock your phone, your accurate study time is safely preserved via authoritative server timestamps.",
      badge: "Step 3",
      badgeColor: "bg-amber-500/10 text-amber-300 border-amber-500/25",
    },
    {
      stepNumber: "04",
      icon: Square,
      title: "Stop & Check Off Completed Goals",
      subtitle: "The Atomic Stop Hook records your wins",
      description:
        "When finished, tap 'Stop'. A checklist modal will ask which 24-hour goals you accomplished during this session. Check them off, and your session duration, completed tasks, and score points will be permanently saved to your History and Leaderboard.",
      badge: "Step 4",
      badgeColor: "bg-violet-500/10 text-violet-300 border-violet-500/25",
    },
  ];

  const features = [
    {
      icon: Clock,
      title: "Authoritative Timestamp Timers",
      subtitle: "Zero clock drift or timer loss",
      description:
        "StudyRoom calculates active study duration from authoritative PostgreSQL timestamps. It never relies on fragile browser interval ticks. Pauses and breaks are excluded from your study total with microsecond precision.",
      accent: "border-teal-500/20 bg-teal-500/5 text-teal-300",
      pill: "Authoritative Sync",
    },
    {
      icon: Target,
      title: "Rolling 24-Hour Goal Windows",
      subtitle: "Personal 24h accountability cycles",
      description:
        "Goal windows run for exactly 24 hours from creation rather than resetting at midnight. You can append new goals at any time, but tasks cannot be deleted—uncompleted goals count towards your weekly completion rate.",
      accent: "border-emerald-500/20 bg-emerald-500/5 text-emerald-300",
      pill: "High Accountability",
    },
    {
      icon: CheckCircle2,
      title: "The Atomic Stop Hook",
      subtitle: "Instant task verification",
      description:
        "Stopping a session triggers a completion modal where you verify tasks finished in that block. This executes an atomic transaction that archives the study session and increments your leaderboard goal stats in one step.",
      accent: "border-violet-500/20 bg-violet-500/5 text-violet-300",
      pill: "Atomic Storage",
    },
    {
      icon: History,
      title: "Study History & 3-Month Retention",
      subtitle: "Detailed log of sessions and tasks",
      description:
        "Review all past study sessions, start/end timestamps, duration, and completed goals in the History tab. History automatically prunes records older than 90 days, or you can clear it anytime.",
      accent: "border-amber-500/20 bg-amber-500/5 text-amber-300",
      pill: "Auto Pruned (90d)",
    },
    {
      icon: Moon,
      title: "Deep Night 🌙 & Early Bird ☀️ Badges",
      subtitle: "Automatic time-of-day recognition",
      description:
        "Study sessions between 00:00–05:00 UTC display the Deep Night 🌙 tag on your avatar card. Sessions between 05:00–08:00 UTC display the Early Bird ☀️ tag to reward night owls and early risers.",
      accent: "border-indigo-500/20 bg-indigo-500/5 text-indigo-300",
      pill: "Time Badges",
    },
    {
      icon: Smartphone,
      title: "Mobile PWA & Tactile Haptics",
      subtitle: "Installable distraction-free app",
      description:
        "Install StudyRoom directly to your iOS or Android home screen. Includes built-in tactile haptic feedback for button clicks, session toggles, and task completions.",
      accent: "border-rose-500/20 bg-rose-500/5 text-rose-300",
      pill: "PWA Experience",
    },
  ];

  return (
    <div className="space-y-5">
      {/* Navigation Tabs */}
      <div className="flex items-center p-1 bg-zinc-900/80 border border-zinc-800 rounded-2xl gap-1">
        <button
          type="button"
          onClick={() => setActiveTab("how-to-use")}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-extrabold transition-all touch-manipulation flex items-center justify-center space-x-1.5 ${
            activeTab === "how-to-use"
              ? "bg-violet-500/15 text-violet-200 border border-violet-500/30 shadow-sm"
              : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <HelpCircle className="w-3.5 h-3.5" />
          <span>How to Use</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("features")}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-extrabold transition-all touch-manipulation flex items-center justify-center space-x-1.5 ${
            activeTab === "features"
              ? "bg-emerald-500/15 text-emerald-200 border border-emerald-500/30 shadow-sm"
              : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Features</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("scoring")}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-extrabold transition-all touch-manipulation flex items-center justify-center space-x-1.5 ${
            activeTab === "scoring"
              ? "bg-amber-500/15 text-amber-200 border border-amber-500/30 shadow-sm"
              : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <Trophy className="w-3.5 h-3.5" />
          <span>50/30/20 Scoring</span>
        </button>
      </div>

      {/* Tab 1: How to Use the App (Step-by-Step) */}
      {activeTab === "how-to-use" && (
        <div className="space-y-4">
          <div className="p-4 bg-zinc-900/60 border border-zinc-800 rounded-2xl space-y-1">
            <h2 className="text-sm font-extrabold text-zinc-100 flex items-center space-x-2">
              <span>🚀 4-Step Quick Start Workflow</span>
            </h2>
            <p className="text-xs text-zinc-400">
              StudyRoom is built for frictionless focus and high accountability. Here is how your daily study cycle works:
            </p>
          </div>

          <div className="space-y-3">
            {steps.map((s, idx) => {
              const Icon = s.icon;
              return (
                <div
                  key={idx}
                  className="p-4 sm:p-5 bg-zinc-900/70 border border-zinc-800/90 rounded-2xl space-y-2.5 shadow-sm relative overflow-hidden backdrop-blur-md"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2.5">
                      <span className="font-mono text-xs font-black text-zinc-500 px-2 py-0.5 rounded-md bg-zinc-950 border border-zinc-800">
                        {s.stepNumber}
                      </span>
                      <h3 className="text-sm font-extrabold text-zinc-100">{s.title}</h3>
                    </div>

                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${s.badgeColor}`}
                    >
                      {s.badge}
                    </span>
                  </div>

                  <p className="text-xs font-semibold text-zinc-300 flex items-center space-x-1.5">
                    <Icon className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                    <span>{s.subtitle}</span>
                  </p>

                  <p className="text-xs text-zinc-400/90 leading-relaxed">{s.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab 2: Feature Breakdown */}
      {activeTab === "features" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {features.map((f, idx) => {
            const Icon = f.icon;
            return (
              <div
                key={idx}
                className={`p-4 sm:p-5 rounded-2xl border ${f.accent} space-y-2.5 flex flex-col justify-between shadow-sm backdrop-blur-md`}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="p-2 rounded-xl bg-zinc-950/80 border border-zinc-800/90 text-zinc-100">
                      <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
                    </div>
                    <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-zinc-950/90 border border-zinc-800 text-zinc-300">
                      {f.pill}
                    </span>
                  </div>

                  <h3 className="text-sm font-extrabold text-zinc-100">{f.title}</h3>
                  <p className="text-[11px] font-semibold text-zinc-300">{f.subtitle}</p>
                  <p className="text-xs text-zinc-400 leading-relaxed">{f.description}</p>
                </div>

                <div className="pt-2 border-t border-zinc-800/60 flex items-center space-x-1.5 text-[10px] text-zinc-500 font-medium">
                  <ShieldCheck className="w-3 h-3 text-zinc-400" />
                  <span>Authoritative PWA Feature</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Tab 3: Transparent 50/30/20 Scoring Rules */}
      {activeTab === "scoring" && (
        <div className="space-y-4">
          <div className="p-4 sm:p-5 bg-zinc-900/70 border border-zinc-800/90 rounded-2xl space-y-3 backdrop-blur-md">
            <div className="flex items-center space-x-2.5">
              <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-300">
                <Trophy className="w-5 h-5 fill-amber-400 text-amber-400" />
              </div>
              <div>
                <h2 className="text-sm font-extrabold text-zinc-100">
                  100-Point Normalized Ranking Algorithm
                </h2>
                <p className="text-[11px] text-zinc-400">
                  Fair, transparent, and balanced across study duration, goal execution, and consistency.
                </p>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              {/* 50 Points: Study Hours */}
              <div className="p-3.5 rounded-xl bg-zinc-950/60 border border-teal-500/20 space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Clock className="w-4 h-4 text-teal-300" />
                    <span className="text-xs font-bold text-zinc-200">
                      50 Points: Active Study Duration
                    </span>
                  </div>
                  <span className="font-mono text-xs font-black text-teal-300 px-2 py-0.5 rounded-full bg-teal-500/10 border border-teal-500/30">
                    50% Weight
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400 leading-snug">
                  Calculated relative to the top performer in the group:
                  <code className="block mt-1 font-mono text-[10px] text-teal-200 bg-zinc-900/90 p-1.5 rounded border border-zinc-800">
                    Score = (Your Weekly Minutes / Top Peer Weekly Minutes) × 50
                  </code>
                </p>
              </div>

              {/* 30 Points: Goal Completion */}
              <div className="p-3.5 rounded-xl bg-zinc-950/60 border border-emerald-500/20 space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                    <span className="text-xs font-bold text-zinc-200">
                      30 Points: 24h Goal Completion Rate
                    </span>
                  </div>
                  <span className="font-mono text-xs font-black text-emerald-300 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30">
                    30% Weight
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400 leading-snug">
                  Percentage of locked 24-hour goals successfully checked off:
                  <code className="block mt-1 font-mono text-[10px] text-emerald-200 bg-zinc-900/90 p-1.5 rounded border border-zinc-800">
                    Score = (Completed Goals / Total Locked Goals) × 30
                  </code>
                </p>
              </div>

              {/* 20 Points: Consistency Streak */}
              <div className="p-3.5 rounded-xl bg-zinc-950/60 border border-amber-500/20 space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Flame className="w-4 h-4 text-amber-300" />
                    <span className="text-xs font-bold text-zinc-200">
                      20 Points: Consistency Streak
                    </span>
                  </div>
                  <span className="font-mono text-xs font-black text-amber-300 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30">
                    20% Weight
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400 leading-snug">
                  Consecutive days with at least 30 active study minutes:
                  <code className="block mt-1 font-mono text-[10px] text-amber-200 bg-zinc-900/90 p-1.5 rounded border border-zinc-800">
                    Score = min(20, (Consecutive Study Days / 7) × 20)
                  </code>
                </p>
              </div>
            </div>
          </div>

          {/* Weekly Achiever Badge Card */}
          <div className="p-4 bg-amber-500/10 border border-amber-500/25 rounded-2xl flex items-center space-x-3.5">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-300 shrink-0">
              <Award className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h3 className="text-xs font-black uppercase tracking-wider text-amber-200">
                Weekly Achiever Award ⭐
              </h3>
              <p className="text-[11px] text-amber-200/80 mt-0.5 leading-snug">
                Every Monday at 00:00 UTC, the #1 ranked member is automatically awarded the Weekly Achiever badge, displaying a glowing crown across all live rooms and leaderboards.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
