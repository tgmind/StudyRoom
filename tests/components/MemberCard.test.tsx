import { describe, it, expect } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { MemberCard } from "@/components/room/MemberCard";
import { UserProfile } from "@/lib/supabase/types";

describe("MemberCard Component", () => {
  const baseMember: UserProfile = {
    id: "user-123",
    display_name: "Subodh",
    avatar_url: null,
    current_status: "offline",
    session_start_time: null,
    break_started_at: null,
    last_resumed_at: null,
    current_focus: "Maths",
    has_achiever_badge: false,
    created_at: new Date().toISOString(),
    past_24h_study_seconds: 7200,
    total_sessions_count: 5,
    active_study_seconds_snapshot: 1800, // 30 minutes
  };

  it("renders offline status accurately without break or session subtext", () => {
    render(<MemberCard member={{ ...baseMember, current_status: "offline" }} />);

    expect(screen.getByText("Subodh")).toBeInTheDocument();
    expect(screen.getByText("Offline")).toBeInTheDocument();
    expect(screen.queryByText(/Session:/i)).not.toBeInTheDocument();
  });

  it("renders studying status with active live study time in pill and no subtext", () => {
    render(
      <MemberCard
        member={{
          ...baseMember,
          current_status: "studying",
          session_start_time: new Date(Date.now() - 1500 * 1000).toISOString(),
          last_resumed_at: new Date(Date.now() - 1500 * 1000).toISOString(),
          active_study_seconds_snapshot: 0,
        }}
        customElapsedSeconds={1500}
      />
    );

    expect(screen.getByText("Studying")).toBeInTheDocument();
    expect(screen.getByText("25:00")).toBeInTheDocument();
    expect(screen.queryByText(/Session:/i)).not.toBeInTheDocument();
  });

  it("renders break status with live break timer in pill and current session time as subtext", () => {
    const now = new Date("2026-09-03T10:10:00Z");
    const breakStart = new Date("2026-09-03T10:05:00Z").toISOString(); // 5m on break

    render(
      <MemberCard
        member={{
          ...baseMember,
          current_status: "break",
          break_started_at: breakStart,
          active_study_seconds_snapshot: 2715, // 45m 15s studied before pausing
        }}
        currentTimestamp={now}
      />
    );

    expect(screen.getByText("On Break")).toBeInTheDocument();
    expect(screen.getByText("Break 05:00")).toBeInTheDocument();

    // Session time shown as subtext
    expect(screen.getByText("Session:")).toBeInTheDocument();
    expect(screen.getByText("45:15")).toBeInTheDocument();
  });

  it("renders customElapsedSeconds in subtext when isCurrentUser is true on break", () => {
    const now = new Date("2026-09-03T10:10:00Z");
    const breakStart = new Date("2026-09-03T10:02:00Z").toISOString(); // 8m on break

    render(
      <MemberCard
        member={{
          ...baseMember,
          current_status: "break",
          break_started_at: breakStart,
          active_study_seconds_snapshot: 1200,
        }}
        isCurrentUser={true}
        customElapsedSeconds={1860} // 31m 00s
        currentTimestamp={now}
      />
    );

    expect(screen.getByText("Break 08:00")).toBeInTheDocument();
    expect(screen.getByText("Session:")).toBeInTheDocument();
    expect(screen.getByText("31:00")).toBeInTheDocument();
  });

  it("renders expired break (> 1 hour) as Offline without break timer or subtext", () => {
    const now = new Date("2026-09-03T10:10:00Z");
    const expiredBreakStart = new Date("2026-09-03T09:05:00Z").toISOString(); // 65m on break

    render(
      <MemberCard
        member={{
          ...baseMember,
          current_status: "break",
          break_started_at: expiredBreakStart,
          active_study_seconds_snapshot: 3600,
        }}
        currentTimestamp={now}
      />
    );

    expect(screen.getByText("Offline")).toBeInTheDocument();
    expect(screen.queryByText("On Break")).not.toBeInTheDocument();
    expect(screen.queryByText(/Break 65:/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Session:/i)).not.toBeInTheDocument();
  });
});
