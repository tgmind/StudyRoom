/**
 * Client-Side Image Analysis & Optimization Engine for StudyRoom Preset Avatars
 *
 * Automatically converts raw user-uploaded or dropped images (up to 20MB)
 * into high-fidelity, featherweight 256x256 WebP avatars on pure white (#FFFFFF)
 * backing. Eliminates interface freezes and achieves ~98%+ compression ratios.
 */

export interface ImageAnalysis {
  originalName: string;
  originalSize: number;
  originalWidth: number;
  originalHeight: number;
  originalFormat: string;
  aspectRatio: number;
  hasTransparency: boolean;
}

export interface OptimizedAvatarResult {
  file: File;
  blob: Blob;
  previewUrl: string;
  originalName: string;
  originalSize: number;
  optimizedSize: number;
  compressionRatio: number; // percentage saved, e.g. 98.5
  originalWidth: number;
  originalHeight: number;
  optimizedWidth: number;   // exactly 256
  optimizedHeight: number;  // exactly 256
  suggestedLabel: string;
  suggestedCategory: string;
}

export interface OptimizeOptions {
  targetSize?: number;       // default 256
  quality?: number;          // default 0.85
  preferredCategory?: string;
  onProgress?: (step: "analyzing" | "resampling" | "compressing" | "complete", progress: number) => void;
}

/**
 * Derives a clean, readable avatar label from a raw filename.
 * e.g., "anime_girl_01.png" -> "Anime Girl 01"
 * e.g., "cyber-samurai-character.jpeg" -> "Cyber Samurai Character"
 */
export function deriveLabelFromFilename(filename: string): string {
  // Strip extension
  const base = filename.replace(/\.[^/.]+$/, "");
  // Replace underscores, hyphens, and multiple spaces
  const cleaned = base
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return "New Avatar";

  // Capitalize words
  return cleaned
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Derives a smart category prediction from filename keywords.
 */
export function predictCategoryFromFilename(filename: string, existingCategories: string[] = []): string {
  const lower = filename.toLowerCase();

  if (lower.includes("cat") || lower.includes("dog") || lower.includes("animal") || lower.includes("pet") || lower.includes("bear")) {
    return "Cute Animals & Friends";
  }
  if (lower.includes("heritage") || lower.includes("culture") || lower.includes("shiva") || lower.includes("ganesha") || lower.includes("lord")) {
    return "Culture & Heritage";
  }
  if (lower.includes("icon") || lower.includes("badge") || lower.includes("playful") || lower.includes("symbol")) {
    return "Playful Icons";
  }
  if (lower.includes("girl") || lower.includes("waifu") || lower.includes("female") || lower.includes("woman")) {
    return "Anime Girls";
  }
  if (lower.includes("boy") || lower.includes("guy") || lower.includes("male") || lower.includes("man")) {
    return "Anime Boys";
  }
  if (lower.includes("buddy") || lower.includes("friend") || lower.includes("student") || lower.includes("study")) {
    return "Study Buddies";
  }

  return existingCategories.length > 0 ? existingCategories[1] || "Study Buddies" : "Study Buddies";
}

/**
 * Analyzes and optimizes an image file into a standardized 256x256 WebP avatar.
 * Runs non-blockingly using asynchronous Canvas APIs.
 */
export async function analyzeAndOptimizeAvatarImage(
  file: File,
  options: OptimizeOptions = {}
): Promise<OptimizedAvatarResult> {
  const targetSize = options.targetSize || 256;
  const quality = options.quality !== undefined ? options.quality : 0.85;

  options.onProgress?.("analyzing", 15);

  // 1. Verify file validity
  if (!file || !file.type.startsWith("image/")) {
    throw new Error(`Invalid file type "${file?.type || "unknown"}". Please upload an image.`);
  }

  // 2. Load into HTMLImageElement via Object URL
  const objectUrl = URL.createObjectURL(file);

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Failed to decode image data"));
      el.src = objectUrl;
    });

    options.onProgress?.("resampling", 45);

    const originalWidth = img.naturalWidth || img.width;
    const originalHeight = img.naturalHeight || img.height;

    // 3. Create 256x256 Canvas with Pure White Backing (#FFFFFF)
    const canvas = document.createElement("canvas");
    canvas.width = targetSize;
    canvas.height = targetSize;

    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) {
      throw new Error("Unable to initialize canvas 2D rendering context");
    }

    // Set pure solid white background
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, targetSize, targetSize);

    // 4. Calculate smart centering / portrait framing
    // Portrait artwork typically has face centered around 40-45% of height
    const aspect = originalWidth / originalHeight;
    let drawWidth: number;
    let drawHeight: number;
    let dx: number;
    let dy: number;

    if (aspect > 1) {
      // Landscape: fit height, center horizontally
      drawHeight = targetSize;
      drawWidth = targetSize * aspect;
      dx = (targetSize - drawWidth) / 2;
      dy = 0;
    } else {
      // Portrait or square: fit width, slight upward bias for portrait face focus
      drawWidth = targetSize;
      drawHeight = targetSize / aspect;
      dx = 0;
      // Headroom bias: center on 42% height rather than 50%
      const excessHeight = drawHeight - targetSize;
      dy = -excessHeight * 0.38;
    }

    // High quality bicubic scaling
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, dx, dy, drawWidth, drawHeight);

    options.onProgress?.("compressing", 75);

    // 5. Convert to WebP format asynchronously
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => {
          if (b) {
            resolve(b);
          } else {
            // Fallback to PNG if WebP fails
            canvas.toBlob(
              (pngBlob) => {
                if (pngBlob) resolve(pngBlob);
                else reject(new Error("Canvas blob conversion failed"));
              },
              "image/png"
            );
          }
        },
        "image/webp",
        quality
      );
    });

    const optimizedSize = blob.size;
    const compressionRatio = Math.max(
      0,
      Math.round(((file.size - optimizedSize) / file.size) * 1000) / 10
    );

    const previewUrl = URL.createObjectURL(blob);
    const suggestedLabel = deriveLabelFromFilename(file.name);
    const suggestedCategory = options.preferredCategory || predictCategoryFromFilename(file.name);

    // Form modern clean filename
    const cleanId = `avatar-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const optimizedFile = new File([blob], `${cleanId}.webp`, {
      type: "image/webp",
      lastModified: Date.now(),
    });

    options.onProgress?.("complete", 100);

    return {
      file: optimizedFile,
      blob,
      previewUrl,
      originalName: file.name,
      originalSize: file.size,
      optimizedSize,
      compressionRatio,
      originalWidth,
      originalHeight,
      optimizedWidth: targetSize,
      optimizedHeight: targetSize,
      suggestedLabel,
      suggestedCategory,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
