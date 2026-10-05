import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { BottomNav, NAV_INACTIVITY_MS } from "@/components/navigation/BottomNav";

let mockPathname = "/room";
let pathnameListeners: Array<() => void> = [];

function setMockPathname(newPath: string) {
  mockPathname = newPath;
  pathnameListeners.forEach((listener) => listener());
}

vi.mock("next/navigation", () => ({
  usePathname: () => {
    const [, setTick] = React.useState(0);
    React.useEffect(() => {
      const listener = () => setTick((t) => t + 1);
      pathnameListeners.push(listener);
      return () => {
        pathnameListeners = pathnameListeners.filter((l) => l !== listener);
      };
    }, []);
    return mockPathname;
  },
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
}));

describe("BottomNav Component", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockPathname = "/room";
    pathnameListeners = [];
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  // 1 & 2: All existing navigation items render with labels and links
  it("renders all 7 canonical navigation items with correct labels and links", () => {
    render(<BottomNav isStudying={false} />);

    const expectedItems = [
      { label: "Room", href: "/room" },
      { label: "Rankings", href: "/leaderboard" },
      { label: "Analytics", href: "/analytics" },
      { label: "Streak", href: "/streak" },
      { label: "Goals", href: "/goals" },
      { label: "History", href: "/history" },
      { label: "Settings", href: "/settings" },
    ];

    expectedItems.forEach(({ label, href }) => {
      const link = screen.getByRole("link", { name: new RegExp(label, "i") });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute("href", href);
    });
  });

  // 3 & 4: Correct active item receives the new high-contrast active treatment
  it("applies the modern high-contrast white background active indication to the current route", () => {
    setMockPathname("/leaderboard");
    render(<BottomNav isStudying={false} />);

    const activeLink = screen.getByRole("link", { name: /Rankings/i });
    expect(activeLink).toHaveClass("bg-white");
    expect(activeLink).toHaveClass("text-zinc-950");
    expect(activeLink).toHaveAttribute("aria-current", "page");

    // Inactive link should NOT have bg-white
    const inactiveLink = screen.getByRole("link", { name: /Room/i });
    expect(inactiveLink).not.toHaveClass("bg-white");
    expect(inactiveLink).not.toHaveAttribute("aria-current");
  });

  it("applies the high-contrast active indication when on /analytics", () => {
    setMockPathname("/analytics");
    render(<BottomNav isStudying={false} />);

    const analyticsLink = screen.getByRole("link", { name: /Global Analytics/i });
    expect(analyticsLink).toHaveClass("bg-white");
    expect(analyticsLink).toHaveClass("text-zinc-950");
    expect(analyticsLink).toHaveAttribute("aria-current", "page");

    // Other links like Rankings and Room should NOT be active
    const rankingsLink = screen.getByRole("link", { name: /Rankings/i });
    expect(rankingsLink).not.toHaveClass("bg-white");
    expect(rankingsLink).not.toHaveAttribute("aria-current");

    const roomLink = screen.getByRole("link", { name: /Room/i });
    expect(roomLink).not.toHaveClass("bg-white");
    expect(roomLink).not.toHaveAttribute("aria-current");
  });

  // 5: Nested route matching works
  it("supports nested route matching for sub-paths", () => {
    setMockPathname("/goals/daily-challenge");
    render(<BottomNav isStudying={false} />);

    const goalsLink = screen.getByRole("link", { name: /Goals/i });
    expect(goalsLink).toHaveClass("bg-white");
    expect(goalsLink).toHaveAttribute("aria-current", "page");
  });

  // 6: Root / does not incorrectly match unrelated routes
  it("does not match root path '/' against other pages like /room", () => {
    setMockPathname("/");
    render(<BottomNav isStudying={false} />);

    // None of the canonical items should be active when on '/'
    const links = screen.getAllByRole("link");
    links.forEach((link) => {
      expect(link).not.toHaveAttribute("aria-current", "page");
      expect(link).not.toHaveClass("bg-white");
    });
  });

  // Streak special case
  it("preserves special flame visual styling when Streak is active", () => {
    setMockPathname("/streak");
    render(<BottomNav isStudying={false} />);

    const streakLink = screen.getByRole("link", { name: /Streak/i });
    expect(streakLink).toHaveClass("bg-white");
    expect(streakLink).toHaveAttribute("aria-current", "page");

    // Should contain the flame svg with amber styling
    const flameIcon = streakLink.querySelector("svg");
    expect(flameIcon).toHaveClass("text-amber-500");
  });

  // 7: When not in study session, stays expanded in full original form
  it("stays expanded in full original form when NOT in a study session and does not auto-collapse", () => {
    render(<BottomNav isStudying={false} />);

    const nav = screen.getByRole("navigation");
    expect(nav).toHaveClass("translate-y-0");
    expect(nav).toHaveClass("opacity-100");
    expect(nav).not.toHaveAttribute("aria-hidden", "true");

    // Advance 30 seconds - should STILL be expanded because user is NOT studying
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(nav).toHaveClass("translate-y-0");
    expect(screen.queryByRole("button", { name: /Open navigation panel/i })).not.toBeInTheDocument();
  });

  // 8: Manual hiding via arrow button when not in study session
  it("allows manual hiding via arrow button when not in study session, and expands back on dot press", () => {
    render(<BottomNav isStudying={false} />);
    const nav = screen.getByRole("navigation");

    // Arrow button is present
    const arrowButton = screen.getByRole("button", { name: /Collapse navigation panel/i });
    expect(arrowButton).toBeInTheDocument();

    // User manually clicks arrow to hide
    act(() => {
      fireEvent.click(arrowButton);
    });

    const hiddenNav = screen.getByRole("navigation", { hidden: true });
    expect(hiddenNav).toHaveClass("translate-y-full");
    const triggerDot = screen.getByRole("button", { name: /Open navigation panel/i });
    expect(triggerDot).toBeInTheDocument();

    // User clicks dot to expand back
    act(() => {
      fireEvent.click(triggerDot);
    });

    expect(screen.getByRole("navigation")).toHaveClass("translate-y-0");
    expect(screen.queryByRole("button", { name: /Open navigation panel/i })).not.toBeInTheDocument();
  });

  // 9: Necessarily collapses into Up arrow in White Filled Circle when in a study session
  it("necessarily hides into collapsed Up arrow in White Filled Circle when user is in a study session", () => {
    render(<BottomNav isStudying={true} />);

    const nav = screen.getByRole("navigation", { hidden: true });
    expect(nav).toHaveClass("translate-y-full");
    const trigger = screen.getByRole("button", { name: /Open navigation panel/i });
    expect(trigger).toBeInTheDocument();

    // Verify it renders the Up arrow in a White Filled Circle
    const whiteCircle = trigger.querySelector(".bg-white");
    expect(whiteCircle).toBeInTheDocument();
    expect(whiteCircle).toHaveClass("rounded-full");
    const upArrow = whiteCircle?.querySelector("svg");
    expect(upArrow).toBeInTheDocument();
  });

  // 10: Smoothly transitions when study session starts and stops
  it("smoothly transitions between expanded and collapsed dot as study session starts and finishes", () => {
    const { rerender } = render(<BottomNav isStudying={false} />);
    expect(screen.getByRole("navigation")).toHaveClass("translate-y-0");

    // Session starts (timer running)
    rerender(<BottomNav isStudying={true} />);
    expect(screen.getByRole("navigation", { hidden: true })).toHaveClass("translate-y-full");
    expect(screen.getByRole("button", { name: /Open navigation panel/i })).toBeInTheDocument();

    // Session stops (offline)
    rerender(<BottomNav isStudying={false} />);
    expect(screen.getByRole("navigation")).toHaveClass("translate-y-0");
    expect(screen.queryByRole("button", { name: /Open navigation panel/i })).not.toBeInTheDocument();
  });

  // 11 & 12: In a study session, expanding via dot auto-collapses after NAV_INACTIVITY_MS (20s)
  it("in a study session, expanding via dot auto-collapses after NAV_INACTIVITY_MS (20s)", () => {
    render(<BottomNav isStudying={true} />);
    const nav = screen.getByRole("navigation", { hidden: true });

    expect(nav).toHaveClass("translate-y-full");
    const trigger = screen.getByRole("button", { name: /Open navigation panel/i });

    // Expand via dot
    act(() => {
      fireEvent.click(trigger);
      vi.advanceTimersByTime(16); // Flush rAF focus
    });
    expect(screen.getByRole("navigation")).toHaveClass("translate-y-0");

    // After 15s still expanded
    act(() => {
      vi.advanceTimersByTime(15_000);
    });
    expect(screen.getByRole("navigation")).toHaveClass("translate-y-0");

    // After remaining 5s (total 20s) auto-collapses back to dot
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(screen.getByRole("navigation", { hidden: true })).toHaveClass("translate-y-full");
  });

  // 13: Interaction while studying resets timer
  it("resets the inactivity countdown on nav interaction while in a study session", () => {
    render(<BottomNav isStudying={true} />);

    const trigger = screen.getByRole("button", { name: /Open navigation panel/i });
    act(() => {
      fireEvent.click(trigger);
      vi.advanceTimersByTime(16);
    });
    const nav = screen.getByRole("navigation");
    expect(nav).toHaveClass("translate-y-0");

    // Wait 15s
    act(() => {
      vi.advanceTimersByTime(15_000);
    });
    // Hover over nav
    act(() => {
      fireEvent.mouseEnter(nav);
    });

    // Advance 10s (25s total, but only 10s since hover)
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(nav).toHaveClass("translate-y-0");

    // Advance remaining 10s -> collapses
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(screen.getByRole("navigation", { hidden: true })).toHaveClass("translate-y-full");
  });

  // 14: Cleans up timers on unmount
  it("cleans up active timers when component unmounts", () => {
    const clearTimeoutSpy = vi.spyOn(global, "clearTimeout");
    const { unmount } = render(<BottomNav isStudying={true} />);

    unmount();
    expect(clearTimeoutSpy).toHaveBeenCalled();
  });

  // 15: Exact production routes preserved
  it("contains exactly and only the 7 production routes without placeholder items", () => {
    render(<BottomNav isStudying={false} />);

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(7);

    const hrefs = links.map((link) => link.getAttribute("href"));
    expect(hrefs).toEqual([
      "/room",
      "/leaderboard",
      "/analytics",
      "/streak",
      "/goals",
      "/history",
      "/settings",
    ]);
  });
});
