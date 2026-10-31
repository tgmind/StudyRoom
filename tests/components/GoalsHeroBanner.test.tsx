import React from "react";
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GoalsHeroBanner } from "@/components/goals/GoalsHeroBanner";

describe("GoalsHeroBanner Component", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders the motivational summit hero banner by default without the removed pill", () => {
    render(<GoalsHeroBanner />);
    expect(screen.getByAltText(/Late night study desk overlooking illuminated mountain path/i)).toBeInTheDocument();
    expect(screen.getByTitle(/Minimize motivation banner/i)).toBeInTheDocument();
    expect(screen.queryByText(/Ascend The Peak/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Every hour lights your path/i)).not.toBeInTheDocument();
  });

  it("allows collapsing and expanding the banner with state saved to localStorage", () => {
    render(<GoalsHeroBanner />);

    // Click collapse button
    const collapseBtn = screen.getByTitle(/Minimize motivation banner/i);
    fireEvent.click(collapseBtn);

    // Should now show the compact collapsed view
    expect(screen.getByText(/The Summit Awaits/i)).toBeInTheDocument();
    expect(localStorage.getItem("sr_goals_hero_collapsed")).toBe("true");

    // Click expand button
    const expandBtn = screen.getByTitle(/Expand motivational banner/i);
    fireEvent.click(expandBtn);

    // Should be restored to the full banner
    expect(screen.getByAltText(/Late night study desk overlooking illuminated mountain path/i)).toBeInTheDocument();
    expect(localStorage.getItem("sr_goals_hero_collapsed")).toBe("false");
  });
});
