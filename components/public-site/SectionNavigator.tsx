"use client";

import React, { useState, useEffect } from "react";
import { ListFilter, ChevronUp, ChevronDown, Compass } from "lucide-react";

interface SectionItem {
  id: string;
  number: string;
  label: string;
}

interface SectionNavigatorProps {
  priceInr?: number;
}

export function SectionNavigator({ priceInr = 50 }: SectionNavigatorProps) {
  const [activeSection, setActiveSection] = useState("top");
  const [isOpen, setIsOpen] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);

  const price = typeof priceInr === "number" && !isNaN(priceInr) ? priceInr : 50;

  const sections: SectionItem[] = [
    { id: "top", number: "00", label: "Overview" },
    { id: "what-is", number: "01", label: "What is Study Room" },
    { id: "why-us", number: "02", label: "Why Study Room" },
    { id: "how-it-works", number: "03", label: "How It Works" },
    { id: "features", number: "04", label: "Core Features" },
    { id: "live-timer", number: "05", label: "Live Study Timer" },
    { id: "realtime-sync", number: "06", label: "Realtime Architecture" },
    { id: "goals-tracking", number: "07", label: "20-Hour Goals & Streaks" },
    { id: "member-status", number: "08", label: "Member Status System" },
    { id: "rivalry", number: "09", label: "Rivalry Arena" },
    { id: "rules", number: "10", label: "Rules & Conditions" },
    { id: "who-can-join", number: "11", label: "Who Can Join" },
    { id: "membership", number: "12", label: `Membership & ₹${price} Payment` },
    { id: "faq", number: "13", label: "FAQ" },
  ];

  useEffect(() => {
    const handleScroll = () => {
      // 1. Calculate overall scroll percentage
      const totalScroll = document.documentElement.scrollHeight - window.innerHeight;
      if (totalScroll > 0) {
        const currentProgress = Math.min(100, Math.max(0, (window.scrollY / totalScroll) * 100));
        setScrollProgress(currentProgress);
      }

      // 2. Detect active section in viewport
      const scrollPosition = window.scrollY + 200;
      for (let i = sections.length - 1; i >= 0; i--) {
        const section = document.getElementById(sections[i].id);
        if (section && section.offsetTop <= scrollPosition) {
          setActiveSection(sections[i].id);
          break;
        }
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, [sections]);

  const currentItem = sections.find((s) => s.id === activeSection) || sections[0];

  return (
    <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-40">
      {/* Expanded Menu Dropdown */}
      {isOpen && (
        <div className="mb-3 w-64 max-w-[calc(100vw-32px)] rounded-2xl border border-blue-100 bg-white/95 p-3 shadow-2xl backdrop-blur-md animate-in slide-in-from-bottom-2 duration-200">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2 px-1">
            <span className="text-[11px] font-black uppercase tracking-wider text-[#0b73e6] flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5" />
              <span>Section Navigator</span>
            </span>
            <span className="text-[10px] font-bold text-slate-400">{Math.round(scrollProgress)}% read</span>
          </div>

          <div className="mt-2 max-h-72 overflow-y-auto space-y-1 pr-1 text-xs">
            {sections.map((sec) => {
              const isActive = sec.id === activeSection;
              return (
                <a
                  key={sec.id}
                  href={`#${sec.id}`}
                  onClick={() => setIsOpen(false)}
                  className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 font-bold transition-colors ${
                    isActive
                      ? "bg-[#eaf5ff] text-[#0b73e6]"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  <span className="truncate">{sec.label}</span>
                  <span className="ml-2 font-mono text-[10px] opacity-60 shrink-0">{sec.number}</span>
                </a>
              );
            })}
          </div>
        </div>
      )}

      {/* Floating Toggle Button with Progress Ring: Compact 40px circular FAB on mobile, pill on sm+ */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="group relative flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2 rounded-full border border-blue-200/80 bg-white/95 h-10 w-10 sm:h-auto sm:w-auto p-2 sm:px-3.5 sm:py-2 text-xs font-black text-[#071a3a] shadow-xl backdrop-blur-md transition-all hover:border-[#0b73e6] hover:shadow-2xl active:scale-95 cursor-pointer"
        aria-label="Toggle section navigator"
      >
        {/* Progress indicator circle */}
        <div className="relative flex h-5 w-5 items-center justify-center shrink-0">
          <svg className="h-5 w-5 -rotate-90" viewBox="0 0 36 36">
            <path
              className="text-slate-100"
              strokeWidth="4"
              stroke="currentColor"
              fill="none"
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            />
            <path
              className="text-[#0b73e6] transition-all duration-150"
              strokeDasharray={`${scrollProgress}, 100`}
              strokeWidth="4"
              strokeLinecap="round"
              stroke="currentColor"
              fill="none"
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            />
          </svg>
          <span className="absolute text-[8px] font-mono font-bold text-[#071a3a]">{currentItem.number}</span>
        </div>

        <span className="hidden sm:inline-block max-w-[140px] truncate text-left">{currentItem.label}</span>

        {isOpen ? (
          <ChevronDown className="hidden sm:block h-3.5 w-3.5 text-slate-400 group-hover:text-[#0b73e6] shrink-0" />
        ) : (
          <ChevronUp className="hidden sm:block h-3.5 w-3.5 text-slate-400 group-hover:text-[#0b73e6] shrink-0" />
        )}
      </button>
    </div>
  );
}
