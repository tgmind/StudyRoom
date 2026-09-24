"use client";

import React from "react";
import { GraduationCap, BookOpen, Code, Award, CheckCircle2 } from "lucide-react";

export function WhoCanJoinSection() {
  const groups = [
    {
      title: "JEE & NEET Aspirants",
      icon: "🎯",
      desc: "Master long problem-solving blocks, practice daily numerical sets, and stay disciplined through intense exam cycles.",
    },
    {
      title: "UPSC & State PSC",
      icon: "📚",
      desc: "Log continuous 6-to-10 hour syllabus reading sessions with break accountability and distraction-free tracking.",
    },
    {
      title: "University & College Students",
      icon: "🎓",
      desc: "Prepare for semester midterms, finals, and competitive entrance tests alongside fellow focused peers.",
    },
    {
      title: "Coders & Self-Taught Learners",
      icon: "💻",
      desc: "Build technical deep-work habits, complete programming projects, and eliminate procrastination.",
    },
  ];

  return (
    <section id="who-can-join" className="py-14 sm:py-20 lg:py-24 bg-gradient-to-b from-[#f0fdfa] via-[#f5fffc] to-[#ccfbf1]/50 border-b border-teal-200/60 scroll-mt-20">
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-[#eaf5ff] px-3.5 py-1 text-xs font-black uppercase tracking-wider text-[#07458f]">
            <span>11 — ADMISSIONS &amp; AUDIENCE</span>
          </div>
          <h2 className="mt-3.5 text-2xl xs:text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-[#071a3a]">
            Who Can <span className="text-[#0b73e6]">Join</span>?
          </h2>
          <p className="mt-3.5 sm:mt-4 text-sm sm:text-base lg:text-lg font-medium leading-relaxed text-slate-600">
            Study Room is open to anyone committed to serious, self-directed learning. If you value silence, focus, and genuine effort, you belong here.
          </p>
        </div>

        {/* Groups Grid */}
        <div className="mt-10 sm:mt-14 grid gap-5 sm:gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {groups.map((group, idx) => (
            <div
              key={idx}
              className="flex flex-col justify-between rounded-3xl border border-blue-100/90 bg-white p-5 sm:p-6 shadow-sm shadow-blue-500/5 transition-all hover:-translate-y-1 hover:shadow-lg"
            >
              <div>
                <div className="flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-2xl bg-[#eaf5ff] text-2xl shadow-sm">
                  {group.icon}
                </div>
                <h3 className="mt-4 sm:mt-5 text-base sm:text-lg font-black text-[#071a3a]">{group.title}</h3>
                <p className="mt-2 text-xs sm:text-sm font-medium leading-relaxed text-slate-600 break-words">
                  {group.desc}
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-1.5 text-[11px] font-bold text-[#0b73e6]">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Full Access Included</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
