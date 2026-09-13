import React, { Suspense } from "react";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import type { Metadata } from "next";
import { Loader2 } from "lucide-react";

export const metadata: Metadata = {
  title: "Set New Password | StudyRoom",
  description: "Set a new password for your StudyRoom account",
};

export default function ResetPasswordPage() {
  return (
    <div className="flex-1 flex items-center justify-center p-4">
      <Suspense
        fallback={
          <div className="w-full max-w-md mx-auto p-8 bg-zinc-950 border border-zinc-800 rounded-2xl shadow-xl flex flex-col items-center justify-center space-y-3">
            <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
            <p className="text-xs text-zinc-400">Loading password reset form...</p>
          </div>
        }
      >
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}
