"use client";

import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  AVATAR_CATEGORIES,
  getAllAvatars,
  getAvatarById,
  isValidAvatarId,
  AvatarItem,
  AvatarCategory,
  parseAvatarZoom,
  buildAvatarUrl,
} from "@/lib/avatars/manifest";
import {
  Check,
  Sparkles,
  UploadCloud,
  X,
  Search,
  RotateCcw,
  User,
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Sliders,
  ZoomIn,
  ZoomOut,
  LayoutGrid,
  Layers,
  ArrowRightLeft,
} from "lucide-react";
import { AvatarUpload } from "@/components/ui/AvatarUpload";

export interface AvatarSelectorProps {
  userId: string;
  currentAvatarId?: string | null;
  currentAvatarUrl?: string | null;
  savedAvatarId?: string | null;
  savedAvatarUrl?: string | null;
  displayName: string;
  onAvatarChanged: (avatarId: string | null, avatarUrl: string | null) => void;
  disabled?: boolean;
  defaultExpanded?: boolean;
}

export const AvatarSelector = React.memo(function AvatarSelector({
  userId,
  currentAvatarId,
  currentAvatarUrl,
  savedAvatarId,
  savedAvatarUrl,
  displayName,
  onAvatarChanged,
  disabled = false,
  defaultExpanded = true,
}: AvatarSelectorProps) {
  const [isGalleryExpanded, setIsGalleryExpanded] = useState(defaultExpanded);
  const [selectedCategory, setSelectedCategory] = useState<AvatarCategory | "All">("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [isCustomUploadOpen, setIsCustomUploadOpen] = useState(false);
  const [isWrapMode, setIsWrapMode] = useState(false);

  // Desktop horizontal scroll & drag controls for category pills
  const categoryScrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const scrollLeftRef = useRef(0);
  const hasMovedRef = useRef(false);

  const updateScrollButtons = useCallback(() => {
    const el = categoryScrollRef.current;
    if (!el) return;
    const hasOverflow = el.scrollWidth > el.clientWidth + 2;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(hasOverflow && el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  }, []);

  useEffect(() => {
    const el = categoryScrollRef.current;
    if (!el || isWrapMode || !isGalleryExpanded) return;

    updateScrollButtons();
    el.addEventListener("scroll", updateScrollButtons, { passive: true });
    window.addEventListener("resize", updateScrollButtons, { passive: true });

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => {
        updateScrollButtons();
      });
      resizeObserver.observe(el);
    }

    return () => {
      el.removeEventListener("scroll", updateScrollButtons);
      window.removeEventListener("resize", updateScrollButtons);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, [updateScrollButtons, isWrapMode, isGalleryExpanded]);

  const scrollCategories = useCallback((direction: "left" | "right") => {
    const el = categoryScrollRef.current;
    if (!el) return;
    const scrollAmount = Math.max(160, Math.floor(el.clientWidth * 0.65));
    el.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth",
    });
  }, []);

  const handleCategoryWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      if (isWrapMode) return;
      const el = categoryScrollRef.current;
      if (!el) return;
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && el.scrollWidth > el.clientWidth) {
        el.scrollLeft += e.deltaY;
      }
    },
    [isWrapMode]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (isWrapMode) return;
      const el = categoryScrollRef.current;
      if (!el) return;
      isDraggingRef.current = true;
      hasMovedRef.current = false;
      startXRef.current = e.pageX - el.offsetLeft;
      scrollLeftRef.current = el.scrollLeft;
    },
    [isWrapMode]
  );

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    const el = categoryScrollRef.current;
    if (!el) return;
    e.preventDefault();
    const x = e.pageX - el.offsetLeft;
    const walk = (x - startXRef.current) * 1.2;
    if (Math.abs(walk) > 4) {
      hasMovedRef.current = true;
    }
    el.scrollLeft = scrollLeftRef.current - walk;
  }, []);

  const handleMouseUpOrLeave = useCallback(() => {
    isDraggingRef.current = false;
  }, []);

  // Baseline initial state to detect unsaved changes if saved props are not provided
  const initialRef = useRef({
    avatarId: savedAvatarId !== undefined ? savedAvatarId : currentAvatarId,
    avatarUrl: savedAvatarUrl !== undefined ? savedAvatarUrl : currentAvatarUrl,
  });

  const baselineAvatarId = savedAvatarId !== undefined ? savedAvatarId : initialRef.current.avatarId;
  const baselineAvatarUrl = savedAvatarUrl !== undefined ? savedAvatarUrl : initialRef.current.avatarUrl;

  const isUnsaved = useMemo(() => {
    const idChanged = (currentAvatarId || null) !== (baselineAvatarId || null);
    const urlChanged = (currentAvatarUrl || null) !== (baselineAvatarUrl || null);
    return idChanged || urlChanged;
  }, [currentAvatarId, currentAvatarUrl, baselineAvatarId, baselineAvatarUrl]);

  const allAvatars = useMemo(() => getAllAvatars(), []);

  // Filter avatars by selected category and search query
  const filteredAvatars = useMemo(() => {
    let list = allAvatars;
    if (selectedCategory !== "All") {
      list = list.filter((a) => a.category === selectedCategory);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (a) =>
          a.label.toLowerCase().includes(q) ||
          a.category.toLowerCase().includes(q) ||
          a.id.toLowerCase().includes(q)
      );
    }
    return list;
  }, [allAvatars, selectedCategory, searchQuery]);

  // Resolve current active avatar item
  const activeAvatarItem = useMemo(() => {
    if (currentAvatarId && isValidAvatarId(currentAvatarId)) {
      return getAvatarById(currentAvatarId);
    }
    if (currentAvatarUrl && currentAvatarUrl.startsWith("/avatars/optimized/")) {
      const idMatch = currentAvatarUrl.match(/avatar-\d-\d{2}/);
      if (idMatch) {
        return getAvatarById(idMatch[0]);
      }
    }
    return undefined;
  }, [currentAvatarId, currentAvatarUrl]);

  const initials = useMemo(() => {
    return displayName ? displayName.substring(0, 2).toUpperCase() : "??";
  }, [displayName]);

  // Current zoom level parsed directly from the active avatar URL
  const currentZoom = useMemo(() => {
    return parseAvatarZoom(currentAvatarUrl);
  }, [currentAvatarUrl]);

  const handleSelectAvatar = useCallback(
    (avatar: AvatarItem) => {
      if (disabled) return;
      const urlWithZoom =
        Math.abs(currentZoom - 1.0) >= 0.001
          ? buildAvatarUrl(avatar.assetPath, currentZoom)
          : avatar.assetPath;
      onAvatarChanged(avatar.id, urlWithZoom);
    },
    [disabled, onAvatarChanged, currentZoom]
  );

  const handleZoomChange = useCallback(
    (newZoom: number) => {
      if (disabled || !currentAvatarUrl) return;
      const clampedZoom = Math.min(2.0, Math.max(0.75, Math.round(newZoom * 100) / 100));
      const updatedUrl = buildAvatarUrl(currentAvatarUrl, clampedZoom);
      onAvatarChanged(currentAvatarId || null, updatedUrl);
    },
    [disabled, currentAvatarUrl, currentAvatarId, onAvatarChanged]
  );

  const handleCustomUploadSuccess = useCallback(
    (publicUrl: string | null) => {
      onAvatarChanged(null, publicUrl);
      setIsCustomUploadOpen(false);
    },
    [onAvatarChanged]
  );

  const handleRemoveAvatar = useCallback(() => {
    if (disabled) return;
    onAvatarChanged(null, null);
  }, [disabled, onAvatarChanged]);

  const handleRevert = useCallback(() => {
    if (disabled) return;
    onAvatarChanged(baselineAvatarId || null, baselineAvatarUrl || null);
  }, [disabled, onAvatarChanged, baselineAvatarId, baselineAvatarUrl]);

  return (
    <div className="space-y-4">
      {/* 1. SECTION HEADER WITH CLEAN VISUAL HIERARCHY */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-xs sm:text-sm font-extrabold text-zinc-100 uppercase tracking-wider">
              Profile Avatar
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-500/15 border border-violet-500/30 text-violet-300">
              139 Presets
            </span>
          </div>
          <p className="text-[11px] sm:text-xs text-zinc-400 mt-0.5">
            Choose an illustrated avatar to represent your focus presence across StudyRoom
          </p>
        </div>

        {/* Custom Upload Toggle */}
        <button
          type="button"
          onClick={() => setIsCustomUploadOpen(!isCustomUploadOpen)}
          className="inline-flex items-center justify-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-zinc-800/90 hover:bg-zinc-700 active:bg-zinc-600 border border-zinc-700/80 text-zinc-200 transition-colors shadow-sm shrink-0 self-start sm:self-auto touch-manipulation"
        >
          <UploadCloud className="w-3.5 h-3.5 text-violet-400 shrink-0" />
          <span>{isCustomUploadOpen ? "Browse Library" : "Custom Photo"}</span>
        </button>
      </div>

      {/* 2. PROMINENT CURRENT-AVATAR PREVIEW SHOWCASE */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-zinc-900/90 via-zinc-950/90 to-zinc-900/90 border border-zinc-800/90 p-4 shadow-xl backdrop-blur-sm">
        {/* Top-Right Remove / Reset Button */}
        {currentAvatarUrl && (
          <div className="absolute top-3.5 right-3.5 z-10">
            <button
              type="button"
              onClick={handleRemoveAvatar}
              disabled={disabled}
              className="p-1.5 rounded-xl text-zinc-400 hover:text-rose-300 hover:bg-rose-950/40 border border-zinc-800/80 hover:border-rose-900/50 bg-zinc-900/60 transition-colors touch-manipulation"
              title="Remove avatar"
              aria-label="Remove avatar"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <div className={`flex items-center space-x-3.5 sm:space-x-4 min-w-0 ${currentAvatarUrl ? "pr-8" : ""}`}>
          {/* Avatar Canvas Circle with Glow Effect */}
          <div className="relative shrink-0">
            <div
              onClick={() => !isCustomUploadOpen && setIsGalleryExpanded((prev) => !prev)}
              role="button"
              tabIndex={0}
              title={!isCustomUploadOpen ? "Click to change avatar" : undefined}
              onKeyDown={(e) => {
                if ((e.key === "Enter" || e.key === " ") && !isCustomUploadOpen) {
                  e.preventDefault();
                  setIsGalleryExpanded((prev) => !prev);
                }
              }}
              className={`relative w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white border-2 border-violet-500/50 p-0.5 flex items-center justify-center shadow-[0_0_18px_rgba(139,92,246,0.3)] overflow-hidden group ${
                !isCustomUploadOpen
                  ? "cursor-pointer hover:border-violet-400 hover:shadow-[0_0_24px_rgba(139,92,246,0.45)] transition-all"
                  : ""
              }`}
            >
              {currentAvatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={currentAvatarUrl}
                  alt={activeAvatarItem?.label || "Active avatar preview"}
                  style={{
                    transform: `scale(${currentZoom})`,
                    transformOrigin: "center 42%",
                  }}
                  className="w-full h-full object-cover object-center rounded-full block transition-transform duration-150 ease-out"
                  loading="eager"
                  decoding="async"
                />
              ) : (
                <div className="w-full h-full rounded-full bg-gradient-to-br from-violet-950/60 to-zinc-950 border border-violet-800/40 flex items-center justify-center">
                  <span className="text-base sm:text-lg font-black text-violet-200 tracking-wider">
                    {initials}
                  </span>
                </div>
              )}
            </div>

            {/* Micro Badge Icon */}
            <div className="absolute bottom-0 right-0 p-1 bg-violet-600 border-2 border-zinc-950 rounded-full text-white shadow-md pointer-events-none">
              <Sparkles className="w-3 h-3" />
            </div>
          </div>

          {/* Details & Status Indicators */}
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center space-x-1.5">
              {isUnsaved ? (
                <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 border border-amber-500/30 text-amber-300 whitespace-nowrap shrink-0">
                  <Clock className="w-2.5 h-2.5 text-amber-400 shrink-0" />
                  <span>Previewing (Unsaved)</span>
                </span>
              ) : (
                <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 whitespace-nowrap shrink-0">
                  <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
                  <span>Saved Profile Avatar</span>
                </span>
              )}
            </div>

            <h3 className="text-sm sm:text-base font-extrabold text-zinc-100 tracking-tight truncate leading-tight pt-0.5">
              {activeAvatarItem
                ? activeAvatarItem.label
                : currentAvatarUrl
                ? "Custom Photo"
                : `${displayName || "User"} (Initials)`}
            </h3>

            <p className="text-[11px] sm:text-xs text-zinc-400 truncate">
              {activeAvatarItem
                ? activeAvatarItem.category
                : currentAvatarUrl
                ? "Custom profile image"
                : "No avatar selected"}
            </p>

            {/* Unsaved prompt with dedicated Revert action in clean separate flow */}
            {isUnsaved && (
              <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1.5 border-t border-zinc-800/60 mt-1">
                <span className="text-[10px] sm:text-[10.5px] font-medium text-amber-300/85">
                  Remember to click &ldquo;Save Profile&rdquo; below to confirm.
                </span>
                <button
                  type="button"
                  onClick={handleRevert}
                  disabled={disabled}
                  className="inline-flex items-center space-x-1 text-[10px] font-bold text-amber-300 hover:text-white px-2 py-0.5 rounded-md bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 transition-colors shrink-0 touch-manipulation"
                  title="Revert to saved avatar"
                >
                  <RotateCcw className="w-2.5 h-2.5" />
                  <span>Revert</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Zoom & Framing Slider Adjuster */}
        {currentAvatarUrl && (
          <div className="mt-3 pt-3 border-t border-zinc-800/80 space-y-2 animate-in fade-in duration-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-1.5">
                <Sliders className="w-3.5 h-3.5 text-violet-400" />
                <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-zinc-300">
                  Zoom & Adjust
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="font-mono text-[11px] font-extrabold px-2 py-0.5 rounded-md bg-violet-500/15 border border-violet-500/30 text-violet-300">
                  {Math.round(currentZoom * 100)}%
                </span>
                {Math.abs(currentZoom - 1.0) >= 0.001 && (
                  <button
                    type="button"
                    onClick={() => handleZoomChange(1.0)}
                    disabled={disabled}
                    className="text-[10px] font-bold text-zinc-400 hover:text-zinc-200 px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 transition-colors touch-manipulation cursor-pointer"
                    title="Reset zoom to 100%"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>

            {/* Slider track with stepper buttons */}
            <div className="flex items-center space-x-2.5">
              <button
                type="button"
                onClick={() => handleZoomChange(Math.max(0.75, currentZoom - 0.05))}
                disabled={disabled || currentZoom <= 0.75}
                className="p-1.5 rounded-lg bg-zinc-800/90 hover:bg-zinc-700 active:bg-zinc-600 disabled:opacity-30 text-zinc-300 border border-zinc-700/60 transition-colors touch-manipulation shrink-0 cursor-pointer"
                title="Zoom out"
                aria-label="Zoom out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>

              <div className="relative flex-1 flex items-center">
                <input
                  type="range"
                  min="0.75"
                  max="2.0"
                  step="0.05"
                  value={currentZoom}
                  onChange={(e) => handleZoomChange(parseFloat(e.target.value))}
                  disabled={disabled}
                  aria-label="Avatar Zoom Level"
                  className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-400 touch-pan-x"
                />
              </div>

              <button
                type="button"
                onClick={() => handleZoomChange(Math.min(2.0, currentZoom + 0.05))}
                disabled={disabled || currentZoom >= 2.0}
                className="p-1.5 rounded-lg bg-zinc-800/90 hover:bg-zinc-700 active:bg-zinc-600 disabled:opacity-30 text-zinc-300 border border-zinc-700/60 transition-colors touch-manipulation shrink-0 cursor-pointer"
                title="Zoom in"
                aria-label="Zoom in"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Quick Presets */}
            <div className="flex items-center space-x-1.5 pt-0.5 overflow-x-auto no-scrollbar">
              <span className="text-[10px] text-zinc-500 font-semibold shrink-0">Presets:</span>
              {[
                { label: "Fit 85%", zoom: 0.85 },
                { label: "100%", zoom: 1.0 },
                { label: "Focus 125%", zoom: 1.25 },
                { label: "Close-up 150%", zoom: 1.5 },
              ].map((preset) => {
                const isActive = Math.abs(currentZoom - preset.zoom) < 0.01;
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => handleZoomChange(preset.zoom)}
                    disabled={disabled}
                    className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-all touch-manipulation shrink-0 cursor-pointer ${
                      isActive
                        ? "bg-violet-600 text-white shadow-xs border border-violet-400/50"
                        : "bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 border border-zinc-700/60"
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Mobile-Clever Expand / Collapse CTA Bar */}
        {!isCustomUploadOpen && (
          <div className="mt-3 pt-3 border-t border-zinc-800/80 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setIsGalleryExpanded((prev) => !prev)}
              aria-expanded={isGalleryExpanded}
              aria-controls="avatar-gallery-panel"
              className={`w-full inline-flex items-center justify-between py-2 px-3.5 rounded-xl text-xs font-bold transition-all shadow-sm touch-manipulation ${
                isGalleryExpanded
                  ? "bg-zinc-800/90 hover:bg-zinc-700/90 active:bg-zinc-600 text-zinc-200 border border-zinc-700/80"
                  : "bg-violet-600/20 hover:bg-violet-600/30 active:bg-violet-600/40 text-violet-200 border border-violet-500/40 hover:border-violet-500/60 shadow-[0_0_12px_rgba(139,92,246,0.15)]"
              }`}
            >
              {isGalleryExpanded ? (
                <>
                  <span className="flex items-center space-x-2">
                    <Check className="w-3.5 h-3.5 text-emerald-400 stroke-[2.5]" />
                    <span>Done Browsing Avatars</span>
                  </span>
                  <span className="flex items-center space-x-1 text-[11px] text-zinc-400 font-semibold">
                    <span>Collapse</span>
                    <ChevronUp className="w-4 h-4" />
                  </span>
                </>
              ) : (
                <>
                  <span className="flex items-center space-x-2">
                    <Sparkles className="w-3.5 h-3.5 text-violet-400 animate-pulse" />
                    <span>Change Avatar</span>
                  </span>
                  <span className="flex items-center space-x-1.5 text-[11px] text-violet-400/90 font-semibold">
                    <span>{allAvatars.length} Presets</span>
                    <ChevronDown className="w-4 h-4" />
                  </span>
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* 3. CONDITIONAL BODY: CUSTOM UPLOAD OR PRESET GALLERY */}
      {isCustomUploadOpen ? (
        <div className="p-4 bg-zinc-950/60 border border-zinc-800/90 rounded-2xl space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-800/60">
            <div className="flex items-center space-x-2">
              <UploadCloud className="w-4 h-4 text-violet-400" />
              <span className="text-xs font-bold text-zinc-200 uppercase tracking-wider">
                Upload Custom Image
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsCustomUploadOpen(false)}
              className="text-xs font-semibold text-violet-400 hover:text-violet-300 transition-colors"
            >
              Back to Presets
            </button>
          </div>
          <AvatarUpload
            userId={userId}
            displayName={displayName}
            currentAvatarUrl={currentAvatarUrl}
            onAvatarUploaded={handleCustomUploadSuccess}
          />
        </div>
      ) : isGalleryExpanded ? (
        /* Presets Gallery Mode (Expandable) */
        <div
          id="avatar-gallery-panel"
          className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-200"
        >
          {/* Category Filter Pills & Search */}
          <div className="space-y-2">
            {/* Category Header Row with Desktop Mode Toggle */}
            <div className="flex items-center justify-between px-0.5">
              <div className="flex items-center space-x-1.5">
                <Layers className="w-3.5 h-3.5 text-violet-400" />
                <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-300">
                  Categories
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsWrapMode((prev) => !prev)}
                className="hidden sm:inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[10.5px] font-semibold text-zinc-400 hover:text-zinc-200 bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800/80 transition-colors cursor-pointer touch-manipulation"
                title={isWrapMode ? "Switch to single-row scroll" : "Wrap all categories"}
              >
                {isWrapMode ? (
                  <>
                    <ArrowRightLeft className="w-3 h-3 text-violet-400" />
                    <span>Single Row</span>
                  </>
                ) : (
                  <>
                    <LayoutGrid className="w-3 h-3 text-violet-400" />
                    <span>Wrap All (8)</span>
                  </>
                )}
              </button>
            </div>

            {/* Category Track with Left/Right Chevrons & Gradient Fades */}
            <div className="relative group/track">
              {/* Left Fade & Navigation Button (Desktop / Scrollable) */}
              {!isWrapMode && canScrollLeft && (
                <div className="absolute left-0 top-0 bottom-0 z-10 flex items-center pr-3 pl-0.5 bg-gradient-to-r from-zinc-950 via-zinc-950/85 to-transparent pointer-events-none animate-in fade-in duration-150">
                  <button
                    type="button"
                    onClick={() => scrollCategories("left")}
                    aria-label="Scroll categories left"
                    className="pointer-events-auto p-1.5 rounded-lg bg-zinc-800/95 hover:bg-zinc-700 active:bg-zinc-600 text-zinc-300 hover:text-white border border-zinc-700/80 shadow-md transition-all touch-manipulation cursor-pointer"
                    title="Scroll left"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Scrollable / Wrappable Pill Container */}
              <div
                ref={categoryScrollRef}
                onWheel={handleCategoryWheel}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUpOrLeave}
                onMouseLeave={handleMouseUpOrLeave}
                className={`flex items-center gap-1.5 pb-1.5 scroll-smooth ${
                  isWrapMode
                    ? "flex-wrap overflow-visible"
                    : "overflow-x-auto no-scrollbar touch-pan-x cursor-grab active:cursor-grabbing select-none"
                }`}
              >
                <button
                  type="button"
                  onClick={() => !hasMovedRef.current && setSelectedCategory("All")}
                  aria-pressed={selectedCategory === "All"}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all touch-manipulation shrink-0 cursor-pointer ${
                    selectedCategory === "All"
                      ? "bg-violet-600 text-white shadow-md shadow-violet-900/25 border border-violet-500"
                      : "bg-zinc-900/90 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 border border-zinc-800 hover:border-zinc-700"
                  }`}
                >
                  All ({allAvatars.length})
                </button>

                {AVATAR_CATEGORIES.filter((c) => c !== "All").map((cat) => {
                  const count = allAvatars.filter((a) => a.category === cat).length;
                  const isSelected = selectedCategory === cat;
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => !hasMovedRef.current && setSelectedCategory(cat)}
                      aria-pressed={isSelected}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all touch-manipulation shrink-0 cursor-pointer ${
                        isSelected
                          ? "bg-violet-600 text-white shadow-md shadow-violet-900/25 border border-violet-500"
                          : "bg-zinc-900/90 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 border border-zinc-800 hover:border-zinc-700"
                      }`}
                    >
                      {cat} ({count})
                    </button>
                  );
                })}
              </div>

              {/* Right Fade & Navigation Button (Desktop / Scrollable) */}
              {!isWrapMode && canScrollRight && (
                <div className="absolute right-0 top-0 bottom-0 z-10 flex items-center pl-3 pr-0.5 bg-gradient-to-l from-zinc-950 via-zinc-950/85 to-transparent pointer-events-none animate-in fade-in duration-150">
                  <button
                    type="button"
                    onClick={() => scrollCategories("right")}
                    aria-label="Scroll categories right"
                    className="pointer-events-auto p-1.5 rounded-lg bg-zinc-800/95 hover:bg-zinc-700 active:bg-zinc-600 text-zinc-300 hover:text-white border border-zinc-700/80 shadow-md transition-all touch-manipulation cursor-pointer"
                    title="Scroll right"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            {/* Quick Search Bar */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search avatars by name or keyword..."
                className="w-full pl-9 pr-8 py-1.5 bg-zinc-950/70 border border-zinc-800/90 rounded-xl text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 p-0.5"
                  title="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Curated Responsive Grid with Lazy Loading */}
          <div
            role="radiogroup"
            aria-label="Avatar Collection Gallery"
            className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 gap-2.5 max-h-[380px] overflow-y-auto p-2.5 bg-zinc-950/70 border border-zinc-800/90 rounded-2xl scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-zinc-900"
          >
            {filteredAvatars.length === 0 ? (
              <div className="col-span-full py-8 text-center text-xs text-zinc-500">
                No avatars found matching &ldquo;{searchQuery}&rdquo;.
              </div>
            ) : (
              filteredAvatars.map((avatar) => {
                const isSelected =
                  currentAvatarId === avatar.id ||
                  currentAvatarUrl === avatar.assetPath ||
                  (activeAvatarItem && activeAvatarItem.id === avatar.id);

                return (
                  <button
                    key={avatar.id}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    aria-label={avatar.label}
                    disabled={disabled}
                    onClick={() => handleSelectAvatar(avatar)}
                    className={`relative group aspect-square rounded-xl p-1 transition-all touch-manipulation focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 ${
                      isSelected
                        ? "bg-violet-950/40 border-2 border-violet-500 shadow-[0_0_14px_rgba(139,92,246,0.4)] scale-[1.04] z-10"
                        : "bg-zinc-900/90 hover:bg-zinc-800/90 border border-zinc-800 hover:border-zinc-600 active:scale-95"
                    }`}
                  >
                    {/* Selected Checkmark Badge */}
                    {isSelected && (
                      <span className="absolute -top-1.5 -right-1.5 z-20 w-5 h-5 bg-violet-600 border border-violet-300 rounded-full flex items-center justify-center text-white shadow-md animate-in fade-in zoom-in-75 duration-150">
                        <Check className="w-3 h-3 stroke-[3]" />
                      </span>
                    )}

                    {/* White Background Thumbnail Container */}
                    <div className="w-full h-full rounded-lg overflow-hidden flex items-center justify-center bg-white shadow-xs">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={avatar.assetPath}
                        alt={avatar.label}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover object-center rounded-lg block transition-transform group-hover:scale-105"
                      />
                    </div>

                    <span className="sr-only">{avatar.label}</span>
                  </button>
                );
              })
            )}
          </div>

          {/* Footer Gallery Info & Done Action */}
          <div className="flex items-center justify-between text-[11px] text-zinc-500 px-1 pt-1">
            <span>Showing {filteredAvatars.length} avatars</span>
            <div className="flex items-center space-x-2">
              <span className="hidden sm:inline text-zinc-500">Tap avatar to select</span>
              <button
                type="button"
                onClick={() => setIsGalleryExpanded(false)}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 active:scale-95 text-white text-xs font-bold shadow-md shadow-violet-900/30 transition-all touch-manipulation"
              >
                <Check className="w-3.5 h-3.5 stroke-[3]" />
                <span>Done</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
});
