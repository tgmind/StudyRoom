import { PaymentSubmission } from "./types";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// In-memory queue shared between submission endpoint and admin review endpoint
export const inMemorySubmissions: PaymentSubmission[] = [];

/**
 * Delete a single submission by ID from memory and database
 */
export async function deleteSubmission(id: string): Promise<boolean> {
  const cleanId = String(id || "").trim();
  const idx = inMemorySubmissions.findIndex((s) => s.id === cleanId);
  if (idx !== -1) {
    inMemorySubmissions.splice(idx, 1);
  }

  try {
    const supabase = createAdminClient() || (await createClient());
    await (supabase as any).from("public_payment_submissions").delete().eq("id", cleanId);
    return true;
  } catch (err) {
    if (process.env.NODE_ENV !== "test") {
      console.warn("Could not delete submission from DB:", err);
    }
  }
  return true;
}

/**
 * Clear submissions by status or all from memory and database
 */
export async function clearSubmissions(filter?: { status?: string; all?: boolean }): Promise<boolean> {
  if (filter?.status) {
    for (let i = inMemorySubmissions.length - 1; i >= 0; i--) {
      if (inMemorySubmissions[i].status === filter.status) {
        inMemorySubmissions.splice(i, 1);
      }
    }
  } else if (filter?.all) {
    inMemorySubmissions.length = 0;
  }

  try {
    const supabase = createAdminClient() || (await createClient());
    let query = (supabase as any).from("public_payment_submissions").delete();
    if (filter?.status) {
      query = query.eq("status", filter.status);
    } else {
      query = query.neq("id", "00000000-0000-0000-0000-000000000000");
    }
    await query;
    return true;
  } catch (err) {
    if (process.env.NODE_ENV !== "test") {
      console.warn("Could not clear submissions from DB:", err);
    }
  }
  return true;
}
