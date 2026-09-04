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

  it("sorts offline members in increasing order of their offline time in realtime", () => {
    const now = Date.now();
    const tenMinsAgo = new Date(now - 10 * 60 * 1000).toISOString();
    const oneHourAgo = new Date(now - 60 * 60 * 1000).toISOString();
    const twelveHoursAgo = new Date(now - 12 * 3600 * 1000).toISOString();

    const offlineAditya: UserProfile = {
      ...memberC,
      id: "aditya",
      display_name: "Aditya",
      last_offline_at: twelveHoursAgo, // 12h offline
    };

    const offlinePallavi: UserProfile = {
      ...memberC,
      id: "pallavi",
      display_name: "Pallavi",
      last_offline_at: oneHourAgo, // 1h offline
    };

    const offlineZoya: UserProfile = {
      ...memberC,
      id: "zoya",
      display_name: "Zoya",
      last_offline_at: tenMinsAgo, // 10m offline
    };

    // Pass in reverse/mixed order: Aditya (12h), Pallavi (1h), Zoya (10m)
    const { container } = render(
      <MemberList
        members={[offlineAditya, offlinePallavi, offlineZoya]}
      />
    );

    // Retrieve all offline member names in DOM render order
    const names = Array.from(container.querySelectorAll("h3")).map((el) => el.textContent?.trim());

    // Header has "Offline Members (3)", and member cards have names:
    const memberCardNames = names.filter((n) => n === "Zoya" || n === "Pallavi" || n === "Aditya");

    // Zoya (10m) -> Pallavi (1h) -> Aditya (12h)
    expect(memberCardNames).toEqual(["Zoya", "Pallavi", "Aditya"]);
  });
});
