import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { TopHeader, HEADER_PEEK_MS } from "@/components/navigation/TopHeader";
import { UserProfile } from "@/lib/supabase/types";

describe("TopHeader Component", () => {
  const mockProfile: UserProfile = {
    id: "user-test-1",
    display_name: "Subodh",
    avatar_url: null,
    has_achiever_badge: true,
    current_status: "offline",
    session_start_time: null,
    break_started_at: null,
    last_resumed_at: null,
    active_study_seconds_snapshot: 0,
    created_at: new Date().toISOString(),
    is_admin: false,
    current_focus: null,
    last_break_expired_study_seconds: null,
  };

  it("renders StudyRoom branding and member count correctly", () => {
    render(
      <TopHeader
        memberCount={5}
        isRealtimeConnected={true}
        profile={null}
        expectedPeakHours="6 PM – 9 PM"
      />
    );

    expect(screen.getByText("StudyRoom")).toBeDefined();
    expect(screen.getByText("5 members")).toBeDefined();
    expect(screen.getByText("6 PM – 9 PM")).toBeDefined();
  });

  it("renders user initials and achiever badge once mounted", () => {
    render(
      <TopHeader
        memberCount={3}
        isRealtimeConnected={true}
        profile={mockProfile}
        expectedPeakHours="11 AM – 2 PM"
      />
    );

    expect(screen.getByText("SU")).toBeDefined();
    expect(screen.getByTitle("Account & Settings")).toBeDefined();
    expect(screen.getByTitle("⭐ Weekly Achiever")).toBeDefined();
  });

  it("reflects connectionState in connection indicator title and styling", () => {
    const { rerender } = render(
      <TopHeader
        memberCount={3}
        connectionState="reconnecting"
        profile={null}
      />
    );
    expect(screen.getByTitle("Reconnecting...")).toBeInTheDocument();

    rerender(
      <TopHeader
        memberCount={3}
        connectionState="offline"
        profile={null}
      />
    );
    expect(screen.getByTitle("Offline")).toBeInTheDocument();

    rerender(
      <TopHeader
        memberCount={3}
        connectionState="connected"
        profile={null}
      />
    );
    expect(screen.getByTitle("Connected")).toBeInTheDocument();
  });

  describe("Study Session Dependent Compact Bar Behavior", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.clearAllTimers();
      vi.useRealTimers();
    });

    it("stays expanded in full original form when NOT in a study session", () => {
      render(
        <TopHeader
          memberCount={15}
          isRealtimeConnected={true}
          profile={mockProfile}
          expectedPeakHours="11 AM – 2 PM"
          isStudying={false}
        />
      );

      const header = screen.getByRole("banner");
      // Full original form
      expect(header).toHaveClass("py-2.5");
      expect(screen.getByText("StudyRoom")).toBeInTheDocument();
      expect(screen.getByText("15 members")).toBeInTheDocument();
      expect(screen.getByText("11 AM – 2 PM")).toBeInTheDocument();
      expect(screen.getByTitle("Account & Settings")).toBeInTheDocument();
    });

    it("necessarily hides into compact docked bar when in a study session", () => {
      render(
        <TopHeader
          memberCount={15}
          isRealtimeConnected={true}
          profile={mockProfile}
          expectedPeakHours="11 AM – 2 PM"
          isStudying={true}
        />
      );

      const header = screen.getByRole("banner");
      // Compact docked bar
      expect(header).toHaveClass("py-1");
      // Member count pill is in top-left
      expect(screen.getByText("15 members")).toBeInTheDocument();
      // Expected peak info is in top-right
      expect(screen.getByText("11 AM – 2 PM")).toBeInTheDocument();
      // Logo and avatar are hidden to free up screen real estate
      expect(screen.queryByText("StudyRoom")).not.toBeInTheDocument();
      expect(screen.queryByTitle("Account & Settings")).not.toBeInTheDocument();
    });

    it("smoothly transitions between expanded and compact when study session starts and stops", () => {
      const { rerender } = render(
        <TopHeader
          memberCount={15}
          isRealtimeConnected={true}
          profile={mockProfile}
          expectedPeakHours="11 AM – 2 PM"
          isStudying={false}
        />
      );

      const header = screen.getByRole("banner");
      expect(header).toHaveClass("py-2.5");
      expect(screen.getByText("StudyRoom")).toBeInTheDocument();

      // User starts studying (timer starts running)
      rerender(
        <TopHeader
          memberCount={15}
          isRealtimeConnected={true}
          profile={mockProfile}
          expectedPeakHours="11 AM – 2 PM"
          isStudying={true}
        />
      );

      expect(header).toHaveClass("py-1");
      expect(screen.queryByText("StudyRoom")).not.toBeInTheDocument();
      expect(screen.getByText("15 members")).toBeInTheDocument();
      expect(screen.getByText("11 AM – 2 PM")).toBeInTheDocument();

      // User finishes study session
      rerender(
        <TopHeader
          memberCount={15}
          isRealtimeConnected={true}
          profile={mockProfile}
          expectedPeakHours="11 AM – 2 PM"
          isStudying={false}
        />
      );

      expect(header).toHaveClass("py-2.5");
      expect(screen.getByText("StudyRoom")).toBeInTheDocument();
    });

    it("allows peek expansion on click while studying and returns to compact after timeout", () => {
      render(
        <TopHeader
          memberCount={15}
          isRealtimeConnected={true}
          profile={mockProfile}
          expectedPeakHours="11 AM – 2 PM"
          isStudying={true}
        />
      );

      const header = screen.getByRole("banner");
      expect(header).toHaveClass("py-1");

      // User taps the compact bar to peek
      act(() => {
        fireEvent.click(header);
      });

      expect(header).toHaveClass("py-2.5");
      expect(screen.getByText("StudyRoom")).toBeInTheDocument();

      // After peek timeout (HEADER_PEEK_MS = 8s), automatically returns to compact
      act(() => {
        vi.advanceTimersByTime(HEADER_PEEK_MS);
      });

      expect(header).toHaveClass("py-1");
      expect(screen.queryByText("StudyRoom")).not.toBeInTheDocument();
    });
  });
});
