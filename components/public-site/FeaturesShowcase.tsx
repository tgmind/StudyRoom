"use client";

import React from "react";
import { PublicWebsiteFeatureItem } from "@/lib/public-website/types";
import { Sparkles, Shield, Clock, Users, Target, Swords, Trophy, Lock } from "lucide-react";

interface FeaturesShowcaseProps {
  features: PublicWebsiteFeatureItem[];
}

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  "LIVE STUDY": { bg: "bg-blue-50", text: "text-[#0b73e6]" },
  "REALTIME EXPERIENCE": { bg: "bg-emerald-50", text: "text-emerald-700" },
  "PROGRESS": { bg: "bg-purple-50", text: "text-purple-700" },
  "MOTIVATION": { bg: "bg-amber-50", text: "text-amber-700" },
  "SYSTEM & PRIVACY": { bg: "bg-slate-100", text: "text-slate-700" },
};

export function FeaturesShowcase({ features }: FeaturesShowcaseProps) {
  return (
    <section id="features" className="py-14 sm:py-20 lg:py-24 bg-gradient-to-b from-[#f8fafc] via-[#f1f5f9] to-[#e8eef5] border-b border-slate-200 scroll-mt-20">
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-[#eaf5ff] px-3.5 py-1 text-xs font-black uppercase tracking-wider text-[#07458f]">
            <span>04 — REAL PLATFORM CAPABILITIES</span>
          </div>
          <h2 className="mt-3.5 text-2xl xs:text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-[#071a3a]">
            Built for Serious <span className="text-[#0b73e6]">Self-Study</span>
          </h2>
          <p className="mt-3.5 sm:mt-4 text-sm sm:text-base lg:text-lg font-medium leading-relaxed text-slate-600">
            Every feature in Study Room is engineered to eliminate friction and sustain long study sessions.
            No vanity metrics — only authentic productivity.
          </p>
        </div>

        {/* Feature Cards Grid */}
        <div className="mt-10 sm:mt-14 grid gap-5 sm:gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feat) => {
            const catStyle = CATEGORY_COLORS[feat.category || ""] || { bg: "bg-blue-50", text: "text-[#0b73e6]" };

            return (
              <div
                key={feat.id}
                className="group relative flex flex-col justify-between rounded-3xl border border-blue-100/90 bg-white p-5 sm:p-7 shadow-sm shadow-blue-500/5 transition-all hover:-translate-y-1.5 hover:border-blue-300 hover:shadow-xl"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-2xl bg-[#eaf5ff] text-2xl shadow-sm transition-transform group-hover:scale-110">
                      {feat.icon}
                    </div>
                    {feat.category && (
                      <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${catStyle.bg} ${catStyle.text}`}>
                        {feat.category}
                      </span>
                    )}
                  </div>

                  <h3 className="mt-5 sm:mt-6 text-lg sm:text-xl font-black text-[#071a3a] tracking-tight">{feat.title}</h3>
                  <p className="mt-2 text-xs sm:text-sm font-medium leading-relaxed text-slate-600 break-words">
                    {feat.description}
                  </p>
                </div>

                <div className="mt-5 sm:mt-6 pt-3.5 sm:pt-4 border-t border-slate-100 flex items-center gap-2 text-[11px] sm:text-xs font-bold text-slate-400 group-hover:text-[#0b73e6] transition-colors">
                  <span className="flex h-1.5 w-1.5 rounded-full bg-[#0b73e6]" />
                  <span>Production verified feature</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
