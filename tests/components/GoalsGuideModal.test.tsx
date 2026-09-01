import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { GoalsGuideModal } from "@/components/goals/GoalsGuideModal";

describe("GoalsGuideModal Component", () => {
  it("renders educational content about rolling 24h goals and append-only rules", () => {
    render(<GoalsGuideModal isOpen={true} onClose={vi.fn()} />);

    expect(screen.getByText(/Rolling 24-Hour Goals Guide/i)).toBeInTheDocument();
    expect(screen.getByText(/Continuous 24-Hour Windows/i)).toBeInTheDocument();
    expect(screen.getByText(/Add Multiple or One-by-One/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Append-Only Accountability/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Completing Goals in Room/i)).toBeInTheDocument();
    expect(screen.getByText(/30% Leaderboard Contribution/i)).toBeInTheDocument();
  });
});
