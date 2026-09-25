import { PaymentSubmission } from "./types";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// In-memory queue shared between submission endpoint and admin review endpoint
export const inMemorySubmissions: PaymentSubmission[] = [];

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Delete a single submission by ID from memory and database
 */
export async function deleteSubmission(id: string): Promise<boolean> {
  const cleanId = String(id || "").trim();
  if (!cleanId) {
    throw new Error("Submission ID is required to delete.");
  }

  const isUuid = UUID_REGEX.test(cleanId);
  const adminClient = createAdminClient();
  if (adminClient && isUuid) {
    const { data, error } = await (adminClient as any)
      .from("public_payment_submissions")
      .delete()
      .eq("id", cleanId)
      .select();

    if (error) {
      console.error("Database error deleting submission:", error);
      throw new Error(`Database error deleting submission: ${error.message}`);
    }
  } else if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NODE_ENV !== "test" && !isUuid) {
    throw new Error("Invalid submission ID format.");
  } else if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NODE_ENV !== "test" && !adminClient) {
    throw new Error("Server configuration error: SUPABASE_SERVICE_ROLE_KEY is required for admin database mutations.");
  }

  const idx = inMemorySubmissions.findIndex((s) => s.id === cleanId);
  if (idx !== -1) {
    inMemorySubmissions.splice(idx, 1);
  }

  return true;
}

/**
 * Clear submissions by status or all from memory and database
 */
export async function clearSubmissions(filter?: { status?: string; all?: boolean }): Promise<boolean> {
  const adminClient = createAdminClient();
  if (adminClient) {
    let query = (adminClient as any).from("public_payment_submissions").delete();
    if (filter?.status) {
      query = query.eq("status", filter.status);
    } else {
      query = query.neq("id", "00000000-0000-0000-0000-000000000000");
    }
    const { data, error } = await query.select();
    if (error) {
      console.error("Database error clearing submissions:", error);
      throw new Error(`Database error clearing submissions: ${error.message}`);
    }
  } else if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NODE_ENV !== "test") {
    throw new Error("Server configuration error: SUPABASE_SERVICE_ROLE_KEY is required for admin database mutations.");
  }

  if (filter?.status) {
    for (let i = inMemorySubmissions.length - 1; i >= 0; i--) {
      if (inMemorySubmissions[i].status === filter.status) {
        inMemorySubmissions.splice(i, 1);
      }
    }
  } else if (filter?.all) {
    inMemorySubmissions.length = 0;
  }

  return true;
}
