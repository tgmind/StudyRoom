import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { BreakExpiredModal } from "@/components/session/BreakExpiredModal";

describe("BreakExpiredModal Component", () => {
  it("renders the 1-hour break timeout notice accurately", () => {
    render(
      <BreakExpiredModal
        isOpen={true}
        onClose={vi.fn()}
        onStartNewSession={vi.fn()}
        savedStudySeconds={1500}
      />
    );

    expect(
      screen.getByText(
        "You stayed on break for more than 1 hour. Session has been stopped. Start a new session."
      )
    ).toBeInTheDocument();

    expect(screen.getByText("Start New Session")).toBeInTheDocument();
    expect(screen.getByText("Dismiss")).toBeInTheDocument();
  });

  it("calls onStartNewSession when 'Start New Session' is clicked", () => {
    const handleStartNew = vi.fn();
    const handleClose = vi.fn();

    render(
      <BreakExpiredModal
        isOpen={true}
        onClose={handleClose}
        onStartNewSession={handleStartNew}
        savedStudySeconds={3600}
      />
    );

    fireEvent.click(screen.getByText("Start New Session"));
    expect(handleClose).toHaveBeenCalled();
    expect(handleStartNew).toHaveBeenCalled();
  });
});
