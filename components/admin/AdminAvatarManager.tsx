"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Sparkles,
  UploadCloud,
  DownloadCloud,
  Plus,
  Search,
  Trash2,
  Edit3,
  Check,
  X,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Layers,
  ArrowUpDown,
  Image as ImageIcon,
  CheckCircle,
  Info,
  Sliders,
  ExternalLink,
  HelpCircle,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { AvatarSyncGuideModal } from "@/components/admin/AvatarSyncGuideModal";
import {
  analyzeAndOptimizeAvatarImage,
  OptimizedAvatarResult,
} from "@/lib/avatars/imageOptimizer";
import { resolveAvatarUrl, getAvatarScaleStyle } from "@/lib/avatars/manifest";

export interface PresetAvatar {
  id: string;
  label: string;
  category: string;
  asset_path: string;
  display_order: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

const safeRevokeUrl = (url?: string | null) => {
  if (url && typeof window !== "undefined" && typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") {
    try {
      URL.revokeObjectURL(url);
    } catch {
      // safe fallback
    }
  }
};

/**
 * Resilient, self-healing Avatar thumbnail component with automatic dual-resolution fallback.
 * Attempts primary asset_path (with cache buster), then fails over to Supabase Storage CDN,
 * and if completely unreachable, renders a stylized initial badge instead of a broken image alt.
 */
function AdminAvatarThumbnail({
  avatar,
  className = "",
}: {
  avatar: PresetAvatar;
  className?: string;
}) {
  const [hasError, setHasError] = useState(false);
  const [retryWithCloud, setRetryWithCloud] = useState(false);

  const primarySrc = useMemo(() => {
    const raw = avatar.asset_path || `/avatars/optimized/${avatar.id}.webp`;
    const buster = avatar.updated_at ? `v=${new Date(avatar.updated_at).getTime()}` : "";
    if (!buster) return raw;
    const sep = raw.includes("?") ? "&" : "?";
    return `${raw}${sep}${buster}`;
  }, [avatar.asset_path, avatar.id, avatar.updated_at]);

  const cloudFallbackSrc = useMemo(() => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://mshudehtxhsmnojirjls.supabase.co";
    return `${supabaseUrl}/storage/v1/object/public/avatars/presets/${avatar.id}.webp`;
  }, [avatar.id]);

  const currentSrc = retryWithCloud ? cloudFallbackSrc : primarySrc;

  if (hasError) {
    const initial = avatar.label?.trim()?.charAt(0)?.toUpperCase() || "A";
    return (
      <div className="w-full h-full rounded-full bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-700 flex items-center justify-center text-white font-black text-xs select-none shadow-inner">
        {initial}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={currentSrc}
      src={currentSrc}
      alt={avatar.label}
      loading="lazy"
      onError={() => {
        if (!retryWithCloud && !avatar.asset_path.startsWith("http")) {
          setRetryWithCloud(true);
        } else {
          setHasError(true);
        }
      }}
      className={className}
    />
  );
}

export function AdminAvatarManager() {
  const [avatars, setAvatars] = useState<PresetAvatar[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [sortBy, setSortBy] = useState<"order" | "name" | "newest" | "category">("order");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");

  const [notification, setNotification] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Add Avatar Modal & Dropzone State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizeProgress, setOptimizeProgress] = useState<{ step: string; percent: number }>({ step: "", percent: 0 });
  const [optimizedItem, setOptimizedItem] = useState<OptimizedAvatarResult | null>(null);
  const [formLabel, setFormLabel] = useState("");
  const [formCategory, setFormCategory] = useState("");
  const [isCustomCategory, setIsCustomCategory] = useState(false);
  const [customCategoryInput, setCustomCategoryInput] = useState("");
  const [isSavingAvatar, setIsSavingAvatar] = useState(false);

  // Edit Modal State
  const [editingAvatar, setEditingAvatar] = useState<PresetAvatar | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editOrder, setEditOrder] = useState<number>(1);
  const [editActive, setEditActive] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSyncGuideOpen, setIsSyncGuideOpen] = useState(false);
  const [editOptimizedItem, setEditOptimizedItem] = useState<OptimizedAvatarResult | null>(null);
  const [isEditOptimizing, setIsEditOptimizing] = useState(false);
  const [editOptimizeProgress, setEditOptimizeProgress] = useState<{ step: string; percent: number }>({ step: "", percent: 0 });
  const [isEditDragging, setIsEditDragging] = useState(false);
  const editFileInputRef = useRef<HTMLInputElement>(null);

  // Delete Modal State
  const [deletingAvatar, setDeletingAvatar] = useState<PresetAvatar | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const notify = useCallback((type: "success" | "error", text: string) => {
    setNotification({ type, text });
    setTimeout(() => {
      setNotification((curr) => (curr?.text === text ? null : curr));
    }, 4500);
  }, []);

  // Fetch avatars from API
  const fetchAvatars = useCallback(async () => {
    try {
      setRefreshing(true);
      const res = await fetch("/api/admin/avatars", {
        headers: { "Cache-Control": "no-cache" },
      });
      if (!res.ok) {
        throw new Error(`Failed to load preset avatars: HTTP ${res.status}`);
      }
      const data = await res.json();
      setAvatars(data.avatars || []);
      setCategories(data.categories || []);
    } catch (err: any) {
      console.error("Error fetching admin avatars:", err);
      notify("error", err.message || "Failed to load avatars");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [notify]);

  useEffect(() => {
    fetchAvatars();
  }, [fetchAvatars]);

  // Sync Cloud Avatars into public/avatars/optimized/ and clean up Supabase storage
  const handleSyncCloudAvatars = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch("/api/admin/avatars/sync", {
        method: "POST",
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Sync failed");
      }

      const data = await res.json();
      if (data.syncedCount === 0) {
        notify("success", "All avatars are already synced to local public/avatars/optimized/!");
      } else {
        notify(
          "success",
          `Synced ${data.syncedCount} avatar(s) to public/avatars/optimized/ and freed ${(data.freedBytes / 1024).toFixed(1)} KB from Supabase Storage!`
        );
      }
      await fetchAvatars();
    } catch (err: any) {
      console.error("Sync error:", err);
      notify("error", err.message || "Failed to sync avatars");
    } finally {
      setIsSyncing(false);
    }
  };

  // Handle Drag & Drop
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const processDroppedFile = useCallback(
    async (file: File) => {
      setIsOptimizing(true);
      setOptimizeProgress({ step: "Analyzing file metadata...", percent: 20 });
      try {
        const result = await analyzeAndOptimizeAvatarImage(file, {
          preferredCategory: selectedCategory !== "All" ? selectedCategory : undefined,
          onProgress: (step, percent) => {
            setOptimizeProgress({ step, percent });
          },
        });

        setOptimizedItem(result);
        setFormLabel(result.suggestedLabel);
        setFormCategory(result.suggestedCategory);
        setIsCustomCategory(false);
      } catch (err: any) {
        console.error("Image optimization error:", err);
        notify("error", err.message || "Failed to process image");
      } finally {
        setIsOptimizing(false);
      }
    },
    [selectedCategory, notify]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        processDroppedFile(e.dataTransfer.files[0]);
      }
    },
    [processDroppedFile]
  );

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processDroppedFile(e.target.files[0]);
    }
  };

  // Submit New Avatar
  const handleSaveNewAvatar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!optimizedItem) return;

    const finalCategory = isCustomCategory
      ? customCategoryInput.trim()
      : formCategory.trim();

    if (!formLabel.trim()) {
      notify("error", "Please provide a valid avatar label");
      return;
    }
    if (!finalCategory) {
      notify("error", "Please specify a category");
      return;
    }

    setIsSavingAvatar(true);
    try {
      // 1. Upload optimized WebP file to Supabase storage
      const uploadFormData = new FormData();
      uploadFormData.append("file", optimizedItem.file);

      const uploadRes = await fetch("/api/admin/avatars/upload", {
        method: "POST",
        body: uploadFormData,
      });

      if (!uploadRes.ok) {
        const errData = await uploadRes.json();
        throw new Error(errData.error || "Storage upload failed");
      }

      const uploadData = await uploadRes.json();

      // 2. Insert into preset_avatars database table
      const createRes = await fetch("/api/admin/avatars", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          id: uploadData.id,
          label: formLabel.trim(),
          category: finalCategory,
          asset_path: uploadData.localPath || uploadData.publicUrl,
          is_active: true,
        }),
      });

      if (!createRes.ok) {
        const errData = await createRes.json();
        throw new Error(errData.error || "Failed to record avatar in database");
      }

      notify("success", `Avatar "${formLabel}" successfully created and optimized!`);
      setIsAddModalOpen(false);
      setOptimizedItem(null);
      await fetchAvatars();
    } catch (err: any) {
      console.error("Save avatar error:", err);
      notify("error", err.message || "Failed to save avatar");
    } finally {
      setIsSavingAvatar(false);
    }
  };

  // Open Edit Modal
  const handleOpenEdit = (avatar: PresetAvatar) => {
    safeRevokeUrl(editOptimizedItem?.previewUrl);
    setEditingAvatar(avatar);
    setEditLabel(avatar.label);
    setEditCategory(avatar.category);
    setEditOrder(avatar.display_order);
    setEditActive(avatar.is_active);
    setEditOptimizedItem(null);
    setIsEditOptimizing(false);
    setIsEditDragging(false);
  };

  const handleCloseEdit = () => {
    if (isUpdating) return;
    safeRevokeUrl(editOptimizedItem?.previewUrl);
    setEditingAvatar(null);
    setEditOptimizedItem(null);
    setIsEditOptimizing(false);
    setIsEditDragging(false);
  };

  const processEditReplacementFile = useCallback(
    async (file: File) => {
      setIsEditOptimizing(true);
      setEditOptimizeProgress({ step: "Analyzing replacement image...", percent: 20 });
      try {
        const result = await analyzeAndOptimizeAvatarImage(file, {
          preferredCategory: editCategory || undefined,
          onProgress: (step, percent) => {
            setEditOptimizeProgress({ step, percent });
          },
        });

        safeRevokeUrl(editOptimizedItem?.previewUrl);

        setEditOptimizedItem(result);
        notify("success", "Replacement image optimized to 256×256 WebP!");
      } catch (err: any) {
        console.error("Replacement image optimization error:", err);
        notify("error", err.message || "Failed to process replacement image");
      } finally {
        setIsEditOptimizing(false);
      }
    },
    [editCategory, editOptimizedItem, notify]
  );

  const handleEditDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsEditDragging(true);
  }, []);

  const handleEditDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsEditDragging(false);
  }, []);

  const handleEditDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsEditDragging(false);

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        processEditReplacementFile(e.dataTransfer.files[0]);
      }
    },
    [processEditReplacementFile]
  );

  const handleEditFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processEditReplacementFile(e.target.files[0]);
    }
  };

  const handleClearEditReplacement = () => {
    safeRevokeUrl(editOptimizedItem?.previewUrl);
    setEditOptimizedItem(null);
    if (editFileInputRef.current) {
      editFileInputRef.current.value = "";
    }
  };

  // Save Edit
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAvatar) return;

    setIsUpdating(true);
    try {
      let finalAssetPath: string | undefined = undefined;

      // 1. Upload replacement WebP file if a new image was chosen
      if (editOptimizedItem) {
        const uploadFormData = new FormData();
        uploadFormData.append("file", editOptimizedItem.file);
        // Canonical avatar ID
        uploadFormData.append("id", editingAvatar.id);

        const uploadRes = await fetch("/api/admin/avatars/upload", {
          method: "POST",
          body: uploadFormData,
        });

        if (!uploadRes.ok) {
          const errData = await uploadRes.json();
          throw new Error(errData.error || "Failed to upload replacement avatar to storage");
        }

        const uploadData = await uploadRes.json();
        finalAssetPath = uploadData.localPath || uploadData.publicUrl;
      }

      // 2. Update record in preset_avatars table
      const res = await fetch("/api/admin/avatars", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          id: editingAvatar.id,
          label: editLabel.trim(),
          category: editCategory.trim(),
          display_order: Number(editOrder),
          is_active: editActive,
          asset_path: finalAssetPath,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to update avatar");
      }

      safeRevokeUrl(editOptimizedItem?.previewUrl);

      notify(
        "success",
        editOptimizedItem
          ? `Updated avatar "${editLabel}" with optimized replacement image!`
          : `Updated avatar "${editLabel}"`
      );
      setEditingAvatar(null);
      setEditOptimizedItem(null);
      await fetchAvatars();
    } catch (err: any) {
      console.error("Update avatar error:", err);
      notify("error", err.message || "Failed to update avatar");
    } finally {
      setIsUpdating(false);
    }
  };

  // Toggle Active State
  const handleToggleActive = async (avatar: PresetAvatar) => {
    try {
      const res = await fetch("/api/admin/avatars", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          id: avatar.id,
          is_active: !avatar.is_active,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to toggle avatar status");
      }

      setAvatars((prev) =>
        prev.map((a) => (a.id === avatar.id ? { ...a, is_active: !a.is_active } : a))
      );
      notify(
        "success",
        `Avatar "${avatar.label}" is now ${!avatar.is_active ? "active" : "inactive"}`
      );
    } catch (err: any) {
      console.error("Toggle error:", err);
      notify("error", err.message || "Failed to toggle status");
    }
  };

  // Delete Avatar
  const handleConfirmDelete = async () => {
    if (!deletingAvatar) return;
    setIsDeleting(true);

    try {
      const res = await fetch("/api/admin/avatars", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete",
          id: deletingAvatar.id,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to delete avatar");
      }

      setAvatars((prev) => prev.filter((a) => a.id !== deletingAvatar.id));
      notify("success", `Deleted avatar "${deletingAvatar.label}"`);
      setDeletingAvatar(null);
    } catch (err: any) {
      console.error("Delete error:", err);
      notify("error", err.message || "Failed to delete avatar");
    } finally {
      setIsDeleting(false);
    }
  };

  // Filtered and Sorted Avatars
  const filteredAvatars = useMemo(() => {
    return avatars
      .filter((avatar) => {
        // Status filter
        if (statusFilter === "active" && !avatar.is_active) return false;
        if (statusFilter === "inactive" && avatar.is_active) return false;

        // Category filter
        if (selectedCategory !== "All" && avatar.category !== selectedCategory) {
          return false;
        }

        // Search query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          return (
            avatar.label.toLowerCase().includes(q) ||
            avatar.category.toLowerCase().includes(q) ||
            avatar.id.toLowerCase().includes(q)
          );
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === "order") return a.display_order - b.display_order;
        if (sortBy === "name") return a.label.localeCompare(b.label);
        if (sortBy === "category") return a.category.localeCompare(b.category);
        if (sortBy === "newest") {
          return (
            new Date(b.created_at || 0).getTime() -
            new Date(a.created_at || 0).getTime()
          );
        }
        return 0;
      });
  }, [avatars, statusFilter, selectedCategory, searchQuery, sortBy]);

  // Statistics
  const stats = useMemo(() => {
    const total = avatars.length;
    const active = avatars.filter((a) => a.is_active).length;
    const inactive = total - active;
    const customCount = avatars.filter((a) => a.id.startsWith("avatar-custom")).length;
    const catCount = new Set(avatars.map((a) => a.category)).size;
    const cloudCount = avatars.filter(
      (a) =>
        typeof a.asset_path === "string" &&
        (a.asset_path.startsWith("http://") ||
          a.asset_path.startsWith("https://") ||
          a.asset_path.includes("supabase.co/storage"))
    ).length;

    return { total, active, inactive, customCount, catCount, cloudCount };
  }, [avatars]);

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* Toast Notification */}
      {notification && (
        <div
          className={`p-3.5 rounded-xl text-xs font-semibold flex items-center space-x-2.5 animate-in fade-in shadow-md ${
            notification.type === "success"
              ? "bg-violet-950/70 border border-violet-800/80 text-violet-200"
              : "bg-rose-950/70 border border-rose-800/80 text-rose-200"
          }`}
        >
          {notification.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 text-violet-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span className="flex-1">{notification.text}</span>
          <button
            type="button"
            onClick={() => setNotification(null)}
            className="p-1 text-zinc-400 hover:text-zinc-200"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 1. HERO STATS & CONTROLS BAR */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800/90 shadow-sm backdrop-blur-md">
          <div className="flex items-center space-x-2 text-zinc-400 text-xs font-semibold">
            <ImageIcon className="w-3.5 h-3.5 text-violet-400" />
            <span>Total Presets</span>
          </div>
          <div className="text-xl sm:text-2xl font-black text-zinc-100 mt-1">
            {stats.total}
          </div>
          <div className="text-[10px] text-zinc-500 mt-0.5">
            {stats.active} active • {stats.inactive} inactive
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800/90 shadow-sm backdrop-blur-md">
          <div className="flex items-center space-x-2 text-zinc-400 text-xs font-semibold">
            <Layers className="w-3.5 h-3.5 text-emerald-400" />
            <span>Categories</span>
          </div>
          <div className="text-xl sm:text-2xl font-black text-emerald-300 mt-1">
            {stats.catCount}
          </div>
          <div className="text-[10px] text-zinc-500 mt-0.5">Curated Collections</div>
        </div>

        <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800/90 shadow-sm backdrop-blur-md">
          <div className="flex items-center space-x-2 text-zinc-400 text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Custom Added</span>
          </div>
          <div className="text-xl sm:text-2xl font-black text-amber-300 mt-1">
            {stats.customCount}
          </div>
          <div className="text-[10px] text-zinc-500 mt-0.5">Admin-uploaded avatars</div>
        </div>

        <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800/90 shadow-sm backdrop-blur-md">
          <div className="flex items-center space-x-2 text-zinc-400 text-xs font-semibold">
            <Sliders className="w-3.5 h-3.5 text-sky-400" />
            <span>WebP Engine</span>
          </div>
          <div className="text-xl sm:text-2xl font-black text-sky-300 mt-1">
            256 × 256
          </div>
          <div className="text-[10px] text-zinc-500 mt-0.5">Pure #FFF • ~14KB/img</div>
        </div>
      </div>

      {/* 2. TOOLBAR: SEARCH, CATEGORIES & ACTIONS */}
      <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800/90 shadow-xl space-y-3.5 backdrop-blur-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search avatars by title, category, or ID..."
              className="w-full pl-9 pr-8 py-2 bg-zinc-950/80 border border-zinc-800 rounded-xl text-xs sm:text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center space-x-2 shrink-0">
            {/* 1-Click Sync Cloud Avatars to Local */}
            <button
              type="button"
              onClick={handleSyncCloudAvatars}
              disabled={isSyncing || refreshing}
              className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all flex items-center space-x-1.5 cursor-pointer shadow-sm ${
                stats.cloudCount > 0
                  ? "bg-amber-500/15 hover:bg-amber-500/25 border-amber-500/35 text-amber-200"
                  : "bg-zinc-800/80 hover:bg-zinc-700 active:bg-zinc-600 border-zinc-700/60 text-zinc-300 hover:text-white"
              }`}
              title="Download cloud avatars to public/avatars/optimized/ and clean up Supabase storage"
            >
              <DownloadCloud
                className={`w-4 h-4 ${
                  isSyncing
                    ? "animate-bounce text-amber-400"
                    : stats.cloudCount > 0
                    ? "text-amber-400"
                    : "text-zinc-400"
                }`}
              />
              <span>{isSyncing ? "Syncing..." : "Sync to Local"}</span>
              {stats.cloudCount > 0 && !isSyncing && (
                <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-amber-400 text-zinc-950 font-black">
                  {stats.cloudCount}
                </span>
              )}
            </button>

            {/* Avatar Sync & Recovery Handbook Help Button */}
            <button
              type="button"
              onClick={() => setIsSyncGuideOpen(true)}
              className="p-2 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 active:bg-zinc-600 border border-zinc-700/60 text-zinc-400 hover:text-violet-300 transition-all touch-manipulation cursor-pointer"
              title="Avatar Sync & Disaster Recovery Guide"
              aria-label="Avatar Sync & Disaster Recovery Guide"
            >
              <HelpCircle className="w-4 h-4 text-violet-400" />
            </button>

            <button
              type="button"
              onClick={fetchAvatars}
              disabled={refreshing}
              className="p-2 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 active:bg-zinc-600 border border-zinc-700/60 text-zinc-300 hover:text-white transition-all touch-manipulation cursor-pointer"
              title="Refresh avatars"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin text-violet-400" : ""}`} />
            </button>

            <button
              type="button"
              onClick={() => {
                setOptimizedItem(null);
                setFormLabel("");
                setFormCategory(categories[1] || "Study Buddies");
                setIsAddModalOpen(true);
              }}
              className="inline-flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 active:bg-violet-700 text-white text-xs font-bold shadow-md shadow-violet-900/30 transition-all touch-manipulation cursor-pointer"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>Add Avatar</span>
            </button>
          </div>
        </div>

        {/* Filter Controls Row */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-zinc-800/60 text-xs">
          {/* Category Filter Pills */}
          <div className="flex items-center space-x-1.5 overflow-x-auto no-scrollbar py-0.5">
            <button
              type="button"
              onClick={() => setSelectedCategory("All")}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                selectedCategory === "All"
                  ? "bg-violet-600 text-white shadow-xs"
                  : "bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300"
              }`}
            >
              All ({avatars.length})
            </button>
            {categories.filter((c) => c !== "All").map((cat) => {
              const count = avatars.filter((a) => a.category === cat).length;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                    selectedCategory === cat
                      ? "bg-violet-600 text-white shadow-xs"
                      : "bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300"
                  }`}
                >
                  {cat} ({count})
                </button>
              );
            })}
          </div>

          {/* Sort & Status Selectors */}
          <div className="flex items-center space-x-2 shrink-0">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              aria-label="Filter avatars by status"
              className="px-2.5 py-1 bg-zinc-950/80 border border-zinc-800 rounded-lg text-xs text-zinc-300 focus:outline-none focus:border-violet-500"
            >
              <option value="all">All Status</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive Only</option>
            </select>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              aria-label="Sort avatars by"
              className="px-2.5 py-1 bg-zinc-950/80 border border-zinc-800 rounded-lg text-xs text-zinc-300 focus:outline-none focus:border-violet-500"
            >
              <option value="order">Sort: Order</option>
              <option value="name">Sort: Name (A-Z)</option>
              <option value="category">Sort: Category</option>
              <option value="newest">Sort: Newest</option>
            </select>
          </div>
        </div>
      </div>

      {/* 3. AVATAR GRID GALLERY */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center space-y-3">
          <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
          <p className="text-xs text-zinc-400 font-semibold">Loading preset avatars...</p>
        </div>
      ) : filteredAvatars.length === 0 ? (
        <div className="py-16 text-center rounded-2xl bg-zinc-900/50 border border-zinc-800/80 p-6 space-y-2">
          <ImageIcon className="w-8 h-8 text-zinc-600 mx-auto" />
          <h3 className="text-sm font-bold text-zinc-300">No avatars found</h3>
          <p className="text-xs text-zinc-500">
            No avatars matched your search query &ldquo;{searchQuery}&rdquo;.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
          {filteredAvatars.map((avatar) => {
            const isCustom = avatar.id.startsWith("avatar-custom");

            return (
              <div
                key={avatar.id}
                className={`relative group rounded-2xl border p-3.5 flex flex-col justify-between transition-all backdrop-blur-sm ${
                  avatar.is_active
                    ? "bg-zinc-900/70 border-zinc-800/90 hover:border-zinc-700 shadow-sm"
                    : "bg-zinc-950/60 border-zinc-900 opacity-60"
                }`}
              >
                {/* Top Badge Row */}
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono text-[9px] font-bold text-zinc-500 tracking-wider">
                    #{avatar.display_order}
                  </span>

                  <button
                    type="button"
                    onClick={() => handleToggleActive(avatar)}
                    className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-wider transition-colors cursor-pointer ${
                      avatar.is_active
                        ? "bg-emerald-500/15 border border-emerald-500/30 text-emerald-300"
                        : "bg-zinc-800 text-zinc-400"
                    }`}
                    title={avatar.is_active ? "Click to deactivate" : "Click to activate"}
                  >
                    {avatar.is_active ? "Active" : "Inactive"}
                  </button>
                </div>

                {/* Avatar Circular Preview on Pure White (#FFFFFF) */}
                <div className="flex flex-col items-center justify-center my-1.5">
                  <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white border-2 border-violet-500/40 p-0.5 flex items-center justify-center shadow-md overflow-hidden group-hover:border-violet-400 transition-colors">
                    <AdminAvatarThumbnail
                      avatar={avatar}
                      className="w-full h-full object-cover object-center rounded-full bg-white block transition-transform group-hover:scale-105 duration-200"
                    />
                  </div>
                </div>

                {/* Avatar Details */}
                <div className="text-center mt-2 space-y-1">
                  <h4 className="text-xs font-extrabold text-zinc-100 truncate" title={avatar.label}>
                    {avatar.label}
                  </h4>
                  <div className="flex items-center justify-center space-x-1">
                    <span className="text-[10px] text-zinc-400 truncate max-w-[120px]">
                      {avatar.category}
                    </span>
                    {isCustom && (
                      <span className="text-[9px] font-bold px-1 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                        Custom
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions Footer */}
                <div className="flex items-center justify-center space-x-2 pt-2.5 mt-2.5 border-t border-zinc-800/60">
                  <button
                    type="button"
                    onClick={() => handleOpenEdit(avatar)}
                    className="p-1.5 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 active:bg-zinc-600 text-zinc-300 hover:text-white transition-colors cursor-pointer"
                    title="Edit avatar metadata"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setDeletingAvatar(avatar)}
                    className="p-1.5 rounded-lg bg-zinc-800/80 hover:bg-rose-950/40 active:bg-rose-900/60 text-zinc-400 hover:text-rose-300 transition-colors cursor-pointer"
                    title="Delete avatar"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 4. ADD NEW AVATAR MODAL (WITH DRAG & DROP AND AUTO-OPTIMIZER) */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => !isSavingAvatar && setIsAddModalOpen(false)}
        title="Add & Optimize Preset Avatar"
        subtitle="Images dropped or selected are automatically analyzed and converted to high-performance 256x256 WebP."
      >
        <form onSubmit={handleSaveNewAvatar} className="space-y-4 pt-1">
          {/* Dropzone Container */}
          {!optimizedItem && (
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`p-6 sm:p-8 rounded-2xl border-2 border-dashed transition-all cursor-pointer flex flex-col items-center justify-center space-y-2.5 text-center ${
                isDragging
                  ? "border-violet-500 bg-violet-500/10 scale-[1.01]"
                  : "border-zinc-700/80 hover:border-violet-500/60 bg-zinc-950/60 hover:bg-zinc-950/90"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml,image/avif"
                onChange={handleFileInputChange}
                className="hidden"
              />

              <div className="p-3 rounded-2xl bg-violet-600/15 border border-violet-500/30 text-violet-300">
                <UploadCloud className="w-7 h-7" />
              </div>

              <div>
                <p className="text-xs sm:text-sm font-bold text-zinc-200">
                  Drag and drop an image here, or{" "}
                  <span className="text-violet-400 underline decoration-violet-500/40">browse files</span>
                </p>
                <p className="text-[10px] sm:text-[11px] text-zinc-500 mt-1">
                  PNG, JPG, WebP, SVG, AVIF up to 20MB. Automatically centered on white and converted to WebP.
                </p>
              </div>

              {isOptimizing && (
                <div className="w-full pt-3 space-y-1.5 animate-in fade-in">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-violet-300">
                    <span>{optimizeProgress.step}</span>
                    <span>{optimizeProgress.percent}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-violet-500 transition-all duration-200"
                      style={{ width: `${optimizeProgress.percent}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Auto-Optimized Diagnostics & Review Panel */}
          {optimizedItem && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="p-3.5 rounded-2xl bg-zinc-950/80 border border-zinc-800 space-y-3">
                <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
                  <div className="flex items-center space-x-1.5 text-xs font-bold text-emerald-300">
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                    <span>Auto-Optimized to 256×256 WebP</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setOptimizedItem(null);
                      fileInputRef.current?.click();
                    }}
                    className="text-[11px] font-semibold text-violet-400 hover:text-violet-300"
                  >
                    Change Image
                  </button>
                </div>

                <div className="flex items-center space-x-4">
                  {/* Live Circular Preview on Pure White */}
                  <div className="relative shrink-0">
                    <div className="w-20 h-20 rounded-full bg-white border-2 border-violet-500/60 p-0.5 flex items-center justify-center shadow-lg overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={optimizedItem.previewUrl}
                        alt="Optimized preview"
                        className="w-full h-full object-cover object-center rounded-full bg-white block"
                      />
                    </div>
                    <span className="absolute -bottom-1 -right-1 px-1.5 py-0.5 rounded text-[8px] font-black bg-violet-600 text-white uppercase border border-zinc-950">
                      WebP
                    </span>
                  </div>

                  {/* Compression Stats */}
                  <div className="flex-1 space-y-1 text-xs">
                    <div className="flex items-center justify-between text-zinc-400">
                      <span>Original Image:</span>
                      <span className="font-mono text-zinc-300">
                        {optimizedItem.originalWidth} × {optimizedItem.originalHeight}px (
                        {(optimizedItem.originalSize / 1024).toFixed(1)} KB)
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-zinc-400">
                      <span>Engine Output:</span>
                      <span className="font-mono text-emerald-400 font-bold">
                        256 × 256px ({(optimizedItem.optimizedSize / 1024).toFixed(1)} KB)
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-zinc-400">
                      <span>Bandwidth Saved:</span>
                      <span className="font-mono text-violet-300 font-bold">
                        {optimizedItem.compressionRatio}% smaller
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Avatar Metadata Form */}
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="block text-xs font-bold uppercase tracking-wider text-zinc-300">
                    Avatar Label
                  </label>
                  <input
                    type="text"
                    value={formLabel}
                    onChange={(e) => setFormLabel(e.target.value)}
                    required
                    placeholder="e.g. Cyberpunk Scholar"
                    className="w-full px-3.5 py-2 bg-zinc-950/80 border border-zinc-800 rounded-xl text-xs sm:text-sm text-zinc-100 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold uppercase tracking-wider text-zinc-300">
                      Category
                    </label>
                    <button
                      type="button"
                      onClick={() => setIsCustomCategory(!isCustomCategory)}
                      className="text-[11px] font-semibold text-violet-400 hover:text-violet-300"
                    >
                      {isCustomCategory ? "Choose Existing" : "+ New Category"}
                    </button>
                  </div>

                  {isCustomCategory ? (
                    <input
                      type="text"
                      value={customCategoryInput}
                      onChange={(e) => setCustomCategoryInput(e.target.value)}
                      placeholder="Enter new category name..."
                      className="w-full px-3.5 py-2 bg-zinc-950/80 border border-zinc-800 rounded-xl text-xs sm:text-sm text-zinc-100 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                    />
                  ) : (
                    <select
                      value={formCategory}
                      onChange={(e) => setFormCategory(e.target.value)}
                      className="w-full px-3.5 py-2 bg-zinc-950/80 border border-zinc-800 rounded-xl text-xs sm:text-sm text-zinc-100 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                    >
                      {categories.filter((c) => c !== "All").map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Modal Actions */}
          <div className="flex items-center justify-end space-x-2.5 pt-3 border-t border-zinc-800">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isSavingAvatar}
              onClick={() => setIsAddModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              isLoading={isSavingAvatar}
              disabled={!optimizedItem || isOptimizing}
            >
              Publish Avatar
            </Button>
          </div>
        </form>
      </Modal>

      {/* 5. EDIT AVATAR MODAL */}
      <Modal
        isOpen={!!editingAvatar}
        onClose={handleCloseEdit}
        title="Edit Preset Avatar"
        subtitle={`Editing metadata for avatar #${editingAvatar?.display_order}`}
      >
        {editingAvatar && (
          <form onSubmit={handleSaveEdit} className="space-y-4 pt-1">
            {/* Interactive Avatar Preview & Replace Control */}
            <div
              onDragOver={handleEditDragOver}
              onDragLeave={handleEditDragLeave}
              onDrop={handleEditDrop}
              className={`p-3.5 rounded-xl border transition-all ${
                isEditDragging
                  ? "bg-violet-500/10 border-violet-500 ring-2 ring-violet-500/30"
                  : editOptimizedItem
                  ? "bg-zinc-950/90 border-amber-500/40 shadow-lg shadow-amber-500/5"
                  : "bg-zinc-950/70 border-zinc-800"
              }`}
            >
              <input
                ref={editFileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleEditFileInputChange}
              />

              <div className="flex items-center space-x-3.5">
                <div
                  className={`relative w-14 h-14 rounded-full bg-white p-0.5 overflow-hidden shrink-0 border-2 transition-all ${
                    editOptimizedItem
                      ? "border-amber-400 ring-2 ring-amber-400/30"
                      : "border-violet-500/50"
                  }`}
                >
                  {editOptimizedItem ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={editOptimizedItem.previewUrl}
                      alt={editLabel || editingAvatar.label}
                      className="w-full h-full object-cover object-center rounded-full bg-white block"
                    />
                  ) : (
                    <AdminAvatarThumbnail
                      avatar={editingAvatar}
                      className="w-full h-full object-cover object-center rounded-full bg-white block"
                    />
                  )}
                  {editOptimizedItem && (
                    <span className="absolute top-0 right-0 w-3 h-3 rounded-full bg-amber-400 border-2 border-zinc-950 animate-pulse" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center space-x-1.5">
                    <span className="font-mono text-[10px] text-zinc-500 block truncate">ID: {editingAvatar.id}</span>
                    {editOptimizedItem && (
                      <span className="text-[9px] font-bold uppercase tracking-wider text-amber-300 bg-amber-400/15 border border-amber-400/30 px-1.5 py-0.5 rounded-full shrink-0">
                        WebP Ready
                      </span>
                    )}
                  </div>
                  <span className="text-xs font-bold text-zinc-200 truncate block">{editLabel || editingAvatar.label}</span>
                  <span className="text-[10px] text-zinc-400 truncate block">
                    {editOptimizedItem
                      ? `256×256 WebP • ${(editOptimizedItem.optimizedSize / 1024).toFixed(1)} KB`
                      : editingAvatar.asset_path}
                  </span>
                </div>

                <div className="shrink-0 flex items-center space-x-1.5">
                  {editOptimizedItem ? (
                    <button
                      type="button"
                      onClick={handleClearEditReplacement}
                      disabled={isUpdating || isEditOptimizing}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700 transition-all flex items-center space-x-1 cursor-pointer"
                      title="Discard replaced image and keep original"
                    >
                      <X className="w-3.5 h-3.5 text-zinc-400" />
                      <span>Revert</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => editFileInputRef.current?.click()}
                      disabled={isUpdating || isEditOptimizing}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-violet-600/20 hover:bg-violet-600/30 text-violet-300 hover:text-violet-200 border border-violet-500/35 transition-all flex items-center space-x-1.5 cursor-pointer shadow-sm"
                      title="Choose a new image to replace and optimize"
                    >
                      <UploadCloud className="w-3.5 h-3.5 text-violet-400" />
                      <span>Replace Image</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Live Optimization Progress */}
              {isEditOptimizing && (
                <div className="mt-3 pt-3 border-t border-zinc-800/80 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-violet-300 font-medium flex items-center space-x-1.5">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-400" />
                      <span>{editOptimizeProgress.step || "Optimizing replacement to WebP..."}</span>
                    </span>
                    <span className="font-mono text-zinc-400 font-bold">{editOptimizeProgress.percent}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-violet-500 to-amber-400 transition-all duration-300"
                      style={{ width: `${editOptimizeProgress.percent}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Optimization Performance Metrics Banner */}
              {editOptimizedItem && !isEditOptimizing && (
                <div className="mt-3 pt-2.5 border-t border-amber-500/20 flex flex-wrap items-center justify-between gap-2 text-[10px]">
                  <div className="flex items-center space-x-2 text-zinc-300">
                    <span className="text-zinc-500">
                      Original: {(editOptimizedItem.originalSize / 1024).toFixed(0)} KB ({editOptimizedItem.originalWidth}×{editOptimizedItem.originalHeight})
                    </span>
                    <span className="text-zinc-600">➔</span>
                    <span className="font-bold text-amber-300">
                      WebP: {(editOptimizedItem.optimizedSize / 1024).toFixed(1)} KB (256×256)
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded-md font-mono font-bold bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">
                    -{editOptimizedItem.compressionRatio}% compressed
                  </span>
                </div>
              )}

              {!editOptimizedItem && !isEditOptimizing && (
                <p className="mt-2 text-[10px] text-zinc-500 text-center">
                  Drag & drop a new image here or click <span className="text-violet-400 font-medium">Replace Image</span> to update.
                </p>
              )}
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-bold uppercase tracking-wider text-zinc-300">
                Avatar Label
              </label>
              <input
                type="text"
                value={editLabel}
                onChange={(e) => setEditLabel(e.target.value)}
                required
                className="w-full px-3.5 py-2 bg-zinc-950/80 border border-zinc-800 rounded-xl text-xs sm:text-sm text-zinc-100 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-bold uppercase tracking-wider text-zinc-300">
                Category
              </label>
              <input
                type="text"
                value={editCategory}
                onChange={(e) => setEditCategory(e.target.value)}
                required
                className="w-full px-3.5 py-2 bg-zinc-950/80 border border-zinc-800 rounded-xl text-xs sm:text-sm text-zinc-100 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-300">
                  Display Order
                </label>
                <input
                  type="number"
                  value={editOrder}
                  onChange={(e) => setEditOrder(Number(e.target.value))}
                  required
                  min={1}
                  className="w-full px-3.5 py-2 bg-zinc-950/80 border border-zinc-800 rounded-xl text-xs sm:text-sm text-zinc-100 focus:outline-none focus:border-violet-500"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-300">
                  Visibility Status
                </label>
                <button
                  type="button"
                  onClick={() => setEditActive(!editActive)}
                  className={`w-full py-2 px-3 rounded-xl text-xs font-bold border transition-colors cursor-pointer flex items-center justify-center space-x-1.5 ${
                    editActive
                      ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
                      : "bg-zinc-800 border-zinc-700 text-zinc-400"
                  }`}
                >
                  <Check className={`w-3.5 h-3.5 ${editActive ? "opacity-100" : "opacity-0"}`} />
                  <span>{editActive ? "Active" : "Hidden"}</span>
                </button>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2.5 pt-3 border-t border-zinc-800">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isUpdating || isEditOptimizing}
                onClick={handleCloseEdit}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                isLoading={isUpdating}
                disabled={isUpdating || isEditOptimizing}
              >
                Save Changes
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* 6. DELETE CONFIRMATION MODAL */}
      <Modal
        isOpen={!!deletingAvatar}
        onClose={() => !isDeleting && setDeletingAvatar(null)}
        title="Delete Preset Avatar"
        subtitle="Are you sure you want to delete this preset avatar?"
      >
        {deletingAvatar && (
          <div className="space-y-4 pt-1">
            <div className="flex items-center space-x-3.5 p-3 rounded-xl bg-rose-950/30 border border-rose-900/50">
              <div className="w-14 h-14 rounded-full bg-white border-2 border-rose-500/50 p-0.5 overflow-hidden shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={deletingAvatar.asset_path}
                  alt={deletingAvatar.label}
                  className="w-full h-full object-cover object-center rounded-full bg-white block"
                />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-xs font-bold text-zinc-100 truncate block">
                  {deletingAvatar.label}
                </span>
                <span className="text-[10px] text-zinc-400 block">{deletingAvatar.category}</span>
                <span className="font-mono text-[9px] text-rose-400 block mt-0.5">
                  ID: {deletingAvatar.id}
                </span>
              </div>
            </div>

            <p className="text-xs text-zinc-400">
              This action will remove the avatar from all user selection galleries. Any user currently
              using this avatar will fall back to their display name initials until they select another avatar.
            </p>

            <div className="flex items-center justify-end space-x-2.5 pt-3 border-t border-zinc-800">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isDeleting}
                onClick={() => setDeletingAvatar(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                size="sm"
                isLoading={isDeleting}
                onClick={handleConfirmDelete}
              >
                Confirm Delete
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* 7. AVATAR SYNC & DISASTER RECOVERY HANDBOOK MODAL */}
      <AvatarSyncGuideModal
        isOpen={isSyncGuideOpen}
        onClose={() => setIsSyncGuideOpen(false)}
        pendingCloudCount={stats.cloudCount}
        onTriggerSync={handleSyncCloudAvatars}
        isSyncing={isSyncing}
      />
    </div>
  );
}
