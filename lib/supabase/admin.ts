import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-Side Supabase Admin Client
 *
 * Exclusively for secure background jobs, cron endpoints, and administrative tasks.
 * Uses SUPABASE_SERVICE_ROLE_KEY to execute SECURITY DEFINER RPCs with service_role privileges.
 * NEVER import or expose this client in client-side / browser components.
 */
export function createAdminClient(): SupabaseClient<any, "public", any> | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  // Defense-in-depth guard: Prevent unit tests from obtaining live production clients unless explicitly configured
  if (process.env.NODE_ENV === "test" || process.env.VITEST === "true") {
    if (process.env.ALLOW_LIVE_DB_TESTS !== "true") {
      throw new Error(
        "Security Violation: An unmocked live Supabase admin client was requested during unit testing. " +
        "Unit tests must mock @/lib/supabase/admin or explicitly set ALLOW_LIVE_DB_TESTS=true with an isolated test database."
      );
    }
  }

  return createClient<any>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
