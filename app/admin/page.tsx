"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useAdmin, isAdminEmail, isAdminUserId } from "@/hooks/useAdmin";
import { createClient } from "@/lib/supabase/client";
import { AdminStatsBar } from "@/components/admin/AdminStatsBar";
import { AdminUserRow } from "@/components/admin/AdminUserRow";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import type { AdminUser, PlatformStats } from "@/hooks/useAdmin";
import {
  Shield,
  RefreshCw,
  Search,
  LogOut,
  Users,
  AlertCircle,
  CheckCircle2,
  Radio,
  X,
  BookOpen,
  Coffee,
  Wifi,
} from "lucide-react";

type StatusFilter = "all" | "studying" | "break" | "offline";

export default function AdminPage() {
  const { user, loading: authLoading, signOut } = useAuth();
  const { getAllUsers, getStats, renameUser, deleteUser, forceEndSession } = useAdmin();
  const router = useRouter();
  const supabase = createClient();

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSignOutModalOpen, setIsSignOutModalOpen] = useState(false);
  const [, setClockTick] = useState(0);

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Periodic 30s tick for updating relative durations of active users
  useEffect(() => {
    const timer = setInterval(() => {
      setClockTick((t) => t + 1);
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  // Redirect non-admin users
  useEffect(() => {
    if (!authLoading && user) {
      if (!isAdminEmail(user.email) && !isAdminUserId(user.id)) {
        router.push("/room");
      }
    }
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [user, authLoading, router]);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const [usersData, statsData] = await Promise.allSettled([
        getAllUsers(),
        getStats(),
      ]);

      if (usersData.status === "fulfilled") {
        setUsers(usersData.value);
      } else {
        throw usersData.reason;
      }

      if (statsData.status === "fulfilled") {
        setStats(statsData.value);
      }
    } catch (err) {
      console.error("Admin fetch error:", err);
      setError(err instanceof Error ? err.message : "Failed to load admin data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [getAllUsers, getStats]);

  useEffect(() => {
    if (user && (isAdminEmail(user.email) || isAdminUserId(user.id))) {
      fetchData();
    }
  }, [user, fetchData]);

  // High-performance Realtime: in-place state update + debounced stats re-fetch
  useEffect(() => {
    if (!user || (!isAdminEmail(user.email) && !isAdminUserId(user.id))) return;

    const channel = supabase
      .channel("admin:users")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "users" },
        (payload) => {
          // 1. Optimistic in-place update for instant UI feedback with zero network delay
          if (payload.eventType === "UPDATE") {
            const updatedProfile = payload.new as {
              id: string;
              display_name?: string;
              avatar_url?: string | null;
              current_status?: string;
              current_focus?: string | null;
              session_start_time?: string | null;
              break_started_at?: string | null;
              active_study_seconds_snapshot?: number;
              has_achiever_badge?: boolean;
            };

            setUsers((prev) =>
              prev.map((u) => {
                if (u.user_id === updatedProfile.id) {
                  return {
                    ...u,
                    display_name: updatedProfile.display_name ?? u.display_name,
                    avatar_url: updatedProfile.avatar_url !== undefined ? updatedProfile.avatar_url : u.avatar_url,
                    current_status: updatedProfile.current_status ?? u.current_status,
                    current_focus: updatedProfile.current_focus !== undefined ? updatedProfile.current_focus : u.current_focus,
                    session_start_time: updatedProfile.session_start_time !== undefined ? updatedProfile.session_start_time : u.session_start_time,
                    break_started_at: updatedProfile.break_started_at !== undefined ? updatedProfile.break_started_at : u.break_started_at,
                    active_study_seconds_snapshot: updatedProfile.active_study_seconds_snapshot ?? u.active_study_seconds_snapshot,
                    has_achiever_badge: updatedProfile.has_achiever_badge ?? u.has_achiever_badge,
                  };
                }
                return u;
              })
            );
          } else if (payload.eventType === "DELETE") {
            const deletedId = (payload.old as { id: string }).id;
            setUsers((prev) => prev.filter((u) => u.user_id !== deletedId));
          }

          // 2. Debounced background stats refresh (avoids spamming RPC on rapid status changes)
          if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
          }
          debounceTimerRef.current = setTimeout(async () => {
            try {
              const newStats = await getStats();
              setStats(newStats);
              // For INSERTs, do a full data fetch
              if (payload.eventType === "INSERT") {
                const refreshedUsers = await getAllUsers();
                setUsers(refreshedUsers);
              }
            } catch {
              // background refresh non-fatal
            }
          }, 500);
        }
      )
      .subscribe((status) => {
        setIsRealtimeConnected(status === "SUBSCRIBED");
      });

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      supabase.removeChannel(channel);
    };
  }, [supabase, user, getStats, getAllUsers]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
  };

  const clearNotification = () => {
    setError(null);
    setSuccess(null);
  };

  const handleRename = async (userId: string, newName: string) => {
    clearNotification();
    try {
      await renameUser(userId, newName);
      setSuccess(`Renamed user to "${newName}"`);
      setUsers((prev) =>
        prev.map((u) => (u.user_id === userId ? { ...u, display_name: newName } : u))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rename user");
      throw err;
    }
  };

  const handleDelete = async (userId: string, userName: string) => {
    clearNotification();
    try {
      await deleteUser(userId);
      setSuccess(`Deleted user "${userName}" from the platform`);
      setUsers((prev) => prev.filter((u) => u.user_id !== userId));
      try {
        const newStats = await getStats();
        setStats(newStats);
      } catch {
        // stats refresh non-critical
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete user");
      throw err;
    }
  };

  const handleForceEnd = async (userId: string, userName: string) => {
    clearNotification();
    try {
      const minutes = await forceEndSession(userId);
      setSuccess(`Suspended session for "${userName}" (${minutes} min recorded)`);
      // Update local state immediately
      setUsers((prev) =>
        prev.map((u) =>
          u.user_id === userId
            ? {
                ...u,
                current_status: "offline",
                current_focus: null,
                session_start_time: null,
                break_started_at: null,
                active_study_seconds_snapshot: 0,
              }
            : u
        )
      );
      try {
        const newStats = await getStats();
        setStats(newStats);
      } catch {
        // non-critical
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to suspend session");
      throw err;
    }
  };

  const handleSignOut = async () => {
    setIsSignOutModalOpen(false);
    try {
      await signOut();
    } catch {
      // ignore error, proceed to login
    } finally {
      window.location.href = "/login";
    }
  };

  // Status counts
  const counts = useMemo(() => {
    return {
      all: users.length,
      studying: users.filter((u) => u.current_status === "studying").length,
      break: users.filter((u) => u.current_status === "break").length,
      offline: users.filter((u) => u.current_status === "offline").length,
    };
  }, [users]);

  // Filter users by search query and status tab
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchesSearch = u.display_name.toLowerCase().includes(searchQuery.toLowerCase());
      if (!matchesSearch) return false;
      if (statusFilter === "all") return true;
      return u.current_status === statusFilter;
    });
  }, [users, searchQuery, statusFilter]);

  // Guard: don't render until we know user is admin
  if (authLoading || !user || (!isAdminEmail(user.email) && !isAdminUserId(user.id))) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-screen bg-[#090a0f]">
        <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-[#090a0f] text-zinc-100 pb-16">
      {/* Admin Header Bar */}
      <header className="sticky top-0 z-50 w-full bg-zinc-950/95 backdrop-blur-xl border-b border-rose-500/20 px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-sm font-black tracking-tight text-zinc-100">
                  StudyRoom Admin
                </h1>
                {/* Live Realtime Status Pill */}
                <div
                  className={`flex items-center space-x-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border ${
                    isRealtimeConnected
                      ? "bg-fuchsia-500/10 border-fuchsia-500/30 text-fuchsia-300"
                      : "bg-amber-500/10 border-amber-500/30 text-amber-300"
                  }`}
                >
                  <Radio className={`w-2.5 h-2.5 ${isRealtimeConnected ? "animate-pulse text-fuchsia-400" : ""}`} />
                  <span>{isRealtimeConnected ? "Live" : "Connecting"}</span>
                </div>
              </div>
              <p className="text-[10px] text-zinc-500">Platform Control & Supervision</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              className="p-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-100 transition-all touch-manipulation active:scale-95"
              aria-label="Refresh data"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            </button>
            <button
              type="button"
              onClick={() => setIsSignOutModalOpen(true)}
              className="p-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 text-rose-400 hover:text-rose-300 transition-all touch-manipulation active:scale-95"
              aria-label="Sign out"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-4xl px-3.5 sm:px-6 py-4 mx-auto space-y-4">
        {/* Notifications */}
        {error && (
          <div className="p-3 bg-rose-950/40 border border-rose-800/80 rounded-xl text-xs font-medium text-rose-200 flex items-center space-x-2 animate-in fade-in">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span className="flex-1">{error}</span>
            <button type="button" onClick={() => setError(null)} className="text-rose-400 hover:text-rose-200 p-1">
              ✕
            </button>
          </div>
        )}
        {success && (
          <div className="p-3 bg-violet-950/40 border border-violet-800/80 rounded-xl text-xs font-medium text-violet-200 flex items-center space-x-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-violet-400" />
            <span className="flex-1">{success}</span>
            <button type="button" onClick={() => setSuccess(null)} className="text-violet-400 hover:text-violet-200 p-1">
              ✕
            </button>
          </div>
        )}

        {/* Platform Stats Overview */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-[10px] font-black uppercase tracking-wider text-zinc-400">
              Live Platform Overview
            </h2>
            <span className="text-[10px] text-zinc-500">Auto-updating realtime</span>
          </div>
          <AdminStatsBar stats={stats} loading={loading} />
        </div>

        {/* User Management Section */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center space-x-2">
              <Users className="w-4 h-4 text-violet-400" />
              <h2 className="text-xs font-black uppercase tracking-wider text-zinc-300">
                User Management
              </h2>
              <span className="text-[10px] text-zinc-500 tabular-nums font-mono">
                ({filteredUsers.length} of {users.length})
              </span>
            </div>
          </div>

          {/* Search Bar + Clear button */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search users by display name..."
              className="w-full pl-9 pr-8 py-2.5 bg-zinc-950/80 border border-zinc-800 rounded-xl text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-zinc-500 hover:text-zinc-300"
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Status Filter Tabs */}
          <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 text-xs">
            <button
              type="button"
              onClick={() => setStatusFilter("all")}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl font-bold transition-all shrink-0 touch-manipulation ${
                statusFilter === "all"
                  ? "bg-violet-600 text-white shadow-md shadow-violet-600/20"
                  : "bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 border border-zinc-800"
              }`}
            >
              <span>All</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/30 tabular-nums">
                {counts.all}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter("studying")}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl font-bold transition-all shrink-0 touch-manipulation ${
                statusFilter === "studying"
                  ? "bg-fuchsia-600 text-white shadow-md shadow-fuchsia-600/20"
                  : "bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 border border-zinc-800"
              }`}
            >
              <BookOpen className="w-3 h-3" />
              <span>Studying</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/30 tabular-nums">
                {counts.studying}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter("break")}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl font-bold transition-all shrink-0 touch-manipulation ${
                statusFilter === "break"
                  ? "bg-amber-600 text-white shadow-md shadow-amber-600/20"
                  : "bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 border border-zinc-800"
              }`}
            >
              <Coffee className="w-3 h-3" />
              <span>On Break</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/30 tabular-nums">
                {counts.break}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter("offline")}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl font-bold transition-all shrink-0 touch-manipulation ${
                statusFilter === "offline"
                  ? "bg-zinc-700 text-white shadow-md shadow-zinc-700/20"
                  : "bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 border border-zinc-800"
              }`}
            >
              <Wifi className="w-3 h-3" />
              <span>Offline</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/30 tabular-nums">
                {counts.offline}
              </span>
            </button>
          </div>

          {/* User List */}
          {loading ? (
            <div className="space-y-2.5">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="w-full h-24 bg-zinc-900/50 border border-zinc-800/80 rounded-xl animate-pulse"
                />
              ))}
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="p-10 text-center border border-dashed border-zinc-800 bg-zinc-900/20 rounded-xl space-y-2">
              <Users className="w-8 h-8 text-zinc-600 mx-auto" />
              <h3 className="text-xs font-bold text-zinc-300">
                {searchQuery
                  ? "No users match your search"
                  : statusFilter !== "all"
                  ? `No users currently ${statusFilter}`
                  : "No users on the platform"}
              </h3>
              <p className="text-[11px] text-zinc-500">
                {searchQuery
                  ? "Try searching for another name or clearing the search filter."
                  : "Registered platform users will appear here automatically."}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredUsers.map((u) => (
                <AdminUserRow
                  key={u.user_id}
                  user={u}
                  onRename={handleRename}
                  onDelete={handleDelete}
                  onForceEnd={handleForceEnd}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Sign Out Confirmation Modal */}
      <Modal
        isOpen={isSignOutModalOpen}
        onClose={() => setIsSignOutModalOpen(false)}
        title="Admin Sign Out"
        subtitle="Are you sure you want to sign out of the admin panel?"
      >
        <div className="space-y-4 pt-1">
          <p className="text-xs text-zinc-400">
            You will need to enter your admin credentials to sign back in.
          </p>
          <div className="flex items-center justify-end space-x-3 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsSignOutModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={handleSignOut}
              className="font-extrabold"
            >
              Sign Out
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
