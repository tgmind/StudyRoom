import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Reset Password | StudyRoom",
  description: "Reset your StudyRoom account password",
};

export default function ForgotPasswordPage() {
  return (
    <div className="flex-1 flex items-center justify-center p-4">
      <ForgotPasswordForm />
    </div>
  );
}
