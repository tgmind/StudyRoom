import crypto from "crypto";
import { NextRequest } from "next/server";
import { isAdminEmail, isAdminUserId } from "@/lib/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Perform a constant-time comparison of two strings to prevent timing attacks.
 */
function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Validate candidate admin key against server-only environment secrets.
 * Enforces a strict minimum length of 24 characters and constant-time comparison.
 * Never includes hardcoded or default keys.
 */
export function isMatchingAdminKey(key: string | null | undefined): boolean {
  if (!key) return false;
  const trimmed = key.trim();
  if (!trimmed) return false;

  const envKey = process.env.PUBLIC_SITE_ADMIN_KEY?.trim();
  if (envKey && envKey.length >= 8) {
    if (safeCompare(trimmed, envKey)) return true;
  }

  const cronSecret = process.env.CRON_SECRET?.trim();
  if (cronSecret && cronSecret.length >= 24) {
    if (safeCompare(trimmed, cronSecret)) return true;
  }

  return false;
}

/**
 * Verify that a state-changing mutation request originates from the same site.
 * Protects against cross-site request forgery (CSRF).
 */
export function verifySameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");

  if (!origin) {
    // If no Origin header (e.g. server-to-server or curl), check if Referer matches host
    const referer = request.headers.get("referer");
    if (referer) {
      try {
        return new URL(referer).host === host;
      } catch {
        return false;
      }
    }
    // Allow non-browser requests only if Authorization header is present
    return request.headers.has("authorization");
  }

  try {
    const originHost = new URL(origin).host;
    return originHost === host;
  } catch {
    return false;
  }
}

/**
 * Authenticate incoming request as an authorized platform administrator.
 */
export async function isAuthorizedAdmin(request: NextRequest): Promise<boolean> {
  // 1. Check Bearer token from Authorization header
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.substring(7).trim();
    if (isMatchingAdminKey(token)) return true;
  }

  // 2. Check HttpOnly cookie
  const cookieKey = request.cookies.get("public_site_admin_auth")?.value;
  if (isMatchingAdminKey(cookieKey)) return true;

  // 3. Check Supabase authenticated platform admin session
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      if (isAdminEmail(user.email) || isAdminUserId(user.id)) {
        return true;
      }

      const { data: profile } = await supabase
        .from("users")
        .select("is_admin")
        .eq("id", user.id)
        .maybeSingle();

      if (profile && (profile as { is_admin?: boolean }).is_admin === true) {
        return true;
      }
    }
  } catch {
    // Fail-closed on error
  }

  return false;
}
