"use client";

import React, { useState } from "react";
import {
  Clock,
  Target,
  CheckCircle2,
  Trophy,
  Flame,
  Moon,
  Smartphone,
  ShieldCheck,
  Play,
  Coffee,
  Sparkles,
  HelpCircle,
  Award,
  Calculator,
  Equal,
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
      accent: "violet",
      badgeColor: "bg-violet-500/10 text-violet-300 border-violet-500/30",
      iconColor: "text-violet-300 bg-violet-500/10 border-violet-500/25",
    },
    {
      stepNumber: "02",
      icon: Play,
      title: "Start Live Study in Room",
      subtitle: "Authoritative tracking begins",
      description:
        "Head to the Room tab and tap 'Start Studying'. Your timer immediately begins tracking your focus time and your status is broadcast live to all peer study members in the room.",
      badge: "Step 2",
      accent: "fuchsia",
      badgeColor: "bg-fuchsia-500/10 text-fuchsia-300 border-fuchsia-500/30",
      iconColor: "text-fuchsia-300 bg-fuchsia-500/10 border-fuchsia-500/25",
    },
    {
      stepNumber: "03",
      icon: Coffee,
      title: "Pause for Breaks & Resume",
      subtitle: "Screen locks never lose your time (1h max break)",
      description:
        "Need coffee or rest? Tap 'Pause'. Your study timer freezes precisely. When you tap 'Resume', study timing continues. Note: Breaks are capped at 1 hour max—if a break exceeds 1 hour, your session automatically stops and all study time before the break is safely preserved.",
      badge: "Step 3",
      accent: "amber",
      badgeColor: "bg-amber-500/10 text-amber-300 border-amber-500/30",
      iconColor: "text-amber-300 bg-amber-500/10 border-amber-500/25",
    },
    {
      stepNumber: "04",
      icon: CheckCircle2,
      title: "Stop & Check Off Completed Goals",
      subtitle: "The Atomic Stop Hook records your wins",
      description:
        "When finished, tap 'Stop'. A checklist modal will ask which 24-hour goals you accomplished during this session. Check them off, and your session duration, completed tasks, and score points will be permanently saved to your History and Leaderboard.",
      badge: "Step 4",
      accent: "violet",
      badgeColor: "bg-violet-500/10 text-violet-300 border-violet-500/30",
      iconColor: "text-violet-300 bg-violet-500/10 border-violet-500/25",
    },
  ];

  const features = [
    {
      icon: Clock,
      title: "Authoritative Timestamp Timers",
      subtitle: "Zero clock drift or timer loss",
      description:
        "StudyRoom calculates active study duration from authoritative PostgreSQL timestamps. It never relies on fragile browser interval ticks. Pauses and breaks are excluded from your study total with microsecond precision.",
      accent: "border-violet-500/25 bg-zinc-900/80 text-violet-300",
      pill: "Authoritative Sync",
      pillBg: "bg-violet-500/10 text-violet-300 border-violet-500/30",
    },
    {
      icon: Target,
      title: "Rolling 24-Hour Goal Windows",
      subtitle: "Personal 24h accountability cycles",
      description:
        "Goal windows run for exactly 24 hours from creation rather than resetting at midnight. You can append new goals at any time, but tasks cannot be deleted—uncompleted goals count towards your weekly completion rate.",
      accent: "border-fuchsia-500/25 bg-zinc-900/80 text-fuchsia-300",
      pill: "High Accountability",
      pillBg: "bg-fuchsia-500/10 text-fuchsia-300 border-fuchsia-500/30",
    },
    {
      icon: CheckCircle2,
      title: "The Atomic Stop Hook",
      subtitle: "Instant task verification",
      description:
        "Stopping a session triggers a completion modal where you verify tasks finished in that block. This executes an atomic transaction that archives the study session and increments your leaderboard goal stats in one step.",
      accent: "border-violet-500/25 bg-zinc-900/80 text-violet-300",
      pill: "Atomic Storage",
      pillBg: "bg-violet-500/10 text-violet-300 border-violet-500/30",
    },
    {
      icon: Flame,
      title: "Study History & 3-Month Retention",
      subtitle: "Detailed log of sessions and tasks",
      description:
        "Review all past study sessions, start/end timestamps, duration, and completed goals in the History tab. History automatically prunes records older than 90 days, or you can clear it anytime.",
      accent: "border-amber-500/25 bg-zinc-900/80 text-amber-300",
      pill: "Auto Pruned (90d)",
      pillBg: "bg-amber-500/10 text-amber-300 border-amber-500/30",
    },
    {
      icon: Moon,
      title: "Deep Night 🌙 & Early Bird ☀️ Badges",
      subtitle: "Automatic time-of-day recognition",
      description:
        "Study sessions between 00:00–04:00 (Asia/Kolkata) display the Deep Night 🌙 tag on your avatar card. Sessions between 04:00–07:00 display the Early Bird ☀️ tag to reward night owls and early risers.",
      accent: "border-indigo-500/25 bg-zinc-900/80 text-indigo-300",
      pill: "Time Badges",
      pillBg: "bg-indigo-500/10 text-indigo-300 border-indigo-500/30",
    },
    {
      icon: Smartphone,
      title: "Mobile PWA & Tactile Haptics",
      subtitle: "Installable distraction-free app",
      description:
        "Install StudyRoom directly to your iOS or Android home screen. Includes built-in tactile haptic feedback for button clicks, session toggles, and task completions.",
      accent: "border-rose-500/25 bg-zinc-900/80 text-rose-300",
      pill: "PWA Experience",
      pillBg: "bg-rose-500/10 text-rose-300 border-rose-500/30",
    },
  ];

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Dynamic Responsive Tab Bar */}
      <div className="grid grid-cols-3 p-1.5 bg-zinc-900/90 border border-zinc-800 rounded-2xl gap-1 sm:gap-1.5 backdrop-blur-md shadow-lg">
        <button
          type="button"
          onClick={() => setActiveTab("how-to-use")}
          className={`py-2 px-1 sm:px-3 rounded-xl text-xs font-black transition-all touch-manipulation flex items-center justify-center space-x-1 sm:space-x-1.5 whitespace-nowrap ${
            activeTab === "how-to-use"
              ? "bg-violet-500/15 text-violet-200 border border-violet-500/35 shadow-sm"
              : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40"
          }`}
        >
          <HelpCircle className="w-3.5 h-3.5 shrink-0" />
          <span>How to Use</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("features")}
          className={`py-2 px-1 sm:px-3 rounded-xl text-xs font-black transition-all touch-manipulation flex items-center justify-center space-x-1 sm:space-x-1.5 whitespace-nowrap ${
            activeTab === "features"
              ? "bg-fuchsia-500/15 text-fuchsia-200 border border-fuchsia-500/35 shadow-sm"
              : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40"
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 shrink-0" />
          <span>Features</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("scoring")}
          className={`py-2 px-1 sm:px-3 rounded-xl text-xs font-black transition-all touch-manipulation flex items-center justify-center space-x-1 sm:space-x-1.5 whitespace-nowrap ${
            activeTab === "scoring"
              ? "bg-amber-500/15 text-amber-200 border border-amber-500/35 shadow-sm"
              : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40"
          }`}
        >
          <Trophy className="w-3.5 h-3.5 shrink-0" />
          <span>Scoring</span>
        </button>
      </div>

      {/* Tab 1: How to Use the App (Step-by-Step) */}
      {activeTab === "how-to-use" && (
        <div className="space-y-3.5">
          <div className="p-4 bg-zinc-900/70 border border-zinc-800/90 rounded-2xl space-y-1 backdrop-blur-md shadow-sm">
            <h2 className="text-xs sm:text-sm font-extrabold text-zinc-100 flex items-center space-x-2">
              <span>🚀 4-Step Quick Start Workflow</span>
            </h2>
            <p className="text-[11px] sm:text-xs text-zinc-400">
              StudyRoom is built for frictionless focus and high accountability. Here is how your daily study cycle works:
            </p>
          </div>

          <div className="space-y-3">
            {steps.map((s, idx) => {
              const Icon = s.icon;
              return (
                <div
                  key={idx}
                  className="p-4 sm:p-5 bg-zinc-900/70 border border-zinc-800/90 rounded-2xl space-y-3 shadow-md relative overflow-hidden backdrop-blur-md"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start space-x-2.5 min-w-0 flex-1">
                      <div className={`p-2 rounded-xl border ${s.iconColor} shrink-0 mt-0.5`}>
                        <Icon className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center space-x-2">
                          <span className="font-mono text-[10px] sm:text-xs font-black text-zinc-500 shrink-0">
                            #{s.stepNumber}
                          </span>
                          <h3 className="text-xs sm:text-sm font-extrabold text-zinc-100 leading-snug">
                            {s.title}
                          </h3>
                        </div>
                        <p className="text-[11px] font-semibold text-zinc-400 mt-0.5 leading-snug">
                          {s.subtitle}
                        </p>
                      </div>
                    </div>

                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border shrink-0 ${s.badgeColor}`}
                    >
                      {s.badge}
                    </span>
                  </div>

                  <p className="text-xs text-zinc-300/90 leading-relaxed pl-1 pt-1 border-t border-zinc-800/60">
                    {s.description}
                  </p>
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
                className={`p-4 sm:p-5 rounded-2xl border ${f.accent} space-y-3 flex flex-col justify-between shadow-md backdrop-blur-md`}
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="p-2.5 rounded-xl bg-zinc-950/90 border border-zinc-800 text-zinc-100 shadow-sm shrink-0">
                      <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
                    </div>
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border shrink-0 ${f.pillBg}`}
                    >
                      {f.pill}
                    </span>
                  </div>

                  <div>
                    <h3 className="text-xs sm:text-sm font-extrabold text-zinc-100">
                      {f.title}
                    </h3>
                    <p className="text-[11px] font-semibold text-zinc-400">
                      {f.subtitle}
                    </p>
                  </div>

                  <p className="text-xs text-zinc-400 leading-relaxed">
                    {f.description}
                  </p>
                </div>

                <div className="pt-2.5 border-t border-zinc-800/60 flex items-center space-x-1.5 text-[10px] text-zinc-500 font-medium">
                  <ShieldCheck className="w-3.5 h-3.5 text-zinc-400" />
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
          {/* Header Overview Card */}
          <div className="p-4 sm:p-5 bg-zinc-900/70 border border-zinc-800/90 rounded-2xl space-y-3.5 backdrop-blur-md shadow-xl">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-300 shrink-0">
                <Trophy className="w-5 h-5 fill-amber-400 text-amber-400" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm sm:text-base font-extrabold text-zinc-100 tracking-tight">
                  100-Point Normalized Ranking Algorithm
                </h2>
                <p className="text-[11px] text-zinc-400">
                  Balanced 50/30/20 composition rewarding effort, goal execution, and consistency.
                </p>
              </div>
            </div>

            {/* Split Composition Bar */}
            <div className="space-y-1.5 pt-1">
              <div className="flex justify-between items-center text-[10px] font-mono font-bold">
                <span className="text-violet-400">50% Study Hours</span>
                <span className="text-fuchsia-400">30% 24h Goals</span>
                <span className="text-amber-400">20% Streak</span>
              </div>
              <div className="w-full h-3 bg-zinc-950 rounded-full border border-zinc-800 flex overflow-hidden p-0.5 gap-1">
                <div className="h-full bg-violet-500 rounded-l-full shadow-sm" style={{ width: "50%" }} />
                <div className="h-full bg-fuchsia-500 shadow-sm" style={{ width: "30%" }} />
                <div className="h-full bg-amber-500 rounded-r-full shadow-sm" style={{ width: "20%" }} />
              </div>
            </div>
          </div>

          {/* Component 1: 50% Active Study Duration */}
          <div className="p-4 sm:p-5 rounded-2xl bg-zinc-900/80 border border-violet-500/30 space-y-3 shadow-md backdrop-blur-md">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center space-x-2.5 min-w-0">
                <div className="p-2 rounded-xl bg-violet-500/10 border border-violet-500/25 text-violet-300 shrink-0">
                  <Clock className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-xs sm:text-sm font-extrabold text-zinc-100">
                    Active Study Duration
                  </h3>
                  <p className="text-[10px] sm:text-[11px] text-zinc-400">
                    Max 50.0 points • Relative weekly scaling
                  </p>
                </div>
              </div>

              <span className="font-mono text-xs font-black text-violet-300 px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/30 shrink-0">
                50% Weight
              </span>
            </div>

            <p className="text-xs text-zinc-300/90 leading-relaxed">
              Calculated dynamically relative to the group&apos;s peak performer during the active week (Monday to Sunday in IST).
            </p>

            {/* Formula Block */}
            <div className="p-3 bg-zinc-950/80 border border-zinc-800/90 rounded-xl space-y-1">
              <div className="flex items-center space-x-1.5 text-[10px] font-bold text-violet-400 uppercase tracking-wider">
                <Calculator className="w-3 h-3" />
                <span>Formula</span>
              </div>
              <div className="font-mono text-xs text-zinc-200 flex flex-wrap items-center gap-1.5">
                <span className="text-violet-300 font-bold">Study Score</span>
                <Equal className="w-3.5 h-3.5 text-zinc-500" />
                <span>(Your Weekly Minutes ÷ Top Peer Minutes) × 50</span>
              </div>
            </div>
          </div>

          {/* Component 2: 30% 24h Goal Completion Rate */}
          <div className="p-4 sm:p-5 rounded-2xl bg-zinc-900/80 border border-fuchsia-500/30 space-y-3 shadow-md backdrop-blur-md">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center space-x-2.5 min-w-0">
                <div className="p-2 rounded-xl bg-fuchsia-500/10 border border-fuchsia-500/25 text-fuchsia-300 shrink-0">
                  <Target className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-xs sm:text-sm font-extrabold text-zinc-100">
                    24-Hour Goal Completion
                  </h3>
                  <p className="text-[10px] sm:text-[11px] text-zinc-400">
                    Max 30.0 points • Task execution rate
                  </p>
                </div>
              </div>

              <span className="font-mono text-xs font-black text-fuchsia-300 px-3 py-1 rounded-full bg-fuchsia-500/10 border border-fuchsia-500/30 shrink-0">
                30% Weight
              </span>
            </div>

            <p className="text-xs text-zinc-300/90 leading-relaxed">
              Percentage of tasks completed across all 24-hour goal windows created during the week.
            </p>

            {/* Formula Block */}
            <div className="p-3 bg-zinc-950/80 border border-zinc-800/90 rounded-xl space-y-1">
              <div className="flex items-center space-x-1.5 text-[10px] font-bold text-fuchsia-400 uppercase tracking-wider">
                <Calculator className="w-3 h-3" />
                <span>Formula</span>
              </div>
              <div className="font-mono text-xs text-zinc-200 flex flex-wrap items-center gap-1.5">
                <span className="text-fuchsia-300 font-bold">Goal Score</span>
                <Equal className="w-3.5 h-3.5 text-zinc-500" />
                <span>(Completed Tasks ÷ Total Committed Tasks) × 30</span>
              </div>
            </div>
          </div>

          {/* Component 3: 20% Consistency & Streak */}
          <div className="p-4 sm:p-5 rounded-2xl bg-zinc-900/80 border border-amber-500/30 space-y-3 shadow-md backdrop-blur-md">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center space-x-2.5 min-w-0">
                <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-300 shrink-0">
                  <Flame className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-xs sm:text-sm font-extrabold text-zinc-100">
                    Consistency & Streak
                  </h3>
                  <p className="text-[10px] sm:text-[11px] text-zinc-400">
                    Max 20.0 points • Daily commitment habit
                  </p>
                </div>
              </div>

              <span className="font-mono text-xs font-black text-amber-300 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 shrink-0">
                20% Weight
              </span>
            </div>

            <p className="text-xs text-zinc-300/90 leading-relaxed">
              Consecutive days with at least 30 active study minutes (capped at 7 days for the full 20 points).
            </p>

            {/* Formula Block */}
            <div className="p-3 bg-zinc-950/80 border border-zinc-800/90 rounded-xl space-y-1">
              <div className="flex items-center space-x-1.5 text-[10px] font-bold text-amber-400 uppercase tracking-wider">
                <Calculator className="w-3 h-3" />
                <span>Formula</span>
              </div>
              <div className="font-mono text-xs text-zinc-200 flex flex-wrap items-center gap-1.5">
                <span className="text-amber-300 font-bold">Streak Score</span>
                <Equal className="w-3.5 h-3.5 text-zinc-500" />
                <span>(Qualifying Days ÷ 7) × 20</span>
              </div>
            </div>
          </div>

          {/* Weekly Achiever Badge Card */}
          <div className="p-4 sm:p-5 bg-gradient-to-r from-amber-500/15 via-zinc-900/90 to-zinc-950 border border-amber-500/35 rounded-2xl flex items-center space-x-3.5 shadow-md">
            <div className="p-2.5 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-300 shrink-0">
              <Award className="w-5 h-5 text-amber-400 fill-amber-400" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-amber-200">
                Weekly Achiever Award ⭐
              </h3>
              <p className="text-[11px] text-amber-200/80 mt-0.5 leading-snug">
                Every Monday at 00:00 IST, the #1 ranked member is automatically awarded the Weekly Achiever badge, displaying a glowing badge across all live rooms and leaderboards.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
