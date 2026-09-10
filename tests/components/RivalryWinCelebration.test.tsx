import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { RivalryWinCelebration } from "@/components/room/RivalryWinCelebration";
import { RivalryWinEvent } from "@/lib/time/rivalry";

vi.mock("@/lib/utils/haptics", () => ({
  triggerHapticFeedback: vi.fn(),
}));

import { triggerHapticFeedback } from "@/lib/utils/haptics";

let mockLocalStorage: Record<string, string> = {};
let mockSessionStorage: Record<string, string> = {};

const createStorageMock = (storeRef: { current: Record<string, string> }) => ({
  getItem: (key: string) => storeRef.current[key] ?? null,
  setItem: (key: string, value: string) => {
    storeRef.current[key] = String(value);
  },
  removeItem: (key: string) => {
    delete storeRef.current[key];
  },
  clear: () => {
    storeRef.current = {};
  },
  length: 0,
  key: () => null,
});

const localStoreRef = { current: mockLocalStorage };
const sessionStoreRef = { current: mockSessionStorage };

describe("RivalryWinCelebration Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStoreRef.current = {};
    sessionStoreRef.current = {};
    vi.stubGlobal("localStorage", createStorageMock(localStoreRef));
    vi.stubGlobal("sessionStorage", createStorageMock(sessionStoreRef));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const mockWinEvent: RivalryWinEvent = {
    id: "win-user1-user2-100",
    winnerName: "Alice",
    loserName: "Bob",
    timestamp: Date.now() - 1000, // 1 second ago (fresh)
  };

  it("renders full-screen celebration modal and compact banner on first fresh arrival", () => {
    render(<RivalryWinCelebration winEvent={mockWinEvent} />);

    // Headline and victory notice
    expect(screen.getByText("Victory Claimed!")).toBeInTheDocument();
    expect(screen.getAllByText(/Alice/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Bob/).length).toBeGreaterThanOrEqual(1);

    // Haptic feedback should be triggered once
    expect(triggerHapticFeedback).toHaveBeenCalledTimes(1);
    expect(triggerHapticFeedback).toHaveBeenCalledWith([30, 40, 50]);
  });

  it("suppresses repeated full-screen popups and haptic triggers when re-rendered with duplicate win event", () => {
    const { rerender } = render(<RivalryWinCelebration winEvent={mockWinEvent} />);
    expect(triggerHapticFeedback).toHaveBeenCalledTimes(1);

    // Simulate incoming duplicate event packet (e.g. echo from broadcast or polling)
    const duplicateEvent: RivalryWinEvent = {
      ...mockWinEvent,
      timestamp: Date.now() - 500, // slightly different timestamp
    };

    rerender(<RivalryWinCelebration winEvent={duplicateEvent} />);

    // Haptics should NOT be re-triggered
    expect(triggerHapticFeedback).toHaveBeenCalledTimes(1);
  });

  it("persists dual-key dismissal (id and pair) when user dismisses the celebration", () => {
    const handleDismiss = vi.fn();
    render(<RivalryWinCelebration winEvent={mockWinEvent} onDismiss={handleDismiss} />);

    // Find and click dismiss button (e.g., in banner or modal)
    const closeButtons = screen.getAllByRole("button", { name: /close|dismiss/i });
    expect(closeButtons.length).toBeGreaterThan(0);
    fireEvent.click(closeButtons[0]);

    expect(handleDismiss).toHaveBeenCalled();

    // Verify localStorage has both id and pair dismissed keys
    expect(localStorage.getItem(`studyroom_win_dismissed_${mockWinEvent.id}`)).toBe("true");
    const pairDismissed = localStorage.getItem(`studyroom_win_dismissed_pair_${mockWinEvent.winnerName}_${mockWinEvent.loserName}`);
    expect(pairDismissed).toBeTruthy();
  });

  it("does not render when win event is already dismissed in localStorage", () => {
    localStorage.setItem(`studyroom_win_dismissed_${mockWinEvent.id}`, "true");

    const { container } = render(<RivalryWinCelebration winEvent={mockWinEvent} />);
    expect(container.firstChild).toBeNull();
  });

  it("does not render when pair was dismissed in localStorage within 15 minutes", () => {
    const pairKey = `studyroom_win_dismissed_pair_${mockWinEvent.winnerName}_${mockWinEvent.loserName}`;
    localStorage.setItem(pairKey, Date.now().toString());

    // Even if the event has a different ID
    const differentIdEvent: RivalryWinEvent = {
      id: "win-user1-user2-different-bucket",
      winnerName: "Alice",
      loserName: "Bob",
      timestamp: Date.now(),
    };

    const { container } = render(<RivalryWinCelebration winEvent={differentIdEvent} />);
    expect(container.firstChild).toBeNull();
  });

  it("does not render when win event is older than 15 minutes", () => {
    const oldWinEvent: RivalryWinEvent = {
      id: "win-old",
      winnerName: "Alice",
      loserName: "Bob",
      timestamp: Date.now() - 16 * 60 * 1000, // 16 mins ago
    };

    const { container } = render(<RivalryWinCelebration winEvent={oldWinEvent} />);
    expect(container.firstChild).toBeNull();
  });
});
