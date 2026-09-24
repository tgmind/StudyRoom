"use client";

import React from "react";
import { PublicWebsiteGeneralInfo, PublicWebsiteBranding } from "@/lib/public-website/types";
import { Users, Shield, ArrowUp } from "lucide-react";

interface PublicFooterProps {
  general: PublicWebsiteGeneralInfo;
  branding: PublicWebsiteBranding;
}

export function PublicFooter({ general, branding }: PublicFooterProps) {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-[#071a3a] text-white">
      <div className="w-full max-w-7xl mx-auto px-4 py-12 sm:py-16 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-[1.2fr_0.8fr]">
          {/* Brand Info */}
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-2xl text-[#071a3a] shadow-sm">
                {branding.logoIcon || "👥"}
              </div>
              <div>
                <div className="text-xl font-black">{branding.logoText || "Study Room"}</div>
                <div className="text-[10px] font-bold tracking-[0.18em] text-blue-200 uppercase">
                  Study Together • Grow Together
                </div>
              </div>
            </div>

            <p className="mt-4 sm:mt-5 max-w-md text-xs sm:text-sm font-medium leading-relaxed text-blue-100 break-words">
              {general.description ||
                "A focused virtual study platform for serious students who want accountability, live synchronization, and real study-time tracking — without talking, discussion, or video-call distractions."}
            </p>

            <div className="mt-5 sm:mt-6 flex flex-wrap items-center gap-4 text-xs font-bold text-blue-200">
              <span className="break-all">Contact: {general.contactEmail || "studyaliveapp@gmail.com"}</span>
            </div>
          </div>

          {/* Quick Links Navigation */}
          <div className="grid grid-cols-2 gap-6 text-xs font-bold text-blue-100">
            <div>
              <p className="font-black uppercase tracking-widest text-blue-300 mb-3 text-[11px] sm:text-xs">Platform</p>
              <ul className="space-y-2.5">
                <li><a href="#what-is" className="hover:text-white transition-colors">What is It</a></li>
                <li><a href="#how-it-works" className="hover:text-white transition-colors">How It Works</a></li>
                <li><a href="#features" className="hover:text-white transition-colors">Features</a></li>
                <li><a href="#live-timer" className="hover:text-white transition-colors">Live Timer</a></li>
                <li><a href="#rivalry" className="hover:text-white transition-colors">Rivalry Arena</a></li>
              </ul>
            </div>

            <div>
              <p className="font-black uppercase tracking-widest text-blue-300 mb-3 text-[11px] sm:text-xs">Community</p>
              <ul className="space-y-2.5">
                <li><a href="#rules" className="hover:text-white transition-colors">Rules &amp; Conditions</a></li>
                <li><a href="#membership" className="hover:text-white transition-colors">₹50 Membership</a></li>
                <li><a href="#faq" className="hover:text-white transition-colors">FAQ</a></li>
              </ul>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-10 sm:mt-12 pt-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-blue-200">
          <div className="text-center sm:text-left">
            © {currentYear} {branding.logoText || "Study Room"}. All rights reserved.
          </div>
          <div className="flex items-center gap-4">
            <a href="#top" className="flex items-center gap-1 hover:text-white transition-colors">
              <span>Back to top</span>
              <ArrowUp className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
