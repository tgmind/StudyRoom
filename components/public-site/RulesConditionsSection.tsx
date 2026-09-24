"use client";

import React from "react";
import { PublicWebsiteConditions } from "@/lib/public-website/types";
import { ShieldCheck, FileText, AlertCircle, Lock, RotateCcw } from "lucide-react";

interface RulesConditionsSectionProps {
  conditions: PublicWebsiteConditions;
}

export function RulesConditionsSection({ conditions }: RulesConditionsSectionProps) {
  return (
    <section id="rules" className="py-14 sm:py-20 lg:py-24 bg-gradient-to-b from-[#f4f4f5] via-[#fafafa] to-[#e4e4e7]/50 border-b border-zinc-200 scroll-mt-20">
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-[#eaf5ff] px-3.5 py-1 text-xs font-black uppercase tracking-wider text-[#07458f]">
            <span>10 — COMMUNITY STANDARDS</span>
          </div>
          <h2 className="mt-3.5 text-2xl xs:text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-[#071a3a]">
            Rules, Conditions &amp; <span className="text-[#0b73e6]">Policies</span>
          </h2>
          <p className="mt-3.5 sm:mt-4 text-sm sm:text-base lg:text-lg font-medium leading-relaxed text-slate-600">
            Study Room is maintained as an authentic, high-trust environment. Every member adheres to these core principles to safeguard group focus.
          </p>
        </div>

        {/* 4 Cards Grid for Rules & Policies */}
        <div className="mt-10 sm:mt-14 grid gap-5 sm:gap-6 md:grid-cols-2">
          {/* Card 1: Eligibility & Membership */}
          <div className="rounded-3xl border border-blue-100 bg-[#f8fcff] p-5 sm:p-7 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-[#0b73e6]">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <h3 className="text-lg sm:text-xl font-black text-[#071a3a]">Eligibility Criteria</h3>
            </div>
            <ul className="mt-4 sm:mt-5 space-y-2.5 text-xs sm:text-sm font-semibold text-slate-700">
              {conditions.eligibility.map((item, idx) => (
                <li key={idx} className="flex items-start gap-2.5 break-words">
                  <span className="text-[#0b73e6] font-bold shrink-0 mt-0.5">●</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Card 2: Acceptable Usage & Integrity */}
          <div className="rounded-3xl border border-blue-100 bg-[#f8fcff] p-5 sm:p-7 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                <AlertCircle className="h-5 w-5" />
              </div>
              <h3 className="text-lg sm:text-xl font-black text-[#071a3a]">Acceptable Usage &amp; Integrity</h3>
            </div>
            <ul className="mt-4 sm:mt-5 space-y-2.5 text-xs sm:text-sm font-semibold text-slate-700">
              {conditions.acceptableUsage.map((item, idx) => (
                <li key={idx} className="flex items-start gap-2.5 break-words">
                  <span className="text-amber-600 font-bold shrink-0 mt-0.5">●</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Card 3: Room Conduct & Inactivity */}
          <div className="rounded-3xl border border-blue-100 bg-[#f8fcff] p-5 sm:p-7 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-100 text-purple-700">
                <FileText className="h-5 w-5" />
              </div>
              <h3 className="text-lg sm:text-xl font-black text-[#071a3a]">Study Room Conduct</h3>
            </div>
            <ul className="mt-4 sm:mt-5 space-y-2.5 text-xs sm:text-sm font-semibold text-slate-700">
              {conditions.studyRoomRules.map((item, idx) => (
                <li key={idx} className="flex items-start gap-2.5 break-words">
                  <span className="text-purple-600 font-bold shrink-0 mt-0.5">●</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Card 4: Payment Terms, Refunds & Privacy */}
          <div className="rounded-3xl border border-blue-100 bg-[#f8fcff] p-5 sm:p-7 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                <Lock className="h-5 w-5" />
              </div>
              <h3 className="text-lg sm:text-xl font-black text-[#071a3a]">Payment Terms &amp; Privacy</h3>
            </div>
            <div className="mt-4 sm:mt-5 space-y-3 text-xs sm:text-sm text-slate-600 font-medium">
              <p className="break-words">
                <strong className="text-slate-800">Payment &amp; Refund:</strong> {conditions.refundPolicy}
              </p>
              <p className="break-words">
                <strong className="text-slate-800">Privacy Standard:</strong> {conditions.dataPrivacy}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
