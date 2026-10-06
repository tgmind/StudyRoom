/**
 * Strict server-side and client-side URL validation utility for social links.
 * Enforces http/https protocols and protects against script injections and invalid links.
 */
export function isValidHttpUrl(candidate: unknown): boolean {
  if (typeof candidate !== "string") return false;
  const trimmed = candidate.trim();
  if (!trimmed) return false;

  try {
    const parsed = new URL(trimmed);
    // Strictly allow only http and https protocols
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }
    // Hostname must be present and contain at least one dot or be localhost
    if (!parsed.hostname || (!parsed.hostname.includes(".") && parsed.hostname !== "localhost")) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Trims and normalizes a candidate URL string.
 */
export function normalizeUrl(url: string): string {
  return url.trim();
}
