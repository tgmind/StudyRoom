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

  it("calls onRivalryWin once with stable 15m bucket ID when a rivalry dissolves and suppresses duplicates", () => {
    const handleRivalryWin = vi.fn();

    const rival1: UserProfile = {
      id: "rival-1",
      display_name: "Rival One",
      avatar_url: null,
      current_status: "studying",
      session_start_time: new Date(Date.now() - 10 * 1000).toISOString(),
      weekly_study_seconds: 20000,
      current_focus: null,
      has_achiever_badge: false,
      created_at: new Date().toISOString(),
    };

    const rival2: UserProfile = {
      id: "rival-2",
      display_name: "Rival Two",
      avatar_url: null,
      current_status: "studying",
      session_start_time: new Date(Date.now() - 10 * 1000).toISOString(),
      weekly_study_seconds: 20100, // 100s gap, within 600s threshold
      current_focus: null,
      has_achiever_badge: false,
      created_at: new Date().toISOString(),
    };

    // 1. Initial render with active rivalry (currentUserId is rival-2, the leader)
    const { rerender } = render(
      <MemberList
        members={[rival1, rival2]}
        currentUserId="rival-2"
        onRivalryWin={handleRivalryWin}
      />
    );

    // Initial render: rivalry is active, no win declared yet
    expect(handleRivalryWin).not.toHaveBeenCalled();

    // 2. Rivalry dissolves: rival2 pulls ahead by 1000s (> 600s threshold)
    const rival2Ahead: UserProfile = {
      ...rival2,
      weekly_study_seconds: 21500, // 1500s gap, dissolves rivalry
    };

    rerender(
      <MemberList
        members={[rival1, rival2Ahead]}
        currentUserId="rival-2"
        onRivalryWin={handleRivalryWin}
      />
    );

    // onRivalryWin should have been called once for rival-2 winning
    expect(handleRivalryWin).toHaveBeenCalledTimes(1);
    const winEvent = handleRivalryWin.mock.calls[0][0];
    expect(winEvent.winnerName).toBe("Rival Two");
    expect(winEvent.loserName).toBe("Rival One");
    expect(winEvent.id).toMatch(/^win-rival-2-rival-1-\d+$/);

    // 3. Duplicate re-renders or updates within 15-minute cooldown should NOT re-trigger
    rerender(
      <MemberList
        members={[rival1, rival2Ahead]}
        currentUserId="rival-2"
        onRivalryWin={handleRivalryWin}
      />
    );
    expect(handleRivalryWin).toHaveBeenCalledTimes(1);
  });

  it("suppresses onRivalryWin when current user is not the winner and the winner is active (Designated Broadcaster)", () => {
    const handleRivalryWin = vi.fn();

    const rival1: UserProfile = {
      id: "rival-1",
      display_name: "Rival One",
      avatar_url: null,
      current_status: "studying",
      session_start_time: new Date(Date.now() - 10 * 1000).toISOString(),
      weekly_study_seconds: 20000,
      current_focus: null,
      has_achiever_badge: false,
      created_at: new Date().toISOString(),
    };

    const rival2: UserProfile = {
      id: "rival-2",
      display_name: "Rival Two",
      avatar_url: null,
      current_status: "studying",
      session_start_time: new Date(Date.now() - 10 * 1000).toISOString(),
      weekly_study_seconds: 20100, // 100s gap
      current_focus: null,
      has_achiever_badge: false,
      created_at: new Date().toISOString(),
    };

    // Current user is rival-1 (the loser/non-winner peer). Both rival-1 and rival-2 are active.
    const { rerender } = render(
      <MemberList
        members={[rival1, rival2]}
        currentUserId="rival-1"
        onRivalryWin={handleRivalryWin}
      />
    );

    // Rivalry dissolves
    const rival2Ahead: UserProfile = {
      ...rival2,
      weekly_study_seconds: 21500,
    };

    rerender(
      <MemberList
        members={[rival1, rival2Ahead]}
        currentUserId="rival-1"
        onRivalryWin={handleRivalryWin}
      />
    );

    // Because rival-2 (winner) is active in the room, rival-1's client does NOT broadcast (avoids storm)
    expect(handleRivalryWin).not.toHaveBeenCalled();
  });
});

