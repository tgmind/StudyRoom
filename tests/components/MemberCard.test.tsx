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
    weekly_study_seconds: 36000, // 10 hours
    total_sessions_count: 5,
    active_study_seconds_snapshot: 1800, // 30 minutes
  };

  it("renders offline status with offline duration in pill and no subtext", () => {
    const now = new Date("2026-09-03T14:00:00Z");
    const fourHoursAgo = new Date(now.getTime() - 4 * 3600 * 1000).toISOString();

    render(
      <MemberCard
        member={{ ...baseMember, current_status: "offline", last_offline_at: fourHoursAgo }}
        currentTimestamp={now}
      />
    );

    expect(screen.getByText("Subodh")).toBeInTheDocument();
    expect(screen.getByText("Offline 4h")).toBeInTheDocument();
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

  it("renders 00:00 cleanly without flashing Syncing... when customElapsedSeconds is 0", () => {
    render(
      <MemberCard
        member={{
          ...baseMember,
          current_status: "studying",
          session_start_time: new Date().toISOString(),
          last_resumed_at: new Date().toISOString(),
          active_study_seconds_snapshot: 0,
        }}
        customElapsedSeconds={0}
      />
    );

    expect(screen.getByText("Studying")).toBeInTheDocument();
    expect(screen.getByText("00:00")).toBeInTheDocument();
    expect(screen.queryByText("Syncing...")).not.toBeInTheDocument();
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

    // Study time shown as subtext
    expect(screen.getByText("Study:")).toBeInTheDocument();
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
    expect(screen.getByText("Study:")).toBeInTheDocument();
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

    expect(screen.getByText(/Offline/i)).toBeInTheDocument();
    expect(screen.queryByText("On Break")).not.toBeInTheDocument();
    expect(screen.queryByText(/Break 65:/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Study:/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Session:/i)).not.toBeInTheDocument();
  });

  it("renders realtime live weekly study time beside the clock icon", () => {
    render(
      <MemberCard
        member={{
          ...baseMember,
          weekly_study_seconds: 36000, // 10h past weekly
          current_status: "studying",
          session_start_time: new Date(Date.now() - 1800 * 1000).toISOString(),
          last_resumed_at: new Date(Date.now() - 1800 * 1000).toISOString(),
        }}
        isCurrentUser={true}
        customElapsedSeconds={1800} // 30m live
      />
    );

    // 10h past weekly + 30m live = 10h 30m
    expect(screen.getByText("10h 30m")).toBeInTheDocument();
  });

  it("renders Online status pill and avatar indicator when member is offline but present in room", () => {
    const now = new Date("2026-09-03T14:00:00Z");

    render(
      <MemberCard
        member={{
          ...baseMember,
          current_status: "offline",
          is_present: true,
        }}
        currentTimestamp={now}
      />
    );

    expect(screen.getByText("Subodh")).toBeInTheDocument();
    expect(screen.getByText("Online")).toBeInTheDocument();
    expect(screen.queryByText(/Offline/i)).not.toBeInTheDocument();
    expect(screen.getAllByTitle("Present in room (Online)")).toHaveLength(2);
  });

  it("renders Achiever card with Achiever crest and crown icon", () => {
    const { container } = render(
      <MemberCard
        member={{
          ...baseMember,
          display_name: "Aditya",
          has_achiever_badge: true,
        }}
      />
    );

    expect(screen.getByLabelText("Weekly Achiever")).toBeInTheDocument();
    expect(screen.getByText("Achiever")).toBeInTheDocument();
    expect(screen.getByText("Aditya")).toBeInTheDocument();
    // Crown icons present (crest crown + top crown)
    const svgs = container.querySelectorAll("svg");
    expect(svgs.length).toBeGreaterThanOrEqual(2);
  });

  it("simultaneously renders Achiever crest, crown, Studying status, and timer when studying", () => {
    render(
      <MemberCard
        member={{
          ...baseMember,
          display_name: "Aditya",
          has_achiever_badge: true,
          current_status: "studying",
        }}
        isCurrentUser={true}
        customElapsedSeconds={1245} // 20:45
      />
    );

    expect(screen.getByLabelText("Weekly Achiever")).toBeInTheDocument();
    expect(screen.getByText("Achiever")).toBeInTheDocument();
    expect(screen.getByText("Studying")).toBeInTheDocument();
    expect(screen.getByText("20:45")).toBeInTheDocument();
  });

  it("simultaneously renders Achiever crest, crown, On Break status, and break timer when on break", () => {
    const now = new Date("2026-09-03T10:10:00Z");
    const breakStart = new Date("2026-09-03T10:06:00Z").toISOString(); // 4m break

    render(
      <MemberCard
        member={{
          ...baseMember,
          display_name: "Aditya",
          has_achiever_badge: true,
          current_status: "break",
          break_started_at: breakStart,
          active_study_seconds_snapshot: 3600,
        }}
        currentTimestamp={now}
      />
    );

    expect(screen.getByLabelText("Weekly Achiever")).toBeInTheDocument();
    expect(screen.getByText("Achiever")).toBeInTheDocument();
    expect(screen.getByText("On Break")).toBeInTheDocument();
    expect(screen.getByText("Break 04:00")).toBeInTheDocument();
    expect(screen.getByText("01:00:00")).toBeInTheDocument(); // 1h study snapshot
  });

  it("renders both Achiever treatment and YOU badge when current user", () => {
    render(
      <MemberCard
        member={{
          ...baseMember,
          display_name: "Aditya",
          has_achiever_badge: true,
        }}
        isCurrentUser={true}
      />
    );

    expect(screen.getByLabelText("Weekly Achiever")).toBeInTheDocument();
    expect(screen.getByText("You")).toBeInTheDocument();
    expect(screen.getByText("Aditya")).toBeInTheDocument();
  });

  it("simultaneously renders Achiever + Studying + YOU correctly without overlap", () => {
    render(
      <MemberCard
        member={{
          ...baseMember,
          display_name: "Aditya",
          has_achiever_badge: true,
          current_status: "studying",
        }}
        isCurrentUser={true}
        customElapsedSeconds={900}
      />
    );

    expect(screen.getByLabelText("Weekly Achiever")).toBeInTheDocument();
    expect(screen.getByText("Studying")).toBeInTheDocument();
    expect(screen.getByText("You")).toBeInTheDocument();
    expect(screen.getByText("15:00")).toBeInTheDocument();
  });

  it("simultaneously renders Achiever + On Break + YOU correctly without overlap", () => {
    const now = new Date("2026-09-03T10:10:00Z");
    const breakStart = new Date("2026-09-03T10:05:00Z").toISOString();

    render(
      <MemberCard
        member={{
          ...baseMember,
          display_name: "Aditya",
          has_achiever_badge: true,
          current_status: "break",
          break_started_at: breakStart,
          active_study_seconds_snapshot: 1800,
        }}
        isCurrentUser={true}
        customElapsedSeconds={1800}
        currentTimestamp={now}
      />
    );

    expect(screen.getByLabelText("Weekly Achiever")).toBeInTheDocument();
    expect(screen.getByText("On Break")).toBeInTheDocument();
    expect(screen.getByText("You")).toBeInTheDocument();
    expect(screen.getByText("Break 05:00")).toBeInTheDocument();
  });

  it("renders Compact Achiever mode cleanly", () => {
    render(
      <MemberCard
        member={{
          ...baseMember,
          display_name: "Aditya",
          has_achiever_badge: true,
        }}
        compact={true}
      />
    );

    expect(screen.getByLabelText("Weekly Achiever")).toBeInTheDocument();
    expect(screen.getByText("Aditya")).toBeInTheDocument();
  });

  it("handles long member names gracefully without throwing or creating invalid DOM structure", () => {
    const longName = "Alexander Bartholomew Christopher Montgomery III";
    render(
      <MemberCard
        member={{
          ...baseMember,
          display_name: longName,
          has_achiever_badge: true,
        }}
      />
    );

    const heading = screen.getByRole("heading", { level: 3 });
    expect(heading).toHaveTextContent(longName);
    expect(heading).toHaveAttribute("title", longName);
    expect(heading.className).toContain("truncate");
  });

  it("renders Achiever treatment properly with avatar fallback initials when avatar_url is null", () => {
    render(
      <MemberCard
        member={{
          ...baseMember,
          display_name: "Aditya Roy",
          avatar_url: null,
          has_achiever_badge: true,
        }}
      />
    );

    expect(screen.getByText("AD")).toBeInTheDocument();
    expect(screen.getByLabelText("Weekly Achiever")).toBeInTheDocument();
  });

  it("renders non-Achiever cards without Achiever crest or crown watermark", () => {
    render(
      <MemberCard
        member={{
          ...baseMember,
          display_name: "Subodh",
          has_achiever_badge: false,
        }}
      />
    );

    expect(screen.queryByLabelText("Weekly Achiever")).not.toBeInTheDocument();
    expect(screen.queryByText("Achiever")).not.toBeInTheDocument();
  });

  it("re-renders when has_achiever_badge transitions from false to true", () => {
    const { rerender } = render(
      <MemberCard
        member={{
          ...baseMember,
          display_name: "Subodh",
          has_achiever_badge: false,
        }}
      />
    );

    expect(screen.queryByLabelText("Weekly Achiever")).not.toBeInTheDocument();

    rerender(
      <MemberCard
        member={{
          ...baseMember,
          display_name: "Subodh",
          has_achiever_badge: true,
        }}
      />
    );

    expect(screen.getByLabelText("Weekly Achiever")).toBeInTheDocument();
    expect(screen.getByText("Achiever")).toBeInTheDocument();
  });

  it("renders enlarged Achiever title pill with crown icon and correct classes", () => {
    render(
      <MemberCard
        member={{
          ...baseMember,
          display_name: "Subodh",
          has_achiever_badge: true,
        }}
      />
    );

    const achieverPill = screen.getByLabelText("Weekly Achiever");
    expect(achieverPill).toBeInTheDocument();
    expect(achieverPill.className).toContain("text-[10px]");
    expect(achieverPill.className).toContain("font-black");
    expect(screen.getByText("Achiever")).toBeInTheDocument();
  });

  it("renders decorative crossed swords in bottom corners exclusively for Achiever when studying in global view", () => {
    render(
      <MemberCard
        member={{
          ...baseMember,
          has_achiever_badge: true,
          current_status: "studying",
          session_start_time: new Date(Date.now() - 1500 * 1000).toISOString(),
          last_resumed_at: new Date(Date.now() - 1500 * 1000).toISOString(),
        }}
        isInRivalry={false}
        compact={false}
      />
    );

    expect(screen.getByTestId("member-card-swords-left")).toBeInTheDocument();
    expect(screen.getByTestId("member-card-swords-right")).toBeInTheDocument();
  });

  it("never renders swords on non-Achiever member cards", () => {
    render(
      <MemberCard
        member={{
          ...baseMember,
          has_achiever_badge: false,
          current_status: "studying",
          session_start_time: new Date(Date.now() - 1500 * 1000).toISOString(),
          last_resumed_at: new Date(Date.now() - 1500 * 1000).toISOString(),
        }}
        isInRivalry={false}
        compact={false}
      />
    );

    expect(screen.queryByTestId("member-card-swords-left")).not.toBeInTheDocument();
    expect(screen.queryByTestId("member-card-swords-right")).not.toBeInTheDocument();
  });

  it("hides decorative crossed swords when Achiever card is added to rivalry (isInRivalry=true or compact=true)", () => {
    const { rerender } = render(
      <MemberCard
        member={{
          ...baseMember,
          has_achiever_badge: true,
          current_status: "studying",
          session_start_time: new Date(Date.now() - 1500 * 1000).toISOString(),
          last_resumed_at: new Date(Date.now() - 1500 * 1000).toISOString(),
        }}
        isInRivalry={true}
      />
    );

    expect(screen.queryByTestId("member-card-swords-left")).not.toBeInTheDocument();
    expect(screen.queryByTestId("member-card-swords-right")).not.toBeInTheDocument();

    // Also verify compact={true} hides them
    rerender(
      <MemberCard
        member={{
          ...baseMember,
          has_achiever_badge: true,
          current_status: "studying",
          session_start_time: new Date(Date.now() - 1500 * 1000).toISOString(),
          last_resumed_at: new Date(Date.now() - 1500 * 1000).toISOString(),
        }}
        compact={true}
      />
    );

    expect(screen.queryByTestId("member-card-swords-left")).not.toBeInTheDocument();
    expect(screen.queryByTestId("member-card-swords-right")).not.toBeInTheDocument();
  });
});


