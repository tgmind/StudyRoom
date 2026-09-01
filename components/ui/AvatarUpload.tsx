"use client";

import React, { useState, useRef } from "react";
import { Trash2, Loader2, UploadCloud } from "lucide-react";
import { uploadAvatar } from "@/lib/supabase/storage";
import { validateAvatarFile } from "@/lib/validation/schemas";

interface AvatarUploadProps {
  userId: string;
  currentAvatarUrl?: string | null;
  onAvatarUploaded: (publicUrl: string | null) => void;
  displayName?: string;
}

export function AvatarUpload({
  userId,
  currentAvatarUrl,
  onAvatarUploaded,
  displayName = "User",
}: AvatarUploadProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentAvatarUrl || null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const initials = displayName
    ? displayName.substring(0, 2).toUpperCase()
    : "??";

  const handleFileSelected = async (file: File) => {
    const validation = validateAvatarFile(file);
    if (!validation.isValid) {
      setError(validation.error || "Invalid file");
      return;
    }

    setError(null);
    setIsUploading(true);

    const localObjectUrl = URL.createObjectURL(file);
    setPreviewUrl(localObjectUrl);

    try {
      const publicUrl = await uploadAvatar(file, userId);
      setPreviewUrl(publicUrl);
      onAvatarUploaded(publicUrl);
    } catch (err) {
      console.error("Avatar upload failed:", err);
      setError(err instanceof Error ? err.message : "Failed to upload image");
      setPreviewUrl(currentAvatarUrl || null);
    } finally {
      setIsUploading(false);
      URL.revokeObjectURL(localObjectUrl);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelected(e.target.files[0]);
    }
  };

  const handleRemove = () => {
    setPreviewUrl(null);
    setError(null);
    onAvatarUploaded(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-3">
      <label className="block text-xs font-medium text-zinc-300">
        Profile Picture (Stored globally in PWA)
      </label>

      <div className="flex items-center space-x-4">
        {/* Avatar Preview Wrapper */}
        <div className="relative w-16 h-16 rounded-full bg-zinc-800 border-2 border-zinc-700 overflow-hidden shrink-0 aspect-square flex items-center justify-center text-zinc-100 font-extrabold text-lg shadow-inner">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt="Profile preview"
              className="w-full h-full object-cover object-center rounded-full block"
            />
          ) : (
            <span>{initials}</span>
          )}

          {isUploading && (
            <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
              <Loader2 className="w-5 h-5 text-zinc-100 animate-spin" />
            </div>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex-1 space-y-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={handleInputChange}
            className="hidden"
            id="avatar-file-input"
          />

          <div className="flex items-center space-x-2 flex-wrap gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="inline-flex items-center space-x-1.5 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 border border-zinc-700 text-zinc-100 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 min-h-[44px] touch-manipulation"
            >
              {isUploading ? (
                <Loader2 className="w-4 h-4 animate-spin text-zinc-300" />
              ) : (
                <UploadCloud className="w-4 h-4 text-zinc-300" />
              )}
              <span>{previewUrl ? "Change Photo" : "Upload Photo"}</span>
            </button>

            {previewUrl && !isUploading && (
              <button
                type="button"
                onClick={handleRemove}
                className="inline-flex items-center space-x-1 px-2.5 py-2 text-zinc-400 hover:text-red-400 hover:bg-red-950/20 border border-transparent rounded-lg text-xs font-medium transition-colors min-h-[44px] touch-manipulation"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Remove</span>
              </button>
            )}
          </div>

          <p className="text-[11px] text-zinc-500">
            JPG, PNG, WebP or GIF. Maximum file size: <strong>2 MB</strong>.
          </p>
        </div>
      </div>

      {error && <p className="text-xs font-medium text-red-400">{error}</p>}
    </div>
  );
}
