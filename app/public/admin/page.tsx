"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { PublicWebsiteContent, PaymentSubmission, PublicCoupon, ReferralEnrollment } from "@/lib/public-website/types";
import { DEFAULT_PUBLIC_CONTENT } from "@/lib/public-website/defaultContent";
import { extractDriveId, getDriveImageUrls } from "@/lib/public-website/driveUtils";
import {
  Lock,
  Unlock,
  Save,
  Eye,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  QrCode,
  Image as ImageIcon,
  Settings,
  ShieldAlert,
  Users,
  HelpCircle,
  DollarSign,
  Loader2,
  RefreshCw,
  LogOut,
  Ticket,
  Plus,
} from "lucide-react";

export default function PublicSiteAdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [adminKey, setAdminKey] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  // Active Management Tab
  const [activeTab, setActiveTab] = useState<
    "general" | "branding" | "sections" | "conditions" | "faqs" | "submissions" | "coupons"
  >("general");

  // Editable Content State
  const [content, setContent] = useState<PublicWebsiteContent>(DEFAULT_PUBLIC_CONTENT);
  const [saving, setSaving] = useState(false);
  const [saveToast, setSaveToast] = useState<string | null>(null);

  // Submissions Queue State
  const [submissions, setSubmissions] = useState<PaymentSubmission[]>([]);
  const [loadingSubmissions, setLoadingSubmissions] = useState(false);

  // Referral Coupons State
  const [coupons, setCoupons] = useState<PublicCoupon[]>([]);
  const [referrals, setReferrals] = useState<ReferralEnrollment[]>([]);
  const [loadingCoupons, setLoadingCoupons] = useState(false);
  const [newCouponCode, setNewCouponCode] = useState("");
  const [newCouponMaxUses, setNewCouponMaxUses] = useState("");
  const [newCouponNote, setNewCouponNote] = useState("");
  const [creatingCoupon, setCreatingCoupon] = useState(false);

  // Check initial authentication
  useEffect(() => {
    fetch("/api/public-website/content")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && typeof data === "object") {
          setContent((prev) => ({ ...prev, ...data }));
        }
      })
      .catch(() => {});

    // Check if session cookie is already valid
    fetch("/api/public-website/admin/submissions")
      .then((res) => {
        if (res.ok) {
          setIsAuthenticated(true);
        } else {
          setIsAuthenticated(false);
        }
      })
      .catch(() => setIsAuthenticated(false));
  }, []);

  // Fetch submissions when tab becomes active
  useEffect(() => {
    if (isAuthenticated && activeTab === "submissions") {
      fetchSubmissions();
    }
    if (isAuthenticated && activeTab === "coupons") {
      fetchCoupons();
    }
  }, [isAuthenticated, activeTab]);

  const fetchSubmissions = async () => {
    setLoadingSubmissions(true);
    try {
      const res = await fetch("/api/public-website/admin/submissions");
      if (res.ok) {
        const data = await res.json();
        setSubmissions(data.submissions || []);
      }
    } catch {
      // ignore
    } finally {
      setLoadingSubmissions(false);
    }
  };

  const fetchCoupons = async () => {
    setLoadingCoupons(true);
    try {
      const res = await fetch("/api/public-website/admin/coupons");
      if (res.ok) {
        const data = await res.json();
        setCoupons(data.coupons || []);
        setReferrals(data.referrals || []);
      }
    } catch {
      // ignore
    } finally {
      setLoadingCoupons(false);
    }
  };

  const handleToggleCoupon = async (code: string, currentActive: boolean) => {
    try {
      const res = await fetch("/api/public-website/admin/coupons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, isActive: !currentActive }),
      });
      if (res.ok) {
        setCoupons((prev) =>
          prev.map((c) => (c.code === code ? { ...c, isActive: !currentActive } : c))
        );
      }
    } catch {}
  };

  const handleCreateCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCouponCode.trim()) return;
    setCreatingCoupon(true);
    try {
      const res = await fetch("/api/public-website/admin/coupons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: newCouponCode.trim().toUpperCase(),
          discountPercent: 100,
          maxUses: newCouponMaxUses ? Number(newCouponMaxUses) : null,
          note: newCouponNote.trim(),
          isActive: true,
        }),
      });
      if (res.ok) {
        setNewCouponCode("");
        setNewCouponMaxUses("");
        setNewCouponNote("");
        fetchCoupons();
      }
    } catch {}
    finally {
      setCreatingCoupon(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError(null);

    try {
      const res = await fetch("/api/public-website/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: adminKey.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Authentication failed");
      }

      setIsAuthenticated(true);
      fetchSubmissions();
    } catch (err: any) {
      setAuthError(err.message || "Invalid authentication key");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/public-website/admin/auth", { method: "DELETE" });
    setIsAuthenticated(false);
  };

  const handleSaveContent = async () => {
    setSaving(true);
    setSaveToast(null);

    try {
      const res = await fetch("/api/public-website/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(content),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to save content");
      }

      setSaveToast("Changes saved successfully!");
      setTimeout(() => setSaveToast(null), 3500);
    } catch (err: any) {
      alert("Error saving: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateSubmissionStatus = async (id: string, status: "verified" | "rejected") => {
    try {
      const res = await fetch("/api/public-website/admin/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      if (res.ok) {
        setSubmissions((prev) =>
          prev.map((s) => (s.id === id ? { ...s, status } : s))
        );
      }
    } catch (err) {
      alert("Failed to update submission");
    }
  };

  // Google Drive Preview Helper
  const qrDriveId = extractDriveId(content.branding.qrCodeDriveUrl);
  const qrPreviewUrls = getDriveImageUrls(content.branding.qrCodeDriveUrl);

  if (isAuthenticated === null) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-[#0b73e6]" />
      </div>
    );
  }

  // 1. Authentication Screen
  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f8fcff] p-4">
        <div className="w-full max-w-md rounded-3xl border border-blue-100 bg-white p-8 shadow-2xl">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#071a3a] text-white shadow-md">
            <Lock className="h-6 w-6 text-amber-400" />
          </div>

          <h1 className="mt-5 text-center text-2xl font-black text-[#071a3a]">
            Public Website Admin
          </h1>
          <p className="mt-1 text-center text-xs font-semibold text-slate-500">
            Enter your administrative key to manage content &amp; payments
          </p>

          {authError && (
            <div className="mt-4 flex items-center gap-2 rounded-xl bg-red-50 p-3 text-xs font-bold text-red-600 border border-red-200">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{authError}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="mt-6 space-y-4">
            <div>
              <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1.5">
                Admin Secret Key
              </label>
              <input
                type="password"
                required
                value={adminKey}
                onChange={(e) => setAdminKey(e.target.value)}
                placeholder="Enter PUBLIC_SITE_ADMIN_KEY"
                className="w-full rounded-xl border border-blue-200 px-4 py-3 text-sm font-bold outline-none focus:border-[#0b73e6] focus:ring-2 focus:ring-blue-100"
              />
              <span className="mt-1.5 block text-[11px] text-slate-400">
                Authorized administrators only.
              </span>
            </div>

            <button
              type="submit"
              disabled={authLoading}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#071a3a] hover:bg-[#0b244d] py-3.5 text-sm font-black text-white shadow-lg transition-all active:scale-95 disabled:opacity-75"
            >
              {authLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlock className="h-4 w-4" />}
              <span>Authenticate &amp; Open Dashboard</span>
            </button>
          </form>

          <div className="mt-6 border-t border-slate-100 pt-4 text-center">
            <Link href="/public" className="text-xs font-bold text-[#0b73e6] hover:underline">
              ← Return to Public Website
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // 2. Main Admin CMS Dashboard
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Admin Top Header */}
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white px-4 sm:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#071a3a] text-white">
            <Settings className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-black text-[#071a3a] leading-none">
              Public Website CMS &amp; Submissions
            </h2>
            <span className="text-[10px] font-bold text-slate-400">
              Isolated from Study Room Production App
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {saveToast && (
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700 animate-in fade-in">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>{saveToast}</span>
            </span>
          )}

          <Link
            href="/public"
            target="_blank"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <Eye className="h-3.5 w-3.5 text-[#0b73e6]" />
            <span>Preview Live Site</span>
            <ExternalLink className="h-3 w-3 text-slate-400" />
          </Link>

          <button
            type="button"
            onClick={handleSaveContent}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#0b73e6] hover:bg-blue-600 px-4 py-2 text-xs font-black text-white shadow transition-all active:scale-95 disabled:opacity-75"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            <span>Save Changes</span>
          </button>

          <button
            type="button"
            onClick={handleLogout}
            className="p-2 text-slate-400 hover:text-red-600 transition-colors"
            title="Sign Out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Main Admin Workspace */}
      <div className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-8">
        {/* Navigation Tabs */}
        <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
          {[
            { id: "general", label: "General & Support" },
            { id: "branding", label: "Branding & Google Drive" },
            { id: "sections", label: "Hero & Features" },
            { id: "conditions", label: "Rules & Policies" },
            { id: "faqs", label: "FAQs" },
            { id: "submissions", label: `₹50 Submissions (${submissions.filter((s) => s.status === "pending").length} pending)` },
            { id: "coupons", label: `Referral Coupons (${coupons.filter((c) => c.isActive).length} active)` },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as any)}
              className={`rounded-xl px-4 py-2 text-xs font-black transition-all ${
                activeTab === tab.id
                  ? "bg-[#071a3a] text-white shadow-sm"
                  : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab 1: General Info & Support */}
        {activeTab === "general" && (
          <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm space-y-6">
            <h3 className="text-lg font-black text-[#071a3a]">General Platform Information</h3>

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1.5">
                  Website Title
                </label>
                <input
                  type="text"
                  value={content.general.title}
                  onChange={(e) =>
                    setContent({
                      ...content,
                      general: { ...content.general, title: e.target.value },
                    })
                  }
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-bold outline-none focus:border-[#0b73e6]"
                />
              </div>

              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1.5">
                  Tagline
                </label>
                <input
                  type="text"
                  value={content.general.tagline}
                  onChange={(e) =>
                    setContent({
                      ...content,
                      general: { ...content.general, tagline: e.target.value },
                    })
                  }
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-bold outline-none focus:border-[#0b73e6]"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1.5">
                  Platform Description
                </label>
                <textarea
                  rows={3}
                  value={content.general.description}
                  onChange={(e) =>
                    setContent({
                      ...content,
                      general: { ...content.general, description: e.target.value },
                    })
                  }
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-medium outline-none focus:border-[#0b73e6]"
                />
              </div>

              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1.5">
                  Support Email
                </label>
                <input
                  type="email"
                  value={content.general.contactEmail}
                  onChange={(e) =>
                    setContent({
                      ...content,
                      general: { ...content.general, contactEmail: e.target.value },
                    })
                  }
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-bold outline-none focus:border-[#0b73e6]"
                />
              </div>

              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1.5">
                  Support Working Hours
                </label>
                <input
                  type="text"
                  value={content.general.supportInfo || ""}
                  onChange={(e) =>
                    setContent({
                      ...content,
                      general: { ...content.general, supportInfo: e.target.value },
                    })
                  }
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-bold outline-none focus:border-[#0b73e6]"
                />
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Branding & Google Drive Image Links */}
        {activeTab === "branding" && (
          <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm space-y-6">
            <h3 className="text-lg font-black text-[#071a3a]">Branding &amp; Google Drive Assets</h3>

            <div className="rounded-2xl bg-blue-50/70 p-4 border border-blue-100 text-xs font-semibold text-[#07458f] space-y-1.5">
              <p className="font-black text-sm">💡 Google Drive Image Instructions:</p>
              <p>
                1. Upload your QR code or image to Google Drive.<br />
                2. Right-click the file → <b>Share</b> → Under &apos;General access&apos;, select: <b>&quot;Anyone with the link&quot;</b> and set role to <b>&quot;Viewer&quot;</b>.<br />
                3. Paste the share link below. Our multi-endpoint algorithm will resolve it directly.
              </p>
            </div>

            <div className="space-y-5">
              {/* QR Code Drive Link */}
              <div className="rounded-2xl border border-slate-200 p-5 bg-slate-50/50">
                <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1.5">
                  UPI Payment QR Code (Google Drive Sharing URL)
                </label>
                <input
                  type="text"
                  value={content.branding.qrCodeDriveUrl}
                  onChange={(e) =>
                    setContent({
                      ...content,
                      branding: { ...content.branding, qrCodeDriveUrl: e.target.value },
                    })
                  }
                  placeholder="https://drive.google.com/file/d/.../view?usp=sharing"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-mono font-bold outline-none focus:border-[#0b73e6]"
                />

                {/* Live Preview of Drive QR */}
                <div className="mt-4 flex items-center gap-4">
                  <div className="h-24 w-24 rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm flex items-center justify-center overflow-hidden">
                    {qrPreviewUrls[0] ? (
                      <img
                        src={qrPreviewUrls[0]}
                        alt="QR Preview"
                        className="h-full w-full object-contain"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <QrCode className="h-8 w-8 text-slate-300" />
                    )}
                  </div>
                  <div className="text-xs space-y-1">
                    <p className="font-bold text-slate-700">
                      Parsed File ID:{" "}
                      <code className="bg-slate-200 px-1 py-0.5 rounded font-mono text-slate-800">
                        {qrDriveId || "None detected"}
                      </code>
                    </p>
                    <p className="text-slate-500">
                      Endpoint: Google Drive Thumbnail API (1200px)
                    </p>
                  </div>
                </div>
              </div>

              {/* Logo Settings */}
              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1.5">
                    Logo Text
                  </label>
                  <input
                    type="text"
                    value={content.branding.logoText}
                    onChange={(e) =>
                      setContent({
                        ...content,
                        branding: { ...content.branding, logoText: e.target.value },
                      })
                    }
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-bold outline-none focus:border-[#0b73e6]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1.5">
                    Logo Icon / Emoji
                  </label>
                  <input
                    type="text"
                    value={content.branding.logoIcon}
                    onChange={(e) =>
                      setContent({
                        ...content,
                        branding: { ...content.branding, logoIcon: e.target.value },
                      })
                    }
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-bold outline-none focus:border-[#0b73e6]"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Hero & Features */}
        {activeTab === "sections" && (
          <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm space-y-6">
            <h3 className="text-lg font-black text-[#071a3a]">Hero &amp; Core Content</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1.5">
                  Hero Top Pill Badge
                </label>
                <input
                  type="text"
                  value={content.hero.badge}
                  onChange={(e) =>
                    setContent({
                      ...content,
                      hero: { ...content.hero, badge: e.target.value },
                    })
                  }
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-bold outline-none focus:border-[#0b73e6]"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1.5">
                    Main Headline
                  </label>
                  <input
                    type="text"
                    value={content.hero.headlineMain}
                    onChange={(e) =>
                      setContent({
                        ...content,
                        hero: { ...content.hero, headlineMain: e.target.value },
                      })
                    }
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-bold outline-none focus:border-[#0b73e6]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1.5">
                    Highlighted Headline (Blue)
                  </label>
                  <input
                    type="text"
                    value={content.hero.headlineHighlight}
                    onChange={(e) =>
                      setContent({
                        ...content,
                        hero: { ...content.hero, headlineHighlight: e.target.value },
                      })
                    }
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-bold outline-none focus:border-[#0b73e6]"
                  />
                </div>
              </div>

              {/* Membership Price */}
              <div className="rounded-2xl bg-amber-50/60 p-4 border border-amber-200/80">
                <label className="block text-xs font-black uppercase tracking-wider text-amber-900 mb-1.5">
                  Membership Joining Fee (₹ INR)
                </label>
                <input
                  type="number"
                  value={content.membership.priceInr}
                  onChange={(e) =>
                    setContent({
                      ...content,
                      membership: {
                        ...content.membership,
                        priceInr: Number(e.target.value) || 50,
                      },
                    })
                  }
                  className="w-36 rounded-xl border border-amber-300 bg-white px-3.5 py-2 text-lg font-black text-amber-900 outline-none focus:border-[#0b73e6]"
                />
                <span className="ml-3 text-xs font-bold text-amber-800">
                  Default: ₹50 one-time
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Tab 4: Rules & Policies */}
        {activeTab === "conditions" && (
          <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm space-y-6">
            <h3 className="text-lg font-black text-[#071a3a]">Rules, Conditions &amp; Policies</h3>

            <div className="space-y-5">
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1.5">
                  Refund Policy Text
                </label>
                <textarea
                  rows={3}
                  value={content.conditions.refundPolicy}
                  onChange={(e) =>
                    setContent({
                      ...content,
                      conditions: { ...content.conditions, refundPolicy: e.target.value },
                    })
                  }
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-medium outline-none focus:border-[#0b73e6]"
                />
              </div>

              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1.5">
                  Data Privacy Standard
                </label>
                <textarea
                  rows={3}
                  value={content.conditions.dataPrivacy}
                  onChange={(e) =>
                    setContent({
                      ...content,
                      conditions: { ...content.conditions, dataPrivacy: e.target.value },
                    })
                  }
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-medium outline-none focus:border-[#0b73e6]"
                />
              </div>
            </div>
          </div>
        )}

        {/* Tab 5: FAQs */}
        {activeTab === "faqs" && (
          <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm space-y-6">
            <h3 className="text-lg font-black text-[#071a3a]">Frequently Asked Questions</h3>

            <div className="space-y-4">
              {content.faqs.map((faq, idx) => (
                <div key={idx} className="rounded-2xl border border-slate-200 p-4 space-y-2">
                  <input
                    type="text"
                    value={faq.question}
                    onChange={(e) => {
                      const updated = [...content.faqs];
                      updated[idx].question = e.target.value;
                      setContent({ ...content, faqs: updated });
                    }}
                    placeholder="Question"
                    className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-black outline-none focus:border-[#0b73e6]"
                  />
                  <textarea
                    rows={2}
                    value={faq.answer}
                    onChange={(e) => {
                      const updated = [...content.faqs];
                      updated[idx].answer = e.target.value;
                      setContent({ ...content, faqs: updated });
                    }}
                    placeholder="Answer"
                    className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium outline-none focus:border-[#0b73e6]"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 6: Payment Submissions Queue */}
        {activeTab === "submissions" && (
          <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black text-[#071a3a]">Payment Submissions Queue</h3>
                <p className="text-xs text-slate-500">
                  Review student UTR submissions and verify against bank statement
                </p>
              </div>

              <button
                type="button"
                onClick={fetchSubmissions}
                disabled={loadingSubmissions}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loadingSubmissions ? "animate-spin" : ""}`} />
                <span>Refresh</span>
              </button>
            </div>

            {submissions.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-xs font-bold">
                No payment submissions in queue yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 text-slate-400 uppercase tracking-wider">
                    <tr>
                      <th className="py-2.5 px-3">Student Name</th>
                      <th className="py-2.5 px-3">Contact</th>
                      <th className="py-2.5 px-3">UTR Reference</th>
                      <th className="py-2.5 px-3">Amount</th>
                      <th className="py-2.5 px-3">Submitted</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {submissions.map((sub) => (
                      <tr key={sub.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-3 font-bold text-[#071a3a]">{sub.name}</td>
                        <td className="py-3 px-3 text-slate-600">{sub.contact}</td>
                        <td className="py-3 px-3 font-mono font-black text-blue-700 tracking-wider">
                          {sub.utr}
                        </td>
                        <td className="py-3 px-3 font-bold text-slate-800">₹{sub.amount}</td>
                        <td className="py-3 px-3 text-slate-400">
                          {new Date(sub.submittedAt).toLocaleDateString()} {new Date(sub.submittedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                              sub.status === "verified"
                                ? "bg-green-100 text-green-700"
                                : sub.status === "rejected"
                                ? "bg-red-100 text-red-700"
                                : "bg-amber-100 text-amber-800"
                            }`}
                          >
                            {sub.status}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right space-x-2">
                          {sub.status === "pending" && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleUpdateSubmissionStatus(sub.id, "verified")}
                                className="rounded-lg bg-green-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-green-700 shadow-sm"
                              >
                                Verify
                              </button>
                              <button
                                type="button"
                                onClick={() => handleUpdateSubmissionStatus(sub.id, "rejected")}
                                className="rounded-lg bg-red-100 px-2.5 py-1 text-[11px] font-bold text-red-700 hover:bg-red-200"
                              >
                                Reject
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab 7: Referral Coupons & Access */}
        {activeTab === "coupons" && (
          <div className="mt-6 space-y-6">
            {/* Coupon Generator Card */}
            <div className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <Ticket className="w-5 h-5 text-[#0b73e6]" />
                <h3 className="text-lg font-black text-[#071a3a]">Create or Update Referral Coupon</h3>
              </div>
              <form onSubmit={handleCreateCoupon} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1">
                    Coupon Code *
                  </label>
                  <input
                    type="text"
                    required
                    value={newCouponCode}
                    onChange={(e) => setNewCouponCode(e.target.value.toUpperCase())}
                    placeholder="e.g. PARTNER100"
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs sm:text-sm font-bold uppercase tracking-wider text-[#071a3a] outline-none focus:border-[#0b73e6]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1">
                    Max Uses (Leave blank for unlimited)
                  </label>
                  <input
                    type="number"
                    value={newCouponMaxUses}
                    onChange={(e) => setNewCouponMaxUses(e.target.value)}
                    placeholder="e.g. 250"
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs sm:text-sm font-bold text-[#071a3a] outline-none focus:border-[#0b73e6]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1">
                    Internal Note / Source
                  </label>
                  <input
                    type="text"
                    value={newCouponNote}
                    onChange={(e) => setNewCouponNote(e.target.value)}
                    placeholder="e.g. Special telegram batch"
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs sm:text-sm font-bold text-[#071a3a] outline-none focus:border-[#0b73e6]"
                  />
                </div>
                <div className="sm:col-span-3 flex justify-end">
                  <button
                    type="submit"
                    disabled={creatingCoupon || !newCouponCode.trim()}
                    className="inline-flex items-center gap-2 rounded-xl bg-[#071a3a] hover:bg-[#0b244d] disabled:opacity-50 px-5 py-2.5 text-xs font-black text-white shadow-sm transition-all"
                  >
                    {creatingCoupon ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    <span>Save Coupon</span>
                  </button>
                </div>
              </form>
            </div>

            {/* Coupons List Table */}
            <div className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-black text-[#071a3a]">Active Referral Coupons</h3>
                  <p className="text-xs text-slate-500">Manage 100% OFF referral coupons and activation status</p>
                </div>
                <button
                  type="button"
                  onClick={fetchCoupons}
                  disabled={loadingCoupons}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loadingCoupons ? "animate-spin" : ""}`} />
                  <span>Refresh</span>
                </button>
              </div>

              {coupons.length === 0 ? (
                <div className="text-center py-10 text-xs font-bold text-slate-400">
                  No coupons found.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-200 text-slate-400 uppercase tracking-wider">
                      <tr>
                        <th className="py-2.5 px-3">Code</th>
                        <th className="py-2.5 px-3">Discount</th>
                        <th className="py-2.5 px-3">Redemptions</th>
                        <th className="py-2.5 px-3">Internal Note</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {coupons.map((c) => (
                        <tr key={c.id || c.code} className="hover:bg-slate-50/70">
                          <td className="py-3 px-3 font-mono font-black text-[#071a3a] tracking-wider">
                            {c.code}
                          </td>
                          <td className="py-3 px-3">
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-black text-emerald-800 text-[10px]">
                              {c.discountPercent}% OFF
                            </span>
                          </td>
                          <td className="py-3 px-3 text-slate-700 font-bold">
                            {c.usedCount} / {c.maxUses ? c.maxUses : "∞"}
                          </td>
                          <td className="py-3 px-3 text-slate-500">{c.note || "—"}</td>
                          <td className="py-3 px-3">
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                                c.isActive
                                  ? "bg-green-100 text-green-700"
                                  : "bg-slate-100 text-slate-500"
                              }`}
                            >
                              {c.isActive ? "Active" : "Disabled"}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => handleToggleCoupon(c.code, c.isActive)}
                              className={`rounded-lg px-2.5 py-1 text-[11px] font-bold shadow-sm transition-colors ${
                                c.isActive
                                  ? "bg-red-50 text-red-600 hover:bg-red-100 border border-red-200"
                                  : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200"
                              }`}
                            >
                              {c.isActive ? "Deactivate" : "Activate"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Referral Redemptions Table */}
            <div className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm space-y-4">
              <div>
                <h3 className="text-lg font-black text-[#071a3a]">Recent Referral Enrollments</h3>
                <p className="text-xs text-slate-500">Students who registered using a 100% OFF referral coupon</p>
              </div>

              {referrals.length === 0 ? (
                <div className="text-center py-10 text-xs font-bold text-slate-400">
                  No referral enrollments recorded yet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-200 text-slate-400 uppercase tracking-wider">
                      <tr>
                        <th className="py-2.5 px-3">Student Name</th>
                        <th className="py-2.5 px-3">Referred By</th>
                        <th className="py-2.5 px-3">Coupon Used</th>
                        <th className="py-2.5 px-3">Agreement</th>
                        <th className="py-2.5 px-3">Enrolled At</th>
                        <th className="py-2.5 px-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {referrals.map((ref) => (
                        <tr key={ref.id} className="hover:bg-slate-50/70">
                          <td className="py-3 px-3 font-bold text-[#071a3a]">{ref.name}</td>
                          <td className="py-3 px-3 text-slate-700">{ref.referredBy}</td>
                          <td className="py-3 px-3 font-mono font-black text-emerald-700">
                            {ref.couponCode}
                          </td>
                          <td className="py-3 px-3">
                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-black text-emerald-700 border border-emerald-200">
                              ✓ Accepted
                            </span>
                          </td>
                          <td className="py-3 px-3 text-slate-400">
                            {new Date(ref.submittedAt).toLocaleDateString()} {new Date(ref.submittedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </td>
                          <td className="py-3 px-3">
                            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-black text-blue-700 border border-blue-200 uppercase">
                              {ref.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
