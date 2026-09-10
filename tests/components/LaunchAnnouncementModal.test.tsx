import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { LaunchAnnouncementModal, LAUNCH_UPDATE_STORAGE_KEY } from "@/components/ui/LaunchAnnouncementModal";

let mockPathname = "/room";
let mockAuthContext: { user: { id: string } | null; loading: boolean } | null = {
  user: { id: "user-test-123" },
  loading: false,
};

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

vi.mock("@/components/auth/AuthProvider", () => ({
  useAuthContext: () => mockAuthContext,
}));

describe("StudyRoom UPDATE Modal Component", () => {
  let mockStorage: Record<string, string> = {};

  beforeEach(() => {
    mockStorage = {};
    mockPathname = "/room";
    mockAuthContext = {
      user: { id: "user-test-123" },
      loading: false,
    };

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

  it("strictly suppresses rendering on /login route", () => {
    mockPathname = "/login";

    render(<LaunchAnnouncementModal />);

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.queryByText("StudyRoom UPDATE")).toBeNull();
    expect(screen.queryByText("Understood")).toBeNull();
  });

  it("strictly suppresses rendering on /signup route", () => {
    mockPathname = "/signup";

    render(<LaunchAnnouncementModal />);

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.queryByText("StudyRoom UPDATE")).toBeNull();
    expect(screen.queryByText("Understood")).toBeNull();
  });

  it("strictly suppresses rendering when user is not authenticated", () => {
    mockPathname = "/room";
    mockAuthContext = {
      user: null,
      loading: false,
    };

    render(<LaunchAnnouncementModal />);

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.queryByText("StudyRoom UPDATE")).toBeNull();
    expect(screen.queryByText("Understood")).toBeNull();
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

  it("renders update notice for authenticated user on /room and saves acknowledgment on clicking Understood", () => {
    mockPathname = "/room";
    mockAuthContext = {
      user: { id: "user-test-123" },
      loading: false,
    };

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

    // Verify localStorage keys (global + per-user) are saved
    expect(mockStorage[LAUNCH_UPDATE_STORAGE_KEY]).toBe("true");
    expect(mockStorage[`${LAUNCH_UPDATE_STORAGE_KEY}_user-test-123`]).toBe("true");
  });
});
