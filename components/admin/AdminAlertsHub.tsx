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
  UserPlus,
  BarChart3,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { generateAlertEmail, AlertType } from "@/lib/email/templates";
import { createClient } from "@/lib/supabase/client";

export interface AlertCandidate {
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
  past_week_study_minutes: number;
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

interface PlatformUserOption {
  id: string;
  display_name: string;
  current_status: string;
  has_achiever_badge: boolean;
  last_offline_at: string | null;
  created_at: string;
  weekly_minutes: number;
  total_minutes: number;
}

interface AdminAlertsHubProps {
  adminEmail?: string;
}

type TabType = "all" | "A" | "W" | "I" | "D" | "history";

export function AdminAlertsHub({ adminEmail }: AdminAlertsHubProps) {
  const [candidates, setCandidates] = useState<AlertCandidate[]>([]);
  const [allUsers, setAllUsers] = useState<PlatformUserOption[]>([]);
  const [history, setHistory] = useState<AlertHistoryItem[]>([]);
  const [mailerConfig, setMailerConfig] = useState<MailerConfigStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Direct Member Alert Modal state
  const [isDirectAlertOpen, setIsDirectAlertOpen] = useState(false);
  const [directSelectedUserId, setDirectSelectedUserId] = useState<string>("");
  const [directAlertType, setDirectAlertType] = useState<AlertType>("W");

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

  // Smart Candidate Scanner: Combines RPC + Client-side Fallback
  const fetchData = useCallback(async () => {
    try {
      setRefreshing(true);
      const headers = await getAuthHeaders();

      // 1. Fetch Mailer Config & History
      const [configRes, historyRes, rpcRes, usersRes, sessionsRes] = await Promise.allSettled([
        fetch("/api/admin/alerts?action=config", { headers }),
        fetch("/api/admin/alerts?action=history&limit=50", { headers }),
        (supabase as any).rpc("rpc_admin_scan_alert_candidates", {
          p_admin_email: adminEmail || "sa@admin.tg",
        }),
        supabase.from("users").select("*"),
        supabase.from("study_sessions").select("id, user_id, start_time, end_time, duration_minutes"),
      ]);

      if (configRes.status === "fulfilled" && configRes.value.ok) {
        const cfg = await configRes.value.json();
        setMailerConfig(cfg);
        if (!cfg.configured) {
          setShowConfigHelp(true);
        }
      }

      if (historyRes.status === "fulfilled" && historyRes.value.ok) {
        const histJson = await historyRes.value.json();
        if (histJson.history) {
          setHistory(histJson.history);
        }
      }

      // Check RPC response
      let candidatesList: AlertCandidate[] = [];

      if (rpcRes.status === "fulfilled" && !rpcRes.value.error && Array.isArray(rpcRes.value.data) && rpcRes.value.data.length > 0) {
        candidatesList = rpcRes.value.data;
        setNeedsMigration(false);
      }

      // 2. Client-side Smart Scanner Fallback
      // If RPC returned 0 or error, compute candidates directly from users & sessions
      if (usersRes.status === "fulfilled" && usersRes.value.data) {
        const rawUsers = usersRes.value.data as any[];
        const rawSessions = (sessionsRes.status === "fulfilled" && sessionsRes.value.data) ? (sessionsRes.value.data as any[]) : [];

        const now = Date.now();
        const weekAgo = now - 7 * 86400 * 1000;

        const nonAdmin = rawUsers.filter((u) => !u.is_admin);

        const platformUsersList: PlatformUserOption[] = nonAdmin.map((u) => {
          const userSessions = rawSessions.filter((s) => s.user_id === u.id);
          let weekMins = 0;
          let totalMins = 0;
          userSessions.forEach((s) => {
            const mins = s.duration_minutes || 0;
            totalMins += mins;
            if (new Date(s.start_time).getTime() >= weekAgo) {
              weekMins += mins;
            }
          });

          return {
            id: u.id,
            display_name: u.display_name,
            current_status: u.current_status,
            has_achiever_badge: u.has_achiever_badge,
            last_offline_at: u.last_offline_at,
            created_at: u.created_at,
            weekly_minutes: weekMins,
            total_minutes: totalMins,
          };
        });

        setAllUsers(platformUsersList);

        // If RPC didn't return candidates, compute them from the loaded dataset
        if (candidatesList.length === 0) {
          const computed: AlertCandidate[] = [];

          nonAdmin.forEach((u) => {
            const userSessions = rawSessions.filter((s) => s.user_id === u.id);
            let maxTime: number | null = null;
            let totalMins = 0;
            let weekMins = 0;

            userSessions.forEach((s) => {
              const t = new Date(s.end_time || s.start_time).getTime();
              if (!maxTime || t > maxTime) maxTime = t;
              totalMins += s.duration_minutes || 0;
              if (new Date(s.start_time).getTime() >= weekAgo) {
                weekMins += s.duration_minutes || 0;
              }
            });

            const offlineTime = u.last_offline_at ? new Date(u.last_offline_at).getTime() : null;
            const createdTime = new Date(u.created_at).getTime();
            const latestActive = maxTime || offlineTime || createdTime;

            const isCurrentlyActive = u.current_status === "studying" || u.current_status === "break";
            const inactiveDays = isCurrentlyActive
              ? 0
              : Math.max(0, Math.floor((now - latestActive) / (1000 * 86400)));

            const userEmail = u.email || `${u.display_name.toLowerCase().replace(/[^a-z0-9]/g, "")}@student.studyroom`;

            // 1. TYPE A: Achiever Title 🏆 (Badge holders)
            if (u.has_achiever_badge && inactiveDays < 3) {
              computed.push({
                candidate_id: `A-${u.id}`,
                user_id: u.id,
                user_name: u.display_name,
                user_email: userEmail,
                alert_type: "A",
                consecutive_inactive_days: inactiveDays,
                reason: "Active Achiever Title holder",
                last_active_at: new Date(latestActive).toISOString(),
                last_alert_sent_at: null,
                has_achiever_badge: true,
                total_study_minutes: totalMins,
                past_week_study_minutes: weekMins,
              });
            }

            // 2. TYPE D: Account Deletion Alert 🚨 (5+ consecutive days offline)
            if (!isCurrentlyActive && inactiveDays >= 5) {
              computed.push({
                candidate_id: `D-${u.id}`,
                user_id: u.id,
                user_name: u.display_name,
                user_email: userEmail,
                alert_type: "D",
                consecutive_inactive_days: inactiveDays,
                reason: `Inactive for ${inactiveDays} consecutive days (Threshold: 5 days)`,
                last_active_at: new Date(latestActive).toISOString(),
                last_alert_sent_at: null,
                has_achiever_badge: u.has_achiever_badge,
                total_study_minutes: totalMins,
                past_week_study_minutes: weekMins,
              });
            }
            // 3. TYPE I: Account Activity Notice ⚠️ (3 to 4 consecutive days offline)
            else if (!isCurrentlyActive && inactiveDays >= 3 && inactiveDays < 5) {
              computed.push({
                candidate_id: `I-${u.id}`,
                user_id: u.id,
                user_name: u.display_name,
                user_email: userEmail,
                alert_type: "I",
                consecutive_inactive_days: inactiveDays,
                reason: `Inactive for ${inactiveDays} consecutive days (Threshold: 3 days)`,
                last_active_at: new Date(latestActive).toISOString(),
                last_alert_sent_at: null,
                has_achiever_badge: u.has_achiever_badge,
                total_study_minutes: totalMins,
                past_week_study_minutes: weekMins,
              });
            }
            // 4. TYPE W: Weekly Performance & Momentum Alert 📊 (Active within 3 days, low past week output)
            else if (inactiveDays < 3 && !u.has_achiever_badge && weekMins < 120) {
              computed.push({
                candidate_id: `W-${u.id}`,
                user_id: u.id,
                user_name: u.display_name,
                user_email: userEmail,
                alert_type: "W",
                consecutive_inactive_days: inactiveDays,
                reason: `Low study output in past 7 days (${(weekMins / 60).toFixed(1)}h logged)`,
                last_active_at: new Date(latestActive).toISOString(),
                last_alert_sent_at: null,
                has_achiever_badge: false,
                total_study_minutes: totalMins,
                past_week_study_minutes: weekMins,
              });
            }
          });

          // Sort candidates priority: A (Achievers) -> D (Deletion) -> I (Notice) -> W (Weekly)
          computed.sort((a, b) => {
            const order: Record<string, number> = { A: 1, D: 2, I: 3, W: 4 };
            return (order[a.alert_type] || 5) - (order[b.alert_type] || 5);
          });

          candidatesList = computed;
        }
      }

      setCandidates(candidatesList);
    } catch (err) {
      console.error("Alerts fetch error:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [adminEmail, getAuthHeaders, supabase]);

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
    const wCount = candidates.filter((c) => c.alert_type === "W").length;
    const iCount = candidates.filter((c) => c.alert_type === "I").length;
    const dCount = candidates.filter((c) => c.alert_type === "D").length;
    const sentCount = history.filter((h) => h.status === "sent").length;
    return { total, aCount, wCount, iCount, dCount, sentCount };
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
      previewCandidate.consecutive_inactive_days,
      Math.round((previewCandidate.past_week_study_minutes || 0) / 60)
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
          weeklyHours: Math.round((previewCandidate.past_week_study_minutes || 0) / 60),
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

  // Direct Alert to Any Member
  const handleOpenDirectAlert = (user?: PlatformUserOption) => {
    if (user) {
      setDirectSelectedUserId(user.id);
      setDirectAlertType(user.has_achiever_badge ? "A" : "W");
    } else if (allUsers.length > 0) {
      setDirectSelectedUserId(allUsers[0].id);
      setDirectAlertType("W");
    }
    setIsDirectAlertOpen(true);
  };

  const handleSendDirectAlert = async () => {
    const targetUser = allUsers.find((u) => u.id === directSelectedUserId);
    if (!targetUser) return;

    const email = `${targetUser.display_name.toLowerCase().replace(/[^a-z0-9]/g, "")}@student.studyroom`;

    const tempCandidate: AlertCandidate = {
      candidate_id: `DIRECT-${targetUser.id}-${Date.now()}`,
      user_id: targetUser.id,
      user_name: targetUser.display_name,
      user_email: email,
      alert_type: directAlertType,
      consecutive_inactive_days: 0,
      reason: `Direct ${directAlertType} alert from admin based on performance review`,
      last_active_at: new Date().toISOString(),
      last_alert_sent_at: null,
      has_achiever_badge: targetUser.has_achiever_badge,
      total_study_minutes: targetUser.total_minutes,
      past_week_study_minutes: targetUser.weekly_minutes,
    };

    setPreviewCandidate(tempCandidate);
    setIsDirectAlertOpen(false);
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
      case "W":
        return (
          <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-500/15 border border-indigo-500/30 text-indigo-300">
            <span>📊</span>
            <span>Weekly Review</span>
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
            Detect defaulters, celebrate weekly achievers, evaluate past-week output, and send verified alerts.
          </p>
        </div>

        <div className="flex items-center space-x-2.5">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => handleOpenDirectAlert()}
            className="border-indigo-500/30 text-indigo-300 hover:bg-indigo-950/40"
          >
            <UserPlus className="w-3.5 h-3.5 mr-1.5 text-indigo-400" />
            <span>Direct Member Alert</span>
          </Button>

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
                <li>Choose any standard free personal Gmail address.</li>
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
                <li>Add to your .env.local file.</li>
              </ol>
            </div>
          )}
        </div>
      )}

      {/* 3. METRIC CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5">
        <div
          onClick={() => setActiveTab("all")}
          className={`cursor-pointer p-3 rounded-xl border transition-all ${
            activeTab === "all"
              ? "bg-zinc-800/80 border-indigo-500/50 shadow-sm"
              : "bg-zinc-900/40 border-zinc-800 hover:bg-zinc-900"
          }`}
        >
          <div className="text-[11px] text-zinc-400">Total Actionable</div>
          <div className="text-xl font-bold text-zinc-100 mt-1">{counts.total}</div>
        </div>

        <div
          onClick={() => setActiveTab("A")}
          className={`cursor-pointer p-3 rounded-xl border transition-all ${
            activeTab === "A"
              ? "bg-emerald-950/30 border-emerald-500/50 shadow-sm"
              : "bg-zinc-900/40 border-zinc-800 hover:bg-zinc-900"
          }`}
        >
          <div className="text-[11px] text-emerald-400 flex items-center space-x-1">
            <span>🏆</span>
            <span>Achievers</span>
          </div>
          <div className="text-xl font-bold text-emerald-300 mt-1">{counts.aCount}</div>
        </div>

        <div
          onClick={() => setActiveTab("W")}
          className={`cursor-pointer p-3 rounded-xl border transition-all ${
            activeTab === "W"
              ? "bg-indigo-950/30 border-indigo-500/50 shadow-sm"
              : "bg-zinc-900/40 border-zinc-800 hover:bg-zinc-900"
          }`}
        >
          <div className="text-[11px] text-indigo-400 flex items-center space-x-1">
            <span>📊</span>
            <span>Weekly Slump</span>
          </div>
          <div className="text-xl font-bold text-indigo-300 mt-1">{counts.wCount}</div>
        </div>

        <div
          onClick={() => setActiveTab("I")}
          className={`cursor-pointer p-3 rounded-xl border transition-all ${
            activeTab === "I"
              ? "bg-amber-950/30 border-amber-500/50 shadow-sm"
              : "bg-zinc-900/40 border-zinc-800 hover:bg-zinc-900"
          }`}
        >
          <div className="text-[11px] text-amber-400 flex items-center space-x-1">
            <span>⚠️</span>
            <span>Notice (3d)</span>
          </div>
          <div className="text-xl font-bold text-amber-300 mt-1">{counts.iCount}</div>
        </div>

        <div
          onClick={() => setActiveTab("D")}
          className={`cursor-pointer p-3 rounded-xl border transition-all ${
            activeTab === "D"
              ? "bg-rose-950/30 border-rose-500/50 shadow-sm"
              : "bg-zinc-900/40 border-zinc-800 hover:bg-zinc-900"
          }`}
        >
          <div className="text-[11px] text-rose-400 flex items-center space-x-1">
            <span>🚨</span>
            <span>Deletion (5d)</span>
          </div>
          <div className="text-xl font-bold text-rose-300 mt-1">{counts.dCount}</div>
        </div>

        <div
          onClick={() => setActiveTab("history")}
          className={`cursor-pointer p-3 rounded-xl border transition-all ${
            activeTab === "history"
              ? "bg-zinc-800/80 border-zinc-600 shadow-sm"
              : "bg-zinc-900/40 border-zinc-800 hover:bg-zinc-900"
          }`}
        >
          <div className="text-[11px] text-zinc-400 flex items-center space-x-1">
            <Clock className="w-3.5 h-3.5" />
            <span>Sent History</span>
          </div>
          <div className="text-xl font-bold text-zinc-300 mt-1">{counts.sentCount}</div>
        </div>
      </div>

      {/* 4. FILTER TABS & SEARCH */}
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
                onClick={() => setActiveTab("W")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  activeTab === "W"
                    ? "bg-indigo-500 text-white"
                    : "bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800"
                }`}
              >
                📊 Weekly Slump ({counts.wCount})
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

          {/* 5. CANDIDATES TABLE */}
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
                    <th className="p-3">Alert Trigger</th>
                    <th className="p-3">Activity &amp; Weekly Record</th>
                    <th className="p-3">Last Active</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-zinc-500">
                        <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-zinc-400" />
                        Scanning students, inactivity records &amp; weekly performance...
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
                                <div className="font-semibold text-zinc-100 flex items-center space-x-1">
                                  <span>{candidate.user_name}</span>
                                  {candidate.has_achiever_badge && (
                                    <span title="Achiever Title Active">👑</span>
                                  )}
                                </div>
                                <div className="text-[11px] text-zinc-500 font-mono">
                                  {candidate.user_email}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="p-3">{renderTypeBadge(candidate.alert_type)}</td>
                          <td className="p-3">
                            <div className="space-y-0.5">
                              <div className="text-zinc-200 font-medium">
                                {candidate.reason}
                              </div>
                              <div className="text-[11px] text-zinc-500 flex items-center space-x-2">
                                <span>Past Week: {(candidate.past_week_study_minutes / 60).toFixed(1)}h</span>
                                <span>&bull;</span>
                                <span>All-time: {(candidate.total_study_minutes / 60).toFixed(1)}h</span>
                              </div>
                            </div>
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
        /* 6. SENT HISTORY TAB */
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

      {/* 7. DIRECT MEMBER ALERT MODAL */}
      <Modal
        isOpen={isDirectAlertOpen}
        onClose={() => setIsDirectAlertOpen(false)}
        title="Direct Alert to Member"
        subtitle="Select any platform member to send an instant customized alert based on past performance"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">
              Select Student / Member:
            </label>
            <select
              value={directSelectedUserId}
              onChange={(e) => setDirectSelectedUserId(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs rounded-xl p-2.5 focus:outline-none focus:border-indigo-500"
            >
              {allUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.display_name} {u.has_achiever_badge ? "👑" : ""} ({u.current_status}) — Past Week: {(u.weekly_minutes / 60).toFixed(1)}h
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">
              Select Alert Type:
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDirectAlertType("A")}
                className={`p-2.5 rounded-xl border text-left text-xs transition-all ${
                  directAlertType === "A"
                    ? "bg-emerald-950/40 border-emerald-500 text-emerald-200 font-bold"
                    : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <div className="flex items-center space-x-1.5 mb-1">
                  <span>🏆</span>
                  <span>Achiever&apos;s Title</span>
                </div>
                <div className="text-[10px] opacity-75">Milestone &amp; consistency award</div>
              </button>

              <button
                type="button"
                onClick={() => setDirectAlertType("W")}
                className={`p-2.5 rounded-xl border text-left text-xs transition-all ${
                  directAlertType === "W"
                    ? "bg-indigo-950/40 border-indigo-500 text-indigo-200 font-bold"
                    : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <div className="flex items-center space-x-1.5 mb-1">
                  <span>📊</span>
                  <span>Weekly Review</span>
                </div>
                <div className="text-[10px] opacity-75">Momentum &amp; slump check-in</div>
              </button>

              <button
                type="button"
                onClick={() => setDirectAlertType("I")}
                className={`p-2.5 rounded-xl border text-left text-xs transition-all ${
                  directAlertType === "I"
                    ? "bg-amber-950/40 border-amber-500 text-amber-200 font-bold"
                    : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <div className="flex items-center space-x-1.5 mb-1">
                  <span>⚠️</span>
                  <span>Activity Notice</span>
                </div>
                <div className="text-[10px] opacity-75">3-day inactivity reminder</div>
              </button>

              <button
                type="button"
                onClick={() => setDirectAlertType("D")}
                className={`p-2.5 rounded-xl border text-left text-xs transition-all ${
                  directAlertType === "D"
                    ? "bg-rose-950/40 border-rose-500 text-rose-200 font-bold"
                    : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <div className="flex items-center space-x-1.5 mb-1">
                  <span>🚨</span>
                  <span>Deletion Alert</span>
                </div>
                <div className="text-[10px] opacity-75">5-day urgent warning</div>
              </button>
            </div>
          </div>

          <div className="flex justify-end space-x-2 pt-2">
            <Button variant="ghost" onClick={() => setIsDirectAlertOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSendDirectAlert} className="bg-indigo-600 hover:bg-indigo-500 text-white">
              <Eye className="w-3.5 h-3.5 mr-1.5" />
              <span>Preview &amp; Send</span>
            </Button>
          </div>
        </div>
      </Modal>

      {/* 8. INTERACTIVE LIVE PREVIEW MODAL */}
      {previewCandidate && previewEmailContent && (
        <Modal
          isOpen={!!previewCandidate}
          onClose={() => setPreviewCandidate(null)}
          title={`Email Preview: ${previewEmailContent.subject}`}
          subtitle={`Message for ${previewCandidate.user_name} (${previewCandidate.user_email})`}
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
                <span>From: StudyRoom &lt;studyaliveapp@gmail.com&gt;</span>
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
