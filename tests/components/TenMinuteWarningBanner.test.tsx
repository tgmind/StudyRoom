import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { TenMinuteWarningBanner } from "@/components/session/TenMinuteWarningBanner";

describe("TenMinuteWarningBanner Component", () => {
  it("renders session expiring soon banner with compact minimal text", () => {
    const handleDismiss = vi.fn();
    render(
      <TenMinuteWarningBanner
        type="session"
        remainingSeconds={540}
        onDismiss={handleDismiss}
      />
    );

    expect(screen.getByText("Session limit in")).toBeInTheDocument();
    expect(screen.getByText("09:00")).toBeInTheDocument();
    expect(screen.getByText(/Wrap up goals/i)).toBeInTheDocument();
  });

  it("renders break expiring soon banner with compact minimal text", () => {
    const handleDismiss = vi.fn();
    render(
      <TenMinuteWarningBanner
        type="break"
        remainingSeconds={300}
        onDismiss={handleDismiss}
      />
    );

    expect(screen.getByText("Break expires in")).toBeInTheDocument();
    expect(screen.getByText("05:00")).toBeInTheDocument();
    expect(screen.getByText(/Resume soon/i)).toBeInTheDocument();
  });

  it("calls onDismiss when close button is clicked", () => {
    const handleDismiss = vi.fn();
    render(
      <TenMinuteWarningBanner
        type="session"
        remainingSeconds={600}
        onDismiss={handleDismiss}
      />
    );

    const closeBtn = screen.getByRole("button", { name: /dismiss alert/i });
    fireEvent.click(closeBtn);

    expect(handleDismiss).toHaveBeenCalledTimes(1);
  });
});

