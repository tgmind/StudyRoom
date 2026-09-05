import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { LaunchAnnouncementModal, LAUNCH_UPDATE_STORAGE_KEY } from "@/components/ui/LaunchAnnouncementModal";

describe("StudyRoom UPDATE Modal Component", () => {
  let mockStorage: Record<string, string> = {};

  beforeEach(() => {
    mockStorage = {};
    const storageMock = {
      getItem: (key: string) => mockStorage[key] || null,
      setItem: (key: string, val: string) => {
        mockStorage[key] = val;
      },
      removeItem: (key: string) => {
        delete mockStorage[key];
      },
      clear: () => {
        mockStorage = {};
      },
      length: 0,
      key: () => null,
    };
    vi.stubGlobal("localStorage", storageMock);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("does not render when user has already acknowledged the update notice", () => {
    mockStorage[LAUNCH_UPDATE_STORAGE_KEY] = "true";

    render(<LaunchAnnouncementModal />);

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.queryByText("StudyRoom UPDATE")).toBeNull();
    expect(screen.queryByText("Understood")).toBeNull();
  });

  it("renders update notice with Leaderboard scoring reform, 3-hour limit, and Streak section and closes saving state on clicking Understood", () => {
    render(<LaunchAnnouncementModal />);

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getAllByText("StudyRoom UPDATE").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Fairer Leaderboard: Dual-Pillar Goal Index")).toBeDefined();
    expect(screen.getByText(/Setting 1 goal can no longer beat students/i)).toBeDefined();
    expect(screen.getByText("3-Hour Maximum Session Limit")).toBeDefined();
    expect(screen.getByText(/limited to a maximum of/i)).toBeDefined();
    expect(screen.getByText(/Brand-New "Streak" Heatmap Section/i)).toBeDefined();
    expect(screen.getByText(/Study for at least/i)).toBeDefined();

    const understoodBtn = screen.getByRole("button", { name: /understood/i });
    expect(understoodBtn).toBeDefined();

    fireEvent.click(understoodBtn);

    // Verify localStorage key is saved
    expect(mockStorage[LAUNCH_UPDATE_STORAGE_KEY]).toBe("true");
  });
});
