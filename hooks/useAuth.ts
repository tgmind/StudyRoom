"use client";

import { useAuthContext, AuthContextValue } from "@/components/auth/AuthProvider";

export type { AuthContextValue };

export function useAuth(): AuthContextValue {
  const context = useAuthContext();
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

