import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

/**
 * Server-Side Supabase Admin Client
 *
 * Exclusively for secure background jobs, cron endpoints, and administrative tasks.
 * Uses SUPABASE_SERVICE_ROLE_KEY to execute SECURITY DEFINER RPCs with service_role privileges.
 * NEVER import or expose this client in client-side / browser components.
 */
export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
