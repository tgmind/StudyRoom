import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { EmptyStudyRoomState } from "@/components/room/EmptyStudyRoomState";

describe("EmptyStudyRoomState Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (window as any).__studyRoomStartSession;
  });

  it("renders the minimized mobile layout with lamp graphic as center of attraction and short heading", () => {
    const { container } = render(<EmptyStudyRoomState totalMembers={9} />);

    // Mobile container (< lg)
    const mobileContainer = container.querySelector(".lg\\:hidden");
    expect(mobileContainer).toBeInTheDocument();

    // Contains the lamp illustration as center of attraction
    expect(mobileContainer?.querySelector("svg")).toBeInTheDocument();

    // Contains short heading and minimized supporting text
    expect(mobileContainer).toHaveTextContent("No members studying");
    expect(mobileContainer).toHaveTextContent("Start your timer to lead the session");

    // Does NOT contain redundant buttons or pills in mobile layout
    expect(mobileContainer?.querySelector("button")).toBeNull();
    expect(mobileContainer).not.toHaveTextContent("Live Peer Study • Room Quiet");
    expect(mobileContainer).not.toHaveTextContent("9 peers in room available");
  });

  it("displays singular peer text when totalMembers is 1", () => {
    render(<EmptyStudyRoomState totalMembers={1} />);
    expect(screen.getAllByText(/1 peer in room available/i).length).toBeGreaterThanOrEqual(1);
  });

  it("displays fallback text when totalMembers is 0", () => {
    render(<EmptyStudyRoomState totalMembers={0} />);
    expect(screen.getAllByText(/Be the first in the room/i).length).toBeGreaterThanOrEqual(1);
  });

  it("calls onStartSession prop when Start Studying button is clicked", () => {
    const onStartSession = vi.fn();
    render(<EmptyStudyRoomState totalMembers={5} onStartSession={onStartSession} />);

    const startButtons = screen.getAllByRole("button", { name: /Start Studying/i });
    expect(startButtons.length).toBeGreaterThanOrEqual(1);

    fireEvent.click(startButtons[0]);
    expect(onStartSession).toHaveBeenCalledTimes(1);
  });

  it("invokes window.__studyRoomStartSession fallback when onStartSession is not provided", () => {
    const windowStartMock = vi.fn();
    (window as any).__studyRoomStartSession = windowStartMock;

    render(<EmptyStudyRoomState totalMembers={3} />);

    const startButtons = screen.getAllByRole("button", { name: /Start Studying/i });
    fireEvent.click(startButtons[0]);

    expect(windowStartMock).toHaveBeenCalledTimes(1);
  });
});
