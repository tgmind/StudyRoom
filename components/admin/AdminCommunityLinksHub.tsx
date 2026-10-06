"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Share2,
  Plus,
  Edit3,
  Trash2,
  ExternalLink,
  ArrowUp,
  ArrowDown,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Check,
  X,
  Globe,
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { SocialLink, PLATFORM_PRESETS, PlatformPreset } from "@/lib/social/types";
import { SocialPlatformIcon, getPlatformBadgeStyle } from "@/components/social/SocialPlatformIcons";
import { isValidHttpUrl, normalizeUrl } from "@/lib/social/urlValidation";

interface AdminCommunityLinksHubProps {
  adminEmail?: string | null;
}

export function AdminCommunityLinksHub({ adminEmail }: AdminCommunityLinksHubProps) {
  const [links, setLinks] = useState<SocialLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Edit / Add Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingLink, setEditingLink] = useState<Partial<SocialLink> | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<string>("whatsapp");
  const [formErrors, setFormErrors] = useState<{ title?: string; url?: string }>({});
  const [saving, setSaving] = useState(false);

  // Delete Confirmation Modal State
  const [deleteTarget, setDeleteTarget] = useState<SocialLink | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Fetch all links from admin API
  const fetchAdminLinks = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch("/api/admin/social-links", {
        cache: "no-store",
        headers: {
          Pragma: "no-cache",
        },
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || "Failed to fetch community links");
      }

      const data = await res.json();
      setLinks(Array.isArray(data.links) ? data.links : []);
    } catch (err: any) {
      console.error("Fetch social links error:", err);
      setError(err?.message || "Failed to load community links from database.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchAdminLinks();
  }, [fetchAdminLinks]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchAdminLinks();
  };

  // 1. Instant Enable/Disable Toggle
  const handleToggle = async (link: SocialLink) => {
    const nextState = !link.is_enabled;
    const previousLinks = [...links];

    // Optimistic UI update
    setLinks((prev) =>
      prev.map((l) => (l.id === link.id ? { ...l, is_enabled: nextState } : l))
    );

    try {
      const res = await fetch("/api/admin/social-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "toggle",
          id: link.id,
          is_enabled: nextState,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || "Failed to update link status");
      }

      setSuccess(`"${link.title}" is now ${nextState ? "enabled" : "disabled"}.`);
    } catch (err: any) {
      // Revert optimistic update
      setLinks(previousLinks);
      setError(err?.message || "Failed to update status");
    }
  };

  // 2. Open Add Modal
  const handleOpenAddModal = () => {
    const defaultPreset = PLATFORM_PRESETS[0];
    setSelectedPreset(defaultPreset.key);
    setEditingLink({
      id: "",
      platform: defaultPreset.key,
      title: defaultPreset.name,
      url: "",
      action_text: defaultPreset.defaultActionText,
      is_enabled: true,
      display_order: links.length + 1,
      icon_key: defaultPreset.defaultIconKey,
    });
    setFormErrors({});
    setIsModalOpen(true);
  };

  // 3. Open Edit Modal
  const handleOpenEditModal = (link: SocialLink) => {
    setSelectedPreset(link.platform || "custom");
    setEditingLink({ ...link });
    setFormErrors({});
    setIsModalOpen(true);
  };

  // 4. Handle Platform Preset Switch in Modal
  const handlePresetChange = (presetKey: string) => {
    setSelectedPreset(presetKey);
    const preset = PLATFORM_PRESETS.find((p) => p.key === presetKey);
    if (!preset) return;

    setEditingLink((prev) => ({
      ...prev,
      platform: preset.key,
      title: preset.key === "custom" ? (prev?.title || "") : preset.name,
      action_text: preset.defaultActionText,
      icon_key: preset.defaultIconKey,
    }));
  };

  // 5. Submit Save (Create or Update)
  const handleSaveLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLink) return;

    const title = (editingLink.title || "").trim();
    const url = (editingLink.url || "").trim();

    const errors: { title?: string; url?: string } = {};
    if (!title) errors.title = "Platform name is required.";
    if (!url) {
      errors.url = "Target URL is required.";
    } else if (!isValidHttpUrl(url)) {
      errors.url = "Must be a valid web URL (starting with https:// or http://).";
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payloadLink: Partial<SocialLink> = {
        ...editingLink,
        title,
        url: normalizeUrl(url),
        action_text: (editingLink.action_text || "").trim() || "Join Now",
        platform: editingLink.platform || "custom",
        icon_key: editingLink.icon_key || editingLink.platform || "custom",
        is_enabled: editingLink.is_enabled !== false,
        display_order: typeof editingLink.display_order === "number" ? editingLink.display_order : links.length + 1,
      };

      const res = await fetch("/api/admin/social-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save",
          link: payloadLink,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || "Failed to save social link");
      }

      setSuccess(`Saved "${title}" successfully.`);
      setIsModalOpen(false);
      setEditingLink(null);
      await fetchAdminLinks();
    } catch (err: any) {
      setError(err?.message || "Failed to save link");
    } finally {
      setSaving(false);
    }
  };

  // 6. Delete Link
  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;

    setDeleting(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/social-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete",
          id: deleteTarget.id,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || "Failed to delete social link");
      }

      setSuccess(`Deleted "${deleteTarget.title}" permanently.`);
      setDeleteTarget(null);
      await fetchAdminLinks();
    } catch (err: any) {
      setError(err?.message || "Failed to delete link");
    } finally {
      setDeleting(false);
    }
  };

  // 7. Move Link Up / Down
  const handleReorder = async (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= links.length) return;

    const previousLinks = [...links];
    const newLinks = [...links];
    const current = newLinks[index];
    const target = newLinks[targetIndex];

    // Swap display_order
    const tempOrder = current.display_order;
    current.display_order = target.display_order;
    target.display_order = tempOrder;

    // Sort by new display_order
    newLinks.sort((a, b) => a.display_order - b.display_order);
    setLinks(newLinks);

    try {
      const res = await fetch("/api/admin/social-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reorder",
          items: newLinks.map((l, i) => ({ id: l.id, display_order: i + 1 })),
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || "Failed to reorder");
      }
      setSuccess("Order updated successfully.");
    } catch (err: any) {
      // Revert optimistic order
      setLinks(previousLinks);
      setError(err?.message || "Failed to reorder links");
      // Reconcile from server without wiping the error
      try {
        const res = await fetch("/api/admin/social-links", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.links)) setLinks(data.links);
        }
      } catch {
        // ignore background reconciliation error
      }
    }
  };

  return (
    <div className="space-y-4">
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

      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-zinc-900/70 border border-zinc-800/90 rounded-2xl p-4 sm:p-5 shadow-xl backdrop-blur-md">
        <div className="flex items-center space-x-3">
          <div className="p-2 sm:p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 shrink-0">
            <Share2 className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-sm sm:text-base font-extrabold text-zinc-100 tracking-tight">
                Community & Social Links
              </h2>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-300 font-mono">
                {links.filter((l) => l.is_enabled).length} active / {links.length} total
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              Manage WhatsApp, Telegram, and additional social channels displayed on the user Settings Page
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-100 transition-all touch-manipulation active:scale-95"
            aria-label="Refresh community links"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={handleOpenAddModal}
            className="font-extrabold text-xs space-x-1.5 shadow-md bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500/30"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Social Platform</span>
          </Button>
        </div>
      </div>

      {/* Platform List */}
      {loading ? (
        <div className="space-y-2.5">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="w-full h-20 bg-zinc-900/50 border border-zinc-800/80 rounded-xl animate-pulse"
            />
          ))}
        </div>
      ) : links.length === 0 ? (
        <div className="p-8 text-center border border-dashed border-zinc-800 bg-zinc-900/20 rounded-xl space-y-2">
          <Share2 className="w-8 h-8 text-zinc-600 mx-auto" />
          <h3 className="text-xs font-bold text-zinc-300">No social platforms configured</h3>
          <p className="text-[11px] text-zinc-500">
            Click &ldquo;Add Social Platform&rdquo; above to configure WhatsApp, Telegram, or other community channels.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {links.map((link, idx) => {
            const badgeStyle = getPlatformBadgeStyle(link.platform);

            return (
              <div
                key={link.id}
                className={`w-full flex flex-col sm:flex-row sm:items-center justify-between p-3.5 sm:p-4 rounded-xl border transition-all ${
                  link.is_enabled
                    ? "bg-zinc-900/80 border-zinc-800/90 hover:border-zinc-700"
                    : "bg-zinc-950/60 border-zinc-900 opacity-65 hover:opacity-85"
                }`}
              >
                {/* Left: Icon, Platform Title, URL, Order */}
                <div className="flex items-center space-x-3 min-w-0 flex-1">
                  {/* Order Controls */}
                  <div className="flex flex-col space-y-0.5 shrink-0">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => handleReorder(idx, "up")}
                      className="p-1 text-zinc-500 hover:text-zinc-200 disabled:opacity-20 disabled:hover:text-zinc-500 transition-colors"
                      title="Move Up"
                    >
                      <ArrowUp className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === links.length - 1}
                      onClick={() => handleReorder(idx, "down")}
                      className="p-1 text-zinc-500 hover:text-zinc-200 disabled:opacity-20 disabled:hover:text-zinc-500 transition-colors"
                      title="Move Down"
                    >
                      <ArrowDown className="w-3 h-3" />
                    </button>
                  </div>

                  {/* Platform Icon */}
                  <div
                    className={`w-9 h-9 rounded-xl ${badgeStyle.badgeBg} border ${badgeStyle.badgeBorder} ${badgeStyle.textColor} flex items-center justify-center shrink-0`}
                  >
                    <SocialPlatformIcon platform={link.icon_key || link.platform} size={18} />
                  </div>

                  {/* Title & Details */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center space-x-2">
                      <span className="text-xs sm:text-sm font-bold text-zinc-100 truncate">
                        {link.title}
                      </span>
                      <span
                        className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full uppercase tracking-wider ${
                          link.is_enabled
                            ? "bg-emerald-500/15 border border-emerald-500/30 text-emerald-400"
                            : "bg-zinc-800 text-zinc-500 border border-zinc-700"
                        }`}
                      >
                        {link.is_enabled ? "Enabled" : "Disabled"}
                      </span>
                      <span className="text-[10px] text-zinc-400 font-mono bg-zinc-950/80 px-1.5 py-0.5 rounded border border-zinc-800/80">
                        {link.action_text || "Join Now"}
                      </span>
                    </div>

                    <div className="flex items-center space-x-1.5 mt-1 min-w-0">
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-zinc-400 hover:text-zinc-200 truncate flex items-center space-x-1 max-w-full group"
                      >
                        <span className="truncate">{link.url}</span>
                        <ExternalLink className="w-2.5 h-2.5 opacity-60 group-hover:opacity-100 shrink-0" />
                      </a>
                    </div>
                  </div>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center space-x-2 mt-3 sm:mt-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-zinc-800/80 shrink-0">
                  {/* Enable/Disable Toggle Switch Button */}
                  <button
                    type="button"
                    onClick={() => handleToggle(link)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 border ${
                      link.is_enabled
                        ? "bg-emerald-500/15 hover:bg-emerald-500/25 border-emerald-500/30 text-emerald-300"
                        : "bg-zinc-800 hover:bg-zinc-700 border-zinc-700 text-zinc-400"
                    }`}
                  >
                    {link.is_enabled ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Enabled</span>
                      </>
                    ) : (
                      <>
                        <X className="w-3.5 h-3.5 text-zinc-400" />
                        <span>Disabled</span>
                      </>
                    )}
                  </button>

                  {/* Edit Button */}
                  <button
                    type="button"
                    onClick={() => handleOpenEditModal(link)}
                    className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-zinc-100 border border-zinc-700 transition-colors"
                    title="Edit Platform"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>

                  {/* Delete Button */}
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(link)}
                    className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 border border-rose-500/25 transition-colors"
                    title="Delete Platform"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Platform Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingLink(null);
        }}
        title={editingLink?.id ? "Edit Social Platform" : "Add Social Platform"}
        subtitle="Configure community channel link and button details"
      >
        {editingLink && (
          <form onSubmit={handleSaveLink} className="space-y-3.5 pt-1">
            {/* Platform Preset Selector */}
            <div className="space-y-1">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                Platform Type
              </label>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
                {PLATFORM_PRESETS.map((preset) => {
                  const isSelected = selectedPreset === preset.key;
                  return (
                    <button
                      type="button"
                      key={preset.key}
                      onClick={() => handlePresetChange(preset.key)}
                      className={`flex items-center space-x-1.5 p-2 rounded-xl text-xs font-bold border transition-all ${
                        isSelected
                          ? "bg-zinc-100 text-zinc-950 border-white shadow-sm"
                          : "bg-zinc-950/80 hover:bg-zinc-900 border-zinc-800 text-zinc-400"
                      }`}
                    >
                      <SocialPlatformIcon platform={preset.defaultIconKey} size={14} />
                      <span className="truncate">{preset.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Platform Display Name */}
            <div className="space-y-1">
              <label htmlFor="social-platform-title" className="block text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                Button Label / Platform Name
              </label>
              <input
                id="social-platform-title"
                type="text"
                value={editingLink.title || ""}
                onChange={(e) =>
                  setEditingLink((prev) => ({ ...prev, title: e.target.value }))
                }
                placeholder="e.g. WhatsApp, Telegram, YouTube"
                required
                className="w-full px-3 py-2 bg-zinc-950/80 border border-zinc-800 rounded-xl text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 font-medium"
              />
              {formErrors.title && (
                <p className="text-[10px] text-rose-400">{formErrors.title}</p>
              )}
            </div>

            {/* URL Field */}
            <div className="space-y-1">
              <label htmlFor="social-platform-url" className="block text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                Channel / Group Web URL
              </label>
              <input
                id="social-platform-url"
                type="url"
                value={editingLink.url || ""}
                onChange={(e) =>
                  setEditingLink((prev) => ({ ...prev, url: e.target.value }))
                }
                placeholder={
                  PLATFORM_PRESETS.find((p) => p.key === selectedPreset)
                    ?.defaultUrlPlaceholder || "https://..."
                }
                required
                className="w-full px-3 py-2 bg-zinc-950/80 border border-zinc-800 rounded-xl text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 font-mono text-[11px]"
              />
              {formErrors.url ? (
                <p className="text-[10px] text-rose-400">{formErrors.url}</p>
              ) : (
                <p className="text-[10px] text-zinc-500">
                  Must start with https:// or http://. Users will open this link in the app or browser.
                </p>
              )}
            </div>

            {/* Action Text Field */}
            <div className="space-y-1">
              <label htmlFor="social-platform-action" className="block text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                Action Text
              </label>
              <input
                id="social-platform-action"
                type="text"
                value={editingLink.action_text || ""}
                onChange={(e) =>
                  setEditingLink((prev) => ({ ...prev, action_text: e.target.value }))
                }
                placeholder="Join Now"
                required
                className="w-full px-3 py-2 bg-zinc-950/80 border border-zinc-800 rounded-xl text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 font-medium"
              />
              <p className="text-[10px] text-zinc-500">
                Default: &ldquo;Join Now&rdquo;. For YouTube or Instagram, &ldquo;Subscribe&rdquo; or &ldquo;Follow&rdquo; can be used.
              </p>
            </div>

            {/* Display Order & Enabled Switch */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="space-y-1">
                <label htmlFor="social-platform-order" className="block text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                  Display Order
                </label>
                <input
                  id="social-platform-order"
                  type="number"
                  min={1}
                  max={99}
                  value={editingLink.display_order ?? 1}
                  onChange={(e) =>
                    setEditingLink((prev) => ({
                      ...prev,
                      display_order: parseInt(e.target.value, 10) || 1,
                    }))
                  }
                  className="w-full px-3 py-2 bg-zinc-950/80 border border-zinc-800 rounded-xl text-xs text-zinc-100 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                  Active Status
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setEditingLink((prev) => ({
                      ...prev,
                      is_enabled: !prev?.is_enabled,
                    }))
                  }
                  className={`w-full py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center space-x-1.5 transition-all ${
                    editingLink.is_enabled !== false
                      ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
                      : "bg-zinc-800 border-zinc-700 text-zinc-400"
                  }`}
                >
                  {editingLink.is_enabled !== false ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Enabled</span>
                    </>
                  ) : (
                    <>
                      <X className="w-3.5 h-3.5" />
                      <span>Disabled</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Buttons */}
            <div className="flex items-center justify-end space-x-2 pt-3 border-t border-zinc-800">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setIsModalOpen(false);
                  setEditingLink(null);
                }}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                isLoading={saving}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold"
              >
                Save Platform
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Delete Social Platform"
        subtitle={`Permanently remove "${deleteTarget?.title}"?`}
      >
        <div className="space-y-4 pt-1">
          <p className="text-xs text-zinc-400">
            This will permanently remove this button from the database and user Settings Page. You can also disable it instead if you want to temporarily hide it.
          </p>

          <div className="flex items-center justify-end space-x-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              size="sm"
              onClick={handleConfirmDelete}
              isLoading={deleting}
              className="font-extrabold"
            >
              Confirm Delete
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
