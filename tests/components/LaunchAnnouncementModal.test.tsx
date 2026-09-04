import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { LaunchAnnouncementModal } from "@/components/ui/LaunchAnnouncementModal";

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
    mockStorage["studyroom_update_3h_notice_v1"] = "true";

    render(<LaunchAnnouncementModal />);

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.queryByText("StudyRoom UPDATE")).toBeNull();
    expect(screen.queryByText("Understood")).toBeNull();
  });

  it("renders update notice and closes saving state on clicking Understood", () => {
    render(<LaunchAnnouncementModal />);

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getAllByText("StudyRoom UPDATE").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Study Sessions Capped at 3 Hours")).toBeDefined();
    expect(screen.getByText(/restricted to a maximum of 3 hours per session/i)).toBeDefined();

    const understoodBtn = screen.getByRole("button", { name: /understood/i });
    expect(understoodBtn).toBeDefined();

    fireEvent.click(understoodBtn);

    // Verify localStorage key is saved
    expect(mockStorage["studyroom_update_3h_notice_v1"]).toBe("true");
  });
});
