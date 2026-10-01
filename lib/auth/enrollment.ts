import crypto from "crypto";
import { NextResponse, type NextRequest } from "next/server";

export const ENROLLMENT_COOKIE_NAME = "studyroom_enrollment_token";
export const CLAIM_SECRET_COOKIE_NAME = "studyroom_utr_claim";
export const ADMIN_AUTH_COOKIE_NAME = "public_site_admin_auth";

/**
 * Generate a 32-byte CSPRNG hex bearer token.
 */
export function generateEnrollmentToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Compute SHA-256 hex digest of a string or buffer.
 */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Generate a 4-digit human OTP between '0000' and '9999' using CSPRNG.
 * Preserves leading zeros.
 */
export function generateOtpCode(): string {
  return crypto.randomInt(0, 10000).toString().padStart(4, "0");
}

/**
 * Generate a 32-byte CSPRNG hex creation nonce for two-phase signup.
 */
export function generateCreationNonce(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Generate a 32-byte CSPRNG hex claim secret for pending payment matching.
 */
export function generateClaimSecret(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Set the HttpOnly enrollment token cookie on a NextResponse.
 */
export function setEnrollmentTokenCookie(response: NextResponse, token: string): void {
  const isProd = process.env.NODE_ENV === "production";
  response.cookies.set(ENROLLMENT_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24, // 24 hours
  });
}

/**
 * Clear the enrollment token cookie.
 */
export function clearEnrollmentTokenCookie(response: NextResponse): void {
  response.cookies.set(ENROLLMENT_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

/**
 * Set the HttpOnly payment claim cookie on a NextResponse.
 */
export function setClaimSecretCookie(response: NextResponse, secret: string): void {
  const isProd = process.env.NODE_ENV === "production";
  response.cookies.set(CLAIM_SECRET_COOKIE_NAME, secret, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/api/public-website",
    maxAge: 60 * 60 * 24, // 24 hours
  });
}

/**
 * Clear the payment claim cookie.
 */
export function clearClaimSecretCookie(response: NextResponse): void {
  response.cookies.set(CLAIM_SECRET_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/public-website",
    maxAge: 0,
  });
}

/**
 * Extract client IP from standard reverse proxy headers.
 */
export function extractClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp) {
    return cfIp.trim();
  }
  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp.trim();
  }
  return "127.0.0.1";
}

// In-Memory Sliding Window Rate Limiter
interface RateLimitEntry {
  timestamps: number[];
}
const rateLimitStore = new Map<string, RateLimitEntry>();

// Periodic cleanup of expired rate limit entries every 10 minutes
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore.entries()) {
      entry.timestamps = entry.timestamps.filter((ts) => now - ts < 15 * 60 * 1000);
      if (entry.timestamps.length === 0) {
        rateLimitStore.delete(key);
      }
    }
  }, 10 * 60 * 1000);
}

/**
 * Check and record a rate limit hit for a key (e.g. IP or IP+action).
 * Returns { allowed: boolean, remaining: number, resetMs: number }.
 */
export function checkRateLimit(
  key: string,
  limit: number = 5,
  windowMs: number = 10 * 60 * 1000
): { allowed: boolean; remaining: number; resetMs: number } {
  const now = Date.now();
  let entry = rateLimitStore.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    rateLimitStore.set(key, entry);
  }

  // Remove timestamps outside window
  entry.timestamps = entry.timestamps.filter((ts) => now - ts < windowMs);

  if (entry.timestamps.length >= limit) {
    const oldest = entry.timestamps[0];
    const resetMs = Math.max(0, windowMs - (now - oldest));
    return { allowed: false, remaining: 0, resetMs };
  }

  entry.timestamps.push(now);
  return {
    allowed: true,
    remaining: limit - entry.timestamps.length,
    resetMs: windowMs,
  };
}
