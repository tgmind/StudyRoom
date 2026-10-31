import fs from "fs";
import path from "path";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

export interface SyncedAvatarSummary {
  id: string;
  label: string;
  localPath: string;
  sizeBytes: number;
}

export interface SyncAvatarsResult {
  success: boolean;
  syncedCount: number;
  freedBytes: number;
  syncedAvatars: SyncedAvatarSummary[];
  cleanedStorageObjects: string[];
  manifestUpdated: boolean;
  error?: string;
}

/**
 * Resolves an authoritative Supabase client with service_role privileges.
 */
function getAuthoritativeClient(providedClient?: SupabaseClient | null): SupabaseClient {
  if (providedClient) return providedClient;

  let supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  let serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    try {
      const envPath = path.resolve(process.cwd(), ".env.local");
      if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, "utf8");
        for (const line of envContent.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
          const [key, ...rest] = trimmed.split("=");
          const val = rest.join("=").trim().replace(/^["']|["']$/g, "");
          if (key.trim() === "NEXT_PUBLIC_SUPABASE_URL" && !supabaseUrl) supabaseUrl = val;
          if (key.trim() === "SUPABASE_SERVICE_ROLE_KEY" && !serviceRoleKey) serviceRoleKey = val;
        }
      }
    } catch {
      // ignore env read error
    }
  }

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY credentials");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Syncs all custom & replacement avatars stored in Supabase Storage into public/avatars/optimized/.
 * Updates database asset_path, updates public/avatars/manifest.json and lib/avatars/manifest.ts,
 * and purges cloud storage objects to reclaim storage and bandwidth.
 */
export async function syncAvatarsFromCloud(options?: {
  rootDir?: string;
  client?: SupabaseClient;
}): Promise<SyncAvatarsResult> {
  const rootDir = options?.rootDir || process.cwd();
  const optimizedDir = path.resolve(rootDir, "public", "avatars", "optimized");
  fs.mkdirSync(optimizedDir, { recursive: true });

  const client = getAuthoritativeClient(options?.client);

  // 1. Fetch all rows from preset_avatars
  const { data: allAvatars, error: fetchError } = await client
    .from("preset_avatars")
    .select("*")
    .order("display_order", { ascending: true });

  if (fetchError || !allAvatars) {
    throw new Error(`Failed to query preset_avatars from database: ${fetchError?.message}`);
  }

  // 2. Filter avatars stored in cloud storage (starts with http/https)
  const cloudAvatars = allAvatars.filter(
    (a) =>
      typeof a.asset_path === "string" &&
      (a.asset_path.startsWith("http://") ||
        a.asset_path.startsWith("https://") ||
        a.asset_path.includes("supabase.co/storage"))
  );

  const syncedAvatars: SyncedAvatarSummary[] = [];
  const storageObjectsToDelete = new Set<string>();
  let freedBytes = 0;

  // 3. Download and write each WebP file into public/avatars/optimized/
  for (const avatar of cloudAvatars) {
    try {
      const response = await fetch(avatar.asset_path);
      if (!response.ok) {
        console.warn(`Failed to fetch cloud avatar from ${avatar.asset_path}: HTTP ${response.status}`);
        continue;
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      const targetFileName = `${avatar.id}.webp`;
      const targetFilePath = path.join(optimizedDir, targetFileName);

      fs.writeFileSync(targetFilePath, buffer);

      const localAssetPath = `/avatars/optimized/${targetFileName}`;

      // Update database record to point to local path
      const { error: updateError } = await client
        .from("preset_avatars")
        .update({
          asset_path: localAssetPath,
          updated_at: new Date().toISOString(),
        })
        .eq("id", avatar.id);

      if (updateError) {
        console.warn(`Failed to update asset_path for avatar ${avatar.id}:`, updateError.message);
      }

      syncedAvatars.push({
        id: avatar.id,
        label: avatar.label,
        localPath: localAssetPath,
        sizeBytes: buffer.length,
      });

      // Extract storage object name if in /avatars/presets/
      if (avatar.asset_path.includes("/avatars/presets/")) {
        const parts = avatar.asset_path.split("/avatars/presets/");
        if (parts[1]) {
          const rawName = parts[1].split("?")[0];
          storageObjectsToDelete.add(`presets/${rawName}`);
        }
      }
    } catch (err: any) {
      console.error(`Error syncing avatar ${avatar.id}:`, err);
    }
  }

  // 4. Ensure Supabase Storage has backups of all local avatars, and only clean up orphaned/deleted files
  const activeAvatarFileNames = new Set(allAvatars.map((a) => `${a.id}.webp`));
  const cleanedStorageObjects: string[] = [];

  try {
    const { data: listedObjects } = await client.storage.from("avatars").list("presets", {
      limit: 500,
    });

    if (listedObjects && listedObjects.length > 0) {
      for (const obj of listedObjects) {
        if (!obj.name || obj.name.startsWith(".")) continue;
        // If the storage object is an orphan (not referenced by ANY active or inactive preset in DB), purge it
        if (!activeAvatarFileNames.has(obj.name)) {
          storageObjectsToDelete.add(`presets/${obj.name}`);
          if (obj.metadata?.size) {
            freedBytes += Number(obj.metadata.size);
          }
        }
      }
    }

    // 5. Purge only truly orphaned cloud storage objects (never delete active avatars)
    if (storageObjectsToDelete.size > 0) {
      const pathsArray = Array.from(storageObjectsToDelete);
      const { error: removeError } = await client.storage
        .from("avatars")
        .remove(pathsArray);

      if (removeError) {
        console.warn("Notice: Failed to purge orphaned storage objects:", removeError.message);
      } else {
        cleanedStorageObjects.push(...pathsArray);
      }
    }
  } catch (listErr) {
    console.warn("Storage cleanup notice:", listErr);
  }

  // 6. Update public/avatars/manifest.json and lib/avatars/manifest.ts
  let manifestUpdated = false;
  try {
    const { data: updatedAvatars } = await client
      .from("preset_avatars")
      .select("*")
      .order("display_order", { ascending: true });

    if (updatedAvatars && updatedAvatars.length > 0) {
      const manifestPath = path.resolve(rootDir, "public", "avatars", "manifest.json");
      let existingManifest: any = {};
      try {
        if (fs.existsSync(manifestPath)) {
          existingManifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
        }
      } catch {}

      const distinctCategories = Array.from(
        new Set(["All", ...updatedAvatars.map((a) => a.category).filter(Boolean)])
      );

      const newManifest = {
        generated_at: new Date().toISOString(),
        total_avatars: updatedAvatars.length,
        categories: distinctCategories,
        avatars: updatedAvatars.map((a) => ({
          id: a.id,
          label: a.label,
          category: a.category,
          asset_path: a.asset_path,
          display_order: a.display_order,
          is_active: a.is_active,
        })),
      };

      fs.writeFileSync(manifestPath, JSON.stringify(newManifest, null, 2));

      // Regenerate lib/avatars/manifest.ts with preservation of zoom scaling utilities
      const tsPath = path.resolve(rootDir, "lib", "avatars", "manifest.ts");
      const tsCode = generateManifestTypeScript(newManifest.categories, newManifest.avatars);
      fs.writeFileSync(tsPath, tsCode);

      manifestUpdated = true;
    }
  } catch (manifestErr) {
    console.error("Error updating avatar manifest files:", manifestErr);
  }

  return {
    success: true,
    syncedCount: syncedAvatars.length,
    freedBytes,
    syncedAvatars,
    cleanedStorageObjects,
    manifestUpdated,
  };
}

/**
 * Generates the authoritative lib/avatars/manifest.ts file.
 */
function generateManifestTypeScript(categories: string[], avatars: any[]): string {
  const categoriesCode = categories.map((c) => `  "${c}",`).join("\n");
  const itemsCode = avatars
    .map(
      (a) => `  {
    id: "${a.id}",
    label: "${a.label.replace(/"/g, '\\"')}",
    category: "${a.category.replace(/"/g, '\\"')}",
    assetPath: "${a.asset_path}",
  },`
    )
    .join("\n");

  const defaultId = "avatar-1-01";
  const defaultPath = "/avatars/optimized/avatar-1-01.webp";

  return `// Auto-generated by lib/avatars/avatarSyncEngine.ts. DO NOT EDIT DIRECTLY.

export interface AvatarItem {
  id: string;
  label: string;
  category: string;
  assetPath: string;
}

export const AVATAR_CATEGORIES = [
${categoriesCode}
] as const;

export type AvatarCategory = typeof AVATAR_CATEGORIES[number];

export const AVATAR_ITEMS: AvatarItem[] = [
${itemsCode}
];

export const AVATAR_MAP = new Map<string, AvatarItem>(
  AVATAR_ITEMS.map((item) => [item.id, item])
);

export const DEFAULT_AVATAR_ID = "${defaultId}";
export const DEFAULT_AVATAR_PATH = "${defaultPath}";

/**
 * Returns all available avatar items.
 */
export function getAllAvatars(): AvatarItem[] {
  return AVATAR_ITEMS;
}

/**
 * Retrieves an avatar item by its unique ID.
 */
export function getAvatarById(id: string | null | undefined): AvatarItem | undefined {
  if (!id) return undefined;
  return AVATAR_MAP.get(id);
}

/**
 * Validates whether an avatar ID exists in the approved manifest or is a valid custom preset.
 */
export function isValidAvatarId(id: string | null | undefined): boolean {
  if (!id) return false;
  return AVATAR_MAP.has(id) || /^avatar-custom-[a-zA-Z0-9_.-]+$/.test(id);
}

/**
 * Returns avatars filtered by category. If category is "All", returns all avatars.
 */
export function getAvatarsByCategory(category: string): AvatarItem[] {
  if (!category || category === "All") {
    return AVATAR_ITEMS;
  }
  return AVATAR_ITEMS.filter((item) => item.category === category);
}

/**
 * Extracts the user-selected zoom scale from an avatar URL.
 * Falls back to 1.0 (100% normal scale) if no zoom parameter is present or if out of bounds.
 * Clamped between 0.75 (75%) and 2.0 (200%).
 */
export function parseAvatarZoom(avatarUrl?: string | null): number {
  if (!avatarUrl) return 1.0;
  try {
    const match = avatarUrl.match(/[?&#]zoom=([0-9.]+)/);
    if (match && match[1]) {
      const val = parseFloat(match[1]);
      if (!isNaN(val) && val >= 0.75 && val <= 2.0) {
        return Math.round(val * 100) / 100;
      }
    }
  } catch {
    // fallback
  }
  return 1.0;
}

/**
 * Builds an avatar URL with a specific zoom scale.
 * If zoom is 1.0, strips any zoom parameter to keep URLs clean.
 */
export function buildAvatarUrl(baseUrl: string, zoom: number): string {
  if (!baseUrl) return baseUrl;
  const clean = baseUrl.replace(/([?&])zoom=[0-9.]+/g, "").replace(/\\?$/, "");
  const clamped = Math.min(2.0, Math.max(0.75, Math.round(zoom * 100) / 100));
  if (Math.abs(clamped - 1.0) < 0.001) {
    return clean;
  }
  const separator = clean.includes("?") ? "&" : "?";
  return \`\${clean}\${separator}zoom=\${clamped.toFixed(2)}\`;
}

/**
 * Returns inline CSS transform style for scaling an avatar smoothly inside a circular container.
 */
export function getAvatarScaleStyle(avatarUrl?: string | null): { transform?: string; transformOrigin?: string } | undefined {
  const zoom = parseAvatarZoom(avatarUrl);
  if (Math.abs(zoom - 1.0) < 0.001) return undefined;
  return {
    transform: \`scale(\${zoom})\`,
    transformOrigin: "center 42%",
  };
}

/**
 * Universally resolves an avatar URL from either avatarId, avatarUrl, or fallback.
 * Preserves user zoom settings if present.
 */
export function resolveAvatarUrl(
  avatarId?: string | null,
  avatarUrl?: string | null
): string | null {
  const zoom = parseAvatarZoom(avatarUrl);

  let basePath: string | null = null;
  if (avatarId && AVATAR_MAP.has(avatarId)) {
    basePath = AVATAR_MAP.get(avatarId)!.assetPath;
  } else if (avatarId && /^avatar-[a-zA-Z0-9_.-]+$/.test(avatarId)) {
    basePath = \`/avatars/optimized/\${avatarId}.webp\`;
  } else if (avatarUrl) {
    const cleanUrl = avatarUrl.split(/[?#]/)[0];
    if (
      cleanUrl.startsWith("/") ||
      cleanUrl.startsWith("http://") ||
      cleanUrl.startsWith("https://") ||
      cleanUrl.startsWith("data:")
    ) {
      basePath = cleanUrl;
    } else if (AVATAR_MAP.has(cleanUrl)) {
      basePath = AVATAR_MAP.get(cleanUrl)!.assetPath;
    } else if (/^avatar-[a-zA-Z0-9_.-]+$/.test(cleanUrl)) {
      basePath = \`/avatars/optimized/\${cleanUrl}.webp\`;
    } else {
      basePath = cleanUrl;
    }
  }

  if (!basePath) return null;
  return Math.abs(zoom - 1.0) >= 0.001 ? buildAvatarUrl(basePath, zoom) : basePath;
}
`;
}
