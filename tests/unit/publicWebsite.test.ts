import { describe, it, expect, vi } from "vitest";
import {
  extractDriveId,
  getDriveImageUrls,
  getDriveDownloadUrl,
  isValidImageUrl,
  generateUpiUri,
} from "@/lib/public-website/driveUtils";
import { DEFAULT_PUBLIC_CONTENT } from "@/lib/public-website/defaultContent";

describe("Public Website - Google Drive & Image Utilities", () => {
  it("extracts file ID from standard /file/d/ sharing URLs", () => {
    const url = "https://drive.google.com/file/d/16hdJsPDWQ6_S8i9HiAVw1Wxn36bT--M0/view?usp=sharing";
    const id = extractDriveId(url);
    expect(id).toBe("16hdJsPDWQ6_S8i9HiAVw1Wxn36bT--M0");
  });

  it("extracts file ID from ?id= query param URLs", () => {
    const url = "https://drive.google.com/open?id=16hdJsPDWQ6_S8i9HiAVw1Wxn36bT--M0";
    const id = extractDriveId(url);
    expect(id).toBe("16hdJsPDWQ6_S8i9HiAVw1Wxn36bT--M0");
  });

  it("extracts file ID from /uc?id= URLs", () => {
    const url = "https://drive.google.com/uc?id=16hdJsPDWQ6_S8i9HiAVw1Wxn36bT--M0";
    const id = extractDriveId(url);
    expect(id).toBe("16hdJsPDWQ6_S8i9HiAVw1Wxn36bT--M0");
  });

  it("returns null for placeholder or empty URLs", () => {
    expect(extractDriveId("")).toBeNull();
    expect(extractDriveId(null)).toBeNull();
    expect(extractDriveId(undefined)).toBeNull();
    expect(extractDriveId("https://drive.google.com/PASTE_YOUR_GOOGLE_DRIVE")).toBeNull();
  });

  it("generates prioritized thumbnail endpoints for Google Drive images", () => {
    const url = "https://drive.google.com/file/d/16hdJsPDWQ6_S8i9HiAVw1Wxn36bT--M0/view";
    const sources = getDriveImageUrls(url);
    expect(sources.length).toBe(3);
    expect(sources[0]).toContain("https://drive.google.com/thumbnail?id=16hdJsPDWQ6_S8i9HiAVw1Wxn36bT--M0&sz=w1200");
    expect(sources[1]).toContain("https://drive.google.com/uc?export=view&id=16hdJsPDWQ6_S8i9HiAVw1Wxn36bT--M0");
  });

  it("generates direct download URL for Google Drive file", () => {
    const url = "https://drive.google.com/file/d/16hdJsPDWQ6_S8i9HiAVw1Wxn36bT--M0/view";
    const download = getDriveDownloadUrl(url);
    expect(download).toBe("https://drive.usercontent.google.com/download?id=16hdJsPDWQ6_S8i9HiAVw1Wxn36bT--M0&export=download");
  });

  it("validates direct image URLs and Google Drive URLs", () => {
    expect(isValidImageUrl("https://drive.google.com/file/d/16hdJsPDWQ6_S8i9HiAVw1Wxn36bT--M0/view")).toBe(true);
    expect(isValidImageUrl("https://example.com/logo.png")).toBe(true);
    expect(isValidImageUrl("not-a-valid-url")).toBe(false);
  });

  it("generates standard UPI payment intent URIs", () => {
    const uri = generateUpiUri({
      payeeAddress: "studyaliveapp@okhdfcbank",
      payeeName: "Study Room",
      amount: 50,
      transactionNote: "Lifetime Access",
    });

    expect(uri).toContain("upi://pay?");
    expect(uri).toContain("pa=studyaliveapp%40okhdfcbank");
    expect(uri).toContain("pn=Study+Room");
    expect(uri).toContain("am=50.00");
  });
});

describe("Public Website - Authoritative Default Content", () => {
  it("contains all necessary sections with production defaults", () => {
    expect(DEFAULT_PUBLIC_CONTENT.general.title).toContain("Study Room");
    expect(DEFAULT_PUBLIC_CONTENT.hero.badge).toBeDefined();
    expect(DEFAULT_PUBLIC_CONTENT.features.length).toBeGreaterThanOrEqual(5);
    expect(DEFAULT_PUBLIC_CONTENT.howItWorks.length).toBe(4);
    expect(DEFAULT_PUBLIC_CONTENT.membership.priceInr).toBe(50);
    expect(DEFAULT_PUBLIC_CONTENT.conditions.eligibility.length).toBeGreaterThan(0);
    expect(DEFAULT_PUBLIC_CONTENT.conditions.acceptableUsage.length).toBeGreaterThan(0);
    expect(DEFAULT_PUBLIC_CONTENT.conditions.refundPolicy).toBeDefined();
    expect(DEFAULT_PUBLIC_CONTENT.faqs.length).toBeGreaterThanOrEqual(4);
  });

  it("features only verified real platform capabilities", () => {
    const featureIds = DEFAULT_PUBLIC_CONTENT.features.map((f) => f.id);
    expect(featureIds).toContain("timer");
    expect(featureIds).toContain("presence");
    expect(featureIds).toContain("goals");
    expect(featureIds).toContain("rivalry");
    expect(featureIds).toContain("leaderboard");
  });
});

describe("Public Website - UTR Validation Logic", () => {
  const isValidUtr = (utr: string) => /^[A-Za-z0-9]{8,22}$/.test(utr.trim().replace(/\s+/g, ""));

  it("accepts valid alphanumeric UTRs", () => {
    expect(isValidUtr("426819204812")).toBe(true); // 12-digit standard UPI UTR
    expect(isValidUtr("UPI426819204812")).toBe(true);
    expect(isValidUtr("4268 1920 4812")).toBe(true); // handles spaces
    expect(isValidUtr("AXIS09124812")).toBe(true);
  });

  it("rejects invalid UTRs", () => {
    expect(isValidUtr("")).toBe(false);
    expect(isValidUtr("12345")).toBe(false); // too short (< 8)
    expect(isValidUtr("1234567890123456789012345")).toBe(false); // too long (> 22)
    expect(isValidUtr("12345@#67890")).toBe(false); // special characters
  });
});

import { isMatchingAdminKey, DEFAULT_PUBLIC_ADMIN_KEY } from "@/lib/public-website/authUtils";

describe("Public Website - Admin Multi-Key Auth Logic", () => {
  it("matches the default administrative key", () => {
    expect(isMatchingAdminKey(DEFAULT_PUBLIC_ADMIN_KEY)).toBe(true);
    expect(isMatchingAdminKey("studyroom_admin_secure_key")).toBe(true);
  });

  it("rejects unauthorized passwords", () => {
    expect(isMatchingAdminKey("wrong_password")).toBe(false);
    expect(isMatchingAdminKey("")).toBe(false);
    expect(isMatchingAdminKey(null)).toBe(false);
  });
});

import {
  validateCouponCode,
  recordReferralEnrollment,
  inMemoryCoupons,
  saveCoupon,
} from "@/lib/public-website/couponStore";

describe("Public Website - Referral Coupon Validation & Enrollment", () => {
  it("validates existing active 100% OFF coupons", async () => {
    const res = await validateCouponCode("REFERRAL100");
    expect(res.valid).toBe(true);
    expect(res.coupon?.discountPercent).toBe(100);
    expect(res.coupon?.code).toBe("REFERRAL100");
  });

  it("handles case-insensitivity and whitespace in coupon codes", async () => {
    const res = await validateCouponCode("  study100  ");
    expect(res.valid).toBe(true);
    expect(res.coupon?.code).toBe("STUDY100");
  });

  it("rejects non-existent coupon codes with generic message", async () => {
    const res = await validateCouponCode("FAKECD999");
    expect(res.valid).toBe(false);
    expect(res.errorMessage).toBe("Invalid or inactive coupon code.");
  });

  it("rejects inactive coupon codes", async () => {
    const disabledCoupon = await saveCoupon({
      code: "DISABLEDTEST",
      isActive: false,
      discountPercent: 100,
    });
    expect(disabledCoupon.isActive).toBe(false);

    const res = await validateCouponCode("DISABLEDTEST");
    expect(res.valid).toBe(false);
    expect(res.errorMessage).toBe("Invalid or inactive coupon code.");
  });

  it("rejects coupons that have exceeded max_uses", async () => {
    const limitedCoupon = await saveCoupon({
      code: "MAXTEST",
      maxUses: 1,
      isActive: true,
      discountPercent: 100,
    });
    limitedCoupon.usedCount = 1;

    const res = await validateCouponCode("MAXTEST");
    expect(res.valid).toBe(false);
    expect(res.errorMessage).toBe("Invalid or inactive coupon code.");
  });

  it("fails referral enrollment if agreement is not accepted", async () => {
    const res = await recordReferralEnrollment({
      couponCode: "REFERRAL100",
      name: "Ravi Sharma",
      referredBy: "Aditya",
      agreementAccepted: false,
    });

    expect(res.success).toBe(false);
    expect(res.errorMessage).toContain("Referral Responsibility Agreement");
  });

  it("fails referral enrollment if name or referredBy is missing or too short", async () => {
    const res1 = await recordReferralEnrollment({
      couponCode: "REFERRAL100",
      name: "",
      referredBy: "Aditya",
      agreementAccepted: true,
    });
    expect(res1.success).toBe(false);
    expect(res1.errorMessage).toContain("full name");

    const res2 = await recordReferralEnrollment({
      couponCode: "REFERRAL100",
      name: "Ravi",
      referredBy: "",
      agreementAccepted: true,
    });
    expect(res2.success).toBe(false);
    expect(res2.errorMessage).toContain("who referred you");
  });

  it("successfully enrolls student with valid coupon, valid fields, and agreement", async () => {
    const initialUsedCount = inMemoryCoupons.find((c) => c.code === "REFERRAL100")?.usedCount || 0;

    const res = await recordReferralEnrollment({
      couponCode: "REFERRAL100",
      name: "Riya Verma",
      referredBy: "Telegram Study Group",
      agreementAccepted: true,
    });

    expect(res.success).toBe(true);
    expect(res.enrollmentId).toMatch(/^ref_/);

    const updatedUsedCount = inMemoryCoupons.find((c) => c.code === "REFERRAL100")?.usedCount || 0;
    expect(updatedUsedCount).toBe(initialUsedCount + 1);
  });
});

import React from "react";
import { render, screen } from "@testing-library/react";
import { PaymentSection } from "@/components/public-site/PaymentSection";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe("Public Website - Payment Section Security & UI Safety", () => {
  it("never exposes raw UPI ID text in the DOM to prevent misuse", () => {
    const { container } = render(
      React.createElement(PaymentSection, {
        membership: DEFAULT_PUBLIC_CONTENT.membership,
        branding: DEFAULT_PUBLIC_CONTENT.branding,
        onOpenUtrModal: () => {},
      })
    );


    // CRITICAL: Raw UPI ID must NOT appear anywhere in the rendered HTML
    expect(container.textContent).not.toContain("studyaliveapp@okhdfcbank");
    expect(screen.queryByText(/studyaliveapp@okhdfcbank/i)).toBeNull();

    // Verify presence of safe CTA and supported apps indicators
    expect(screen.getAllByText(/I Have Paid — Submit UTR/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/GPay/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/PhonePe/i).length).toBeGreaterThanOrEqual(1);
  });
});

import { Header } from "@/components/public-site/Header";
import { PublicFooter } from "@/components/public-site/PublicFooter";

describe("Public Website - Navigation & Access Gating", () => {
  it("does not render any Sign In, Login, or Admin Panel links on the public marketing page", () => {
    // 1. Check Header
    const { container: headerContainer } = render(
      React.createElement(Header, {
        general: DEFAULT_PUBLIC_CONTENT.general,
        branding: DEFAULT_PUBLIC_CONTENT.branding,
        onJoinClick: () => {},
      })
    );

    expect(headerContainer.querySelector('a[href="/login"]')).toBeNull();
    expect(headerContainer.querySelector('a[href="/signup"]')).toBeNull();
    expect(screen.queryByText(/^Sign In$/i)).toBeNull();

    // 2. Check Footer
    const { container: footerContainer } = render(
      React.createElement(PublicFooter, {
        general: DEFAULT_PUBLIC_CONTENT.general,
        branding: DEFAULT_PUBLIC_CONTENT.branding,
      })
    );

    expect(footerContainer.querySelector('a[href="/login"]')).toBeNull();
    expect(footerContainer.querySelector('a[href="/public/admin"]')).toBeNull();
    expect(screen.queryByText(/Student Sign In/i)).toBeNull();
    expect(screen.queryByText(/Admin Panel/i)).toBeNull();
  });
});

import { HeroSection } from "@/components/public-site/HeroSection";
import { getPublicSiteShareUrl, sharePublicSite } from "@/lib/public-website/driveUtils";

describe("Public Website - Direct Link Sharing", () => {
  it("resolves canonical direct public share URL", () => {
    const url = getPublicSiteShareUrl();
    expect(url).toContain("/public");
  });

  it("renders share buttons in both Header and HeroSection", () => {
    // 1. Header Share Button
    const { container: headerContainer } = render(
      React.createElement(Header, {
        general: DEFAULT_PUBLIC_CONTENT.general,
        branding: DEFAULT_PUBLIC_CONTENT.branding,
        onJoinClick: () => {},
      })
    );
    expect(headerContainer.querySelector('button[aria-label="Share public website with friends"]')).not.toBeNull();

    // 2. HeroSection Share Button
    const { container: heroContainer } = render(
      React.createElement(HeroSection, {
        hero: DEFAULT_PUBLIC_CONTENT.hero,
        onJoinClick: () => {},
      })
    );
    expect(heroContainer.querySelector('button[aria-label="Share StudyRoom direct link with friends"]')).not.toBeNull();
    expect(screen.getAllByText(/Share With Friends/i).length).toBeGreaterThanOrEqual(1);
  });
});

