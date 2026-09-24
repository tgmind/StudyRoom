export interface PublicWebsiteGeneralInfo {
  title: string;
  tagline: string;
  description: string;
  contactEmail: string;
  contactPhone?: string;
  supportInfo?: string;
  socialLinks?: {
    telegram?: string;
    discord?: string;
    twitter?: string;
    youtube?: string;
  };
}

export interface PublicWebsiteBranding {
  logoText: string;
  logoIcon: string;
  qrCodeDriveUrl: string;
  heroImageDriveUrl?: string;
  featureImageDriveUrl?: string;
}

export interface PublicWebsiteHero {
  badge: string;
  headlineMain: string;
  headlineHighlight: string;
  description: string;
  ctaPrimaryText: string;
  ctaSecondaryText: string;
  pills: string[];
}

export interface PublicWebsiteFeatureItem {
  id: string;
  icon: string;
  title: string;
  description: string;
  category?: string;
}

export interface PublicWebsiteHowItWorksStep {
  stepNumber: number;
  title: string;
  description: string;
  icon: string;
}

export interface PublicWebsiteMembership {
  priceInr: number;
  badgeText: string;
  title: string;
  description: string;
  upiId?: string;
  payeeName: string;
  benefits: string[];
  steps: {
    number: number;
    title: string;
    description: string;
  }[];
  securityNote: string;
  whyFeeTitle?: string;
  whyFeePoints?: string[];
  strictPolicyTitle?: string;
  strictPolicyText?: string;
}

export interface PublicWebsiteConditions {
  eligibility: string[];
  acceptableUsage: string[];
  studyRoomRules: string[];
  paymentConditions: string[];
  refundPolicy: string;
  cancellationPolicy: string;
  dataPrivacy: string;
}

export interface PublicWebsiteFaqItem {
  question: string;
  answer: string;
}

export interface PublicWebsiteContent {
  general: PublicWebsiteGeneralInfo;
  branding: PublicWebsiteBranding;
  hero: PublicWebsiteHero;
  howItWorks: PublicWebsiteHowItWorksStep[];
  features: PublicWebsiteFeatureItem[];
  membership: PublicWebsiteMembership;
  conditions: PublicWebsiteConditions;
  faqs: PublicWebsiteFaqItem[];
  lastUpdated?: string;
  version?: number;
}

export interface PaymentSubmission {
  id: string;
  name: string;
  contact: string;
  utr: string;
  amount: number;
  submittedAt: string;
  status: "pending" | "verified" | "rejected";
  notes?: string;
}

export interface PublicCoupon {
  id: string;
  code: string;
  discountPercent: number; // 100 for 100% OFF
  isActive: boolean;
  maxUses?: number | null;
  usedCount: number;
  note?: string;
  createdAt: string;
}

export interface ReferralEnrollment {
  id: string;
  couponCode: string;
  name: string;
  referredBy: string;
  agreementAccepted: boolean;
  submittedAt: string;
  status: "active" | "flagged" | "revoked";
}

export interface CouponValidationResult {
  valid: boolean;
  discountPercent?: number;
  code?: string;
  message: string;
}

