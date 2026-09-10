import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { AuthInstallOptions } from "@/components/auth/AuthInstallOptions";
import { PwaInstallBanner } from "@/components/ui/PwaInstallBanner";
import * as latestReleaseModule from "@/lib/app/latestRelease";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/login",
}));

describe("AuthInstallOptions and Dual Installation Flow", () => {
  let mockStorage: Record<string, string> = {};

  beforeEach(() => {
    vi.clearAllMocks();
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

    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  it("renders both Web PWA and Android App options", async () => {
    render(<AuthInstallOptions />);

    expect(screen.getByText("Web PWA")).toBeInTheDocument();
    expect(screen.getByText(/Install PWA/i)).toBeInTheDocument();
    expect(screen.getByText("Android App")).toBeInTheDocument();
    expect(screen.getByText(/Download APK/i)).toBeInTheDocument();
  });

  it("triggers direct APK download without navigating away or redirecting page", async () => {
    const triggerSpy = vi.spyOn(latestReleaseModule, "triggerApkDirectDownload").mockImplementation(() => {});

    render(<AuthInstallOptions />);

    const downloadBtn = screen.getByRole("button", { name: /download apk/i });
    fireEvent.click(downloadBtn);

    expect(triggerSpy).toHaveBeenCalledTimes(1);
    expect(triggerSpy).toHaveBeenCalledWith(
      expect.stringContaining(".apk"),
      expect.stringContaining("StudyRoom")
    );

    // Verify success toast appears indicating download started
    await waitFor(() => {
      expect(screen.getByText(/Download started!/i)).toBeInTheDocument();
    });
  });

  it("triggers PWA installation prompt when beforeinstallprompt event is fired", async () => {
    const promptMock = vi.fn().mockResolvedValue(undefined);
    const userChoiceMock = Promise.resolve({ outcome: "accepted" as const });

    render(<AuthInstallOptions />);

    // Simulate beforeinstallprompt event wrapped in act
    await act(async () => {
      const event = new Event("beforeinstallprompt") as any;
      event.prompt = promptMock;
      event.userChoice = userChoiceMock;
      window.dispatchEvent(event);
    });

    const pwaBtn = screen.getByRole("button", { name: /install pwa/i });
    await act(async () => {
      fireEvent.click(pwaBtn);
    });

    expect(promptMock).toHaveBeenCalledTimes(1);
  });

  it("renders dual-choice floating PwaInstallBanner on auth pages", async () => {
    const triggerSpy = vi.spyOn(latestReleaseModule, "triggerApkDirectDownload").mockImplementation(() => {});

    render(<PwaInstallBanner />);

    // On /login, banner is shown automatically
    expect(screen.getByText("Install StudyRoom App")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /install pwa/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /get apk/i })).toBeInTheDocument();

    // Clicking Get APK triggers direct download
    fireEvent.click(screen.getByRole("button", { name: /get apk/i }));
    expect(triggerSpy).toHaveBeenCalledTimes(1);
  });
});
