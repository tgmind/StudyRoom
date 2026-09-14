"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Bell,
  RefreshCw,
  Send,
  Eye,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Clock,
  ShieldCheck,
  Smartphone,
  Monitor,
  Search,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Mail,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { generateAlertEmail, AlertType } from "@/lib/email/templates";
import { createClient } from "@/lib/supabase/client";

interface AlertCandidate {
  candidate_id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  alert_type: AlertType;
  consecutive_inactive_days: number;
  reason: string;
  last_active_at: string;
  last_alert_sent_at: string | null;
  has_achiever_badge: boolean;
  total_study_minutes: number;
}

interface AlertHistoryItem {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  alert_type: AlertType;
  status: "pending" | "sent" | "failed" | "dismissed";
  consecutive_inactive_days: number;
  reason: string;
  error_message: string | null;
  sent_at: string | null;
  created_at: string;
}

interface MailerConfigStatus {
  configured: boolean;
  user?: string;
  reason?: string;
}

interface AdminAlertsHubProps {
  adminEmail?: string;
}

type TabType = "all" | "A" | "I" | "D" | "history";

export function AdminAlertsHub({ adminEmail }: AdminAlertsHubProps) {
  const [candidates, setCandidates] = useState<AlertCandidate[]>([]);
  const [history, setHistory] = useState<AlertHistoryItem[]>([]);
  const [mailerConfig, setMailerConfig] = useState<MailerConfigStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Modals state
  const [previewCandidate, setPreviewCandidate] = useState<AlertCandidate | null>(null);
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "mobile">("desktop");
  const [testEmailAddress, setTestEmailAddress] = useState(adminEmail || "");
  const [sendingTest, setSendingTest] = useState(false);
  const [testSuccessMessage, setTestSuccessMessage] = useState<string | null>(null);
  const [testErrorMessage, setTestErrorMessage] = useState<string | null>(null);

  // Batch dispatch state
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [batchInProgress, setBatchInProgress] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });
  const [batchResults, setBatchResults] = useState<
    Array<{ candidate_id: string; user_name: string; success: boolean; error?: string }>
  >([]);
  const [batchFinished, setBatchFinished] = useState(false);

  // Migration requirement prompt
  const [needsMigration, setNeedsMigration] = useState(false);
  const [showConfigHelp, setShowConfigHelp] = useState(false);

  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    if (adminEmail && !testEmailAddress) {
      setTestEmailAddress(adminEmail);
    }
  }, [adminEmail, testEmailAddress]);

  const getAuthHeaders = useCallback(async () => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
      }
    } catch {
      // ignore
    }
    return headers;
  }, [supabase]);

  // Fetch candidates and config
  const fetchData = useCallback(async () => {
    try {
      setRefreshing(true);
      const headers = await getAuthHeaders();
      const [candidatesRes, configRes, historyRes] = await Promise.allSettled([
        fetch("/api/admin/alerts?action=candidates", { headers }),
        fetch("/api/admin/alerts?action=config", { headers }),
        fetch("/api/admin/alerts?action=history&limit=50", { headers }),
      ]);

      if (configRes.status === "fulfilled" && configRes.value.ok) {
        const cfg = await configRes.value.json();
        setMailerConfig(cfg);
        if (!cfg.configured) {
          setShowConfigHelp(true);
        }
      }

      if (candidatesRes.status === "fulfilled") {
        const json = await candidatesRes.value.json();
        if (json.needsMigration) {
          setNeedsMigration(true);
        } else if (json.candidates) {
          setCandidates(json.candidates);
          setNeedsMigration(false);
        }
      }

      if (historyRes.status === "fulfilled" && historyRes.value.ok) {
        const histJson = await historyRes.value.json();
        if (histJson.history) {
          setHistory(histJson.history);
        }
      }
    } catch (err) {
      console.error("Alerts fetch error:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Filtered candidate list
  const filteredCandidates = useMemo(() => {
    return candidates.filter((item) => {
      const matchesTab = activeTab === "all" || item.alert_type === activeTab;
      const query = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !query ||
        item.user_name.toLowerCase().includes(query) ||
        item.user_email.toLowerCase().includes(query);
      return matchesTab && matchesSearch;
    });
  }, [candidates, activeTab, searchQuery]);

  // Counts
  const counts = useMemo(() => {
    const total = candidates.length;
    const aCount = candidates.filter((c) => c.alert_type === "A").length;
    const iCount = candidates.filter((c) => c.alert_type === "I").length;
    const dCount = candidates.filter((c) => c.alert_type === "D").length;
    const sentCount = history.filter((h) => h.status === "sent").length;
    return { total, aCount, iCount, dCount, sentCount };
  }, [candidates, history]);

  // Selection helpers
  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAllFiltered = () => {
    if (selectedIds.size === filteredCandidates.length && filteredCandidates.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredCandidates.map((c) => c.candidate_id)));
    }
  };

  // Live Email Preview Data
  const previewEmailContent = useMemo(() => {
    if (!previewCandidate) return null;
    return generateAlertEmail(
      previewCandidate.alert_type,
      previewCandidate.user_name,
      previewCandidate.consecutive_inactive_days
    );
  }, [previewCandidate]);

  // Send Test Email Action
  const handleSendTest = async () => {
    if (!previewCandidate || !testEmailAddress) return;
    setSendingTest(true);
    setTestSuccessMessage(null);
    setTestErrorMessage(null);

    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/admin/alerts", {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "send_test",
          to: testEmailAddress.trim(),
          name: previewCandidate.user_name,
          type: previewCandidate.alert_type,
          consecutiveDays: previewCandidate.consecutive_inactive_days,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to send test email");
      }

      setTestSuccessMessage(`Test email sent to ${testEmailAddress}! Check your Primary Inbox.`);
    } catch (err) {
      setTestErrorMessage(err instanceof Error ? err.message : "Failed to send test email");
    } finally {
      setSendingTest(false);
    }
  };

  // Batch Dispatch Trigger
  const handleStartBatchDispatch = async () => {
    const selectedList = candidates.filter((c) => selectedIds.has(c.candidate_id));
    if (selectedList.length === 0) return;

    setBatchInProgress(true);
    setBatchFinished(false);
    setBatchResults([]);
    setBatchProgress({ current: 0, total: selectedList.length });

    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/admin/alerts", {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "send_batch",
          candidates: selectedList,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Batch dispatch error");
      }

      setBatchResults(
        json.results.map((r: any) => ({
          candidate_id: r.candidate_id,
          user_name: r.user_name,
          success: r.success,
          error: r.error,
        }))
      );
      setBatchProgress({ current: selectedList.length, total: selectedList.length });
      setBatchFinished(true);

      // Refresh data to reflect sent status
      await fetchData();
      setSelectedIds(new Set());
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to dispatch batch");
    } finally {
      setBatchInProgress(false);
    }
  };

  // Helper for type badges
  const renderTypeBadge = (type: AlertType) => {
    switch (type) {
      case "A":
        return (
          <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">
            <span>🏆</span>
            <span>Achiever&apos;s Title</span>
          </span>
        );
      case "I":
        return (
          <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/15 border border-amber-500/30 text-amber-300">
            <span>⚠️</span>
            <span>Account Notice (3d)</span>
          </span>
        );
      case "D":
        return (
          <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-500/15 border border-rose-500/30 text-rose-300">
            <span>🚨</span>
            <span>Deletion Alert (5d)</span>
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. TOP HEADER & CONTROLS */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-zinc-800">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-xl font-bold text-zinc-100 flex items-center space-x-2">
              <Bell className="w-5 h-5 text-indigo-400" />
              <span>Alerts &amp; Retention Center</span>
            </h2>
            <span className="px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider rounded-md bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
              Manual Watch Hub
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Scan inactive students, preview spam-tested email templates, and dispatch alerts directly to inboxes.
          </p>
        </div>

        <div className="flex items-center space-x-2.5">
          <Button
            variant="secondary"
            size="sm"
            onClick={fetchData}
            isLoading={refreshing}
            className="border-zinc-700 hover:bg-zinc-800"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${refreshing ? "animate-spin" : ""}`} />
            <span>Scan Candidates</span>
          </Button>

          {selectedIds.size > 0 && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setBatchFinished(false);
                setBatchResults([]);
                setIsBatchModalOpen(true);
              }}
              className="bg-indigo-600 hover:bg-indigo-500 text-white border-none shadow-indigo-500/20"
            >
              <Send className="w-3.5 h-3.5 mr-1.5" />
              <span>Dispatch Selected ({selectedIds.size})</span>
            </Button>
          )}
        </div>
      </div>

      {/* 2. SYSTEM STATUS / CONFIGURATION ACCORDION */}
      {mailerConfig && (
        <div
          className={`p-3.5 rounded-xl border text-xs transition-all ${
            mailerConfig.configured
              ? "bg-emerald-950/20 border-emerald-900/40 text-emerald-300"
              : "bg-amber-950/30 border-amber-900/50 text-amber-200"
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              {mailerConfig.configured ? (
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-amber-400" />
              )}
              <span className="font-semibold">
                {mailerConfig.configured
                  ? `Email Dispatcher Ready: Authenticated Gmail SMTP (${mailerConfig.user})`
                  : "Email Credentials Needed (.env.local)"}
              </span>
            </div>
            <button
              onClick={() => setShowConfigHelp((v) => !v)}
              className="flex items-center space-x-1 text-zinc-400 hover:text-zinc-200"
            >
              <span>{showConfigHelp ? "Hide instructions" : "Setup guide"}</span>
              {showConfigHelp ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>

          {showConfigHelp && (
            <div className="mt-3 pt-3 border-t border-zinc-800 text-zinc-300 space-y-2">
              <p className="font-medium text-zinc-200">
                To send alert emails 100% free for life without going to spam:
              </p>
              <ol className="list-decimal pl-5 space-y-1 text-zinc-400">
                <li>Create or choose any standard free personal Gmail address.</li>
                <li>
                  Go to{" "}
                  <a
                    href="https://myaccount.google.com/apppasswords"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-400 underline inline-flex items-center"
                  >
                    Google Account Security &rarr; App Passwords <ExternalLink className="w-3 h-3 ml-1" />
                  </a>
                </li>
                <li>Generate a 16-character App Password named &ldquo;StudyRoom Alerts&rdquo;.</li>
                <li>
                  Add to your <code className="bg-zinc-800 text-zinc-200 px-1 py-0.5 rounded">.env.local</code>:
                </li>
              </ol>
              <pre className="bg-zinc-900 p-2.5 rounded-lg border border-zinc-800 font-mono text-[11px] text-zinc-300 overflow-x-auto">
{`ALERT_GMAIL_USER=your_alerts_email@gmail.com
ALERT_GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
ALERT_FROM_NAME=StudyRoom`}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* 3. SQL MIGRATION REQUIRED WARNING */}
      {needsMigration && (
        <div className="p-4 rounded-xl bg-red-950/30 border border-red-800/50 text-red-200 text-xs flex items-start space-x-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold text-red-100">Database Migration Required in Supabase</p>
            <p className="text-red-300">
              The <code className="bg-red-950/60 px-1 py-0.5 rounded">user_alerts</code> table and scanner function
              haven&apos;t been executed yet. Run the script located in:
            </p>
            <p className="font-mono text-[11px] bg-black/40 p-2 rounded border border-red-900/40 text-red-200">
              supabase/migrations/20260914_alerts_system.sql
            </p>
          </div>
        </div>
      )}

      {/* 4. METRIC CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div
          onClick={() => setActiveTab("all")}
          className={`cursor-pointer p-3.5 rounded-xl border transition-all ${
            activeTab === "all"
              ? "bg-zinc-800/80 border-indigo-500/50 shadow-sm"
              : "bg-zinc-900/40 border-zinc-800 hover:bg-zinc-900"
          }`}
        >
          <div className="text-xs text-zinc-400">Total Actionable</div>
          <div className="text-xl font-bold text-zinc-100 mt-1">{counts.total}</div>
        </div>

        <div
          onClick={() => setActiveTab("A")}
          className={`cursor-pointer p-3.5 rounded-xl border transition-all ${
            activeTab === "A"
              ? "bg-emerald-950/30 border-emerald-500/50 shadow-sm"
              : "bg-zinc-900/40 border-zinc-800 hover:bg-zinc-900"
          }`}
        >
          <div className="text-xs text-emerald-400 flex items-center space-x-1">
            <span>🏆</span>
            <span>Achievers</span>
          </div>
          <div className="text-xl font-bold text-emerald-300 mt-1">{counts.aCount}</div>
        </div>

        <div
          onClick={() => setActiveTab("I")}
          className={`cursor-pointer p-3.5 rounded-xl border transition-all ${
            activeTab === "I"
              ? "bg-amber-950/30 border-amber-500/50 shadow-sm"
              : "bg-zinc-900/40 border-zinc-800 hover:bg-zinc-900"
          }`}
        >
          <div className="text-xs text-amber-400 flex items-center space-x-1">
            <span>⚠️</span>
            <span>Notice (3d)</span>
          </div>
          <div className="text-xl font-bold text-amber-300 mt-1">{counts.iCount}</div>
        </div>

        <div
          onClick={() => setActiveTab("D")}
          className={`cursor-pointer p-3.5 rounded-xl border transition-all ${
            activeTab === "D"
              ? "bg-rose-950/30 border-rose-500/50 shadow-sm"
              : "bg-zinc-900/40 border-zinc-800 hover:bg-zinc-900"
          }`}
        >
          <div className="text-xs text-rose-400 flex items-center space-x-1">
            <span>🚨</span>
            <span>Deletion (5d)</span>
          </div>
          <div className="text-xl font-bold text-rose-300 mt-1">{counts.dCount}</div>
        </div>

        <div
          onClick={() => setActiveTab("history")}
          className={`cursor-pointer p-3.5 rounded-xl border transition-all ${
            activeTab === "history"
              ? "bg-zinc-800/80 border-zinc-600 shadow-sm"
              : "bg-zinc-900/40 border-zinc-800 hover:bg-zinc-900"
          }`}
        >
          <div className="text-xs text-zinc-400 flex items-center space-x-1">
            <Clock className="w-3.5 h-3.5" />
            <span>Sent History</span>
          </div>
          <div className="text-xl font-bold text-zinc-300 mt-1">{counts.sentCount}</div>
        </div>
      </div>

      {/* 5. FILTER TABS & SEARCH */}
      {activeTab !== "history" ? (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center space-x-1.5 overflow-x-auto pb-1">
              <button
                onClick={() => setActiveTab("all")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  activeTab === "all"
                    ? "bg-zinc-100 text-zinc-950"
                    : "bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800"
                }`}
              >
                All ({counts.total})
              </button>
              <button
                onClick={() => setActiveTab("A")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  activeTab === "A"
                    ? "bg-emerald-500 text-zinc-950"
                    : "bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800"
                }`}
              >
                🏆 Achievers ({counts.aCount})
              </button>
              <button
                onClick={() => setActiveTab("I")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  activeTab === "I"
                    ? "bg-amber-500 text-zinc-950"
                    : "bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800"
                }`}
              >
                ⚠️ 3-Day Notice ({counts.iCount})
              </button>
              <button
                onClick={() => setActiveTab("D")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  activeTab === "D"
                    ? "bg-rose-500 text-zinc-950"
                    : "bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800"
                }`}
              >
                🚨 5-Day Deletion ({counts.dCount})
              </button>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                placeholder="Search candidates..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-zinc-900/90 border border-zinc-800 text-zinc-200 text-xs rounded-lg pl-8 pr-3 py-2 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {/* 6. CANDIDATES TABLE */}
          <div className="border border-zinc-800/80 rounded-xl overflow-hidden bg-zinc-900/30">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-zinc-300">
                <thead className="bg-zinc-900/80 text-zinc-400 border-b border-zinc-800 font-semibold uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="p-3 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={
                          selectedIds.size === filteredCandidates.length &&
                          filteredCandidates.length > 0
                        }
                        onChange={handleSelectAllFiltered}
                        className="rounded bg-zinc-800 border-zinc-700 text-indigo-600 focus:ring-0 cursor-pointer"
                      />
                    </th>
                    <th className="p-3">Student</th>
                    <th className="p-3">Alert Type</th>
                    <th className="p-3">Activity Status</th>
                    <th className="p-3">Last Active</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-zinc-500">
                        <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-zinc-400" />
                        Scanning active &amp; inactive students...
                      </td>
                    </tr>
                  ) : filteredCandidates.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-zinc-500">
                        No students currently match this filter. Everything is up to date!
                      </td>
                    </tr>
                  ) : (
                    filteredCandidates.map((candidate) => {
                      const isSelected = selectedIds.has(candidate.candidate_id);
                      return (
                        <tr
                          key={candidate.candidate_id}
                          className={`hover:bg-zinc-800/40 transition-colors ${
                            isSelected ? "bg-indigo-950/20" : ""
                          }`}
                        >
                          <td className="p-3 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleSelect(candidate.candidate_id)}
                              className="rounded bg-zinc-800 border-zinc-700 text-indigo-600 focus:ring-0 cursor-pointer"
                            />
                          </td>
                          <td className="p-3">
                            <div className="flex items-center space-x-2.5">
                              <div className="w-7 h-7 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center font-bold text-[11px] text-zinc-200">
                                {candidate.user_name.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <div className="font-semibold text-zinc-100">
                                  {candidate.user_name}
                                </div>
                                <div className="text-[11px] text-zinc-500 font-mono">
                                  {candidate.user_email}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="p-3">{renderTypeBadge(candidate.alert_type)}</td>
                          <td className="p-3">
                            {candidate.alert_type === "A" ? (
                              <span className="text-emerald-400 font-medium">
                                Achiever badge active ({Math.round(candidate.total_study_minutes / 60)}h total)
                              </span>
                            ) : (
                              <span
                                className={`font-semibold ${
                                  candidate.consecutive_inactive_days >= 5
                                    ? "text-rose-400"
                                    : "text-amber-400"
                                }`}
                              >
                                {candidate.consecutive_inactive_days} days inactive
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-zinc-400">
                            {new Date(candidate.last_active_at).toLocaleDateString("en-IN", {
                              day: "numeric",
                              month: "short",
                            })}
                          </td>
                          <td className="p-3 text-right">
                            <div className="inline-flex items-center space-x-1.5">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setPreviewCandidate(candidate);
                                  setTestSuccessMessage(null);
                                  setTestErrorMessage(null);
                                }}
                                className="h-8 px-2 text-zinc-300 hover:text-white"
                                title="Live Preview"
                              >
                                <Eye className="w-3.5 h-3.5 mr-1" />
                                <span>Preview</span>
                              </Button>

                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => {
                                  setSelectedIds(new Set([candidate.candidate_id]));
                                  setBatchFinished(false);
                                  setBatchResults([]);
                                  setIsBatchModalOpen(true);
                                }}
                                className="h-8 px-2.5 text-xs border-zinc-700 hover:border-zinc-600"
                              >
                                <Send className="w-3 h-3 mr-1" />
                                <span>Send</span>
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* 7. SENT HISTORY TAB */
        <div className="border border-zinc-800 rounded-xl overflow-hidden bg-zinc-900/30">
          <div className="p-3 bg-zinc-900/80 border-b border-zinc-800 flex items-center justify-between">
            <h3 className="text-xs font-semibold text-zinc-300">Recent Dispatches (Last 50)</h3>
            <span className="text-[11px] text-zinc-500">Auto-logged from database</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-zinc-300">
              <thead className="bg-zinc-900/60 text-zinc-400 border-b border-zinc-800 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="p-3">Student</th>
                  <th className="p-3">Alert Type</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Trigger Reason</th>
                  <th className="p-3">Date Dispatched</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {history.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-zinc-500">
                      No alert history recorded yet.
                    </td>
                  </tr>
                ) : (
                  history.map((item) => (
                    <tr key={item.id} className="hover:bg-zinc-800/30">
                      <td className="p-3 font-medium text-zinc-200">
                        <div>{item.user_name}</div>
                        <div className="text-[11px] text-zinc-500 font-mono">{item.user_email}</div>
                      </td>
                      <td className="p-3">{renderTypeBadge(item.alert_type)}</td>
                      <td className="p-3">
                        {item.status === "sent" ? (
                          <span className="inline-flex items-center space-x-1 text-emerald-400 font-semibold">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Sent</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1 text-rose-400 font-semibold" title={item.error_message || ""}>
                            <AlertCircle className="w-3.5 h-3.5" />
                            <span>Failed</span>
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-zinc-400">{item.reason}</td>
                      <td className="p-3 text-zinc-400">
                        {item.sent_at
                          ? new Date(item.sent_at).toLocaleString("en-IN", {
                              day: "numeric",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 8. INTERACTIVE LIVE PREVIEW MODAL */}
      {previewCandidate && previewEmailContent && (
        <Modal
          isOpen={!!previewCandidate}
          onClose={() => setPreviewCandidate(null)}
          title={`Email Preview: ${previewEmailContent.subject}`}
          subtitle={`Simulating message for ${previewCandidate.user_name} (${previewCandidate.user_email})`}
        >
          <div className="space-y-4">
            {/* Device Frame Switcher & Test Action Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-zinc-900 rounded-xl border border-zinc-800">
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setPreviewDevice("desktop")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center space-x-1.5 transition-colors ${
                    previewDevice === "desktop"
                      ? "bg-zinc-800 text-white"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  <Monitor className="w-3.5 h-3.5" />
                  <span>Desktop</span>
                </button>
                <button
                  onClick={() => setPreviewDevice("mobile")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center space-x-1.5 transition-colors ${
                    previewDevice === "mobile"
                      ? "bg-zinc-800 text-white"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>Mobile</span>
                </button>
              </div>

              {/* Instant Test Email Input */}
              <div className="flex items-center space-x-2">
                <div className="relative">
                  <Mail className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                  <input
                    type="email"
                    value={testEmailAddress}
                    onChange={(e) => setTestEmailAddress(e.target.value)}
                    placeholder="Your email address"
                    className="bg-zinc-950 border border-zinc-700 text-zinc-200 text-xs rounded-lg pl-7 pr-2.5 py-1.5 focus:outline-none focus:border-indigo-500 w-52"
                  />
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSendTest}
                  isLoading={sendingTest}
                  disabled={!testEmailAddress}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white border-none h-8 text-xs whitespace-nowrap"
                >
                  <Zap className="w-3 h-3 mr-1" />
                  <span>Send Test to Me</span>
                </Button>
              </div>
            </div>

            {/* Test Email Status Messages */}
            {testSuccessMessage && (
              <div className="p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-800 text-emerald-300 text-xs flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span>{testSuccessMessage}</span>
              </div>
            )}
            {testErrorMessage && (
              <div className="p-2.5 rounded-lg bg-rose-950/40 border border-rose-800 text-rose-300 text-xs flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                <span>{testErrorMessage}</span>
              </div>
            )}

            {/* Rendered Mockup Container */}
            <div
              className={`mx-auto transition-all bg-slate-950 border border-zinc-800 rounded-xl overflow-hidden shadow-2xl ${
                previewDevice === "mobile" ? "max-w-[380px]" : "max-w-full"
              }`}
            >
              <div className="p-2 bg-zinc-900 border-b border-zinc-800 text-[11px] text-zinc-400 flex items-center justify-between">
                <span>From: StudyRoom &lt;studyroom.alerts@gmail.com&gt;</span>
                <span>To: {previewCandidate.user_email}</span>
              </div>
              <div
                className="max-h-[500px] overflow-y-auto"
                dangerouslySetInnerHTML={{ __html: previewEmailContent.html }}
              />
            </div>
          </div>
        </Modal>
      )}

      {/* 9. BATCH DISPATCH CONFIRMATION & PROGRESS MODAL */}
      <Modal
        isOpen={isBatchModalOpen}
        onClose={() => {
          if (!batchInProgress) setIsBatchModalOpen(false);
        }}
        title="Dispatch Selected Alerts"
        subtitle={`Sending emails to ${selectedIds.size} recipient(s)`}
      >
        <div className="space-y-4">
          {!batchFinished ? (
            <>
              <p className="text-xs text-zinc-300">
                You are about to dispatch transactional alerts to the following selected student(s).
                Each message is sent directly through your authenticated Gmail SMTP with zero spam triggers:
              </p>

              <div className="max-h-48 overflow-y-auto border border-zinc-800 rounded-lg divide-y divide-zinc-800 text-xs">
                {candidates
                  .filter((c) => selectedIds.has(c.candidate_id))
                  .map((c) => (
                    <div key={c.candidate_id} className="p-2.5 flex items-center justify-between">
                      <div>
                        <span className="font-semibold text-zinc-200">{c.user_name}</span>
                        <span className="text-zinc-500 font-mono ml-2">({c.user_email})</span>
                      </div>
                      <div>{renderTypeBadge(c.alert_type)}</div>
                    </div>
                  ))}
              </div>

              {batchInProgress && (
                <div className="space-y-2 pt-2">
                  <div className="flex justify-between text-xs text-zinc-400">
                    <span>Dispatching emails...</span>
                    <span>
                      {batchProgress.current} / {batchProgress.total}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 transition-all duration-300"
                      style={{
                        width: `${
                          batchProgress.total > 0
                            ? (batchProgress.current / batchProgress.total) * 100
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-end space-x-2 pt-2">
                <Button
                  variant="ghost"
                  onClick={() => setIsBatchModalOpen(false)}
                  disabled={batchInProgress}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={handleStartBatchDispatch}
                  isLoading={batchInProgress}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white"
                >
                  <Send className="w-3.5 h-3.5 mr-1.5" />
                  <span>Start Sending</span>
                </Button>
              </div>
            </>
          ) : (
            /* Results after completion */
            <div className="space-y-4">
              <div className="p-3 bg-emerald-950/30 border border-emerald-800 rounded-xl flex items-center space-x-3 text-emerald-300 text-xs">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                <div>
                  <p className="font-bold">Batch Dispatch Completed!</p>
                  <p className="text-emerald-400">
                    Successfully sent{" "}
                    {batchResults.filter((r) => r.success).length} of {batchResults.length} emails.
                  </p>
                </div>
              </div>

              <div className="max-h-48 overflow-y-auto border border-zinc-800 rounded-lg divide-y divide-zinc-800 text-xs">
                {batchResults.map((res) => (
                  <div key={res.candidate_id} className="p-2.5 flex items-center justify-between">
                    <span className="text-zinc-200">{res.user_name}</span>
                    {res.success ? (
                      <span className="text-emerald-400 font-semibold flex items-center space-x-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Sent</span>
                      </span>
                    ) : (
                      <span className="text-rose-400 font-semibold flex items-center space-x-1" title={res.error}>
                        <AlertCircle className="w-3.5 h-3.5" />
                        <span>Failed</span>
                      </span>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  variant="secondary"
                  onClick={() => setIsBatchModalOpen(false)}
                >
                  Done
                </Button>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
