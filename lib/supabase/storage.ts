import { createClient } from "./client";
import { validateAvatarFile } from "@/lib/validation/schemas";

export interface UploadAvatarResult {
  publicUrl: string;
  filePath: string;
}

/**
 * Uploads a profile picture file to Supabase Storage bucket 'avatars'.
 * @param file The image File object
 * @param userId Authenticated user ID
 * @returns Public URL of the uploaded image
 */
export async function uploadAvatar(file: File, userId: string): Promise<string> {
  const validation = validateAvatarFile(file);
  if (!validation.isValid) {
    throw new Error(validation.error || "Invalid image file");
  }

  const supabase = createClient();

  // Extract file extension
  const fileExt = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const filePath = `${userId}/avatar-${Date.now()}.${fileExt}`;

  // Upload to Supabase Storage 'avatars' bucket
  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(filePath, file, {
      cacheControl: "3600",
      upsert: true,
      contentType: file.type,
    });

  if (uploadError) {
    console.error("Supabase avatar upload error:", uploadError);
    throw new Error(`Avatar upload failed: ${uploadError.message}`);
  }

  // Retrieve public URL
  const { data: urlData } = supabase.storage
    .from("avatars")
    .getPublicUrl(filePath);

  if (!urlData?.publicUrl) {
    throw new Error("Failed to retrieve public URL for uploaded avatar");
  }

  return urlData.publicUrl;
}

/**
 * Deletes user avatar files from 'avatars' bucket folder.
 */
export async function deleteAvatarFolder(userId: string): Promise<void> {
  const supabase = createClient();

  const { data: listData, error: listError } = await supabase.storage
    .from("avatars")
    .list(userId);

  if (listError || !listData || listData.length === 0) return;

  const filesToRemove = listData.map((f) => `${userId}/${f.name}`);
  await supabase.storage.from("avatars").remove(filesToRemove);
}
