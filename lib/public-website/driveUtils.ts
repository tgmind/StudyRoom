/**
 * Utility functions for Google Drive image links and UPI URLs.
 */

/**
 * Extracts the file ID from various formats of Google Drive sharing links.
 */
export function extractDriveId(url: string | null | undefined): string | null {
  if (!url || typeof url !== "string") return null;

  const trimmed = url.trim();
  if (trimmed.includes("PASTE_YOUR_GOOGLE_DRIVE")) return null;

  // Format: https://drive.google.com/file/d/FILE_ID/view?usp=sharing
  const fileMatch = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileMatch && fileMatch[1]) return fileMatch[1];

  // Format: https://drive.google.com/open?id=FILE_ID or https://drive.google.com/uc?id=FILE_ID
  try {
    const parsed = new URL(trimmed);
    const id = parsed.searchParams.get("id");
    if (id) return id;
  } catch {
    // If not a full URL with protocol, check if user pasted raw ID
    if (/^[a-zA-Z0-9_-]{20,50}$/.test(trimmed)) {
      return trimmed;
    }
  }

  return null;
}

/**
 * Returns prioritized URLs for rendering a Google Drive image in an <img> tag.
 * Google Drive's thumbnail endpoint is consistently the most reliable.
 */
export function getDriveImageUrls(url: string | null | undefined): string[] {
  if (!url) return [];
  const id = extractDriveId(url);
  if (!id) return [url];

  return [
    `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w1200`,
    `https://drive.google.com/uc?export=view&id=${encodeURIComponent(id)}`,
    `https://drive.usercontent.google.com/download?id=${encodeURIComponent(id)}&export=view`,
  ];
}

/**
 * Returns direct download link for Google Drive file.
 */
export function getDriveDownloadUrl(url: string | null | undefined): string {
  if (!url) return "#";
  const id = extractDriveId(url);
  if (!id) return url;

  return `https://drive.usercontent.google.com/download?id=${encodeURIComponent(id)}&export=download`;
}

/**
 * Validates if the string is a recognized Google Drive URL or direct image URL.
 */
export function isValidImageUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== "string") return false;
  const trimmed = url.trim();
  if (extractDriveId(trimmed)) return true;
  return /^(https?:\/\/.*\.(?:png|jpg|jpeg|gif|webp|svg))(\?.*)?$/i.test(trimmed);
}

/**
 * Generates a standard UPI intent payment URI.
 */
export function generateUpiUri(options: {
  payeeAddress: string;
  payeeName: string;
  amount: number;
  currency?: string;
  transactionNote?: string;
}): string {
  const { payeeAddress, payeeName, amount, currency = "INR", transactionNote = "Study Room Lifetime Access" } = options;
  const params = new URLSearchParams({
    pa: payeeAddress,
    pn: payeeName,
    am: amount.toFixed(2),
    cu: currency,
    tn: transactionNote,
  });
  return `upi://pay?${params.toString()}`;
}

/**
 * Returns the canonical direct link for sharing the public website.
 */
export function getPublicSiteShareUrl(): string {
  if (typeof window !== "undefined" && window.location) {
    if (window.location.origin.includes("localhost") || window.location.origin.includes("127.0.0.1")) {
      return "https://studyalive.netlify.app/public";
    }
    return `${window.location.origin}/public`;
  }
  return "https://studyalive.netlify.app/public";
}

/**
 * Shares the public website using the Web Share API when supported,
 * falling back to copying the direct link to the clipboard.
 */
export async function sharePublicSite(): Promise<"shared" | "copied" | "failed"> {
  const url = getPublicSiteShareUrl();
  const shareData = {
    title: "Study Room — Live Group Study, Built for Consistency",
    text: "Join me in Study Room! A focused, silent, server-synchronized virtual study platform for serious students.",
    url,
  };

  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share(shareData);
      return "shared";
    } catch (err: any) {
      if (err?.name === "AbortError") {
        return "failed";
      }
    }
  }

  if (typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    try {
      await navigator.clipboard.writeText(url);
      return "copied";
    } catch {
      return "failed";
    }
  }

  return "failed";
}

