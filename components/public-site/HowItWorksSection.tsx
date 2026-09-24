"use client";

import React from "react";
import { PublicWebsiteHowItWorksStep } from "@/lib/public-website/types";
import { ArrowRight, Workflow } from "lucide-react";

interface HowItWorksSectionProps {
  steps: PublicWebsiteHowItWorksStep[];
}

export function HowItWorksSection({ steps }: HowItWorksSectionProps) {
  const displaySteps =
    steps && steps.length > 0
      ? steps
      : [
          {
            stepNumber: 1,
            title: "Join Study Room",
            description: "Scan the ₹50 UPI QR code, submit your transaction UTR, and proceed to account registration.",
            icon: "📲",
          },
          {
            stepNumber: 2,
            title: "Enter the Live Room",
            description: "Step into the focused virtual study room and see active peers studying in real time.",
            icon: "🚪",
          },
          {
            stepNumber: 3,
            title: "Set Goals & Start Timer",
            description: "Pick your subject, set a rolling 20-hour milestone, and start your server-synchronized timer.",
            icon: "⏱️",
          },
          {
            stepNumber: 4,
            title: "Compete & Build Habit",
            description: "Trigger Rivalry Arena duels when study hours converge, earn streaks, and claim the weekly Achiever Title.",
            icon: "🏆",
          },
        ];

  return (
    <section id="how-it-works" className="py-14 sm:py-20 lg:py-24 bg-gradient-to-b from-[#fdfbf7] via-[#faf6ee] to-[#f6f0e4] border-b border-amber-200/60 scroll-mt-20">
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-[#eaf5ff] px-3.5 py-1 text-xs font-black uppercase tracking-wider text-[#07458f]">
            <Workflow className="w-3.5 h-3.5" />
            <span>03 — SIMPLE WORKFLOW</span>
          </div>
          <h2 className="mt-3.5 text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-[#071a3a] leading-tight">
            Simple 4-Step <span className="text-[#0b73e6]">Study Journey</span>
          </h2>
          <p className="mt-4 text-sm sm:text-base lg:text-lg font-medium leading-relaxed text-slate-600">
            No complicated software, no scheduled meetings, and no teacher dependencies.
            Study on your own schedule whenever you sit down to learn.
          </p>
        </div>

        {/* Steps Grid — Flex Screen Adaptive */}
        <div className="mt-10 sm:mt-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {displaySteps.map((step) => (
            <div
              key={step.stepNumber}
              className="relative flex flex-col justify-between rounded-3xl border border-blue-100 bg-white p-5 sm:p-6 shadow-md shadow-blue-500/5 transition-all hover:-translate-y-1 hover:shadow-xl hover:border-blue-200"
            >
              <div>
                {/* Step indicator header */}
                <div className="flex items-center justify-between">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#eaf5ff] text-2xl shadow-sm">
                    {step.icon}
                  </div>
                  <span className="font-mono text-2xl sm:text-3xl font-black text-blue-200">
                    0{step.stepNumber}
                  </span>
                </div>

                <h3 className="mt-5 text-base sm:text-lg font-black text-[#071a3a]">{step.title}</h3>
                <p className="mt-2 text-xs sm:text-sm font-medium leading-relaxed text-slate-600">
                  {step.description}
                </p>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-50 flex items-center text-[11px] font-black uppercase tracking-wider text-[#0b73e6]">
                <span>Step {step.stepNumber} of 4</span>
                <ArrowRight className="ml-auto h-3.5 w-3.5" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
