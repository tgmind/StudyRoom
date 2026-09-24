"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Header } from "@/components/public-site/Header";
import { SectionNavigator } from "@/components/public-site/SectionNavigator";
import { HeroSection } from "@/components/public-site/HeroSection";
import { WhatIsSection } from "@/components/public-site/WhatIsSection";
import { HowItWorksSection } from "@/components/public-site/HowItWorksSection";
import { FeaturesShowcase } from "@/components/public-site/FeaturesShowcase";
import { LiveTimerDemo } from "@/components/public-site/LiveTimerDemo";
import { RealtimeArchitectureSection } from "@/components/public-site/RealtimeArchitectureSection";
import { GoalsTrackingSection } from "@/components/public-site/GoalsTrackingSection";
import { MemberStatusSection } from "@/components/public-site/MemberStatusSection";
import { RivalryArenaSection } from "@/components/public-site/RivalryArenaSection";
import { RulesConditionsSection } from "@/components/public-site/RulesConditionsSection";
import { WhoCanJoinSection } from "@/components/public-site/WhoCanJoinSection";
import { PaymentSection } from "@/components/public-site/PaymentSection";
import { FaqSection } from "@/components/public-site/FaqSection";
import { PublicFooter } from "@/components/public-site/PublicFooter";
import { UtrModal } from "@/components/public-site/UtrModal";
import { DEFAULT_PUBLIC_CONTENT } from "@/lib/public-website/defaultContent";
import { PublicWebsiteContent } from "@/lib/public-website/types";
import { synchronizeContentPricing } from "@/lib/public-website/priceUtils";

export default function PublicLandingPage() {
  const [content, setContent] = useState<PublicWebsiteContent>(DEFAULT_PUBLIC_CONTENT);
  const [utrModalOpen, setUtrModalOpen] = useState(false);

  useEffect(() => {
    // Fetch live content if modified in admin, falling back gracefully to defaults
    fetch("/api/public-website/content")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && typeof data === "object") {
          setContent((prev) => ({
            ...prev,
            ...data,
            general: { ...prev.general, ...(data.general || {}) },
            branding: { ...prev.branding, ...(data.branding || {}) },
            hero: { ...prev.hero, ...(data.hero || {}) },
            membership: { ...prev.membership, ...(data.membership || {}) },
            conditions: { ...prev.conditions, ...(data.conditions || {}) },
          }));
        }
      })
      .catch((err) => {
        console.warn("Using embedded default content for public website:", err);
      });
  }, []);

  const activePrice =
    typeof content.membership?.priceInr === "number" && !isNaN(content.membership.priceInr)
      ? content.membership.priceInr
      : 50;

  const synchronizedContent = useMemo(
    () => synchronizeContentPricing(content, activePrice),
    [content, activePrice]
  );

  const handleOpenPayment = () => {
    const el = document.getElementById("membership");
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <div className="relative flex flex-col min-h-screen bg-white text-slate-900 selection:bg-blue-100 selection:text-blue-900 antialiased">
      {/* 1. Sticky Navigation Header */}
      <Header
        general={synchronizedContent.general}
        branding={synchronizedContent.branding}
        priceInr={activePrice}
        onJoinClick={handleOpenPayment}
      />

      {/* 2. Floating Section Navigator (00-13) */}
      <SectionNavigator priceInr={activePrice} />

      {/* 3. Main Single Long-Scroll Body */}
      <main className="flex-1">
        {/* Hero Section */}
        <HeroSection
          hero={synchronizedContent.hero}
          priceInr={activePrice}
          onJoinClick={handleOpenPayment}
        />

        {/* 01 & 02: What Is Study Room & Why Study Room */}
        <WhatIsSection />

        {/* 03: How It Works */}
        <HowItWorksSection steps={synchronizedContent.howItWorks} />

        {/* 04: Real Platform Core Features */}
        <FeaturesShowcase features={synchronizedContent.features} />

        {/* 05: Live Study Timer Demo */}
        <LiveTimerDemo />

        {/* 06: Realtime Architecture Visual */}
        <RealtimeArchitectureSection />

        {/* 07: Rolling 24-Hour Goals & Progress Tracking */}
        <GoalsTrackingSection />

        {/* 08: Member Activity and Status System */}
        <MemberStatusSection />

        {/* 09: Rivalry Arena Duel Simulation */}
        <RivalryArenaSection />

        {/* 10: Rules, Conditions, Refund & Privacy */}
        <RulesConditionsSection conditions={synchronizedContent.conditions} />

        {/* 11: Who Can Join */}
        <WhoCanJoinSection />

        {/* 12: UPI QR Payment & Membership Access (At the end of page) */}
        <PaymentSection
          membership={synchronizedContent.membership}
          branding={synchronizedContent.branding}
          onOpenUtrModal={() => setUtrModalOpen(true)}
        />

        {/* 13: Frequently Asked Questions */}
        <FaqSection faqs={synchronizedContent.faqs} priceInr={activePrice} />
      </main>

      {/* 4. Footer */}
      <PublicFooter
        general={synchronizedContent.general}
        branding={synchronizedContent.branding}
        priceInr={activePrice}
      />

      {/* 5. UTR Submission Modal */}
      <UtrModal
        isOpen={utrModalOpen}
        onClose={() => setUtrModalOpen(false)}
        priceInr={activePrice}
      />
    </div>
  );
}
