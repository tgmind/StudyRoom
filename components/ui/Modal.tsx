"use client";

import React, { useEffect } from "react";
import { X } from "lucide-react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  fullScreenMobile?: boolean;
}

export function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  fullScreenMobile = false,
}: ModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
    }

    return () => {
      document.body.style.overflow = "unset";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div
        className={`w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden flex flex-col ${
          fullScreenMobile
            ? "h-full max-h-[92vh] sm:h-auto sm:max-h-[85vh]"
            : "max-h-[90vh]"
        }`}
      >
        {/* Modal Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-zinc-800 bg-zinc-900/50">
          <div>
            <h2 id="modal-title" className="text-base font-semibold text-zinc-100">
              {title}
            </h2>
            {subtitle && (
              <p className="text-xs text-zinc-400 mt-0.5">{subtitle}</p>
            )}
          </div>
          <button
            onClick={onClose}
            type="button"
            aria-label="Close dialog"
            className="p-1 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-5 overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  );
}
