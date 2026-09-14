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
  RotateCcw,
  Pencil,
  Users,
  Check,
  Database,
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
  total_alerts_sent?: number;
  alert_counts?: { A: number; W: number; I: number; D: number };
  last_alert_type?: string;
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
  email: string;
  current_status: string;
  has_achiever_badge: boolean;
  last_offline_at: string | null;
  created_at: string;
  weekly_minutes: number;
  total_minutes: number;
  total_alerts_sent?: number;
  alert_counts?: { A: number; W: number; I: number; D: number };
  last_alert_type?: string;
}

interface WeeklyAchieverStatus {
  isMonday: boolean;
  weekKey: string;
  alreadySentThisWeek: boolean;
  lastSentAlert?: {
    id: string;
    sent_at: string;
    user_name: string;
    user_email: string;
  } | null;
  achiever?: {
    user_id: string;
    display_name: string;
    email: string;
    has_achiever_badge: boolean;
    week_start_iso?: string;
    already_sent_this_week?: boolean;
    total_alerts_sent?: number;
    alert_counts?: { A: number; W: number; I: number; D: number };
  } | null;
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

  // Weekly Achiever Automation state
  const [achieverStatus, setAchieverStatus] = useState<WeeklyAchieverStatus | null>(null);
  const [processingAchiever, setProcessingAchiever] = useState(false);
  const [achieverFeedback, setAchieverFeedback] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);

  // Direct Member Alert Modal state
  const [isDirectAlertOpen, setIsDirectAlertOpen] = useState(false);
  const [directSelectedUserId, setDirectSelectedUserId] = useState<string>("");
  const [directAlertType, setDirectAlertType] = useState<AlertType>("W");
  const [sendingDirectAlert, setSendingDirectAlert] = useState(false);
  const [sendingToStudentFromPreview, setSendingToStudentFromPreview] = useState(false);

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
    Array<{
      candidate_id: string;
      user_name: string;
      user_email?: string;
      alert_type?: string;
      success: boolean;
      emailSent?: boolean;
      dbLogged?: boolean;
      error?: string;
      emailError?: string;
      dbError?: string;
    }>
  >([]);
  const [batchSummary, setBatchSummary] = useState<{
    totalRequested: number;
    totalSent: number;
    totalLogged: number;
    totalFailed: number;
    totalDbErrors: number;
    hasConstraintViolation: boolean;
  } | null>(null);
  const [batchFinished, setBatchFinished] = useState(false);
  const [copiedConstraintSql, setCopiedConstraintSql] = useState(false);
  const [constraintWarning, setConstraintWarning] = useState<string | null>(null);
  const [directAlertError, setDirectAlertError] = useState<string | null>(null);

  // Reset alert counts state
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [resettingAlerts, setResettingAlerts] = useState(false);
  const [resetFeedback, setResetFeedback] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Student Email Edit state
  const [editingStudent, setEditingStudent] = useState<{ userId: string; userName: string; email: string } | null>(null);
  const [editEmailInput, setEditEmailInput] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);
  const [editEmailError, setEditEmailError] = useState<string | null>(null);

  // Sync Auth Emails state
  const [syncingAuth, setSyncingAuth] = useState(false);

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

      // 1. Fetch Mailer Config, History, Achiever Status, Candidates & Platform Members from Server API
      const [configRes, historyRes, achieverRes, candidatesApiRes, membersApiRes, rpcRes, usersRes, sessionsRes, alertsRes] = await Promise.allSettled([
        fetch("/api/admin/alerts?action=config", { headers }),
        fetch("/api/admin/alerts?action=history&limit=100", { headers }),
        fetch("/api/admin/alerts?action=achiever_status", { headers }),
        fetch("/api/admin/alerts?action=candidates", { headers }),
        fetch("/api/admin/alerts?action=members", { headers }),
        (supabase as any).rpc("rpc_admin_scan_alert_candidates", {
          p_admin_email: adminEmail || "studyaliveapp@gmail.com",
        }),
        supabase.from("users").select("*"),
        supabase.from("study_sessions").select("id, user_id, start_time, end_time, duration_minutes"),
        supabase
          .from("user_alerts")
          .select("id, user_id, user_name, user_email, alert_type, status, consecutive_inactive_days, reason, error_message, sent_at, created_at")
          .order("sent_at", { ascending: false })
          .limit(100),
      ]);

      if (configRes.status === "fulfilled" && configRes.value.ok) {
        const cfg = await configRes.value.json();
        setMailerConfig(cfg);
        if (!cfg.configured) {
          setShowConfigHelp(true);
        }
      }

      // Build a definitive map of real signup emails from auth.users (via members API or users table)
      const emailByUserId: Record<string, string> = {};

      if (membersApiRes.status === "fulfilled" && membersApiRes.value.ok) {
        const memJson = await membersApiRes.value.json();
        if (Array.isArray(memJson.members)) {
          memJson.members.forEach((m: any) => {
            if (m.email && !m.email.includes("@student.studyroom")) {
              emailByUserId[m.id] = m.email.trim();
            }
          });
        }
      }

      if (usersRes.status === "fulfilled" && Array.isArray(usersRes.value.data)) {
        (usersRes.value.data as any[]).forEach((u: any) => {
          if (u.email && !u.email.includes("@student.studyroom") && !emailByUserId[u.id]) {
            emailByUserId[u.id] = u.email.trim();
          }
        });
      }

      let fetchedHistory: AlertHistoryItem[] = [];
      if (historyRes.status === "fulfilled" && historyRes.value.ok) {
        const histJson = await historyRes.value.json();
        if (Array.isArray(histJson.history) && histJson.history.length > 0) {
          fetchedHistory = histJson.history.map((h: any) => ({
            ...h,
            user_email: (h.user_email && !h.user_email.includes("@student.studyroom"))
              ? h.user_email.trim()
              : (emailByUserId[h.user_id] || ""),
          }));
          setHistory(fetchedHistory);
        }
      }

      // Robust fallback: if API returned no history but direct query found rows, use them
      if (
        fetchedHistory.length === 0 &&
        alertsRes.status === "fulfilled" &&
        Array.isArray(alertsRes.value.data) &&
        alertsRes.value.data.length > 0
      ) {
        const fallbackHistory: AlertHistoryItem[] = (alertsRes.value.data as any[]).map((row: any) => ({
          id: row.id || `alert-${Math.random()}`,
          user_id: row.user_id,
          user_name: row.user_name || "Student",
          user_email: (row.user_email && !row.user_email.includes("@student.studyroom"))
            ? row.user_email.trim()
            : (emailByUserId[row.user_id] || ""),
          alert_type: row.alert_type as AlertType,
          status: row.status as any,
          consecutive_inactive_days: row.consecutive_inactive_days || 0,
          reason: row.reason || "Study room notification",
          error_message: row.error_message || null,
          sent_at: row.sent_at || row.created_at,
          created_at: row.created_at || new Date().toISOString(),
        }));
        setHistory(fallbackHistory);
      }

      if (achieverRes.status === "fulfilled" && achieverRes.value.ok) {
        const achJson = await achieverRes.value.json();
        if (achJson?.achiever && achJson.achiever.email?.includes("@student.studyroom")) {
          achJson.achiever.email = emailByUserId[achJson.achiever.user_id] || "";
        }
        setAchieverStatus(achJson);
      }

      // Compute aggregated alert counts per user from live user_alerts
      const userAlertsMap: Record<
        string,
        { total: number; A: number; W: number; I: number; D: number; lastSentAt?: string; lastType?: string }
      > = {};

      const rawAlerts = (alertsRes.status === "fulfilled" && alertsRes.value.data) ? (alertsRes.value.data as any[]) : [];
      rawAlerts.forEach((a) => {
        if (a.status === "sent") {
          if (!userAlertsMap[a.user_id]) {
            userAlertsMap[a.user_id] = { total: 0, A: 0, W: 0, I: 0, D: 0 };
          }
          userAlertsMap[a.user_id].total += 1;
          if (a.alert_type === "A") userAlertsMap[a.user_id].A += 1;
          if (a.alert_type === "W") userAlertsMap[a.user_id].W += 1;
          if (a.alert_type === "I") userAlertsMap[a.user_id].I += 1;
          if (a.alert_type === "D") userAlertsMap[a.user_id].D += 1;
          if (!userAlertsMap[a.user_id].lastSentAt || new Date(a.sent_at).getTime() > new Date(userAlertsMap[a.user_id].lastSentAt!).getTime()) {
            userAlertsMap[a.user_id].lastSentAt = a.sent_at;
            userAlertsMap[a.user_id].lastType = a.alert_type;
          }
        }
      });

      // Check Server Candidates API response first, then RPC
      let candidatesList: AlertCandidate[] = [];

      if (candidatesApiRes.status === "fulfilled" && candidatesApiRes.value.ok) {
        const candJson = await candidatesApiRes.value.json();
        if (Array.isArray(candJson.candidates) && candJson.candidates.length > 0) {
          candidatesList = candJson.candidates.map((c: any) => {
            const realEmail = emailByUserId[c.user_id] || ((c.user_email && !c.user_email.includes("@student.studyroom")) ? c.user_email.trim() : "");
            const stats = userAlertsMap[c.user_id] || { total: c.total_alerts_sent || 0, A: c.alert_counts?.A || 0, W: c.alert_counts?.W || 0, I: c.alert_counts?.I || 0, D: c.alert_counts?.D || 0 };
            return {
              ...c,
              user_email: realEmail,
              total_alerts_sent: stats.total,
              alert_counts: { A: stats.A, W: stats.W, I: stats.I, D: stats.D },
              last_alert_type: stats.lastType || c.last_alert_type,
            };
          });
          setNeedsMigration(false);
        }
      }

      if (candidatesList.length === 0 && rpcRes.status === "fulfilled" && !rpcRes.value.error && Array.isArray(rpcRes.value.data) && rpcRes.value.data.length > 0) {
        candidatesList = rpcRes.value.data.map((c: any) => {
          const realEmail = emailByUserId[c.user_id] || ((c.user_email && !c.user_email.includes("@student.studyroom")) ? c.user_email.trim() : "");
          const stats = userAlertsMap[c.user_id] || { total: c.total_alerts_sent || 0, A: c.alert_counts?.A || 0, W: c.alert_counts?.W || 0, I: c.alert_counts?.I || 0, D: c.alert_counts?.D || 0 };
          return {
            ...c,
            user_email: realEmail,
            total_alerts_sent: stats.total,
            alert_counts: { A: stats.A, W: stats.W, I: stats.I, D: stats.D },
            last_alert_type: stats.lastType || c.last_alert_type,
          };
        });
        setNeedsMigration(false);
      }

      // 2. Client-side Smart Scanner Fallback
      // If server API / RPC returned 0 or error, compute candidates directly from users & sessions
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

          const stats = userAlertsMap[u.id] || {
            total: u.total_alerts_sent || 0,
            A: u.alert_counts?.A || 0,
            W: u.alert_counts?.W || 0,
            I: u.alert_counts?.I || 0,
            D: u.alert_counts?.D || 0,
          };

          const exactEmail = emailByUserId[u.id] || ((u.email && !u.email.includes("@student.studyroom")) ? u.email.trim() : "");

          return {
            id: u.id,
            display_name: u.display_name,
            email: exactEmail,
            current_status: u.current_status,
            has_achiever_badge: u.has_achiever_badge,
            last_offline_at: u.last_offline_at,
            created_at: u.created_at,
            weekly_minutes: weekMins,
            total_minutes: totalMins,
            total_alerts_sent: stats.total,
            alert_counts: { A: stats.A, W: stats.W, I: stats.I, D: stats.D },
            last_alert_type: stats.lastType || u.last_alert_type,
          };
        });

        setAllUsers(platformUsersList);

        // If candidates list is still empty, compute from the loaded dataset
        if (candidatesList.length === 0) {
          const computed: AlertCandidate[] = [];

          nonAdmin.forEach((u) => {
            const stats = userAlertsMap[u.id] || { total: 0, A: 0, W: 0, I: 0, D: 0 };
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

            const userEmail = emailByUserId[u.id] || ((u.email && !u.email.includes("@student.studyroom")) ? u.email.trim() : "");

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
                last_alert_sent_at: stats.lastSentAt || null,
                has_achiever_badge: true,
                total_study_minutes: totalMins,
                past_week_study_minutes: weekMins,
                total_alerts_sent: stats.total,
                alert_counts: { A: stats.A, W: stats.W, I: stats.I, D: stats.D },
                last_alert_type: stats.lastType || u.last_alert_type,
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
                last_alert_sent_at: stats.lastSentAt || null,
                has_achiever_badge: u.has_achiever_badge,
                total_study_minutes: totalMins,
                past_week_study_minutes: weekMins,
                total_alerts_sent: stats.total,
                alert_counts: { A: stats.A, W: stats.W, I: stats.I, D: stats.D },
                last_alert_type: stats.lastType || u.last_alert_type,
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
                last_alert_sent_at: stats.lastSentAt || null,
                has_achiever_badge: u.has_achiever_badge,
                total_study_minutes: totalMins,
                past_week_study_minutes: weekMins,
                total_alerts_sent: stats.total,
                alert_counts: { A: stats.A, W: stats.W, I: stats.I, D: stats.D },
                last_alert_type: stats.lastType || u.last_alert_type,
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
                last_alert_sent_at: stats.lastSentAt || null,
                has_achiever_badge: false,
                total_study_minutes: totalMins,
                past_week_study_minutes: weekMins,
                total_alerts_sent: stats.total,
                alert_counts: { A: stats.A, W: stats.W, I: stats.I, D: stats.D },
                last_alert_type: stats.lastType || u.last_alert_type,
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

  // Filtered Alert History (Search by student, email, reason, status or alert type)
  const filteredHistory = useMemo(() => {
    if (!searchQuery.trim()) return history;
    const q = searchQuery.toLowerCase().trim();
    return history.filter(
      (item) =>
        item.user_name?.toLowerCase().includes(q) ||
        item.user_email?.toLowerCase().includes(q) ||
        item.reason?.toLowerCase().includes(q) ||
        item.alert_type?.toLowerCase().includes(q) ||
        item.status?.toLowerCase().includes(q)
    );
  }, [history, searchQuery]);

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

  // Active Achiever resolution: Uses RPC status or authentic email from users/candidates
  const activeAchiever = useMemo(() => {
    if (achieverStatus?.achiever) {
      const ach = achieverStatus.achiever;
      const cleanEmail = (ach.email && !ach.email.includes("@student.studyroom")) ? ach.email.trim() : "";
      return {
        ...ach,
        email: cleanEmail || allUsers.find((u) => u.id === ach.user_id)?.email || "",
      };
    }
    const fromUsers = allUsers.find((u) => u.has_achiever_badge);
    if (fromUsers) {
      const cleanEmail = (fromUsers.email && !fromUsers.email.includes("@student.studyroom")) ? fromUsers.email.trim() : "";
      return {
        user_id: fromUsers.id,
        display_name: fromUsers.display_name,
        email: cleanEmail,
        has_achiever_badge: true,
      };
    }
    const fromCand = candidates.find((c) => c.has_achiever_badge || c.alert_type === "A");
    if (fromCand) {
      const cleanEmail = (fromCand.user_email && !fromCand.user_email.includes("@student.studyroom")) ? fromCand.user_email.trim() : "";
      return {
        user_id: fromCand.user_id,
        display_name: fromCand.user_name,
        email: cleanEmail,
        has_achiever_badge: true,
      };
    }
    return null;
  }, [achieverStatus, allUsers, candidates]);

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

  // Monday Weekly Achiever Automation Trigger
  const handleRunWeeklyAchiever = async (force = false) => {
    try {
      setProcessingAchiever(true);
      setAchieverFeedback(null);
      const headers = await getAuthHeaders();
      const res = await fetch("/api/admin/alerts", {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "process_achiever",
          force,
        }),
      });

      const json = await res.json();
      if (json.success) {
        if (json.processed) {
          setAchieverFeedback({
            type: "success",
            message: `🎉 Success! Weekly Achiever Congratulations email dispatched to ${json.winner?.name} (${json.winner?.email}) for week of ${json.weekKey}.`,
          });
        } else {
          setAchieverFeedback({
            type: "info",
            message: json.reason || "Weekly achiever check completed (no dispatch required).",
          });
        }
        await fetchData();
      } else {
        setAchieverFeedback({
          type: "error",
          message: json.error || "Failed to execute weekly achiever automation.",
        });
      }
    } catch (err: any) {
      setAchieverFeedback({
        type: "error",
        message: err?.message || "Error running weekly achiever automation.",
      });
    } finally {
      setProcessingAchiever(false);
    }
  };

  // Batch Dispatch Trigger
  const handleStartBatchDispatch = async () => {
    const selectedList = candidates.filter((c) => selectedIds.has(c.candidate_id));
    if (selectedList.length === 0) return;

    setBatchInProgress(true);
    setBatchFinished(false);
    setBatchResults([]);
    setBatchSummary(null);
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
        (json.results || []).map((r: any) => ({
          candidate_id: r.candidate_id,
          user_name: r.user_name,
          user_email: r.user_email,
          alert_type: r.alert_type,
          success: r.success,
          emailSent: r.emailSent,
          dbLogged: r.dbLogged,
          error: r.error,
          emailError: r.emailError,
          dbError: r.dbError,
        }))
      );

      setBatchSummary({
        totalRequested: json.totalRequested || selectedList.length,
        totalSent: json.totalSent || 0,
        totalLogged: json.totalLogged || 0,
        totalFailed: json.totalFailed || 0,
        totalDbErrors: json.totalDbErrors || 0,
        hasConstraintViolation: Boolean(json.hasConstraintViolation),
      });

      if (json.hasConstraintViolation) {
        setConstraintWarning(
          "PostgreSQL table check constraint on user_alerts requires an update to allow Weekly Review (Type W). Emails were delivered to students via Gmail SMTP, but could not be logged in database history until the constraint is updated."
        );
      }

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

  // Platform users available for Direct Alert (fallback to candidates if allUsers is loading)
  const selectableUsers = useMemo<PlatformUserOption[]>(() => {
    if (allUsers.length > 0) return allUsers;
    return candidates.map((c) => ({
      id: c.user_id,
      display_name: c.user_name,
      email: c.user_email,
      avatar_url: null,
      current_status: "offline",
      has_achiever_badge: c.has_achiever_badge,
      last_offline_at: c.last_active_at || null,
      created_at: c.last_active_at,
      weekly_minutes: c.past_week_study_minutes,
      total_minutes: c.total_study_minutes,
      total_alerts_sent: c.total_alerts_sent || 0,
      alert_counts: c.alert_counts || { A: 0, W: 0, I: 0, D: 0 },
    }));
  }, [allUsers, candidates]);

  // Direct Alert to Any Member
  const handleOpenDirectAlert = (user?: PlatformUserOption) => {
    setDirectAlertError(null);
    if (user) {
      setDirectSelectedUserId(user.id);
      setDirectAlertType(user.has_achiever_badge ? "A" : "W");
    } else if (selectableUsers.length > 0) {
      setDirectSelectedUserId(selectableUsers[0].id);
      setDirectAlertType("W");
    }
    setIsDirectAlertOpen(true);
  };

  // Preview Direct Alert in the live preview modal
  const handlePreviewDirectAlert = () => {
    const targetUser = selectableUsers.find((u) => u.id === (directSelectedUserId || selectableUsers[0]?.id));
    if (!targetUser) return;

    const email = (targetUser.email && !targetUser.email.includes("@student.studyroom")) ? targetUser.email.trim() : "";

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

  // Send Direct Alert Immediately to Student
  const handleSendDirectAlertNow = async () => {
    const targetUser = selectableUsers.find((u) => u.id === (directSelectedUserId || selectableUsers[0]?.id));
    if (!targetUser) return;

    const email = (targetUser.email && !targetUser.email.includes("@student.studyroom")) ? targetUser.email.trim() : "";
    if (!email) {
      setDirectAlertError("Cannot send alert: Student has no authentic email address on file.");
      return;
    }

    setSendingDirectAlert(true);
    setDirectAlertError(null);
    try {
      const tempCandidate: AlertCandidate = {
        candidate_id: `DIRECT-${targetUser.id}-${Date.now()}`,
        user_id: targetUser.id,
        user_name: targetUser.display_name,
        user_email: email,
        alert_type: directAlertType,
        consecutive_inactive_days: 0,
        reason: `Direct ${directAlertType} alert dispatched by administrator`,
        last_active_at: new Date().toISOString(),
        last_alert_sent_at: null,
        has_achiever_badge: targetUser.has_achiever_badge,
        total_study_minutes: targetUser.total_minutes,
        past_week_study_minutes: targetUser.weekly_minutes,
      };

      const headers = await getAuthHeaders();
      const res = await fetch("/api/admin/alerts", {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "send_batch",
          candidates: [tempCandidate],
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to send alert email");
      }

      const sendResult = json.results?.[0];
      if (sendResult && !sendResult.emailSent) {
        throw new Error(sendResult.emailError || sendResult.error || "Failed to deliver email.");
      }

      if (sendResult && sendResult.emailSent && !sendResult.dbLogged) {
        setResetFeedback({
          type: "error",
          message: `Alert email delivered to ${targetUser.display_name} (${email}), but database audit logging failed (${sendResult.dbError}). Run the SQL constraint update in Supabase SQL editor to fix.`,
        });
        setIsDirectAlertOpen(false);
        await fetchData();
        return;
      }

      setResetFeedback({
        type: "success",
        message: `Alert email successfully sent to ${targetUser.display_name} (${email})!`,
      });

      setIsDirectAlertOpen(false);
      await fetchData();
    } catch (err: any) {
      setDirectAlertError(err?.message || "Failed to send alert email.");
    } finally {
      setSendingDirectAlert(false);
    }
  };

  // Dispatch Alert to Student from Interactive Live Preview Modal
  const handleDispatchFromPreview = async () => {
    if (!previewCandidate || !previewCandidate.user_email) return;

    setSendingToStudentFromPreview(true);
    setTestErrorMessage(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/admin/alerts", {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "send_batch",
          candidates: [previewCandidate],
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to dispatch alert email");
      }

      const sendResult = json.results?.[0];
      if (sendResult && !sendResult.emailSent) {
        throw new Error(sendResult.emailError || sendResult.error || "Failed to deliver email.");
      }

      if (sendResult && sendResult.emailSent && !sendResult.dbLogged) {
        setResetFeedback({
          type: "error",
          message: `Alert email delivered to ${previewCandidate.user_name} (${previewCandidate.user_email}), but database audit log failed: ${sendResult.dbError}`,
        });
        setPreviewCandidate(null);
        await fetchData();
        return;
      }

      setResetFeedback({
        type: "success",
        message: `Alert email successfully delivered to ${previewCandidate.user_name} (${previewCandidate.user_email})!`,
      });

      setPreviewCandidate(null);
      await fetchData();
    } catch (err: any) {
      setTestErrorMessage(err?.message || "Failed to dispatch alert email.");
    } finally {
      setSendingToStudentFromPreview(false);
    }
  };

  // Reset all alert counts and clear history across the platform
  const handleResetAlerts = async () => {
    try {
      setResettingAlerts(true);
      setResetFeedback(null);
      const headers = await getAuthHeaders();
      headers["Content-Type"] = "application/json";

      const res = await fetch("/api/admin/alerts", {
        method: "POST",
        headers,
        body: JSON.stringify({ action: "reset_alerts" }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to reset alert counts");
      }

      // Instantly zero out counters in local React state
      setHistory([]);
      setCandidates((prev) =>
        prev.map((c) => ({
          ...c,
          total_alerts_sent: 0,
          alert_counts: { A: 0, W: 0, I: 0, D: 0 },
          last_alert_sent_at: null,
          last_alert_type: undefined,
        }))
      );
      setAllUsers((prev) =>
        prev.map((u) => ({
          ...u,
          total_alerts_sent: 0,
          alert_counts: { A: 0, W: 0, I: 0, D: 0 },
          last_alert_type: undefined,
        }))
      );

      setResetFeedback({
        message: "All alert history and student sent counters have been successfully reset to 0.",
        type: "success",
      });
      setIsResetConfirmOpen(false);

      // Re-fetch data from database
      setTimeout(() => {
        fetchData();
      }, 500);
    } catch (err: any) {
      setResetFeedback({
        message: err?.message || "Failed to reset alert counts",
        type: "error",
      });
    } finally {
      setResettingAlerts(false);
    }
  };

  // Open inline email editor for student
  const handleOpenEditEmail = (userId: string, userName: string, currentEmail: string) => {
    setEditingStudent({ userId, userName, email: currentEmail || "" });
    setEditEmailInput(currentEmail || "");
    setEditEmailError(null);
  };

  // Save student email directly to Supabase users table
  const handleSaveEmail = async () => {
    if (!editingStudent) return;
    const clean = editEmailInput.trim().toLowerCase();
    if (!clean || !clean.includes("@") || !clean.includes(".")) {
      setEditEmailError("Please enter a valid, authentic email address.");
      return;
    }
    if (clean.includes("@student.studyroom")) {
      setEditEmailError("Placeholder domains (@student.studyroom) are not allowed.");
      return;
    }

    setSavingEmail(true);
    setEditEmailError(null);

    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/admin/alerts", {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "update_user_email",
          user_id: editingStudent.userId,
          email: clean,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to update student email.");
      }

      // Update in candidates state
      setCandidates((prev) =>
        prev.map((c) =>
          c.user_id === editingStudent.userId ? { ...c, user_email: clean } : c
        )
      );

      // Update in allUsers state
      setAllUsers((prev) =>
        prev.map((u) =>
          u.id === editingStudent.userId ? { ...u, email: clean } : u
        )
      );

      setResetFeedback({
        type: "success",
        message: `Successfully updated email for ${editingStudent.userName} to ${clean}`,
      });

      setEditingStudent(null);
    } catch (err: any) {
      setEditEmailError(err.message || "Failed to update email.");
    } finally {
      setSavingEmail(false);
    }
  };

  // Synchronize all member emails from Supabase Auth
  const handleSyncAuthEmails = async () => {
    setSyncingAuth(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/admin/alerts", {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "sync_auth_emails",
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to sync emails from auth.users");
      }

      setResetFeedback({
        type: "success",
        message: json.message || "Member emails successfully synchronized from auth.",
      });

      // Refetch data
      await fetchData();
    } catch (err: any) {
      setResetFeedback({
        type: "error",
        message: err.message || "Failed to sync emails from auth.",
      });
    } finally {
      setSyncingAuth(false);
    }
  };


  // Helper for type badges (supports compact mobile layout)
  const renderTypeBadge = (type: AlertType, compact = false) => {
    switch (type) {
      case "A":
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-bold bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 whitespace-nowrap shrink-0">
            <span>🏆</span>
            <span className={compact ? "inline" : "hidden sm:inline"}>
              {compact ? "Achiever" : "Achiever's Title"}
            </span>
            {!compact && <span className="inline sm:hidden">Achiever</span>}
          </span>
        );
      case "W":
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-bold bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 whitespace-nowrap shrink-0">
            <span>📊</span>
            <span className={compact ? "inline" : "hidden sm:inline"}>
              {compact ? "Weekly" : "Weekly Review"}
            </span>
            {!compact && <span className="inline sm:hidden">Weekly</span>}
          </span>
        );
      case "I":
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-bold bg-amber-500/15 border border-amber-500/30 text-amber-300 whitespace-nowrap shrink-0">
            <span>⚠️</span>
            <span className={compact ? "inline" : "hidden sm:inline"}>
              {compact ? "Notice 3d" : "Account Notice (3d)"}
            </span>
            {!compact && <span className="inline sm:hidden">Notice 3d</span>}
          </span>
        );
      case "D":
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-bold bg-rose-500/15 border border-rose-500/30 text-rose-300 whitespace-nowrap shrink-0">
            <span>🚨</span>
            <span className={compact ? "inline" : "hidden sm:inline"}>
              {compact ? "Deletion 5d" : "Deletion Alert (5d)"}
            </span>
            {!compact && <span className="inline sm:hidden">Deletion 5d</span>}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. TOP HEADER & CONTROLS */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 pb-2 border-b border-zinc-800">
        <div>
          <div className="flex items-center space-x-2 flex-wrap gap-y-1">
            <h2 className="text-lg sm:text-xl font-bold text-zinc-100 flex items-center space-x-2">
              <Bell className="w-5 h-5 text-indigo-400 shrink-0" />
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

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => handleOpenDirectAlert()}
            className="flex-1 sm:flex-initial border-indigo-500/30 text-indigo-300 hover:bg-indigo-950/40 justify-center whitespace-nowrap text-xs"
          >
            <UserPlus className="w-3.5 h-3.5 mr-1.5 text-indigo-400 shrink-0" />
            <span>Direct Alert</span>
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={fetchData}
            isLoading={refreshing}
            className="flex-1 sm:flex-initial border-zinc-700 hover:bg-zinc-800 justify-center whitespace-nowrap text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 shrink-0 ${refreshing ? "animate-spin" : ""}`} />
            <span>Scan</span>
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={handleSyncAuthEmails}
            isLoading={syncingAuth}
            className="flex-1 sm:flex-initial border-zinc-700 hover:bg-zinc-800 justify-center whitespace-nowrap text-xs text-zinc-300"
            title="Sync all student emails directly from Supabase Authentication into student records"
          >
            <Users className={`w-3.5 h-3.5 mr-1.5 text-zinc-400 shrink-0 ${syncingAuth ? "animate-spin" : ""}`} />
            <span>Sync Auth</span>
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => setIsResetConfirmOpen(true)}
            className="flex-1 sm:flex-initial border-rose-900/40 text-rose-300 hover:bg-rose-950/40 hover:border-rose-700/50 justify-center whitespace-nowrap text-xs"
            title="Reset all alert history and student sent counters back to 0"
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1.5 text-rose-400 shrink-0" />
            <span>Reset Counts</span>
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
              className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-500 text-white border-none shadow-indigo-500/20 justify-center whitespace-nowrap text-xs font-semibold"
            >
              <Send className="w-3.5 h-3.5 mr-1.5 shrink-0" />
              <span>Dispatch Selected ({selectedIds.size})</span>
            </Button>
          )}
        </div>
      </div>

      {/* RESET FEEDBACK ALERT */}
      {resetFeedback && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center justify-between transition-all ${
            resetFeedback.type === "success"
              ? "bg-emerald-950/30 border-emerald-800 text-emerald-300"
              : "bg-rose-950/30 border-rose-800 text-rose-300"
          }`}
        >
          <div className="flex items-center space-x-2">
            {resetFeedback.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{resetFeedback.message}</span>
          </div>
          <button
            onClick={() => setResetFeedback(null)}
            className="text-zinc-400 hover:text-zinc-200 text-xs ml-3"
          >
            ✕
          </button>
        </div>
      )}

      {/* DATABASE CONSTRAINT DIAGNOSTICS WARNING BANNER */}
      {constraintWarning && (
        <div className="p-3.5 rounded-xl border border-amber-800 bg-amber-950/40 text-xs text-amber-200 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 font-semibold text-amber-300">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Database Constraint Notice: Table Check Update Required</span>
            </div>
            <button
              onClick={() => setConstraintWarning(null)}
              className="text-zinc-400 hover:text-zinc-200 text-xs ml-3"
            >
              ✕
            </button>
          </div>
          <p className="text-amber-200/90 leading-relaxed">
            {constraintWarning}
          </p>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 p-2 rounded bg-black/40 border border-amber-900/50">
            <code className="text-[10px] text-zinc-300 font-mono break-all select-all">
              ALTER TABLE public.user_alerts DROP CONSTRAINT IF EXISTS user_alerts_alert_type_check; ALTER TABLE public.user_alerts ADD CONSTRAINT user_alerts_alert_type_check CHECK (alert_type IN (&apos;A&apos;, &apos;I&apos;, &apos;D&apos;, &apos;W&apos;));
            </code>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText("ALTER TABLE public.user_alerts DROP CONSTRAINT IF EXISTS user_alerts_alert_type_check;\nALTER TABLE public.user_alerts ADD CONSTRAINT user_alerts_alert_type_check CHECK (alert_type IN ('A', 'I', 'D', 'W'));");
                setCopiedConstraintSql(true);
                setTimeout(() => setCopiedConstraintSql(false), 2500);
              }}
              className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 rounded border border-amber-500/30 font-semibold text-[10px] shrink-0"
            >
              {copiedConstraintSql ? "Copied!" : "Copy SQL Fix"}
            </button>
          </div>
        </div>
      )}

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

      {/* 3.5. MONDAY ACHIEVER AUTOMATION BANNER */}
      <div className="p-4 rounded-xl border border-indigo-500/30 bg-gradient-to-r from-indigo-950/40 via-purple-950/30 to-zinc-900/60 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1.5 flex-1">
          <div className="flex items-center space-x-2 flex-wrap gap-y-1">
            <span className="text-xl">👑</span>
            <span className="text-sm font-bold text-zinc-100">
              Monday Achiever Automation
            </span>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              {achieverStatus?.isMonday ? "🗓️ Today is Monday" : "Automated Every Monday"}
            </span>
            {achieverStatus?.alreadySentThisWeek ? (
              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Dispatched for Week of {achieverStatus.weekKey}
              </span>
            ) : achieverStatus?.isMonday ? (
              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                <Zap className="w-3 h-3" /> Ready for Monday Dispatch
              </span>
            ) : null}
          </div>

          <div className="text-xs text-zinc-300 flex items-center gap-2 flex-wrap">
            {activeAchiever ? (
              <span>
                Current Achiever: <strong className="text-amber-300">{activeAchiever.display_name}</strong>{" "}
                <span className="font-mono text-zinc-400">({activeAchiever.email})</span>
              </span>
            ) : (
              <span className="text-zinc-400">Evaluating previous week top performer...</span>
            )}
            <span>&bull;</span>
            <span className="text-zinc-400">
              {achieverStatus?.alreadySentThisWeek
                ? "Locked: Next congratulations email will be sent automatically on next Monday."
                : achieverStatus?.isMonday
                ? "Triggered automatically when data resets, or run now below."
                : "Fires once per week on Mondays when the weekly leaderboard resets."}
            </span>
          </div>

          {achieverFeedback && (
            <div
              className={`text-xs mt-2 px-2.5 py-1.5 rounded-md border ${
                achieverFeedback.type === "success"
                  ? "bg-emerald-950/40 border-emerald-500/40 text-emerald-300"
                  : achieverFeedback.type === "error"
                  ? "bg-rose-950/40 border-rose-500/40 text-rose-300"
                  : "bg-indigo-950/40 border-indigo-500/40 text-indigo-300"
              }`}
            >
              {achieverFeedback.message}
            </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto shrink-0">
          {activeAchiever && (
            <button
              type="button"
              onClick={() => {
                const cand: AlertCandidate = {
                  candidate_id: `ACHIEVER-${activeAchiever.user_id}-${Date.now()}`,
                  user_id: activeAchiever.user_id,
                  user_name: activeAchiever.display_name,
                  user_email: activeAchiever.email,
                  alert_type: "A",
                  consecutive_inactive_days: 0,
                  reason: "Weekly Leaderboard Champion (Achiever Title)",
                  last_active_at: new Date().toISOString(),
                  last_alert_sent_at: null,
                  has_achiever_badge: true,
                  total_study_minutes: 0,
                  past_week_study_minutes: 0,
                };
                setPreviewCandidate(cand);
              }}
              className="w-full sm:w-auto justify-center px-3 py-2 rounded-lg text-xs font-semibold border border-amber-500/30 text-amber-300 hover:bg-amber-950/40 flex items-center space-x-1.5 transition-all"
            >
              <Eye className="w-3.5 h-3.5 shrink-0" />
              <span>Preview Achiever Email</span>
            </button>
          )}
          <button
            onClick={() => handleRunWeeklyAchiever(false)}
            disabled={processingAchiever || !mailerConfig?.configured}
            className="w-full sm:w-auto justify-center px-3 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-1.5 transition-all shadow-sm"
          >
            {processingAchiever ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
                <span>Checking...</span>
              </>
            ) : (
              <>
                <Zap className="w-3.5 h-3.5 shrink-0" />
                <span>Run Monday Check</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* 4. FILTER TABS & SEARCH (Always visible on mobile & desktop) */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 -mx-1 px-1 sm:mx-0 sm:px-0 scrollbar-none">
            <button
              type="button"
              onClick={() => setActiveTab("all")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center space-x-1.5 shrink-0 ${
                activeTab === "all"
                  ? "bg-zinc-100 text-zinc-950 shadow-sm"
                  : "bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800"
              }`}
            >
              <span>All Candidates</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  activeTab === "all"
                    ? "bg-zinc-300 text-zinc-900"
                    : "bg-zinc-800 text-zinc-300"
                }`}
              >
                {counts.total}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("A")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center space-x-1.5 shrink-0 ${
                activeTab === "A"
                  ? "bg-emerald-500 text-zinc-950 shadow-sm"
                  : "bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800"
              }`}
            >
              <span>🏆 Achievers</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  activeTab === "A"
                    ? "bg-emerald-600 text-white"
                    : "bg-zinc-800 text-zinc-300"
                }`}
              >
                {counts.aCount}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("W")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center space-x-1.5 shrink-0 ${
                activeTab === "W"
                  ? "bg-indigo-500 text-white shadow-sm"
                  : "bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800"
              }`}
            >
              <span>📊 Weekly Slump</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  activeTab === "W"
                    ? "bg-indigo-700 text-white"
                    : "bg-zinc-800 text-zinc-300"
                }`}
              >
                {counts.wCount}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("I")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center space-x-1.5 shrink-0 ${
                activeTab === "I"
                  ? "bg-amber-500 text-zinc-950 shadow-sm"
                  : "bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800"
              }`}
            >
              <span>⚠️ 3-Day Notice</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  activeTab === "I"
                    ? "bg-amber-600 text-zinc-950"
                    : "bg-zinc-800 text-zinc-300"
                }`}
              >
                {counts.iCount}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("D")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center space-x-1.5 shrink-0 ${
                activeTab === "D"
                  ? "bg-rose-500 text-zinc-950 shadow-sm"
                  : "bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800"
              }`}
            >
              <span>🚨 5-Day Deletion</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  activeTab === "D"
                    ? "bg-rose-700 text-white"
                    : "bg-zinc-800 text-zinc-300"
                }`}
              >
                {counts.dCount}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("history")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center space-x-1.5 shrink-0 ${
                activeTab === "history"
                  ? "bg-zinc-100 text-zinc-950 shadow-sm"
                  : "bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800"
              }`}
            >
              <Clock className="w-3.5 h-3.5 shrink-0" />
              <span>Alert History</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  activeTab === "history"
                    ? "bg-zinc-300 text-zinc-900"
                    : "bg-zinc-800 text-zinc-300"
                }`}
              >
                {history.length}
              </span>
            </button>
          </div>

          <div className="relative w-full sm:w-64 shrink-0">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
            <input
              type="text"
              placeholder={
                activeTab === "history"
                  ? "Search alert history (name, email, reason)..."
                  : "Search candidates by name or email..."
              }
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-zinc-900/90 border border-zinc-800 text-zinc-200 text-xs rounded-lg pl-8 pr-7 py-2 focus:outline-none focus:border-indigo-500 placeholder:text-zinc-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-200 text-xs p-0.5"
                title="Clear search"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* 5. CANDIDATES CONTAINER (Responsive Desktop Table + Mobile Cards) */}
        {activeTab !== "history" ? (
          <div className="border border-zinc-800/80 rounded-xl overflow-hidden bg-zinc-900/30">
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs text-zinc-300">
                <thead className="bg-zinc-900/90 text-zinc-400 border-b border-zinc-800 font-bold uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="py-3.5 px-4 w-12 text-center">
                      <input
                        type="checkbox"
                        checked={
                          selectedIds.size === filteredCandidates.length &&
                          filteredCandidates.length > 0
                        }
                        onChange={handleSelectAllFiltered}
                        className="rounded bg-zinc-800 border-zinc-700 text-indigo-600 focus:ring-0 cursor-pointer w-4 h-4"
                      />
                    </th>
                    <th className="py-3.5 px-4">Student</th>
                    <th className="py-3.5 px-4 whitespace-nowrap">Alert Trigger</th>
                    <th className="py-3.5 px-4">Activity &amp; Weekly Record</th>
                    <th className="py-3.5 px-4 whitespace-nowrap">Alerts History</th>
                    <th className="py-3.5 px-4 whitespace-nowrap">Last Active</th>
                    <th className="py-3.5 px-4 text-right whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-zinc-500">
                        <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-zinc-400" />
                        Scanning students, inactivity records &amp; weekly performance...
                      </td>
                    </tr>
                  ) : filteredCandidates.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-zinc-500">
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
                          <td className="py-3.5 px-4 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              disabled={!candidate.user_email}
                              onChange={() => handleToggleSelect(candidate.candidate_id)}
                              className="rounded bg-zinc-800 border-zinc-700 text-indigo-600 focus:ring-0 cursor-pointer w-4 h-4 disabled:opacity-30 disabled:cursor-not-allowed"
                              title={!candidate.user_email ? "Cannot select: Student has no email on file" : ""}
                            />
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="flex items-center space-x-3">
                              <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center font-bold text-xs text-zinc-200 shrink-0">
                                {candidate.user_name.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <div className="font-semibold text-zinc-100 flex items-center space-x-1.5 text-xs">
                                  <span>{candidate.user_name}</span>
                                  {candidate.has_achiever_badge && (
                                    <span title="Achiever Title Active">👑</span>
                                  )}
                                </div>
                                <div className="flex items-center space-x-1.5 text-[11px] text-zinc-500 font-mono">
                                  <span>
                                    {candidate.user_email ? (
                                      candidate.user_email
                                    ) : (
                                      <span className="text-amber-500 font-sans font-medium text-[10px]">⚠️ No Email on File</span>
                                    )}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEditEmail(candidate.user_id, candidate.user_name, candidate.user_email)}
                                    className="text-zinc-500 hover:text-indigo-400 p-0.5 rounded hover:bg-zinc-800 transition shrink-0"
                                    title={`Edit email for ${candidate.user_name}`}
                                  >
                                    <Pencil className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap">{renderTypeBadge(candidate.alert_type)}</td>
                          <td className="py-3.5 px-4">
                            <div className="space-y-1">
                              <div className="text-zinc-200 font-medium">
                                {candidate.reason}
                              </div>
                              <div className="text-[11px] text-zinc-400 flex items-center space-x-2 whitespace-nowrap">
                                <span>Past Week: <strong className="text-zinc-200">{(candidate.past_week_study_minutes / 60).toFixed(1)}h</strong></span>
                                <span>&bull;</span>
                                <span>All-time: <strong className="text-zinc-200">{(candidate.total_study_minutes / 60).toFixed(1)}h</strong></span>
                              </div>
                            </div>
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            {candidate.total_alerts_sent && candidate.total_alerts_sent > 0 ? (
                              <div className="space-y-1">
                                <div className="flex items-center space-x-1">
                                  <span className="text-xs font-semibold text-zinc-200">
                                    {candidate.total_alerts_sent} sent
                                  </span>
                                </div>
                                <div className="flex items-center gap-1 flex-wrap text-[10px]">
                                  {(candidate.alert_counts?.A || 0) > 0 && (
                                    <span
                                      title="Achiever's Title Congratulations"
                                      className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-medium"
                                    >
                                      🏆 {candidate.alert_counts?.A}
                                    </span>
                                  )}
                                  {(candidate.alert_counts?.W || 0) > 0 && (
                                    <span
                                      title="Weekly Momentum / Slump Review"
                                      className="px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 font-medium"
                                    >
                                      📊 {candidate.alert_counts?.W}
                                    </span>
                                  )}
                                  {(candidate.alert_counts?.I || 0) > 0 && (
                                    <span
                                      title="3-Day Activity Notice"
                                      className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 font-medium"
                                    >
                                      ⚠️ {candidate.alert_counts?.I}
                                    </span>
                                  )}
                                  {(candidate.alert_counts?.D || 0) > 0 && (
                                    <span
                                      title="5-Day Account Deletion Notice"
                                      className="px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-300 border border-rose-500/30 font-medium"
                                    >
                                      🚨 {candidate.alert_counts?.D}
                                    </span>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <span className="text-xs text-zinc-500 font-medium">0 sent</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap text-zinc-400 font-medium">
                            {new Date(candidate.last_active_at).toLocaleDateString("en-IN", {
                              day: "numeric",
                              month: "short",
                            })}
                          </td>
                          <td className="py-3.5 px-4 text-right whitespace-nowrap">
                            <div className="inline-flex items-center space-x-1.5">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setPreviewCandidate(candidate);
                                  setTestSuccessMessage(null);
                                  setTestErrorMessage(null);
                                }}
                                className="h-8 px-2 text-zinc-300 hover:text-white border border-zinc-800"
                                title="Live Preview"
                              >
                                <Eye className="w-3.5 h-3.5 mr-1" />
                                <span>Preview</span>
                              </Button>

                              <Button
                                variant="secondary"
                                size="sm"
                                disabled={!candidate.user_email}
                                onClick={() => {
                                  setSelectedIds(new Set([candidate.candidate_id]));
                                  setBatchFinished(false);
                                  setBatchResults([]);
                                  setIsBatchModalOpen(true);
                                }}
                                className="h-8 px-2.5 text-xs border-indigo-500/30 text-indigo-300 hover:bg-indigo-950/30 disabled:opacity-30 disabled:cursor-not-allowed"
                                title={!candidate.user_email ? "Cannot send: Student has no email on file" : "Send Alert"}
                              >
                                <Send className="w-3 h-3 mr-1 text-indigo-400" />
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

            {/* Mobile Card List View */}
            <div className="block md:hidden">
              {/* Mobile Select All Header */}
              {filteredCandidates.length > 0 && (
                <div className="p-3 bg-zinc-900/90 border-b border-zinc-800 flex items-center justify-between">
                  <label className="flex items-center space-x-2 cursor-pointer text-xs text-zinc-300 font-semibold">
                    <input
                      type="checkbox"
                      checked={
                        selectedIds.size === filteredCandidates.length &&
                        filteredCandidates.length > 0
                      }
                      onChange={handleSelectAllFiltered}
                      className="rounded bg-zinc-800 border-zinc-700 text-indigo-600 focus:ring-0 w-4 h-4"
                    />
                    <span>Select All ({filteredCandidates.length})</span>
                  </label>
                  {selectedIds.size > 0 && (
                    <span className="text-[11px] font-bold text-indigo-400">
                      {selectedIds.size} Selected
                    </span>
                  )}
                </div>
              )}

              {loading ? (
                <div className="p-8 text-center text-zinc-500">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-zinc-400" />
                  Scanning students &amp; activity...
                </div>
              ) : filteredCandidates.length === 0 ? (
                <div className="p-8 text-center text-zinc-500 text-xs">
                  No students currently match this filter.
                </div>
              ) : (
                <div className="divide-y divide-zinc-800/80">
                  {filteredCandidates.map((candidate) => {
                    const isSelected = selectedIds.has(candidate.candidate_id);
                    return (
                      <div
                        key={candidate.candidate_id}
                        className={`p-3 sm:p-3.5 space-y-2.5 transition-colors ${
                          isSelected ? "bg-indigo-950/20" : "bg-transparent"
                        }`}
                      >
                        {/* Header: Checkbox + Avatar + Name/Email (min-w-0) + Compact Badge */}
                        <div className="flex items-center justify-between gap-2 min-w-0">
                          <div className="flex items-center space-x-2.5 min-w-0 flex-1">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              disabled={!candidate.user_email}
                              onChange={() => handleToggleSelect(candidate.candidate_id)}
                              className="rounded bg-zinc-800 border-zinc-700 text-indigo-600 focus:ring-0 w-4 h-4 shrink-0 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                            />
                            <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center font-bold text-xs text-zinc-200 shrink-0">
                              {candidate.user_name.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="font-semibold text-zinc-100 flex items-center space-x-1 text-xs truncate">
                                <span className="truncate">{candidate.user_name}</span>
                                {candidate.has_achiever_badge && (
                                  <span className="shrink-0" title="Achiever Title">👑</span>
                                )}
                              </div>
                              <div className="flex items-center space-x-1.5 text-[10px] sm:text-[11px] text-zinc-500 font-mono min-w-0">
                                <span className="truncate">
                                  {candidate.user_email ? (
                                    candidate.user_email
                                  ) : (
                                    <span className="text-amber-500 font-sans font-medium text-[9px]">⚠️ No Email on File</span>
                                  )}
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenEditEmail(candidate.user_id, candidate.user_name, candidate.user_email);
                                  }}
                                  className="text-zinc-500 hover:text-indigo-400 p-0.5 rounded hover:bg-zinc-800 transition shrink-0"
                                  title={`Edit email for ${candidate.user_name}`}
                                >
                                  <Pencil className="w-2.5 h-2.5" />
                                </button>
                              </div>
                            </div>
                          </div>
                          <div className="shrink-0">
                            {renderTypeBadge(candidate.alert_type, true)}
                          </div>
                        </div>

                        {/* Trigger Reason + Stats Grid */}
                        <div className="bg-zinc-950/70 p-2.5 rounded-lg border border-zinc-800/80 space-y-2">
                          <div className="text-xs text-zinc-200 font-medium break-words leading-relaxed">
                            {candidate.reason}
                          </div>
                          <div className="grid grid-cols-3 gap-1 pt-1.5 border-t border-zinc-800/60 text-[10px] sm:text-[11px]">
                            <div className="min-w-0">
                              <span className="text-zinc-500 block text-[9px] uppercase tracking-wider">Past Week</span>
                              <span className="text-zinc-200 font-bold truncate block">
                                {(candidate.past_week_study_minutes / 60).toFixed(1)}h
                              </span>
                            </div>
                            <div className="min-w-0 text-center">
                              <span className="text-zinc-500 block text-[9px] uppercase tracking-wider">All-Time</span>
                              <span className="text-zinc-200 font-bold truncate block">
                                {(candidate.total_study_minutes / 60).toFixed(1)}h
                              </span>
                            </div>
                            <div className="min-w-0 text-right">
                              <span className="text-zinc-500 block text-[9px] uppercase tracking-wider">Active</span>
                              <span className="text-zinc-300 font-medium truncate block">
                                {new Date(candidate.last_active_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Prior Sent History Chips */}
                        {candidate.total_alerts_sent && candidate.total_alerts_sent > 0 ? (
                          <div className="flex items-center gap-1.5 flex-wrap text-[10px]">
                            <span className="text-zinc-400 font-medium">{candidate.total_alerts_sent} sent:</span>
                            {(candidate.alert_counts?.A || 0) > 0 && (
                              <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                🏆 {candidate.alert_counts?.A}
                              </span>
                            )}
                            {(candidate.alert_counts?.W || 0) > 0 && (
                              <span className="px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                                📊 {candidate.alert_counts?.W}
                              </span>
                            )}
                            {(candidate.alert_counts?.I || 0) > 0 && (
                              <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                                ⚠️ {candidate.alert_counts?.I}
                              </span>
                            )}
                            {(candidate.alert_counts?.D || 0) > 0 && (
                              <span className="px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-300 border border-rose-500/30">
                                🚨 {candidate.alert_counts?.D}
                              </span>
                            )}
                          </div>
                        ) : null}

                        {/* Action Buttons */}
                        <div className="flex items-center gap-2 pt-0.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setPreviewCandidate(candidate);
                              setTestSuccessMessage(null);
                              setTestErrorMessage(null);
                            }}
                            className="flex-1 h-8 text-xs text-zinc-300 hover:text-white border border-zinc-800 justify-center"
                          >
                            <Eye className="w-3.5 h-3.5 mr-1 shrink-0" />
                            <span>Preview</span>
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={!candidate.user_email}
                            onClick={() => {
                              setSelectedIds(new Set([candidate.candidate_id]));
                              setBatchFinished(false);
                              setBatchResults([]);
                              setIsBatchModalOpen(true);
                            }}
                            className="flex-1 h-8 text-xs border-indigo-500/40 text-indigo-300 hover:bg-indigo-950/40 justify-center disabled:opacity-30 disabled:cursor-not-allowed"
                            title={!candidate.user_email ? "Cannot send: Student has no email on file" : "Send Alert"}
                          >
                            <Send className="w-3 h-3 mr-1 text-indigo-400 shrink-0" />
                            <span>Send Alert</span>
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* 6. SENT HISTORY TAB (Responsive Desktop Table + Mobile Cards) */
          <div className="border border-zinc-800/80 rounded-xl overflow-hidden bg-zinc-900/30">
            {/* History Header & Sub-bar */}
            <div className="p-3 sm:p-4 bg-zinc-900/90 border-b border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex items-center space-x-2.5">
                <div className="w-7 h-7 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
                  <Clock className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h3 className="text-xs sm:text-sm font-bold text-zinc-100 flex items-center space-x-2">
                    <span>Alert Dispatch History</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-zinc-800 text-zinc-300 border border-zinc-700">
                      {filteredHistory.length} {filteredHistory.length === 1 ? "record" : "records"}
                      {searchQuery && history.length !== filteredHistory.length ? ` (filtered from ${history.length})` : ""}
                    </span>
                  </h3>
                  <p className="text-[11px] text-zinc-400">
                    Historical log of automated Monday achievers and inactivity/deletion warnings
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2 self-start sm:self-auto">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={fetchData}
                  isLoading={refreshing}
                  className="h-8 text-xs text-zinc-300 hover:text-white border border-zinc-800 px-3"
                >
                  <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${refreshing ? "animate-spin" : ""}`} />
                  <span>Refresh History</span>
                </Button>
              </div>
            </div>

            {/* Desktop History Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs text-zinc-300">
                <thead className="bg-zinc-900/60 text-zinc-400 border-b border-zinc-800 uppercase text-[10px] tracking-wider font-bold">
                  <tr>
                    <th className="py-3 px-4">Student</th>
                    <th className="py-3 px-4 whitespace-nowrap">Alert Type</th>
                    <th className="py-3 px-4 whitespace-nowrap">Status</th>
                    <th className="py-3 px-4">Trigger Reason</th>
                    <th className="py-3 px-4 whitespace-nowrap text-right">Date Dispatched</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-zinc-500">
                        <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-zinc-400" />
                        Loading alert history...
                      </td>
                    </tr>
                  ) : filteredHistory.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-zinc-500">
                        {history.length === 0
                          ? "No alert history recorded yet. When alerts are sent, they will appear here automatically."
                          : `No history records match "${searchQuery}".`}
                      </td>
                    </tr>
                  ) : (
                    filteredHistory.map((item) => (
                      <tr key={item.id} className="hover:bg-zinc-800/30 transition-colors">
                        <td className="py-3 px-4">
                          <div className="flex items-center space-x-2.5">
                            <div className="w-7 h-7 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center font-bold text-xs text-zinc-200 shrink-0">
                              {item.user_name ? item.user_name.charAt(0).toUpperCase() : "?"}
                            </div>
                            <div className="min-w-0">
                              <div className="font-semibold text-zinc-200 truncate">{item.user_name}</div>
                              <div className="text-[11px] text-zinc-500 font-mono truncate">{item.user_email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">{renderTypeBadge(item.alert_type)}</td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          {item.status === "sent" ? (
                            <span className="inline-flex items-center space-x-1 text-emerald-400 font-semibold bg-emerald-950/30 px-2 py-0.5 rounded border border-emerald-500/20">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Sent</span>
                            </span>
                          ) : (
                            <span
                              className="inline-flex items-center space-x-1 text-rose-400 font-semibold bg-rose-950/30 px-2 py-0.5 rounded border border-rose-500/20"
                              title={item.error_message || ""}
                            >
                              <AlertCircle className="w-3.5 h-3.5" />
                              <span>Failed</span>
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-zinc-300">
                          <div>{item.reason}</div>
                          {item.error_message && (
                            <div className="text-[10px] text-rose-400 mt-0.5 font-mono">
                              Error: {item.error_message}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-zinc-400 whitespace-nowrap text-right font-medium">
                          {item.sent_at
                            ? new Date(item.sent_at).toLocaleString("en-IN", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
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

            {/* Mobile History Cards */}
            <div className="block md:hidden divide-y divide-zinc-800/80">
              {loading ? (
                <div className="p-8 text-center text-zinc-500 text-xs">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-zinc-400" />
                  Loading alert history...
                </div>
              ) : filteredHistory.length === 0 ? (
                <div className="p-8 text-center text-zinc-500 text-xs">
                  {history.length === 0
                    ? "No alert history recorded yet. When alerts are sent, they will appear here automatically."
                    : `No history records match "${searchQuery}".`}
                </div>
              ) : (
                filteredHistory.map((item) => (
                  <div key={item.id} className="p-3 sm:p-3.5 space-y-2 hover:bg-zinc-800/20 transition-colors">
                    <div className="flex items-center justify-between gap-2 min-w-0">
                      <div className="flex items-center space-x-2 min-w-0 flex-1">
                        <div className="w-7 h-7 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center font-bold text-xs text-zinc-200 shrink-0">
                          {item.user_name ? item.user_name.charAt(0).toUpperCase() : "?"}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-zinc-200 text-xs truncate">{item.user_name}</div>
                          <div className="text-[10px] sm:text-[11px] text-zinc-500 font-mono truncate">{item.user_email}</div>
                        </div>
                      </div>
                      <div className="shrink-0">{renderTypeBadge(item.alert_type, true)}</div>
                    </div>

                    <div className="bg-zinc-950/70 p-2.5 rounded-lg border border-zinc-800/80 space-y-1.5">
                      <div className="text-xs text-zinc-300 break-words leading-relaxed">{item.reason}</div>
                      {item.error_message && (
                        <div className="text-[10px] text-rose-400 bg-rose-950/40 p-1.5 rounded border border-rose-900/40 font-mono break-all">
                          {item.error_message}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-[10px] sm:text-[11px] text-zinc-400 pt-1">
                      <div>
                        {item.status === "sent" ? (
                          <span className="inline-flex items-center space-x-1 text-emerald-400 font-semibold">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Sent Successfully</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1 text-rose-400 font-semibold">
                            <AlertCircle className="w-3.5 h-3.5" />
                            <span>Failed</span>
                          </span>
                        )}
                      </div>
                      <span className="font-mono text-zinc-400 shrink-0">
                        {item.sent_at
                          ? new Date(item.sent_at).toLocaleString("en-IN", {
                              day: "numeric",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "—"}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* 7. DIRECT MEMBER ALERT MODAL */}
      <Modal
        isOpen={isDirectAlertOpen}
        onClose={() => setIsDirectAlertOpen(false)}
        title="Direct Alert to Member"
        subtitle="Select any platform member to send an instant customized alert based on past performance"
        maxWidth="2xl"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">
              Select Student / Member:
            </label>
            <select
              value={directSelectedUserId || selectableUsers[0]?.id || ""}
              onChange={(e) => setDirectSelectedUserId(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs rounded-xl p-2.5 focus:outline-none focus:border-indigo-500"
            >
              {selectableUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.display_name} {u.has_achiever_badge ? "👑" : ""} ({u.current_status}) — Past Week: {(u.weekly_minutes / 60).toFixed(1)}h
                </option>
              ))}
            </select>

            {(() => {
              const selectedUser = selectableUsers.find((u) => u.id === (directSelectedUserId || selectableUsers[0]?.id));
              if (!selectedUser) return null;
              const sent = selectedUser.total_alerts_sent || 0;
              const c = selectedUser.alert_counts || { A: 0, W: 0, I: 0, D: 0 };
              return (
                <div className="mt-2 p-2.5 rounded-lg bg-zinc-900/90 border border-zinc-800 text-[11px] text-zinc-300">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-zinc-200">Alert Tracking History:</span>
                    <span className="px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-200 font-bold">
                      {sent} total sent
                    </span>
                  </div>
                  <div className="mb-1.5 text-zinc-400 flex items-center space-x-1.5">
                    <span className="text-zinc-500">Signup Email: </span>
                    {selectedUser.email ? (
                      <span className="text-zinc-200 font-mono font-medium">{selectedUser.email}</span>
                    ) : (
                      <span className="text-amber-400 font-medium">⚠️ No authentic email found on file</span>
                    )}
                    <button
                      type="button"
                      onClick={() => handleOpenEditEmail(selectedUser.id, selectedUser.display_name, selectedUser.email)}
                      className="text-zinc-500 hover:text-indigo-400 p-0.5 rounded hover:bg-zinc-800 transition shrink-0"
                      title={`Edit email for ${selectedUser.display_name}`}
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap text-zinc-400">
                    <span className="text-emerald-400">🏆 Achiever: {c.A}</span>
                    <span>&bull;</span>
                    <span className="text-indigo-400">📊 Weekly Slump: {c.W}</span>
                    <span>&bull;</span>
                    <span className="text-amber-400">⚠️ Notice: {c.I}</span>
                    <span>&bull;</span>
                    <span className="text-rose-400">🚨 Deletion: {c.D}</span>
                  </div>
                </div>
              );
            })()}
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">
              Select Alert Type:
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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

          {directAlertError && (
            <div className="p-3 bg-rose-950/40 border border-rose-800/80 rounded-xl text-rose-200 text-xs space-y-1.5">
              <div className="flex items-center space-x-2 font-semibold text-rose-300">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>Alert Dispatch Issue</span>
              </div>
              <p className="text-rose-200/90 leading-relaxed font-mono text-[11px] break-words">
                {directAlertError}
              </p>
              {directAlertError.includes("user_alerts_alert_type_check") && (
                <div className="mt-2 p-2 bg-black/40 rounded-lg border border-amber-900/50 text-amber-200 text-[11px] space-y-1.5">
                  <p className="font-semibold text-amber-300">
                    Fix: PostgreSQL check constraint on user_alerts needs to allow Type W
                  </p>
                  <code className="block bg-zinc-950 p-1.5 rounded text-[10px] text-zinc-300 font-mono break-all">
                    ALTER TABLE public.user_alerts DROP CONSTRAINT IF EXISTS user_alerts_alert_type_check; ALTER TABLE public.user_alerts ADD CONSTRAINT user_alerts_alert_type_check CHECK (alert_type IN (&apos;A&apos;, &apos;I&apos;, &apos;D&apos;, &apos;W&apos;));
                  </code>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col sm:flex-row justify-end space-y-2 sm:space-y-0 sm:space-x-2 pt-3 border-t border-zinc-800/80">
            <Button
              variant="ghost"
              disabled={sendingDirectAlert}
              onClick={() => setIsDirectAlertOpen(false)}
              className="text-xs"
            >
              Cancel
            </Button>
            {(() => {
              const selectedUser = selectableUsers.find((u) => u.id === (directSelectedUserId || selectableUsers[0]?.id));
              const hasEmail = Boolean(selectedUser?.email);
              return (
                <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
                  <Button
                    variant="secondary"
                    disabled={!hasEmail || sendingDirectAlert}
                    onClick={handlePreviewDirectAlert}
                    className="border-zinc-700 text-zinc-200 hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed text-xs flex-1 sm:flex-initial"
                    title={!hasEmail ? "Cannot preview alert: Student has no email on file" : "Preview how this email appears to student"}
                  >
                    <Eye className="w-3.5 h-3.5 mr-1.5" />
                    <span>Preview Email</span>
                  </Button>

                  <Button
                    variant="primary"
                    disabled={!hasEmail || sendingDirectAlert}
                    isLoading={sendingDirectAlert}
                    onClick={handleSendDirectAlertNow}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold flex-1 sm:flex-initial"
                    title={!hasEmail ? "Cannot send alert: Student has no email on file" : "Send verified alert email directly to student"}
                  >
                    <Send className="w-3.5 h-3.5 mr-1.5" />
                    <span>Send Alert Now</span>
                  </Button>
                </div>
              );
            })()}
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
          maxWidth="4xl"
        >
          <div className="space-y-4">
            {/* Device Frame Switcher & Test Action Bar */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 p-3 bg-zinc-900 rounded-xl border border-zinc-800">
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setPreviewDevice("desktop")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center space-x-1.5 transition-colors ${
                    previewDevice === "desktop"
                      ? "bg-zinc-800 text-white shadow-sm"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  <Monitor className="w-3.5 h-3.5" />
                  <span>Desktop</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewDevice("mobile")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center space-x-1.5 transition-colors ${
                    previewDevice === "mobile"
                      ? "bg-zinc-800 text-white shadow-sm"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>Mobile</span>
                </button>
              </div>

              {/* Instant Test Email Input Bar */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <div className="relative flex-1 sm:w-64">
                  <Mail className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                  <input
                    type="email"
                    value={testEmailAddress}
                    onChange={(e) => setTestEmailAddress(e.target.value)}
                    placeholder="Your email address"
                    className="w-full bg-zinc-950 border border-zinc-700 text-zinc-200 text-xs rounded-lg pl-7 pr-2.5 py-1.5 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSendTest}
                  isLoading={sendingTest}
                  disabled={!testEmailAddress}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white border-none h-8 text-xs shrink-0 whitespace-nowrap px-3.5 font-semibold shadow-sm"
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
                previewDevice === "mobile" ? "max-w-[400px]" : "w-full"
              }`}
            >
              <div className="p-2.5 bg-zinc-900 border-b border-zinc-800 text-[11px] text-zinc-400 flex items-center justify-between">
                <span>From: StudyRoom &lt;studyaliveapp@gmail.com&gt;</span>
                <span>To: {previewCandidate.user_email}</span>
              </div>
              <div
                className="max-h-[580px] overflow-y-auto"
                dangerouslySetInnerHTML={{ __html: previewEmailContent.html }}
              />
            </div>
            {/* Dispatch Action Footer */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-zinc-800">
              <div className="text-xs text-zinc-400">
                <span>Target Student: </span>
                <strong className="text-zinc-200">{previewCandidate.user_name}</strong>
                {previewCandidate.user_email ? (
                  <span className="font-mono text-zinc-300 ml-1.5">({previewCandidate.user_email})</span>
                ) : (
                  <span className="text-amber-400 ml-1.5 font-medium">⚠️ No email on file</span>
                )}
              </div>

              <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
                <Button
                  variant="ghost"
                  disabled={sendingToStudentFromPreview}
                  onClick={() => setPreviewCandidate(null)}
                  className="text-xs"
                >
                  Close
                </Button>
                <Button
                  variant="primary"
                  disabled={!previewCandidate.user_email || sendingToStudentFromPreview}
                  isLoading={sendingToStudentFromPreview}
                  onClick={handleDispatchFromPreview}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-4"
                  title={!previewCandidate.user_email ? "Cannot send: Student has no email on file" : `Send alert to ${previewCandidate.user_name}`}
                >
                  <Send className="w-3.5 h-3.5 mr-1.5" />
                  <span>Dispatch Alert to {previewCandidate.user_name}</span>
                </Button>
              </div>
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
        title={
          candidates.find((c) => selectedIds.has(c.candidate_id)) && selectedIds.size === 1
            ? `Send Alert to ${candidates.find((c) => selectedIds.has(c.candidate_id))?.user_name}`
            : "Dispatch Selected Alerts"
        }
        subtitle={
          candidates.find((c) => selectedIds.has(c.candidate_id)) && selectedIds.size === 1
            ? `Sending verified alert to ${candidates.find((c) => selectedIds.has(c.candidate_id))?.user_email}`
            : `Sending emails to ${selectedIds.size} recipient(s)`
        }
        maxWidth="2xl"
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
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs"
                >
                  <Send className="w-3.5 h-3.5 mr-1.5" />
                  <span>
                    {selectedIds.size === 1
                      ? "Send Alert Now"
                      : `Start Batch Dispatch (${selectedIds.size})`}
                  </span>
                </Button>
              </div>
            </>
          ) : (
            /* Results after completion */
            <div className="space-y-4">
              {/* Dynamic Status Header */}
              {batchSummary && batchSummary.totalFailed === 0 && batchSummary.totalDbErrors === 0 ? (
                <div className="p-3 bg-emerald-950/30 border border-emerald-800 rounded-xl flex items-center space-x-3 text-emerald-300 text-xs">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                  <div>
                    <p className="font-bold">Batch Dispatch Completed!</p>
                    <p className="text-emerald-400">
                      Successfully delivered and logged {batchSummary.totalSent} of {batchSummary.totalRequested} alert emails.
                    </p>
                  </div>
                </div>
              ) : batchSummary && batchSummary.totalDbErrors > 0 && batchSummary.totalFailed === 0 ? (
                <div className="p-3.5 bg-amber-950/40 border border-amber-800 rounded-xl space-y-2 text-amber-200 text-xs">
                  <div className="flex items-center space-x-3">
                    <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0" />
                    <div>
                      <p className="font-bold text-amber-300">All Emails Sent via SMTP · Database Log Pending</p>
                      <p className="text-amber-200/90">
                        Delivered <strong>{batchSummary.totalSent} of {batchSummary.totalRequested}</strong> alert emails to student inboxes, but <strong>{batchSummary.totalDbErrors}</strong> records could not be recorded in database history.
                      </p>
                    </div>
                  </div>
                  {batchSummary.hasConstraintViolation && (
                    <div className="mt-2 p-2.5 bg-black/40 rounded-lg border border-amber-900/60 text-[11px] space-y-1.5">
                      <p className="font-semibold text-amber-300 flex items-center">
                        <Database className="w-3.5 h-3.5 mr-1 text-amber-400" />
                        Supabase Constraint Update Required for Weekly Review (Type W)
                      </p>
                      <p className="text-zinc-400 leading-relaxed">
                        PostgreSQL rejected Type W alerts because the table check constraint on <code className="text-amber-300 font-mono">user_alerts</code> only allows (&apos;A&apos;, &apos;I&apos;, &apos;D&apos;). Run this quick 2-line SQL in your Supabase SQL Editor:
                      </p>
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 bg-zinc-950 p-2 rounded font-mono text-[10px] text-zinc-300">
                        <code className="break-all select-all">ALTER TABLE public.user_alerts DROP CONSTRAINT IF EXISTS user_alerts_alert_type_check; ALTER TABLE public.user_alerts ADD CONSTRAINT user_alerts_alert_type_check CHECK (alert_type IN (&apos;A&apos;, &apos;I&apos;, &apos;D&apos;, &apos;W&apos;));</code>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText("ALTER TABLE public.user_alerts DROP CONSTRAINT IF EXISTS user_alerts_alert_type_check;\nALTER TABLE public.user_alerts ADD CONSTRAINT user_alerts_alert_type_check CHECK (alert_type IN ('A', 'I', 'D', 'W'));");
                            setCopiedConstraintSql(true);
                            setTimeout(() => setCopiedConstraintSql(false), 2500);
                          }}
                          className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 rounded border border-amber-500/30 text-[10px] font-sans font-semibold shrink-0"
                        >
                          {copiedConstraintSql ? "Copied!" : "Copy SQL Fix"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-3 bg-rose-950/30 border border-rose-800 rounded-xl flex items-center space-x-3 text-rose-200 text-xs">
                  <AlertCircle className="w-5 h-5 text-rose-400 flex-shrink-0" />
                  <div>
                    <p className="font-bold text-rose-300">Batch Dispatch Encountered Issues</p>
                    <p className="text-rose-300/90">
                      {batchResults.filter((r) => r.emailSent).length} sent, {batchResults.filter((r) => !r.emailSent).length} failed delivery.
                    </p>
                  </div>
                </div>
              )}

              {/* Per-candidate detail list */}
              <div className="max-h-60 overflow-y-auto border border-zinc-800 rounded-lg divide-y divide-zinc-800 text-xs">
                {batchResults.map((res) => (
                  <div key={res.candidate_id} className="p-2.5 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="text-zinc-200 font-medium">{res.user_name}</span>
                        {res.alert_type && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono">
                            Type {res.alert_type}
                          </span>
                        )}
                        {res.user_email && (
                          <span className="text-[11px] text-zinc-500 font-sans">
                            ({res.user_email})
                          </span>
                        )}
                      </div>
                      <div>
                        {res.emailSent && res.dbLogged ? (
                          <span className="text-emerald-400 font-semibold flex items-center space-x-1">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Sent &amp; Logged</span>
                          </span>
                        ) : res.emailSent && !res.dbLogged ? (
                          <span className="text-amber-400 font-semibold flex items-center space-x-1" title={res.dbError}>
                            <AlertTriangle className="w-3.5 h-3.5" />
                            <span>Sent (DB Log Failed)</span>
                          </span>
                        ) : (
                          <span className="text-rose-400 font-semibold flex items-center space-x-1" title={res.error}>
                            <AlertCircle className="w-3.5 h-3.5" />
                            <span>Delivery Failed</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Detailed error callout */}
                    {res.dbError && (
                      <p className="text-[10px] text-amber-400/90 bg-amber-950/30 p-1.5 rounded border border-amber-900/40 font-mono break-all">
                        Database Log Issue: {res.dbError}
                      </p>
                    )}
                    {!res.emailSent && (res.emailError || res.error) && (
                      <p className="text-[10px] text-rose-400/90 bg-rose-950/30 p-1.5 rounded border border-rose-900/40 break-all">
                        Delivery Error: {res.emailError || res.error}
                      </p>
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

      {/* 10. RESET ALERT COUNTS CONFIRMATION MODAL */}
      <Modal
        isOpen={isResetConfirmOpen}
        onClose={() => !resettingAlerts && setIsResetConfirmOpen(false)}
        title="Reset All Alert Counts & Clear History?"
        subtitle="Clears all alert logs and resets all student alert badge counters back to 0."
        maxWidth="md"
      >
        <div className="space-y-4">
          <div className="p-3.5 rounded-xl bg-rose-950/30 border border-rose-900/50 text-rose-200 text-xs space-y-2">
            <div className="flex items-center space-x-2 font-semibold text-rose-300">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>Are you sure you want to reset all alerts?</span>
            </div>
            <p className="text-rose-200/90 leading-relaxed">
              This will purge all logged history from <strong>user_alerts</strong> and zero out all badge counters (Total Alerts Sent, Achiever, Slump, Notice, Deletion) on all user profiles.
            </p>
            <p className="text-zinc-400 text-[11px]">
              This will not affect any student study minutes, daily goals, or active sessions.
            </p>
          </div>

          <div className="flex justify-end space-x-2 pt-2">
            <Button
              variant="ghost"
              disabled={resettingAlerts}
              onClick={() => setIsResetConfirmOpen(false)}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={resettingAlerts}
              isLoading={resettingAlerts}
              onClick={handleResetAlerts}
              className="bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold"
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1.5 shrink-0" />
              <span>Confirm &amp; Reset to 0</span>
            </Button>
          </div>
        </div>
      </Modal>

      {/* 11. INLINE EDIT STUDENT EMAIL MODAL */}
      <Modal
        isOpen={!!editingStudent}
        onClose={() => {
          if (!savingEmail) setEditingStudent(null);
        }}
        title="Update Email Address"
        subtitle={editingStudent ? `Assign authentic email for ${editingStudent.userName}` : "Edit student email"}
        maxWidth="md"
      >
        <div className="space-y-4">
          <div className="p-3 bg-zinc-950/80 border border-zinc-800/80 rounded-xl space-y-1">
            <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
              Student Profile
            </div>
            <div className="text-sm font-bold text-zinc-100 flex items-center space-x-2">
              <span>{editingStudent?.userName}</span>
            </div>
            <div className="text-[10px] text-zinc-500 font-mono">
              ID: {editingStudent?.userId}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
              Authentic Email Address <span className="text-rose-400">*</span>
            </label>
            <input
              type="email"
              value={editEmailInput}
              onChange={(e) => setEditEmailInput(e.target.value)}
              placeholder="e.g. amitkumar@gmail.com"
              className="w-full text-xs bg-zinc-950 border border-zinc-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-lg p-2.5 text-zinc-200 placeholder-zinc-600 outline-none font-mono"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleSaveEmail();
                }
              }}
            />
            <p className="text-[11px] text-zinc-500 mt-1.5">
              Email alerts will be sent directly to this address. Fake or placeholder domains are blocked.
            </p>
          </div>

          {editEmailError && (
            <div className="p-2.5 bg-rose-950/40 border border-rose-900/60 rounded-lg text-rose-300 text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{editEmailError}</span>
            </div>
          )}

          <div className="flex justify-end space-x-2 pt-2 border-t border-zinc-800/80">
            <Button
              variant="ghost"
              disabled={savingEmail}
              onClick={() => setEditingStudent(null)}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={savingEmail || !editEmailInput.trim()}
              isLoading={savingEmail}
              onClick={handleSaveEmail}
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold"
            >
              <Check className="w-3.5 h-3.5 mr-1.5 shrink-0" />
              <span>Save Email</span>
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
