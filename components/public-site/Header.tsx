"use client";

import React, { useState } from "react";
import Link from "next/link";
import { PublicWebsiteGeneralInfo, PublicWebsiteBranding } from "@/lib/public-website/types";
import { Menu, X, Shield, ArrowRight, Share2, Check } from "lucide-react";
import { sharePublicSite } from "@/lib/public-website/driveUtils";

interface HeaderProps {
  general: PublicWebsiteGeneralInfo;
  branding: PublicWebsiteBranding;
  onJoinClick: () => void;
}

export function Header({ general, branding, onJoinClick }: HeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [copiedShare, setCopiedShare] = useState(false);

  const handleShare = async () => {
    const result = await sharePublicSite();
    if (result === "copied") {
      setCopiedShare(true);
      setTimeout(() => setCopiedShare(false), 2500);
    }
  };

  return (
    <header className="sticky top-0 z-40 border-b border-blue-100/80 bg-white/95 backdrop-blur-md transition-all">
      <div className="w-full max-w-7xl mx-auto flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand Logo */}
        <Link href="#top" className="flex items-center gap-2 sm:gap-3 group shrink-0" aria-label="Study Room Home">
          <div className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl bg-[#071a3a] text-white shadow-md transition-transform group-hover:scale-105">
            <span className="text-lg sm:text-xl leading-none">{branding.logoIcon || "👥"}</span>
          </div>
          <div>
            <div className="text-sm sm:text-lg font-black tracking-tight text-[#071a3a] leading-none">
              {branding.logoText || "Study Room"}
            </div>
            <div className="text-[8.5px] sm:text-[10px] font-bold uppercase tracking-[0.16em] text-[#0b73e6] mt-0.5 hidden xs:block">
              Study Together • Grow Together
            </div>
          </div>
        </Link>

        {/* Desktop Navigation Links — whitespace-nowrap prevents irregular 2-line wraps */}
        <nav className="hidden items-center gap-2 xl:gap-5 2xl:gap-6 text-[10.5px] xl:text-xs font-black uppercase tracking-wider text-slate-600 lg:flex shrink-0">
          <a href="#what-is" className="whitespace-nowrap transition-colors hover:text-[#0b73e6]">What Is It</a>
          <a href="#how-it-works" className="whitespace-nowrap transition-colors hover:text-[#0b73e6]">How It Works</a>
          <a href="#features" className="whitespace-nowrap transition-colors hover:text-[#0b73e6]">Features</a>
          <a href="#live-timer" className="whitespace-nowrap transition-colors hover:text-[#0b73e6]">Live Timer</a>
          <a href="#rivalry" className="whitespace-nowrap transition-colors hover:text-[#0b73e6]">Rivalry Arena</a>
          <a href="#rules" className="whitespace-nowrap transition-colors hover:text-[#0b73e6]">Rules</a>
          <a href="#membership" className="whitespace-nowrap transition-colors hover:text-[#0b73e6] text-[#0b73e6]">₹50 Access</a>
          <a href="#faq" className="whitespace-nowrap transition-colors hover:text-[#0b73e6]">FAQ</a>
        </nav>

        {/* Action Buttons: Flex-Screen Responsive & Beautifully Sized */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Share Direct Link Button */}
          <button
            type="button"
            onClick={handleShare}
            aria-label="Share public website with friends"
            title="Share direct link with friends"
            className="inline-flex shrink-0 items-center gap-1 sm:gap-1.5 rounded-full border border-blue-200 bg-white px-2.5 sm:px-3.5 py-1.5 sm:py-2 text-[10.5px] sm:text-xs font-bold text-[#071a3a] hover:bg-blue-50 transition-all active:scale-95 whitespace-nowrap cursor-pointer shadow-sm"
          >
            {copiedShare ? (
              <>
                <Check className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-emerald-600 shrink-0" />
                <span className="text-emerald-700 font-black">Copied!</span>
              </>
            ) : (
              <>
                <Share2 className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-[#0b73e6] shrink-0" />
                <span className="hidden xs:inline font-black">Share</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onJoinClick}
            className="inline-flex shrink-0 items-center gap-1 sm:gap-1.5 rounded-full bg-[#ef3340] hover:bg-[#d9222f] px-3 sm:px-4 py-1.5 sm:py-2 text-[10.5px] sm:text-xs font-black text-white shadow-sm hover:shadow transition-all active:scale-95 whitespace-nowrap cursor-pointer"
          >
            <span>Join for ₹50</span>
            <ArrowRight className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
          </button>

          {/* Mobile Menu Toggle */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-700 lg:hidden hover:bg-slate-50 transition-colors cursor-pointer"
            aria-label="Toggle Navigation"
          >
            {mobileMenuOpen ? <X className="h-4 w-4 sm:h-5 sm:w-5" /> : <Menu className="h-4 w-4 sm:h-5 sm:w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="border-b border-blue-100 bg-white px-4 py-4 lg:hidden animate-in slide-in-from-top-2 duration-200 shadow-xl max-h-[85vh] overflow-y-auto">
          <div className="grid gap-2.5 text-sm font-bold text-slate-700">
            <a
              href="#what-is"
              onClick={() => setMobileMenuOpen(false)}
              className="py-2 px-3 rounded-lg hover:bg-blue-50 hover:text-[#0b73e6] transition-colors"
            >
              01 — What Is Study Room
            </a>
            <a
              href="#why-us"
              onClick={() => setMobileMenuOpen(false)}
              className="py-2 px-3 rounded-lg hover:bg-blue-50 hover:text-[#0b73e6] transition-colors"
            >
              02 — Why Study Room
            </a>
            <a
              href="#how-it-works"
              onClick={() => setMobileMenuOpen(false)}
              className="py-2 px-3 rounded-lg hover:bg-blue-50 hover:text-[#0b73e6] transition-colors"
            >
              03 — How It Works
            </a>
            <a
              href="#features"
              onClick={() => setMobileMenuOpen(false)}
              className="py-2 px-3 rounded-lg hover:bg-blue-50 hover:text-[#0b73e6] transition-colors"
            >
              04 — Core Features
            </a>
            <a
              href="#live-timer"
              onClick={() => setMobileMenuOpen(false)}
              className="py-2 px-3 rounded-lg hover:bg-blue-50 hover:text-[#0b73e6] transition-colors"
            >
              05 — Live Study Timer
            </a>
            <a
              href="#realtime-sync"
              onClick={() => setMobileMenuOpen(false)}
              className="py-2 px-3 rounded-lg hover:bg-blue-50 hover:text-[#0b73e6] transition-colors"
            >
              06 — Realtime System
            </a>
            <a
              href="#goals-tracking"
              onClick={() => setMobileMenuOpen(false)}
              className="py-2 px-3 rounded-lg hover:bg-blue-50 hover:text-[#0b73e6] transition-colors"
            >
              07 — 20-Hour Goals &amp; Streaks
            </a>
            <a
              href="#member-status"
              onClick={() => setMobileMenuOpen(false)}
              className="py-2 px-3 rounded-lg hover:bg-blue-50 hover:text-[#0b73e6] transition-colors"
            >
              08 — Peer Presence &amp; Status
            </a>
            <a
              href="#rivalry"
              onClick={() => setMobileMenuOpen(false)}
              className="py-2 px-3 rounded-lg hover:bg-blue-50 hover:text-[#0b73e6] transition-colors"
            >
              09 — Rivalry Arena
            </a>
            <a
              href="#rules"
              onClick={() => setMobileMenuOpen(false)}
              className="py-2 px-3 rounded-lg hover:bg-blue-50 hover:text-[#0b73e6] transition-colors"
            >
              10 — Rules &amp; Conditions
            </a>
            <a
              href="#who-can-join"
              onClick={() => setMobileMenuOpen(false)}
              className="py-2 px-3 rounded-lg hover:bg-blue-50 hover:text-[#0b73e6] transition-colors"
            >
              11 — Who Can Join
            </a>
            <a
              href="#membership"
              onClick={() => setMobileMenuOpen(false)}
              className="py-2 px-3 rounded-lg bg-red-50 text-[#ef3340] font-black"
            >
              12 — Lifetime Access (₹50)
            </a>
            <a
              href="#faq"
              onClick={() => setMobileMenuOpen(false)}
              className="py-2 px-3 rounded-lg hover:bg-blue-50 hover:text-[#0b73e6] transition-colors"
            >
              13 — FAQ
            </a>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex flex-col gap-2">
            <button
              type="button"
              onClick={handleShare}
              className="w-full flex items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50/70 py-2.5 text-center text-xs font-bold text-[#071a3a] hover:bg-blue-100 transition-colors cursor-pointer"
            >
              {copiedShare ? (
                <>
                  <Check className="h-4 w-4 text-emerald-600" />
                  <span className="text-emerald-700 font-black">Direct Link Copied!</span>
                </>
              ) : (
                <>
                  <Share2 className="h-4 w-4 text-[#0b73e6]" />
                  <span>Share Website with Friends</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                onJoinClick();
              }}
              className="w-full rounded-xl bg-gradient-to-r from-[#ef3340] to-[#cf1e38] py-3 text-center text-xs font-black text-white shadow-sm hover:shadow transition-all"
            >
              Pay ₹50 &amp; Join
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
