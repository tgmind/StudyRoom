"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Pencil,
  Trash2,
  StopCircle,
  Check,
  X,
  Crown,
  BookOpen,
  Coffee,
  WifiOff,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import type { AdminUser } from "@/hooks/useAdmin";
import { getEffectiveMemberStatus } from "@/lib/time/break";

interface AdminUserRowProps {
  user: AdminUser;
  onRename: (userId: string, newName: string) => Promise<void>;
  onDelete: (userId: string, userName: string) => Promise<void>;
  onForceEnd: (userId: string, userName: string) => Promise<void>;
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "studying":
      return <BookOpen className="w-3.5 h-3.5 text-fuchsia-400" />;
    case "break":
      return <Coffee className="w-3.5 h-3.5 text-amber-400" />;
    default:
      return <WifiOff className="w-3.5 h-3.5 text-zinc-500" />;
  }
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    studying: "bg-fuchsia-500/15 border-fuchsia-500/30 text-fuchsia-300",
    break: "bg-amber-500/15 border-amber-500/30 text-amber-300",
    offline: "bg-zinc-800/60 border-zinc-700/50 text-zinc-400",
  };

  return (
    <span
      className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
        colors[status] || colors.offline
      }`}
    >
      <StatusIcon status={status} />
      <span>{status}</span>
    </span>
  );
}

function formatTimeSince(isoString: string | null): string {
  if (!isoString) return "—";
  const diff = Math.max(0, Math.floor((Date.now() - new Date(isoString).getTime()) / 1000));
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function AdminUserRow({ user, onRename, onDelete, onForceEnd }: AdminUserRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(user.display_name);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isForceEndModalOpen, setIsForceEndModalOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSaveRename = async () => {
    const trimmed = editName.trim();
    if (!trimmed || trimmed === user.display_name) {
      setIsEditing(false);
      setEditName(user.display_name);
      return;
    }
    setActionLoading(true);
    try {
      await onRename(user.user_id, trimmed);
      setIsEditing(false);
    } catch {
      setEditName(user.display_name);
      setIsEditing(false);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    setActionLoading(true);
    try {
      await onDelete(user.user_id, user.display_name);
      setIsDeleteModalOpen(false);
    } catch {
      // error handled by parent
    } finally {
      setActionLoading(false);
    }
  };

  const handleForceEnd = async () => {
    setActionLoading(true);
    try {
      await onForceEnd(user.user_id, user.display_name);
      setIsForceEndModalOpen(false);
    } catch {
      // error handled by parent
    } finally {
      setActionLoading(false);
    }
  };

  const effectiveStatus = getEffectiveMemberStatus(user, new Date());
  const isActive = effectiveStatus === "studying" || effectiveStatus === "break";

  return (
    <>
      <div className="w-full bg-zinc-900/70 border border-zinc-800/90 rounded-xl p-3.5 space-y-2.5 hover:border-zinc-700/80 transition-colors">
        {/* Row 1: Avatar + Name + Status Badge */}
        <div className="flex items-center gap-3 min-w-0">
          {/* Avatar */}
          <div className="w-9 h-9 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0 overflow-hidden">
            {user.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.avatar_url}
                alt={user.display_name || "User"}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-xs font-bold text-zinc-300">
                {(user.display_name || "?").charAt(0).toUpperCase()}
              </span>
            )}
          </div>

          {/* Name & Joined */}
          <div className="flex-1 min-w-0">
            {isEditing ? (
              <div className="flex items-center gap-1.5">
                <input
                  ref={inputRef}
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveRename();
                    if (e.key === "Escape") {
                      setIsEditing(false);
                      setEditName(user.display_name);
                    }
                  }}
                  maxLength={32}
                  className="flex-1 min-w-0 px-2 py-1 bg-zinc-950 border border-violet-500/50 rounded-lg text-xs text-zinc-100 focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
                <button
                  type="button"
                  onClick={handleSaveRename}
                  disabled={actionLoading}
                  className="p-1 rounded-md bg-violet-500/20 text-violet-300 hover:bg-violet-500/30 transition-colors touch-manipulation"
                  aria-label="Save name"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsEditing(false);
                    setEditName(user.display_name);
                  }}
                  className="p-1 rounded-md bg-zinc-800 text-zinc-400 hover:bg-zinc-700 transition-colors touch-manipulation"
                  aria-label="Cancel editing"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center space-x-1.5 min-w-0">
                <h3 className="text-xs font-bold text-zinc-100 truncate">{user.display_name}</h3>
                {user.has_achiever_badge && (
                  <Crown className="w-3.5 h-3.5 text-amber-400 fill-amber-400 shrink-0" />
                )}
              </div>
            )}
            <p className="text-[10px] text-zinc-500 mt-0.5">Joined {formatDate(user.created_at)}</p>
          </div>

          {/* Status Badge */}
          <StatusBadge status={effectiveStatus} />
        </div>

        {/* Row 2: Session Info (if active) */}
        {isActive && (
          <div className="flex items-center gap-3 text-[10px] pl-12">
            {user.current_focus && (
              <span className="text-zinc-400">
                Focus: <span className="text-zinc-300 font-medium">{user.current_focus}</span>
              </span>
            )}
            <span className="text-zinc-400">
              Duration: <span className="text-zinc-300 font-medium tabular-nums">{formatTimeSince(user.session_start_time)}</span>
            </span>
            {effectiveStatus === "break" && user.break_started_at && (
              <span className="text-amber-400/80">
                Break: <span className="font-medium tabular-nums">{formatTimeSince(user.break_started_at)}</span>
              </span>
            )}
          </div>
        )}

        {/* Row 3: Meta + Actions */}
        <div className="flex items-center justify-between pl-12">
          <div className="flex items-center gap-3 text-[10px] text-zinc-500">
            <span>
              {(user.total_sessions_count ?? 0) + (isActive ? 1 : 0)}{" "}
              {(user.total_sessions_count ?? 0) + (isActive ? 1 : 0) === 1 ? "session" : "sessions"}
            </span>
            {user.active_goal_count > 0 && (
              <span className="text-violet-400/80">{user.active_goal_count} active goal(s)</span>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setEditName(user.display_name);
                setIsEditing(true);
              }}
              className="p-1.5 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-violet-300 transition-all touch-manipulation"
              aria-label={`Rename ${user.display_name}`}
              title="Rename user"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>

            {isActive && (
              <button
                type="button"
                onClick={() => setIsForceEndModalOpen(true)}
                className="p-1.5 rounded-lg bg-zinc-800/80 hover:bg-amber-500/20 text-zinc-400 hover:text-amber-300 transition-all touch-manipulation"
                aria-label={`Force end session for ${user.display_name}`}
                title="Force end session"
              >
                <StopCircle className="w-3.5 h-3.5" />
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsDeleteModalOpen(true)}
              className="p-1.5 rounded-lg bg-zinc-800/80 hover:bg-rose-500/20 text-zinc-400 hover:text-rose-300 transition-all touch-manipulation"
              aria-label={`Delete ${user.display_name}`}
              title="Delete user"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="Delete User"
        subtitle={`Permanently remove "${user.display_name}" from the platform`}
      >
        <div className="space-y-4 pt-1">
          <div className="p-3 bg-rose-950/40 border border-rose-800/60 rounded-xl text-xs text-rose-200 space-y-1">
            <p className="font-bold">⚠️ This action is irreversible.</p>
            <p>All of this user&apos;s data will be permanently deleted:</p>
            <ul className="list-disc list-inside text-rose-300/80 ml-1 space-y-0.5">
              <li>Profile and avatar</li>
              <li>All study sessions and history</li>
              <li>All daily goals</li>
              <li>All session blocks</li>
            </ul>
          </div>

          <div className="flex items-center justify-end space-x-3 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsDeleteModalOpen(false)}
              disabled={actionLoading}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={handleDelete}
              isLoading={actionLoading}
              className="font-extrabold"
            >
              Delete Permanently
            </Button>
          </div>
        </div>
      </Modal>

      {/* Force End Session Modal */}
      <Modal
        isOpen={isForceEndModalOpen}
        onClose={() => setIsForceEndModalOpen(false)}
        title="Force End Session"
        subtitle={`Terminate "${user.display_name}"'s active session`}
      >
        <div className="space-y-4 pt-1">
          <div className="p-3 bg-amber-950/40 border border-amber-800/60 rounded-xl text-xs text-amber-200 space-y-1">
            <p>This will immediately end the user&apos;s current study session.</p>
            <p className="text-amber-300/80">
              Their study time up to this point will be saved, but no task completions will be recorded.
            </p>
          </div>

          <div className="flex items-center justify-end space-x-3 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsForceEndModalOpen(false)}
              disabled={actionLoading}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={handleForceEnd}
              isLoading={actionLoading}
              className="font-extrabold"
            >
              Force End Session
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
