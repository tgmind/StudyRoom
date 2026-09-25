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
import { render, screen, fireEvent } from "@testing-library/react";
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

import {
  inMemorySubmissions,
  deleteSubmission,
  clearSubmissions,
} from "@/lib/public-website/submissionStore";
import {
  deleteCoupon,
  deleteReferralEnrollment,
  clearAllReferralEnrollments,
  inMemoryReferrals,
} from "@/lib/public-website/couponStore";

describe("Public Website - Admin Database & In-Memory Deletion Functions", () => {
  it("deletes a single submission by ID from memory", async () => {
    const testId = "test_sub_del_123";
    inMemorySubmissions.push({
      id: testId,
      name: "Test Delete User",
      contact: "del@test.com",
      utr: "123456789012",
      amount: 50,
      submittedAt: new Date().toISOString(),
      status: "pending",
    });

    expect(inMemorySubmissions.some((s) => s.id === testId)).toBe(true);

    const result = await deleteSubmission(testId);
    expect(result).toBe(true);
    expect(inMemorySubmissions.some((s) => s.id === testId)).toBe(false);
  });

  it("clears rejected submissions without deleting pending or verified submissions", async () => {
    inMemorySubmissions.push(
      {
        id: "sub_pending",
        name: "Pending User",
        contact: "pen@test.com",
        utr: "111111111111",
        amount: 50,
        submittedAt: new Date().toISOString(),
        status: "pending",
      },
      {
        id: "sub_rejected_1",
        name: "Rejected User 1",
        contact: "rej1@test.com",
        utr: "222222222222",
        amount: 50,
        submittedAt: new Date().toISOString(),
        status: "rejected",
      },
      {
        id: "sub_rejected_2",
        name: "Rejected User 2",
        contact: "rej2@test.com",
        utr: "333333333333",
        amount: 50,
        submittedAt: new Date().toISOString(),
        status: "rejected",
      },
      {
        id: "sub_verified",
        name: "Verified User",
        contact: "ver@test.com",
        utr: "444444444444",
        amount: 50,
        submittedAt: new Date().toISOString(),
        status: "verified",
      }
    );

    await clearSubmissions({ status: "rejected" });

    expect(inMemorySubmissions.some((s) => s.id === "sub_rejected_1")).toBe(false);
    expect(inMemorySubmissions.some((s) => s.id === "sub_rejected_2")).toBe(false);
    expect(inMemorySubmissions.some((s) => s.id === "sub_pending")).toBe(true);
    expect(inMemorySubmissions.some((s) => s.id === "sub_verified")).toBe(true);
  });

  it("clears all submissions when all flag is specified", async () => {
    expect(inMemorySubmissions.length).toBeGreaterThan(0);
    await clearSubmissions({ all: true });
    expect(inMemorySubmissions.length).toBe(0);
  });

  it("automatically deactivates and permanently deletes a coupon by code", async () => {
    await saveCoupon({
      code: "DELME100",
      discountPercent: 100,
      isActive: true,
      note: "Coupon to be deleted",
    });

    const validBefore = await validateCouponCode("DELME100");
    expect(validBefore.valid).toBe(true);

    const deleted = await deleteCoupon("DELME100");
    expect(deleted).toBe(true);

    const validAfter = await validateCouponCode("DELME100");
    expect(validAfter.valid).toBe(false);
  });

  it("deletes a referral enrollment by ID", async () => {
    await saveCoupon({ code: "ENROLLTEST", discountPercent: 100, isActive: true });
    const enrollRes = await recordReferralEnrollment({
      couponCode: "ENROLLTEST",
      name: "Enrollment Delete Test",
      referredBy: "Friend",
      agreementAccepted: true,
    });

    expect(enrollRes.success).toBe(true);
    const id = enrollRes.enrollmentId!;
    expect(inMemoryReferrals.some((r) => r.id === id)).toBe(true);

    const deleted = await deleteReferralEnrollment(id);
    expect(deleted).toBe(true);
    expect(inMemoryReferrals.some((r) => r.id === id)).toBe(false);
  });

  it("clears all referral enrollments", async () => {
    await saveCoupon({ code: "BATCHTEST", discountPercent: 100, isActive: true });
    await recordReferralEnrollment({
      couponCode: "BATCHTEST",
      name: "Student 1",
      referredBy: "Friend 1",
      agreementAccepted: true,
    });
    await recordReferralEnrollment({
      couponCode: "BATCHTEST",
      name: "Student 2",
      referredBy: "Friend 2",
      agreementAccepted: true,
    });

    expect(inMemoryReferrals.length).toBeGreaterThanOrEqual(2);
    const cleared = await clearAllReferralEnrollments();
    expect(cleared).toBe(true);
    expect(inMemoryReferrals.length).toBe(0);
  });
});

import { syncPriceInText, synchronizeContentPricing } from "@/lib/public-website/priceUtils";
import { SectionNavigator } from "@/components/public-site/SectionNavigator";

describe("Public Website - Dynamic Price Synchronization", () => {
  it("syncPriceInText replaces legacy ₹50 references with new amount", () => {
    expect(syncPriceInText("Join Study Room — ₹50", 20)).toBe("Join Study Room — ₹20");
    expect(syncPriceInText("The ₹50 fee is one-time and non-refundable.", 20)).toBe(
      "The ₹20 fee is one-time and non-refundable."
    );
    expect(syncPriceInText("Why is there a ₹50 fee?", 99)).toBe("Why is there a ₹99 fee?");
  });

  it("syncPriceInText preserves ₹0 free referral waiver indicators", () => {
    expect(syncPriceInText("Free Access — ₹0", 20)).toBe("Free Access — ₹0");
  });

  it("synchronizeContentPricing synchronizes all content fields to new price", () => {
    const customized = synchronizeContentPricing(DEFAULT_PUBLIC_CONTENT, 20);

    expect(customized.membership.priceInr).toBe(20);
    expect(customized.hero.ctaPrimaryText).toContain("₹20");
    expect(customized.membership.badgeText).toContain("₹20");
    expect(customized.membership.whyFeeTitle).toContain("₹20");
    expect(customized.membership.steps[1].title).toBe("Pay ₹20");
    expect(customized.membership.steps[1].description).toContain("₹20");
    expect(customized.conditions.refundPolicy).toContain("₹20");
    expect(customized.faqs[0].question).toContain("₹20");
    expect(customized.faqs[0].answer).toContain("₹20");
  });

  it("Header dynamically renders custom price when priceInr is passed", () => {
    const { container } = render(
      React.createElement(Header, {
        general: DEFAULT_PUBLIC_CONTENT.general,
        branding: DEFAULT_PUBLIC_CONTENT.branding,
        priceInr: 20,
        onJoinClick: () => {},
      })
    );

    expect(container.textContent).toContain("₹20 Access");
    expect(container.textContent).toContain("Join for ₹20");
    expect(container.textContent).not.toContain("₹50 Access");
    expect(container.textContent).not.toContain("Join for ₹50");
  });

  it("SectionNavigator dynamically updates membership label to custom price", () => {
    const { container } = render(
      React.createElement(SectionNavigator, { priceInr: 20 })
    );

    const toggleBtn = container.querySelector('button[aria-label="Toggle section navigator"]');
    if (toggleBtn) {
      fireEvent.click(toggleBtn);
    }

    expect(container.textContent).toContain("Membership & ₹20 Payment");
    expect(container.textContent).not.toContain("Membership & ₹50 Payment");
  });

  it("PaymentSection dynamically renders custom price throughout texts and QR card", () => {
    const syncedContent = synchronizeContentPricing(DEFAULT_PUBLIC_CONTENT, 20);
    const { container } = render(
      React.createElement(PaymentSection, {
        membership: syncedContent.membership,
        branding: syncedContent.branding,
        onOpenUtrModal: () => {},
      })
    );

    expect(container.textContent).toContain("Join Study Room for ₹20");
    expect(container.textContent).toContain("₹20");
    expect(container.textContent).toContain("one-time enrollment");
    expect(container.textContent).toContain("Pay ₹20");
    expect(container.textContent).toContain("Why is there a ₹20 fee?");
    expect(container.textContent).toContain("The ₹20 fee is one-time and non-refundable.");
    expect(container.textContent).not.toContain("Join Study Room for ₹50");
  });

  it("PublicFooter dynamically renders custom price in quick links", () => {
    const { container } = render(
      React.createElement(PublicFooter, {
        general: DEFAULT_PUBLIC_CONTENT.general,
        branding: DEFAULT_PUBLIC_CONTENT.branding,
        priceInr: 20,
      })
    );

    expect(container.textContent).toContain("₹20 Membership");
    expect(container.textContent).not.toContain("₹50 Membership");
  });
});



