import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { LoginForm } from "@/components/auth/LoginForm";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

const mockResetPasswordForEmail = vi.fn();
const mockUpdateUser = vi.fn();
const mockGetSession = vi.fn();
const mockOnAuthStateChange = vi.fn();
const mockExchangeCodeForSession = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      signInWithPassword: vi.fn(),
      resetPasswordForEmail: mockResetPasswordForEmail,
      updateUser: mockUpdateUser,
      getSession: mockGetSession,
      onAuthStateChange: mockOnAuthStateChange,
      exchangeCodeForSession: mockExchangeCodeForSession,
    },
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/login",
}));

vi.mock("@/components/auth/AuthProvider", () => ({
  useAuthContext: () => ({
    user: null,
    profile: null,
    loading: false,
    error: null,
    refreshProfile: vi.fn(),
    signOut: vi.fn(),
  }),
}));

describe("Forgot Password & Reset Password flows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockOnAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
  });

  describe("LoginForm", () => {
    it("renders 'Forgot Password?' link pointing to /forgot-password", () => {
      render(<LoginForm />);

      const forgotLink = screen.getByRole("link", { name: /forgot password\?/i });
      expect(forgotLink).toBeInTheDocument();
      expect(forgotLink).toHaveAttribute("href", "/forgot-password");
    });
  });

  describe("ForgotPasswordForm", () => {
    it("renders email input and submit button", () => {
      render(<ForgotPasswordForm />);

      expect(screen.getByRole("heading", { name: /reset password/i })).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/your\.email@example\.com/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /send reset link/i })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /back to log in/i })).toBeInTheDocument();
    });

    it("submits email to supabase.auth.resetPasswordForEmail and shows confirmation", async () => {
      mockResetPasswordForEmail.mockResolvedValue({ error: null });

      render(<ForgotPasswordForm />);

      const emailInput = screen.getByPlaceholderText(/your\.email@example\.com/i);
      const submitBtn = screen.getByRole("button", { name: /send reset link/i });

      fireEvent.change(emailInput, { target: { value: "student@example.com" } });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(mockResetPasswordForEmail).toHaveBeenCalledWith(
          "student@example.com",
          expect.objectContaining({
            redirectTo: expect.stringContaining("/reset-password"),
          })
        );
      });

      await waitFor(() => {
        expect(screen.getByText(/check your email/i)).toBeInTheDocument();
        expect(screen.getByText("student@example.com")).toBeInTheDocument();
      });
    });

    it("displays friendly rate limit error if Supabase rate limits requests", async () => {
      mockResetPasswordForEmail.mockResolvedValue({
        error: { message: "For security purposes, you can only request this once every 60 seconds", status: 429 },
      });

      render(<ForgotPasswordForm />);

      const emailInput = screen.getByPlaceholderText(/your\.email@example\.com/i);
      const submitBtn = screen.getByRole("button", { name: /send reset link/i });

      fireEvent.change(emailInput, { target: { value: "spam@example.com" } });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByText(/too many requests/i)).toBeInTheDocument();
      });
    });
  });

  describe("ResetPasswordForm", () => {
    it("renders invalid/expired state when no session or code is found", async () => {
      render(<ResetPasswordForm />);

      await waitFor(
        () => {
          expect(screen.getByText(/invalid or expired link/i)).toBeInTheDocument();
          expect(screen.getByRole("button", { name: /request new reset link/i })).toBeInTheDocument();
        },
        { timeout: 2000 }
      );
    });

    it("renders password input fields when a valid session is active", async () => {
      mockGetSession.mockResolvedValue({
        data: { session: { user: { id: "user-123" } } },
      });

      render(<ResetPasswordForm />);

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: /set new password/i })).toBeInTheDocument();
        expect(screen.getByPlaceholderText(/at least 6 characters/i)).toBeInTheDocument();
        expect(screen.getByPlaceholderText(/re-enter your new password/i)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /update password/i })).toBeInTheDocument();
      });
    });

    it("validates password match before calling updateUser", async () => {
      mockGetSession.mockResolvedValue({
        data: { session: { user: { id: "user-123" } } },
      });

      render(<ResetPasswordForm />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/at least 6 characters/i)).toBeInTheDocument();
      });

      const passInput = screen.getByPlaceholderText(/at least 6 characters/i);
      const confirmInput = screen.getByPlaceholderText(/re-enter your new password/i);
      const submitBtn = screen.getByRole("button", { name: /update password/i });

      fireEvent.change(passInput, { target: { value: "secret123" } });
      fireEvent.change(confirmInput, { target: { value: "different123" } });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
      });
      expect(mockUpdateUser).not.toHaveBeenCalled();
    });

    it("successfully updates password and shows success feedback", async () => {
      mockGetSession.mockResolvedValue({
        data: { session: { user: { id: "user-123" } } },
      });
      mockUpdateUser.mockResolvedValue({ error: null });

      render(<ResetPasswordForm />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/at least 6 characters/i)).toBeInTheDocument();
      });

      const passInput = screen.getByPlaceholderText(/at least 6 characters/i);
      const confirmInput = screen.getByPlaceholderText(/re-enter your new password/i);
      const submitBtn = screen.getByRole("button", { name: /update password/i });

      fireEvent.change(passInput, { target: { value: "newPassword123" } });
      fireEvent.change(confirmInput, { target: { value: "newPassword123" } });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(mockUpdateUser).toHaveBeenCalledWith({ password: "newPassword123" });
        expect(screen.getByText(/password updated successfully/i)).toBeInTheDocument();
      });
    });
  });
});
