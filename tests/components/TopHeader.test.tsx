import { describe, it, expect } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { TopHeader } from "@/components/navigation/TopHeader";
import { UserProfile } from "@/lib/supabase/types";

describe("TopHeader Component", () => {
  const mockProfile: UserProfile = {
    id: "user-test-1",
    display_name: "Subodh",
    avatar_url: null,
    has_achiever_badge: true,
    current_status: "studying",
    session_start_time: new Date().toISOString(),
    break_started_at: null,
    last_resumed_at: new Date().toISOString(),
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
});
