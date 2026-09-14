"use client";

import { useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

type RpcCaller = {
  rpc: (name: string, params?: Record<string, unknown>) => Promise<{ data: unknown; error: Error | null }>;
};

import {
  AdminUser,
  PlatformStats,
  DEFAULT_ADMIN_EMAIL,
  DEFAULT_ADMIN_UID,
  getAdminEmail,
  getAdminUserId,
  isAdminEmail,
  isAdminUserId,
} from "@/lib/admin";

export type { AdminUser, PlatformStats };
export {
  DEFAULT_ADMIN_EMAIL,
  DEFAULT_ADMIN_UID,
  getAdminEmail,
  getAdminUserId,
  isAdminEmail,
  isAdminUserId,
};

export function useAdmin() {
  const supabase = createClient();
  const adminEmail = getAdminEmail();

  const getAllUsers = useCallback(async (): Promise<AdminUser[]> => {
    const { data, error } = await (supabase as unknown as RpcCaller).rpc("rpc_admin_get_all_users", {
      p_admin_email: adminEmail,
    });
    if (error) throw error;
    return (data as unknown as AdminUser[]) || [];
  }, [supabase, adminEmail]);

  const getStats = useCallback(async (): Promise<PlatformStats> => {
    const { data, error } = await (supabase as unknown as RpcCaller).rpc("rpc_admin_get_platform_stats", {
      p_admin_email: adminEmail,
    });
    if (error) throw error;
    return data as unknown as PlatformStats;
  }, [supabase, adminEmail]);

  const renameUser = useCallback(async (targetUserId: string, newName: string): Promise<void> => {
    const { data, error } = await (supabase as unknown as RpcCaller).rpc("rpc_admin_rename_user", {
      p_admin_email: adminEmail,
      p_target_user_id: targetUserId,
      p_new_name: newName,
    });
    if (error) throw error;
    const result = data as unknown as { success: boolean };
    if (!result?.success) throw new Error("Failed to rename user");
  }, [supabase, adminEmail]);

  const deleteUser = useCallback(async (targetUserId: string): Promise<string> => {
    const { data, error } = await (supabase as unknown as RpcCaller).rpc("rpc_admin_delete_user", {
      p_admin_email: adminEmail,
      p_target_user_id: targetUserId,
    });
    if (error) throw error;
    const result = data as unknown as { success: boolean; deleted_user_name: string };
    if (!result?.success) throw new Error("Failed to delete user");
    return result.deleted_user_name;
  }, [supabase, adminEmail]);

  const forceEndSession = useCallback(async (targetUserId: string): Promise<number> => {
    const { data, error } = await (supabase as unknown as RpcCaller).rpc("rpc_admin_force_end_session", {
      p_admin_email: adminEmail,
      p_target_user_id: targetUserId,
    });
    if (error) throw error;
    const result = data as unknown as { success: boolean; duration_minutes?: number; error?: string };
    if (!result?.success) throw new Error(result?.error || "Failed to end session");
    return result.duration_minutes ?? 0;
  }, [supabase, adminEmail]);

  return {
    getAllUsers,
    getStats,
    renameUser,
    deleteUser,
    forceEndSession,
    adminEmail,
  };
}
