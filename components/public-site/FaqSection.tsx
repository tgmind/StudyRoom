"use client";

import React, { useState, useMemo } from "react";
import { PublicWebsiteFaqItem } from "@/lib/public-website/types";
import { HelpCircle, ChevronDown, Search, CreditCard, ShieldAlert, Laptop, Sparkles } from "lucide-react";

interface FaqSectionProps {
  faqs: PublicWebsiteFaqItem[];
}

export function FaqSection({ faqs }: FaqSectionProps) {
  const [selectedCategory, setSelectedCategory] = useState<"all" | "fee" | "community" | "platform">("all");
  const [searchQuery, setSearchQuery] = useState("");

  const categorize = (question: string): "fee" | "community" | "platform" => {
    const q = question.toLowerCase();
    if (
      q.includes("fee") ||
      q.includes("₹50") ||
      q.includes("refund") ||
      q.includes("maintenance") ||
      q.includes("subscription") ||
      q.includes("pay")
    ) {
      return "fee";
    }
    if (
      q.includes("policy") ||
      q.includes("suspended") ||
      q.includes("terminated") ||
      q.includes("cheating") ||
      q.includes("community") ||
      q.includes("rules")
    ) {
      return "community";
    }
    return "platform";
  };

  const filteredFaqs = useMemo(() => {
    return faqs.filter((faq) => {
      const cat = categorize(faq.question);
      const matchesCategory = selectedCategory === "all" || cat === selectedCategory;
      const query = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !query ||
        faq.question.toLowerCase().includes(query) ||
        faq.answer.toLowerCase().includes(query);
      return matchesCategory && matchesSearch;
    });
  }, [faqs, selectedCategory, searchQuery]);

  return (
    <section id="faq" className="py-14 sm:py-20 lg:py-24 bg-gradient-to-b from-[#fafaf9] via-[#f5f5f4] to-[#e7e5e4]/50 border-b border-stone-200 scroll-mt-20">
      <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-[#eaf5ff] px-3.5 py-1 text-xs font-black uppercase tracking-wider text-[#07458f]">
            <HelpCircle className="w-3.5 h-3.5" />
            <span>13 — FREQUENTLY ASKED QUESTIONS</span>
          </div>
          <h2 className="mt-3.5 text-2xl xs:text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-[#071a3a]">
            Everything You Need to <span className="text-[#0b73e6]">Know</span>
          </h2>
          <p className="mt-3.5 text-sm sm:text-base font-medium text-slate-600 max-w-2xl mx-auto leading-relaxed">
            Transparent answers regarding the ₹50 enrollment fee, non-refundable terms, strict community policies, and platform features.
          </p>
        </div>

        {/* Filter Pills & Search Bar */}
        <div className="mt-8 sm:mt-10 flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Category Tabs */}
          <div className="flex flex-wrap items-center justify-center gap-1.5 bg-white p-1 rounded-2xl border border-blue-100 shadow-xs w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setSelectedCategory("all")}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                selectedCategory === "all"
                  ? "bg-[#071a3a] text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
              }`}
            >
              All ({faqs.length})
            </button>
            <button
              type="button"
              onClick={() => setSelectedCategory("fee")}
              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                selectedCategory === "fee"
                  ? "bg-[#0b73e6] text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
              }`}
            >
              <CreditCard className="w-3 h-3" />
              <span>₹50 Fee &amp; Refunds</span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedCategory("community")}
              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                selectedCategory === "community"
                  ? "bg-amber-600 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
              }`}
            >
              <ShieldAlert className="w-3 h-3" />
              <span>Community Policy</span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedCategory("platform")}
              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                selectedCategory === "platform"
                  ? "bg-indigo-600 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
              }`}
            >
              <Laptop className="w-3 h-3" />
              <span>Platform</span>
            </button>
          </div>

          {/* Quick Search Input */}
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search questions..."
              className="w-full pl-9 pr-3 py-2 text-xs font-bold rounded-xl border border-blue-100 bg-white text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0b73e6]/20 focus:border-[#0b73e6]"
            />
          </div>
        </div>

        {/* FAQs Accordion */}
        <div className="mt-6 space-y-3">
          {filteredFaqs.length > 0 ? (
            filteredFaqs.map((faq, idx) => {
              const cat = categorize(faq.question);
              return (
                <details
                  key={idx}
                  className="group rounded-2xl border border-blue-100 bg-white p-4 sm:p-5 shadow-xs transition-all hover:border-blue-200"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between font-black text-[#071a3a] text-xs sm:text-sm md:text-base">
                    <div className="flex items-center gap-2 pr-2">
                      {cat === "fee" && (
                        <span className="shrink-0 px-2 py-0.5 rounded-md bg-blue-50 text-[#0b73e6] text-[10px] font-black uppercase">
                          Fee Terms
                        </span>
                      )}
                      {cat === "community" && (
                        <span className="shrink-0 px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 text-[10px] font-black uppercase">
                          Policy
                        </span>
                      )}
                      <span>{faq.question}</span>
                    </div>
                    <span className="ml-2 sm:ml-4 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[#0b73e6] group-open:rotate-180 transition-transform">
                      <ChevronDown className="h-4 w-4" />
                    </span>
                  </summary>
                  <p className="mt-3 text-xs sm:text-sm font-medium leading-relaxed text-slate-600 border-t border-slate-100 pt-3 break-words">
                    {faq.answer}
                  </p>
                </details>
              );
            })
          ) : (
            <div className="text-center py-10 bg-white rounded-2xl border border-blue-100 p-6">
              <p className="text-sm font-bold text-slate-500">No questions matched your search query.</p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setSelectedCategory("all");
                }}
                className="mt-3 text-xs font-black text-[#0b73e6] hover:underline cursor-pointer"
              >
                Reset filters
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

