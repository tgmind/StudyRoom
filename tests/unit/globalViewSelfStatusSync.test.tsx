import { describe, it, expect } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { MemberList } from "@/components/room/MemberList";
import { MemberCard } from "@/components/room/MemberCard";
import { getEffectiveMemberStatus, isMemberStudyExpired } from "@/lib/time/break";
import { UserProfile } from "@/lib/supabase/types";

describe("Global View Self-Status & Online Presence Synchronization", () => {
  const now = new Date("2026-10-02T10:00:00.000Z");

  // 2h 49m 41s = 10,181 seconds
  const subodhStudySeconds = 10181;
  const subodhStartTime = new Date(now.getTime() - subodhStudySeconds * 1000).toISOString();

  const subodhProfile: UserProfile = {
    id: "subodh-uuid",
    display_name: "Subodh",
    avatar_url: null,
    current_status: "studying",
    session_start_time: subodhStartTime,
    last_resumed_at: subodhStartTime,
    break_started_at: null,
    current_focus: "GATE Preparation",
    has_achiever_badge: true,
    created_at: new Date("2026-01-01T00:00:00.000Z").toISOString(),
    past_24h_study_seconds: subodhStudySeconds,
    weekly_study_seconds: 50000,
    total_sessions_count: 12,
    active_study_seconds_snapshot: 0,
    is_present: true,
  };

  const offlinePeer: UserProfile = {
    id: "peer-offline",
    display_name: "Rahul",
    avatar_url: null,
    current_status: "offline",
    session_start_time: null,
    last_resumed_at: null,
    break_started_at: null,
    current_focus: null,
    has_achiever_badge: false,
    created_at: new Date("2026-01-01T00:00:00.000Z").toISOString(),
    last_offline_at: new Date(now.getTime() - 1800 * 1000).toISOString(),
    past_24h_study_seconds: 0,
    weekly_study_seconds: 20000,
    total_sessions_count: 5,
    active_study_seconds_snapshot: 0,
    is_present: true, // Online presence heartbeat active even though not studying
  };

  it("Case 1: Exact 2h 49m 41s session is NOT expired and derives studying status", () => {
    // 1. Snapshot is 0, elapsed is 10,181s (< 10,800s max)
    expect(isMemberStudyExpired(subodhProfile, now)).toBe(false);
    expect(getEffectiveMemberStatus(subodhProfile, now)).toBe("studying");

    // 2. Authoritative customElapsedSeconds passed directly
    expect(isMemberStudyExpired(subodhProfile, now, 0, subodhStudySeconds)).toBe(false);
    expect(getEffectiveMemberStatus(subodhProfile, now, subodhStudySeconds)).toBe("studying");
  });

  it("Case 2: Prevents false expiration from snapshot double-counting after 1h 30m", () => {
    // Continuous session with snapshot=0 and customElapsedSeconds evaluated cleanly
    const continuousMember: UserProfile = {
      ...subodhProfile,
      active_study_seconds_snapshot: 0,
      last_resumed_at: subodhStartTime,
    };

    expect(isMemberStudyExpired(continuousMember, now, 0, subodhStudySeconds)).toBe(false);
    expect(getEffectiveMemberStatus(continuousMember, now, subodhStudySeconds)).toBe("studying");
  });

  it("Case 3: Correctly enforces 3-hour limit when study time genuinely exceeds 10,800 seconds", () => {
    const expiredSeconds = 10801; // 3h and 1s
    const expiredStartTime = new Date(now.getTime() - expiredSeconds * 1000).toISOString();

    const expiredMember: UserProfile = {
      ...subodhProfile,
      session_start_time: expiredStartTime,
      last_resumed_at: expiredStartTime,
      active_study_seconds_snapshot: 0,
    };

    expect(isMemberStudyExpired(expiredMember, now)).toBe(true);
    expect(getEffectiveMemberStatus(expiredMember, now)).toBe("offline");

    // Also holds when evaluated with customElapsedSeconds
    expect(isMemberStudyExpired(expiredMember, now, 0, expiredSeconds)).toBe(true);
    expect(getEffectiveMemberStatus(expiredMember, now, expiredSeconds)).toBe("offline");
  });

  it("Case 4: MemberList renders Subodh in STUDYING section (not OFFLINE) on own screen at 2h 49m", () => {
    render(
      <MemberList
        members={[subodhProfile, offlinePeer]}
        currentUserId={subodhProfile.id}
        currentUserElapsedSeconds={subodhStudySeconds}
        isLoading={false}
        isRealtimeConnected={true}
      />
    );

    // Subodh must be rendered under STUDYING section
    expect(screen.getByRole("heading", { name: /studying/i })).toBeInTheDocument();
    expect(screen.getByText("Subodh")).toBeInTheDocument();

    // Verify offline section has Rahul, not Subodh
    expect(screen.getByRole("heading", { name: /offline members/i })).toBeInTheDocument();
    expect(screen.getByText("Rahul")).toBeInTheDocument();
  });

  it("Case 5: Remote peer sees Subodh in STUDYING section at 2h 49m without desync", () => {
    render(
      <MemberList
        members={[subodhProfile, offlinePeer]}
        currentUserId="remote-peer-id"
        currentUserElapsedSeconds={0}
        isLoading={false}
        isRealtimeConnected={true}
      />
    );

    // Remote peer should see Subodh under STUDYING section
    expect(screen.getByRole("heading", { name: /studying/i })).toBeInTheDocument();
    expect(screen.getByText("Subodh")).toBeInTheDocument();
  });

  it("Case 6: MemberCard for self evaluates studying status with customElapsedSeconds and renders live duration", () => {
    render(
      <MemberCard
        member={subodhProfile}
        isCurrentUser={true}
        customElapsedSeconds={subodhStudySeconds}
        currentTimestamp={now}
      />
    );

    expect(screen.getByText("Subodh")).toBeInTheDocument();
    // Live timer formatted as 02:49:41
    expect(screen.getByText("02:49:41")).toBeInTheDocument();
  });

  it("Case 7: Genuine offline member with is_present=true shows grey online presence indicator", () => {
    render(
      <MemberList
        members={[offlinePeer]}
        currentUserId="someone-else"
        isLoading={false}
        isRealtimeConnected={true}
      />
    );

    expect(screen.getByRole("heading", { name: /offline members/i })).toBeInTheDocument();
    expect(screen.getByText("Rahul")).toBeInTheDocument();
    // Rahul has is_present: true while offline -> should render presence pill
    expect(screen.getByText(/online/i)).toBeInTheDocument();
  });

  it("Case 8: Reconciling state displays Syncing... indicator in MemberList", () => {
    const { rerender } = render(
      <MemberList
        members={[subodhProfile]}
        currentUserId={subodhProfile.id}
        currentUserElapsedSeconds={subodhStudySeconds}
        isLoading={false}
        isReconciling={true}
        isRealtimeConnected={true}
      />
    );

    expect(screen.getByText("Syncing...")).toBeInTheDocument();

    rerender(
      <MemberList
        members={[subodhProfile]}
        currentUserId={subodhProfile.id}
        currentUserElapsedSeconds={subodhStudySeconds}
        isLoading={false}
        isReconciling={false}
        isRealtimeConnected={true}
      />
    );

    expect(screen.getByText("Live Sync")).toBeInTheDocument();
  });
});
