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

    expect(screen.queryByText("StudyRoom App Launch")).toBeNull();
    expect(screen.queryByText(/Download Native App/i)).toBeNull();
  });

  it("strictly suppresses rendering on /signup route", () => {
    mockPathname = "/signup";

    render(<LaunchAnnouncementModal />);

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.queryByText("StudyRoom App Launch")).toBeNull();
    expect(screen.queryByText(/Download Native App/i)).toBeNull();
  });

  it("strictly suppresses rendering on /onboarding route", () => {
    mockPathname = "/onboarding";

    render(<LaunchAnnouncementModal />);

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.queryByText("StudyRoom App Launch")).toBeNull();
    expect(screen.queryByText(/Download Native App/i)).toBeNull();
  });

  it("does not render when user has already acknowledged the update notice", () => {
    mockStorage[LAUNCH_UPDATE_STORAGE_KEY] = "true";

    render(<LaunchAnnouncementModal />);

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.queryByText("StudyRoom App Launch")).toBeNull();
    expect(screen.queryByText(/Download Native App/i)).toBeNull();
  });

  it("renders stable app announcement on /room and saves acknowledgment when dismissed", () => {
    mockPathname = "/room";
    mockAuthContext = {
      user: { id: "user-test-123" },
      loading: false,
    };

    render(<LaunchAnnouncementModal />);

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getAllByText("StudyRoom App Launch").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Switch to the Native Android App")).toBeDefined();
    expect(screen.getByText("0ms Instant Launch & Zero Freezes")).toBeDefined();
    expect(screen.getByText("Live Notification Chronometer")).toBeDefined();
    expect(screen.getByText("Rock-Solid Background Sync")).toBeDefined();

    const continueBtn = screen.getByRole("button", { name: /continue on webapp for now/i });
    expect(continueBtn).toBeDefined();

    fireEvent.click(continueBtn);

    // Verify localStorage keys (global + per-user) are saved
    expect(mockStorage[LAUNCH_UPDATE_STORAGE_KEY]).toBe("true");
    expect(mockStorage[`${LAUNCH_UPDATE_STORAGE_KEY}_user-test-123`]).toBe("true");
  });

  it("renders stable app announcement on /room even during initial page load while auth is loading", () => {
    mockPathname = "/room";
    mockAuthContext = {
      user: null,
      loading: true,
    };

    render(<LaunchAnnouncementModal />);

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getAllByText("StudyRoom App Launch").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Switch to the Native Android App")).toBeDefined();
  });
});
