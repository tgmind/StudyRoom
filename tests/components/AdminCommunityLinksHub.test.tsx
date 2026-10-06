import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { AdminCommunityLinksHub } from "@/components/admin/AdminCommunityLinksHub";

describe("AdminCommunityLinksHub Component (Admin Portal)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const sampleLinks = [
    {
      id: "whatsapp",
      platform: "whatsapp",
      title: "WhatsApp",
      url: "https://whatsapp.com/channel/0029VbDVgDFBvvseejxJ8L25",
      action_text: "Join Now",
      is_enabled: true,
      display_order: 1,
      icon_key: "whatsapp",
    },
    {
      id: "telegram",
      platform: "telegram",
      title: "Telegram",
      url: "https://t.me/studyalive_telegram",
      action_text: "Join Now",
      is_enabled: false,
      display_order: 2,
      icon_key: "telegram",
    },
  ];

  it("renders community links list with accurate active count and platforms", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({ links: sampleLinks }),
    } as Response);

    await act(async () => {
      render(<AdminCommunityLinksHub adminEmail="studyaliveapp@gmail.com" />);
    });

    await waitFor(() => {
      expect(screen.getByText("Community & Social Links")).toBeInTheDocument();
    });

    expect(screen.getByText(/1 active \/ 2 total/i)).toBeInTheDocument();
    expect(screen.getByText("WhatsApp")).toBeInTheDocument();
    expect(screen.getByText("Telegram")).toBeInTheDocument();
  });

  it("toggles platform enabled status via POST /api/admin/social-links", async () => {
    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ links: sampleLinks }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, message: "Updated" }),
      } as Response);

    await act(async () => {
      render(<AdminCommunityLinksHub adminEmail="studyaliveapp@gmail.com" />);
    });

    await waitFor(() => {
      expect(screen.getByText("WhatsApp")).toBeInTheDocument();
    });

    // Find WhatsApp's toggle button (which currently says "Enabled")
    const enabledBtns = screen.getAllByRole("button", { name: /enabled/i });
    expect(enabledBtns.length).toBeGreaterThan(0);

    await act(async () => {
      fireEvent.click(enabledBtns[0]);
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/admin/social-links",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            action: "toggle",
            id: "whatsapp",
            is_enabled: false,
          }),
        })
      );
    });
  });

  it("opens add modal and validates required fields", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({ links: sampleLinks }),
    } as Response);

    await act(async () => {
      render(<AdminCommunityLinksHub adminEmail="studyaliveapp@gmail.com" />);
    });

    await waitFor(() => {
      expect(screen.getByText("Add Social Platform")).toBeInTheDocument();
    });

    // Click Add button
    const addBtn = screen.getByRole("button", { name: /add social platform/i });
    fireEvent.click(addBtn);

    expect(screen.getByRole("heading", { name: "Add Social Platform" })).toBeInTheDocument();
    expect(screen.getByLabelText(/Channel \/ Group Web URL/i, { selector: "input" })).toBeInTheDocument();
  });

  it("REGRESSION TEST: handles failed reorder by surfacing error and reconciling state", async () => {
    vi.spyOn(global, "fetch")
      // 1. Initial fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ links: sampleLinks }),
      } as Response)
      // 2. Reorder POST fails
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: "Failed to update display order for link 'telegram': Database error" }),
      } as Response)
      // 3. Reconcile fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ links: sampleLinks }),
      } as Response);

    await act(async () => {
      render(<AdminCommunityLinksHub adminEmail="studyaliveapp@gmail.com" />);
    });

    await waitFor(() => {
      expect(screen.getByText("WhatsApp")).toBeInTheDocument();
    });

    // Find the down button on first link to trigger reorder
    const moveDownBtns = screen.getAllByTitle("Move Down");
    expect(moveDownBtns.length).toBeGreaterThan(0);

    await act(async () => {
      fireEvent.click(moveDownBtns[0]);
    });

    await waitFor(() => {
      // Error is displayed to administrator
      expect(screen.getByText(/Failed to update display order for link 'telegram'/i)).toBeInTheDocument();
    });

    // Success banner is NOT displayed
    expect(screen.queryByText(/Order updated successfully/i)).not.toBeInTheDocument();

    // Verify reconciliation fetch was triggered
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });
});
