"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  fullScreenMobile?: boolean;
  closeOnBackdropClick?: boolean;
  hideCloseButton?: boolean;
  disableEscape?: boolean;
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "4xl" | "5xl" | "full";
}

const maxWidthClasses: Record<string, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  "2xl": "max-w-2xl",
  "3xl": "max-w-3xl",
  "4xl": "max-w-4xl",
  "5xl": "max-w-5xl",
  full: "max-w-[95vw]",
};

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  fullScreenMobile = false,
  closeOnBackdropClick = true,
  hideCloseButton = false,
  disableEscape = false,
  maxWidth = "lg",
}: ModalProps) {
  const [mounted, setMounted] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const disableEscapeRef = useRef(disableEscape);
  disableEscapeRef.current = disableEscape;

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape" && !disableEscapeRef.current) {
      onCloseRef.current();
      return;
    }

    if (e.key === "Tab") {
      if (!dialogRef.current) return;
      const focusableElements = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      ).filter((el) => {
        if (el.hasAttribute("disabled") || el.getAttribute("aria-hidden") === "true") return false;
        if (typeof window !== "undefined") {
          try {
            const style = window.getComputedStyle(el);
            if (style.display === "none" || style.visibility === "hidden") return false;
          } catch (_) {}
        }
        return true;
      });

      if (focusableElements.length === 0) {
        e.preventDefault();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === firstElement || !dialogRef.current.contains(document.activeElement)) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        if (document.activeElement === lastElement || !dialogRef.current.contains(document.activeElement)) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
      previousActiveElementRef.current = document.activeElement;
    }

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    // Disable Android SwipeRefreshLayout while modal is open to prevent touch interception
    if (typeof window !== "undefined" && (window as any).AndroidBridge?.setSwipeRefreshEnabled) {
      try {
        (window as any).AndroidBridge.setSwipeRefreshEnabled(false);
      } catch (e) {}
    }

    // Initial focus management: run once on open, but never steal focus if user/browser already placed focus inside
    const focusTimer = setTimeout(() => {
      if (!dialogRef.current) return;
      if (document.activeElement && dialogRef.current.contains(document.activeElement)) {
        return;
      }
      const autoFocusEl = dialogRef.current.querySelector<HTMLElement>("[autofocus]");
      if (autoFocusEl && typeof autoFocusEl.focus === "function") {
        autoFocusEl.focus();
        return;
      }
      const focusableElements = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      );
      if (focusableElements.length > 0 && typeof focusableElements[0].focus === "function") {
        focusableElements[0].focus();
      } else if (typeof dialogRef.current.focus === "function") {
        dialogRef.current.focus();
      }
    }, 50);

    return () => {
      clearTimeout(focusTimer);
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);

      // Restore focus to previously active element ONLY when modal is closed
      if (previousActiveElementRef.current && typeof previousActiveElementRef.current.focus === "function") {
        try {
          previousActiveElementRef.current.focus();
        } catch (_) {}
        previousActiveElementRef.current = null;
      }

      // Re-enable Android SwipeRefreshLayout when modal is closed
      if (typeof window !== "undefined" && (window as any).AndroidBridge?.setSwipeRefreshEnabled) {
        try {
          (window as any).AndroidBridge.setSwipeRefreshEnabled(true);
        } catch (e) {}
      }
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen || !mounted) return null;

  const modalContent = (
    <div
      className="fixed inset-0 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in"
      style={{
        zIndex: 99999,
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: "100%",
        height: "100%",
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      onClick={(e) => {
        if (closeOnBackdropClick && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className={`w-full ${maxWidthClasses[maxWidth] || "max-w-lg"} bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col focus:outline-none ${
          fullScreenMobile
            ? "h-full max-h-[92vh] sm:h-auto sm:max-h-[85vh]"
            : "max-h-[90vh]"
        }`}
        style={{ zIndex: 100000 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-zinc-800 bg-zinc-900/60 shrink-0">
          <div className="min-w-0 flex-1">
            <h2 id="modal-title" className="text-sm sm:text-base font-bold text-zinc-100 leading-snug break-words">
              {title}
            </h2>
            {subtitle && (
              <p className="text-[11px] sm:text-xs text-zinc-400 mt-0.5 break-words leading-relaxed">{subtitle}</p>
            )}
          </div>
          {!hideCloseButton && (
            <button
              onClick={onClose}
              type="button"
              aria-label="Close dialog"
              className="p-1 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center shrink-0 ml-2 touch-manipulation"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Modal Content */}
        <div
          className="p-4 sm:p-5 overflow-y-auto flex-1 min-h-0"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {children}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
