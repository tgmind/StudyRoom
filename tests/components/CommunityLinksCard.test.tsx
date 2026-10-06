import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { CommunityLinksCard } from "@/components/settings/CommunityLinksCard";

describe("CommunityLinksCard Component (Settings UI)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders WhatsApp and Telegram buttons side by side with 'Join Now' and external links", async () => {
    const mockLinks = [
      {
        id: "whatsapp",
        platform: "whatsapp",
        title: "WhatsApp",
        url: "https://whatsapp.com/channel/0029VbDVgDFBvvseejxJ8L25",
        action_text: "Join Now",
        is_enabled: true,
        display_order: 1,
      },
      {
        id: "telegram",
        platform: "telegram",
        title: "Telegram",
        url: "https://t.me/studyalive_telegram",
        action_text: "Join Now",
        is_enabled: true,
        display_order: 2,
      },
    ];

    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({ links: mockLinks }),
    } as Response);

    await act(async () => {
      render(<CommunityLinksCard />);
    });

    await waitFor(() => {
      expect(screen.getByTestId("community-links-card")).toBeInTheDocument();
    });

    // Check heading
    expect(screen.getByText("Community Channels")).toBeInTheDocument();

    // Check both buttons
    const whatsappLink = screen.getByRole("link", { name: /WhatsApp - Join Now/i });
    expect(whatsappLink).toBeInTheDocument();
    expect(whatsappLink).toHaveAttribute("href", "https://whatsapp.com/channel/0029VbDVgDFBvvseejxJ8L25");
    expect(whatsappLink).toHaveAttribute("target", "_blank");
    expect(whatsappLink).toHaveAttribute("rel", "noopener noreferrer");

    const telegramLink = screen.getByRole("link", { name: /Telegram - Join Now/i });
    expect(telegramLink).toBeInTheDocument();
    expect(telegramLink).toHaveAttribute("href", "https://t.me/studyalive_telegram");
    expect(telegramLink).toHaveAttribute("target", "_blank");
    expect(telegramLink).toHaveAttribute("rel", "noopener noreferrer");

    // Check action text
    const joinNowTexts = screen.getAllByText("Join Now");
    expect(joinNowTexts).toHaveLength(2);
  });

  it("omits disabled links when administrator disables a channel", async () => {
    // Only Telegram enabled
    const mockLinks = [
      {
        id: "telegram",
        platform: "telegram",
        title: "Telegram",
        url: "https://t.me/studyalive_telegram",
        action_text: "Join Now",
        is_enabled: true,
        display_order: 2,
      },
    ];

    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({ links: mockLinks }),
    } as Response);

    await act(async () => {
      render(<CommunityLinksCard />);
    });

    await waitFor(() => {
      expect(screen.getByTestId("community-links-card")).toBeInTheDocument();
    });

    expect(screen.queryByText("WhatsApp")).not.toBeInTheDocument();
    expect(screen.getByText("Telegram")).toBeInTheDocument();
  });

  it("cleanly hides the card when all links are disabled or empty in database", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({ links: [] }),
    } as Response);

    const { container } = render(<CommunityLinksCard />);

    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });

    expect(screen.queryByTestId("community-links-card")).not.toBeInTheDocument();
  });

  it("does NOT fall back to default links on API failure and instead hides cleanly", async () => {
    vi.spyOn(global, "fetch").mockRejectedValueOnce(new Error("Network connection dropped"));

    const { container } = render(<CommunityLinksCard />);

    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });

    // Verify default links were NOT resurrected
    expect(screen.queryByText("WhatsApp")).not.toBeInTheDocument();
    expect(screen.queryByText("Telegram")).not.toBeInTheDocument();
  });
});

  it("handles multiple (3+) social links cleanly in a responsive 2-column grid without overflow", async () => {
    const multiLinks = [
      {
        id: "whatsapp",
        platform: "whatsapp",
        title: "WhatsApp",
        url: "https://whatsapp.com/channel/0029VbDVgDFBvvseejxJ8L25",
        action_text: "Join Now",
        is_enabled: true,
        display_order: 1,
      },
      {
        id: "telegram",
        platform: "telegram",
        title: "Telegram",
        url: "https://t.me/studyalive_telegram",
        action_text: "Join Now",
        is_enabled: true,
        display_order: 2,
      },
      {
        id: "youtube",
        platform: "youtube",
        title: "YouTube",
        url: "https://youtube.com/@studyalive",
        action_text: "Subscribe",
        is_enabled: true,
        display_order: 3,
      },
      {
        id: "instagram",
        platform: "instagram",
        title: "Instagram",
        url: "https://instagram.com/studyalive",
        action_text: "Follow",
        is_enabled: true,
        display_order: 4,
      },
    ];

    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({ links: multiLinks }),
    } as Response);

    await act(async () => {
      render(<CommunityLinksCard />);
    });

    await waitFor(() => {
      expect(screen.getByTestId("community-links-card")).toBeInTheDocument();
    });

    const linksRendered = screen.getAllByRole("link");
    expect(linksRendered).toHaveLength(4);

    const gridContainer = linksRendered[0].parentElement;
    expect(gridContainer).toHaveClass("grid");
    expect(gridContainer).toHaveClass("grid-cols-2");
  });
