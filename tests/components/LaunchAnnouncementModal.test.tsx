import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { LaunchAnnouncementModal } from "@/components/ui/LaunchAnnouncementModal";

describe("LaunchAnnouncementModal Component", () => {
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

  it("does not render when user has already acknowledged the launch notice", () => {
    mockStorage["studyroom_launch_notice_seen_v1"] = "true";

    render(<LaunchAnnouncementModal />);

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.queryByText("StudyRoom Official Launch")).toBeNull();
    expect(screen.queryByText("Understood")).toBeNull();
  });

  it("renders when launched and closes saving state on clicking Understood", () => {
    // Set time to post-launch (e.g. Sep 4, 2026 morning)
    vi.setSystemTime(new Date("2026-09-04T02:00:00Z"));

    render(<LaunchAnnouncementModal />);

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByText("StudyRoom Official Launch")).toBeDefined();
    expect(screen.getByText("The Platform is Freshly Initialized!")).toBeDefined();

    const understoodBtn = screen.getByRole("button", { name: /understood/i });
    expect(understoodBtn).toBeDefined();

    fireEvent.click(understoodBtn);

    // Verify localStorage key is saved
    expect(mockStorage["studyroom_launch_notice_seen_v1"]).toBe("true");
  });
});
