import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { MemberList } from "@/components/room/MemberList";
import { UserProfile } from "@/lib/supabase/types";

describe("MemberList Component & Live Global View", () => {
  const memberA: UserProfile = {
    id: "user-a",
    display_name: "Aman",
    avatar_url: null,
    current_status: "studying",
    session_start_time: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    last_resumed_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    break_started_at: null,
    current_focus: "Math",
    has_achiever_badge: false,
    created_at: new Date().toISOString(),
    past_24h_study_seconds: 1800,
    weekly_study_seconds: 36000,
    total_sessions_count: 5,
    active_study_seconds_snapshot: 0,
  };

  const memberB: UserProfile = {
    id: "user-b",
    display_name: "Bhavya",
    avatar_url: null,
    current_status: "studying",
    session_start_time: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    last_resumed_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    break_started_at: null,
    current_focus: "Physics",
    has_achiever_badge: true,
    created_at: new Date().toISOString(),
    past_24h_study_seconds: 3600,
    weekly_study_seconds: 72000,
    total_sessions_count: 8,
    active_study_seconds_snapshot: 0,
  };

  const memberC: UserProfile = {
    id: "user-c",
    display_name: "Chetan",
    avatar_url: null,
    current_status: "offline",
    session_start_time: null,
    last_resumed_at: null,
    break_started_at: null,
    current_focus: null,
    has_achiever_badge: false,
    created_at: new Date().toISOString(),
    last_offline_at: new Date(Date.now() - 3600 * 1000).toISOString(),
    past_24h_study_seconds: 0,
    weekly_study_seconds: 14400,
    total_sessions_count: 2,
    active_study_seconds_snapshot: 0,
  };

  it("renders live active members and offline members in separate sections", () => {
    render(
      <MemberList
        members={[memberA, memberB, memberC]}
        currentUserId="user-a"
      />
    );

    expect(screen.getByText("Aman")).toBeInTheDocument();
    expect(screen.getByText("Bhavya")).toBeInTheDocument();
    expect(screen.getByText("Chetan")).toBeInTheDocument();

    // Studying counter should show 2 active members (or in arena if rivals)
    expect(screen.getByText(/Offline Members \(1\)/i)).toBeInTheDocument();
  });

  it("renders empty state when no room members are present", () => {
    render(<MemberList members={[]} />);
    expect(screen.getByText("No room members found")).toBeInTheDocument();
    expect(screen.getByText(/Start a live study session/i)).toBeInTheDocument();
  });

  it("renders loading skeleton when isLoading is true", () => {
    const { container } = render(<MemberList members={[]} isLoading={true} />);
    const pulses = container.querySelectorAll(".animate-pulse");
    expect(pulses.length).toBeGreaterThanOrEqual(4);
  });
});
