import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DesktopSidebar } from "@/components/navigation/DesktopSidebar";
import { DesktopAppLayout } from "@/components/presentation/desktop/DesktopAppLayout";
import { useAuth } from "@/hooks/useAuth";

vi.mock("@/hooks/useAuth");
vi.mock("next/navigation", () => ({
  usePathname: () => "/room",
  useRouter: () => ({ push: vi.fn() }),
}));

describe("Desktop Navigation System", () => {
  it("renders DesktopSidebar with all 8 main navigation destinations", () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: "user-123", email: "test@example.com" } as any,
      profile: {
        id: "user-123",
        display_name: "Aarav Sharma",
        current_status: "idle",
        current_focus: "Calculus Revision",
        avatar_url: null,
        weekly_study_seconds: 3600,
        has_achiever_badge: false,
      } as any,
      loading: false,
      error: null,
      signOut: vi.fn(),
      refreshProfile: vi.fn(),
      updateProfileOptimistic: vi.fn(),
    });

    render(<DesktopSidebar />);

    // Brand header
    expect(screen.getByText("StudyRoom")).toBeInTheDocument();
    expect(screen.getByText("Live Group Study")).toBeInTheDocument();
    expect(screen.getByText("PWA")).toBeInTheDocument();

    // Navigation links (Rankings and Global Analytics unified into Rankings & Global Analytics)
    expect(screen.getByText("Study Room")).toBeInTheDocument();
    expect(screen.getByText("Rankings & Global Analytics")).toBeInTheDocument();
    expect(screen.getByText("Streak")).toBeInTheDocument();
    expect(screen.getByText("Goals")).toBeInTheDocument();
    expect(screen.getByText("History")).toBeInTheDocument();
    expect(screen.getByText("Planner")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(screen.getByText("Feature Handbook")).toBeInTheDocument();

    // User profile card
    expect(screen.getByText("Aarav Sharma")).toBeInTheDocument();
    expect(screen.getByText("Account & Profile")).toBeInTheDocument();
  });

  it("renders active study mini-widget when user is currently studying", () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: "user-123", email: "test@example.com" } as any,
      profile: {
        id: "user-123",
        display_name: "Aarav Sharma",
        current_status: "studying",
        current_focus: "Quantum Mechanics",
        avatar_url: null,
        weekly_study_seconds: 7200,
        has_achiever_badge: true,
      } as any,
      loading: false,
      error: null,
      signOut: vi.fn(),
      refreshProfile: vi.fn(),
      updateProfileOptimistic: vi.fn(),
    });

    render(<DesktopSidebar />);

    expect(screen.getByText("Studying Now")).toBeInTheDocument();
    expect(screen.getByText("Quantum Mechanics")).toBeInTheDocument();
    expect(screen.getByText("⭐ Weekly Achiever")).toBeInTheDocument();
  });

  it("DesktopAppLayout wraps content with responsive desktop padding offset and sidebar", () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: "user-123" } as any,
      profile: { display_name: "Test" } as any,
      loading: false,
      error: null,
      signOut: vi.fn(),
      refreshProfile: vi.fn(),
      updateProfileOptimistic: vi.fn(),
    });

    const { container } = render(
      <DesktopAppLayout>
        <div data-testid="page-content">Main Page Content</div>
      </DesktopAppLayout>
    );

    expect(screen.getByTestId("page-content")).toBeInTheDocument();

    // Verify DesktopSidebar aside element exists with lg:flex and hidden
    const aside = screen.getByRole("complementary", { name: /desktop application navigation/i });
    expect(aside).toHaveClass("hidden");
    expect(aside).toHaveClass("lg:flex");

    // Content container offset
    const contentWrapper = container.querySelector(".lg\\:pl-64");
    expect(contentWrapper).not.toBeNull();
  });

  it("renders guest sign-in CTA in DesktopSidebar when user is unauthenticated", () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      profile: null,
      loading: false,
      error: null,
      signOut: vi.fn(),
      refreshProfile: vi.fn(),
      updateProfileOptimistic: vi.fn(),
    });

    render(<DesktopSidebar />);

    expect(screen.getByText("Sign In to StudyRoom")).toBeInTheDocument();
  });

  it("renders persistent h-12 header with room metrics when provided", () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: "user-123" } as any,
      profile: { display_name: "Test" } as any,
      loading: false,
      error: null,
      signOut: vi.fn(),
      refreshProfile: vi.fn(),
      updateProfileOptimistic: vi.fn(),
    });

    render(
      <DesktopAppLayout
        memberCount={8}
        expectedPeakHours="18:00 - 22:00"
        isRealtimeConnected={true}
        connectionState="connected"
      >
        <div>Content</div>
      </DesktopAppLayout>
    );

    const header = screen.getByRole("banner", { name: "Desktop Utility Bar" });
    expect(header).toBeInTheDocument();
    expect(header).toHaveClass("h-12");
    expect(screen.getByText(/8 peers in room/i)).toBeInTheDocument();
    expect(screen.getByText(/Expected peak:/i)).toBeInTheDocument();
    expect(screen.getByText("18:00 - 22:00")).toBeInTheDocument();
  });

  it("renders persistent h-12 header with global cloud sync status when room metrics are omitted", () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: "user-123" } as any,
      profile: { display_name: "Test" } as any,
      loading: false,
      error: null,
      signOut: vi.fn(),
      refreshProfile: vi.fn(),
      updateProfileOptimistic: vi.fn(),
    });

    render(
      <DesktopAppLayout>
        <div>Content</div>
      </DesktopAppLayout>
    );

    const header = screen.getByRole("banner", { name: "Desktop Utility Bar" });
    expect(header).toBeInTheDocument();
    expect(header).toHaveClass("h-12");
    expect(screen.getByText("Live Cloud Sync Active")).toBeInTheDocument();
  });
});
