import { NextRequest } from "next/server";
import { isAdminEmail, isAdminUserId } from "@/lib/admin";
import { createClient } from "@/lib/supabase/server";

export const DEFAULT_PUBLIC_ADMIN_KEY = "studyroom_admin_secure_key";

export function getValidAdminKeys(): string[] {
  const keys: string[] = [DEFAULT_PUBLIC_ADMIN_KEY];
  if (process.env.PUBLIC_SITE_ADMIN_KEY) {
    keys.push(process.env.PUBLIC_SITE_ADMIN_KEY.trim());
  }
  if (process.env.CRON_SECRET) {
    keys.push(process.env.CRON_SECRET.trim());
  }
  return keys;
}

export function isMatchingAdminKey(key: string | null | undefined): boolean {
  if (!key) return false;
  const trimmed = key.trim();
  const validKeys = getValidAdminKeys();
  return validKeys.includes(trimmed);
}

export async function isAuthorizedAdmin(request: NextRequest): Promise<boolean> {
  // 1. Check Bearer token from header
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.substring(7).trim();
    if (isMatchingAdminKey(token)) return true;
  }

  // 2. Check HttpOnly cookie
  const cookieKey = request.cookies.get("public_site_admin_auth")?.value;
  if (isMatchingAdminKey(cookieKey)) return true;

  // 3. Check Supabase platform admin session
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user && (isAdminEmail(user.email) || isAdminUserId(user.id))) {
      return true;
    }
  } catch {
    // ignore
  }

  return false;
}
