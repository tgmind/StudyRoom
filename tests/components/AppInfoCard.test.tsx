import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { AppInfoCard } from "@/components/settings/AppInfoCard";
import * as latestReleaseModule from "@/lib/app/latestRelease";

describe("AppInfoCard Component", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders 'You are on the latest version of StudyRoom app.' for up-to-date native app users", async () => {
    vi.spyOn(latestReleaseModule, "getAppEnvironmentInfo").mockReturnValue({
      isNativeApp: true,
      isPwa: false,
      installedVersion: "1.0.1",
      platformLabel: "Android App",
    });

    vi.spyOn(latestReleaseModule, "fetchLatestApkRelease").mockResolvedValue({
      version: "v1.0.1",
      apkDownloadUrl: "https://github.com/tgmind/StudyRoom/releases/download/v1.0.1/StudyRoom-v1.0.1.apk",
      apkSizeMb: "15",
    });

    await act(async () => {
      render(<AppInfoCard />);
    });

    expect(screen.getByText("StudyRoom App")).toBeInTheDocument();
    expect(screen.getByText(/You are on the latest version of StudyRoom app\./i)).toBeInTheDocument();
    expect(screen.getByText(/v1\.0\.1 • Up to Date/i)).toBeInTheDocument();

    // Verify NO download/install button is displayed for up-to-date users
    expect(screen.queryByRole("button", { name: /install|download|update/i })).not.toBeInTheDocument();
  });

  it("renders update prompt and direct download button for outdated native app users (v1.0.0)", async () => {
    vi.spyOn(latestReleaseModule, "getAppEnvironmentInfo").mockReturnValue({
      isNativeApp: true,
      isPwa: false,
      installedVersion: "1.0.0",
      platformLabel: "Android App",
    });

    vi.spyOn(latestReleaseModule, "fetchLatestApkRelease").mockResolvedValue({
      version: "v1.0.1",
      apkDownloadUrl: "https://github.com/tgmind/StudyRoom/releases/download/v1.0.1/StudyRoom-v1.0.1.apk",
      apkSizeMb: "15",
    });

    const triggerSpy = vi.spyOn(latestReleaseModule, "triggerApkDirectDownload").mockImplementation(() => {});

    await act(async () => {
      render(<AppInfoCard />);
    });

    expect(screen.getByText(/New Version v1\.0\.1 Available/i)).toBeInTheDocument();
    expect(screen.getByText(/Your current app is on v1\.0\.0/i)).toBeInTheDocument();

    const updateBtn = screen.getByRole("button", { name: /update to v1\.0\.1/i });
    expect(updateBtn).toBeInTheDocument();

    // Clicking the button triggers direct download without redirect
    fireEvent.click(updateBtn);
    expect(triggerSpy).toHaveBeenCalledTimes(1);
    expect(triggerSpy).toHaveBeenCalledWith(
      expect.stringContaining("StudyRoom-v1.0.1.apk"),
      "StudyRoom-v1.0.1.apk"
    );

    expect(screen.getByText(/Starting Download.../i)).toBeInTheDocument();

    // Verify feedback state appears
    await waitFor(() => {
      expect(screen.getByText(/Download Started! Check Notification Shade/i)).toBeInTheDocument();
    }, { timeout: 2000 });
  });

  it("renders native app install button for Web PWA and browser visitors", async () => {
    vi.spyOn(latestReleaseModule, "getAppEnvironmentInfo").mockReturnValue({
      isNativeApp: false,
      isPwa: true,
      installedVersion: null,
      platformLabel: "Web PWA",
    });

    vi.spyOn(latestReleaseModule, "fetchLatestApkRelease").mockResolvedValue({
      version: "v1.0.1",
      apkDownloadUrl: "https://github.com/tgmind/StudyRoom/releases/download/v1.0.1/StudyRoom-v1.0.1.apk",
      apkSizeMb: "15",
    });

    const triggerSpy = vi.spyOn(latestReleaseModule, "triggerApkDirectDownload").mockImplementation(() => {});

    await act(async () => {
      render(<AppInfoCard />);
    });

    expect(screen.getByText(/Upgrade to the Native Android App/i)).toBeInTheDocument();
    expect(screen.getByText(/Platform • Web PWA/i)).toBeInTheDocument();

    const installBtn = screen.getByRole("button", { name: /install studyroom app/i });
    expect(installBtn).toBeInTheDocument();

    fireEvent.click(installBtn);
    expect(triggerSpy).toHaveBeenCalledTimes(1);
    expect(triggerSpy).toHaveBeenCalledWith(
      expect.stringContaining("StudyRoom-v1.0.1.apk"),
      "StudyRoom-v1.0.1.apk"
    );

    expect(screen.getByText(/Starting Download.../i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/Download Started! Check Notification Shade/i)).toBeInTheDocument();
    }, { timeout: 2000 });
  });
});
