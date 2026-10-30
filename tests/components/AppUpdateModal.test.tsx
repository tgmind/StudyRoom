import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { AppUpdateModal } from "@/components/ui/AppUpdateModal";
import * as useAppUpdateModule from "@/hooks/useAppUpdate";

describe("AppUpdateModal Component", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders nothing when no update is available", () => {
    vi.spyOn(useAppUpdateModule, "useAppUpdate").mockReturnValue({
      hasUpdate: false,
      isChecking: false,
      isRefreshing: false,
      currentBuildId: "build-1",
      latestBuildId: null,
      latestBuildTime: null,
      isDismissed: false,
      checkForUpdate: vi.fn(),
      refreshPlatform: vi.fn(),
      dismissUpdate: vi.fn(),
      reopenUpdateModal: vi.fn(),
    });

    const { container } = render(<AppUpdateModal />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the beautiful update window when an update is available", () => {
    const refreshSpy = vi.fn();
    const dismissSpy = vi.fn();

    vi.spyOn(useAppUpdateModule, "useAppUpdate").mockReturnValue({
      hasUpdate: true,
      isChecking: false,
      isRefreshing: false,
      currentBuildId: "build-old",
      latestBuildId: "build-new-deploy-xyz",
      latestBuildTime: "2026-10-30T14:30:00.000Z",
      isDismissed: false,
      checkForUpdate: vi.fn(),
      refreshPlatform: refreshSpy,
      dismissUpdate: dismissSpy,
      reopenUpdateModal: vi.fn(),
    });

    render(<AppUpdateModal />);

    // Header & Badges
    expect(screen.getByText(/NEW UPDATE PUBLISHED/i)).toBeInTheDocument();
    expect(screen.getByText("StudyRoom Updated")).toBeInTheDocument();
    expect(screen.getByText(/Clean Cache Refresh/i)).toBeInTheDocument();
    expect(screen.getByText(/Zero Data Loss/i)).toBeInTheDocument();

    // Refresh Platform Button
    const refreshBtn = screen.getByRole("button", { name: /Refresh Platform/i });
    expect(refreshBtn).toBeInTheDocument();

    // Click Refresh Platform
    fireEvent.click(refreshBtn);
    expect(refreshSpy).toHaveBeenCalledTimes(1);

    // Dismiss Button (Later)
    const laterBtn = screen.getByRole("button", { name: /Later/i });
    fireEvent.click(laterBtn);
    expect(dismissSpy).toHaveBeenCalledTimes(1);
  });

  it("renders the discreet floating capsule when snoozed/dismissed and allows reopening", () => {
    const reopenSpy = vi.fn();
    const refreshSpy = vi.fn();

    vi.spyOn(useAppUpdateModule, "useAppUpdate").mockReturnValue({
      hasUpdate: true,
      isChecking: false,
      isRefreshing: false,
      currentBuildId: "build-old",
      latestBuildId: "build-new-deploy-xyz",
      latestBuildTime: "2026-10-30T14:30:00.000Z",
      isDismissed: true, // User snoozed earlier
      checkForUpdate: vi.fn(),
      refreshPlatform: refreshSpy,
      dismissUpdate: vi.fn(),
      reopenUpdateModal: reopenSpy,
    });

    render(<AppUpdateModal />);

    // Main modal title should not be rendered
    expect(screen.queryByText("StudyRoom Updated")).not.toBeInTheDocument();

    // Floating capsule should be rendered
    expect(screen.getByText("Update Ready")).toBeInTheDocument();
    const reviewBtn = screen.getByRole("button", { name: /Review & Refresh/i });
    expect(reviewBtn).toBeInTheDocument();

    fireEvent.click(reviewBtn);
    expect(reopenSpy).toHaveBeenCalledTimes(1);

    // Fast refresh button
    const fastRefreshBtn = screen.getByRole("button", { name: /Refresh immediately/i });
    fireEvent.click(fastRefreshBtn);
    expect(refreshSpy).toHaveBeenCalledTimes(1);
  });
});
