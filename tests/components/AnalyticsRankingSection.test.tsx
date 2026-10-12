import { describe, it, expect } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { AnalyticsRankingSection } from "@/components/analytics/AnalyticsRankingSection";
import { GlobalAnalyticsRankings } from "@/lib/supabase/types";

describe("AnalyticsRankingSection & Observatory Visualizers", () => {
  const mockRankings: GlobalAnalyticsRankings = {
    most_studying: [
      {
        rank: 1,
        user_id: "user-1",
        display_name: "Ritesh",
        avatar_url: "https://example.com/avatar1.jpg",
        total_study_minutes: 2376, // 39.6h
        daily_average_minutes: 342, // 5.7h
        active_study_days: 7,
        score: 99.2,
      },
      {
        rank: 2,
        user_id: "user-2",
        display_name: "Tung Tung",
        avatar_url: null,
        total_study_minutes: 2358, // 39.3h
        daily_average_minutes: 336, // 5.6h
        active_study_days: 7,
        score: 98.5,
      },
      {
        rank: 3,
        user_id: "user-3",
        display_name: "Aditya",
        avatar_url: null,
        total_study_minutes: 1920, // 32.0h
        daily_average_minutes: 276, // 4.6h
        active_study_days: 6,
        score: 86.2,
      },
      {
        rank: 4,
        user_id: "user-4",
        display_name: "Subodh",
        avatar_url: null,
        total_study_minutes: 1536, // 25.6h
        daily_average_minutes: 222, // 3.7h
        active_study_days: 6,
        score: 70.1,
      },
      {
        rank: 5,
        user_id: "user-5",
        display_name: "Raunak",
        avatar_url: null,
        total_study_minutes: 1374, // 22.9h
        daily_average_minutes: 198, // 3.3h
        active_study_days: 6,
        score: 59.6,
      },
    ],
    consistency_rhythm_matrix: [
      {
        rank: 1,
        user_id: "user-top-1",
        display_name: "Pooja",
        avatar_url: null,
        total_study_minutes: 240,
        daily_average_minutes: 34.3,
        active_study_days: 2,
        score: 22.5,
      },
      {
        rank: 2,
        user_id: "user-top-2",
        display_name: "Karan",
        avatar_url: null,
        total_study_minutes: 350,
        daily_average_minutes: 50.0,
        active_study_days: 3,
        score: 30.0,
      },
    ],
    achiever_winners: [
      {
        rank: 1,
        user_id: "user-ach-1",
        display_name: "Ritesh",
        avatar_url: null,
        achiever_count: 4,
        total_study_minutes: 9500,
      },
      {
        rank: 2,
        user_id: "user-ach-2",
        display_name: "Aman",
        avatar_url: null,
        achiever_count: 2,
        total_study_minutes: 5200,
      },
    ],
    goal_chasers: [
      {
        rank: 1,
        user_id: "user-goal-1",
        display_name: "Deepak",
        avatar_url: null,
        completed_tasks: 25,
        total_tasks: 25,
        goal_completion_pct: 100.0,
        total_study_minutes: 1800,
      },
      {
        rank: 2,
        user_id: "user-goal-2",
        display_name: "Sanya",
        avatar_url: null,
        completed_tasks: 19,
        total_tasks: 20,
        goal_completion_pct: 95.0,
        total_study_minutes: 1400,
      },
    ],
  };

  describe("1. Analytics Lens Selector Navigation", () => {
    it("renders all four analytical lenses with active lens descriptor", () => {
      render(<AnalyticsRankingSection rankings={mockRankings} />);

      expect(screen.getByRole("tab", { name: /Study/i })).toBeDefined();
      expect(screen.getByRole("tab", { name: /Consistency/i })).toBeDefined();
      expect(screen.getByRole("tab", { name: /Achievers/i })).toBeDefined();
      expect(screen.getByRole("tab", { name: /Goals/i })).toBeDefined();

      expect(
        screen.getByText("Daily study velocity & volume intensity")
      ).toBeDefined();
    });

    it("switches lenses upon user interaction and renders corresponding visualizers", () => {
      render(<AnalyticsRankingSection rankings={mockRankings} />);

      // Defaults to Study Volume
      expect(screen.getByText("Top Study Velocity · #1")).toBeDefined();

      // Click Consistency
      fireEvent.click(screen.getByRole("tab", { name: /Consistency/i }));
      expect(
        screen.getByText("Top Consistent Students • 7-Day Habit Continuity")
      ).toBeDefined();
      expect(screen.getByText("Pooja")).toBeDefined();

      // Click Achievers
      fireEvent.click(screen.getByRole("tab", { name: /Achievers/i }));
      expect(
        screen.getByText("Grand Master Achiever · #1 Hall of Fame")
      ).toBeDefined();
      expect(screen.getByText("×4")).toBeDefined();

      // Click Goals
      fireEvent.click(screen.getByRole("tab", { name: /Goals/i }));
      expect(screen.getByText("Precision Leader · #1 Execution")).toBeDefined();
      expect(screen.getByText("100%")).toBeDefined();
    });

    it("supports keyboard navigation (ArrowRight / ArrowLeft / Home / End)", () => {
      render(<AnalyticsRankingSection rankings={mockRankings} />);

      const tablist = screen.getByRole("tablist", {
        name: "Global Analytics Lenses",
      });

      // Press ArrowRight -> moves to consistency_boost
      fireEvent.keyDown(tablist, { key: "ArrowRight" });
      expect(
        screen.getByText("Top Consistent Students • 7-Day Habit Continuity")
      ).toBeDefined();

      // Press ArrowLeft -> moves back to most_studying
      fireEvent.keyDown(tablist, { key: "ArrowLeft" });
      expect(screen.getByText("Top Study Velocity · #1")).toBeDefined();

      // Press End -> moves to goal_chasers
      fireEvent.keyDown(tablist, { key: "End" });
      expect(screen.getByText("Precision Leader · #1 Execution")).toBeDefined();

      // Press Home -> moves to most_studying
      fireEvent.keyDown(tablist, { key: "Home" });
      expect(screen.getByText("Top Study Velocity · #1")).toBeDefined();
    });
  });

  describe("2. Most Studying — Study Volume Spectrum (Intensity Cascade)", () => {
    it("renders #1 Pinnacle Hero with daily velocity, total volume, and 7-day study rhythm track", () => {
      render(
        <AnalyticsRankingSection
          rankings={mockRankings}
          currentUserId="user-4"
        />
      );

      // #1 Ritesh
      expect(screen.getByText("Ritesh")).toBeDefined();
      expect(screen.getByText("5.7")).toBeDefined();
      expect(screen.getByText("39.6h total volume")).toBeDefined();
      expect(screen.getByText("7 of 7 active days")).toBeDefined();
      expect(screen.getByText("99.2 pts")).toBeDefined();
      expect(screen.getByText("7-Day Study Rhythm Track")).toBeDefined();
      expect(screen.queryByText("100% Baseline")).toBeNull();
      expect(screen.queryByText("Velocity Target")).toBeNull();
    });

    it("renders #2 and #3 comparative velocity cards with proportional bars", () => {
      render(<AnalyticsRankingSection rankings={mockRankings} />);

      // #2 Tung Tung
      expect(screen.getByText("Tung Tung")).toBeDefined();
      expect(screen.getByText("5.6")).toBeDefined();
      expect(screen.getByText("39.3h total")).toBeDefined();

      // #3 Aditya
      expect(screen.getByText("Aditya")).toBeDefined();
      expect(screen.getByText("4.6")).toBeDefined();
      expect(screen.getByText("32.0h total")).toBeDefined();
    });

    it("renders #4 and #5 compact velocity bands", () => {
      render(<AnalyticsRankingSection rankings={mockRankings} />);

      // #4 Subodh
      expect(screen.getByText("Subodh")).toBeDefined();
      expect(screen.getByText("3.7")).toBeDefined();

      // #5 Raunak
      expect(screen.getByText("Raunak")).toBeDefined();
      expect(screen.getByText("3.3")).toBeDefined();
    });

    it("highlights logged-in user with distinct analytical marker and beacon", () => {
      render(
        <AnalyticsRankingSection
          rankings={mockRankings}
          currentUserId="user-4" // Subodh
        />
      );

      // Subodh at #4 should have a "You" marker
      const youBadges = screen.getAllByText("You");
      expect(youBadges.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("3. Consistency — 7-Day Habit Continuity Matrix", () => {
    it("renders active days ratio and 7-segment continuity track without fabricating weekdays", () => {
      render(<AnalyticsRankingSection rankings={mockRankings} />);

      // Switch to Consistency
      fireEvent.click(screen.getByRole("tab", { name: /Consistency/i }));

      expect(screen.getByText("Pooja")).toBeDefined();
      expect(screen.getByText("2 / 7")).toBeDefined();
      expect(screen.getByText("29% Continuity")).toBeDefined();
      expect(screen.getByText("+5d runway")).toBeDefined();

      expect(screen.getByText("Karan")).toBeDefined();
      expect(screen.getByText("3 / 7")).toBeDefined();
      expect(screen.getByText("43% Continuity")).toBeDefined();
      expect(screen.getByText("+4d runway")).toBeDefined();
    });

    it("handles empty consistency data gracefully", () => {
      const emptyRankings: GlobalAnalyticsRankings = {
        ...mockRankings,
        consistency_rhythm_matrix: [],
      };

      render(<AnalyticsRankingSection rankings={emptyRankings} />);
      fireEvent.click(screen.getByRole("tab", { name: /Consistency/i }));

      expect(
        screen.getByText(
          "No student consistency records for this period."
        )
      ).toBeDefined();
    });

    it("historical snapshot with only low_performers does NOT display low performers as consistency ranking", () => {
      // Historical snapshot containing ONLY legacy low_performers and NO consistency_rhythm_matrix
      const historicalLegacyRankings: GlobalAnalyticsRankings = {
        ...mockRankings,
        consistency_rhythm_matrix: undefined,
        low_performers: [
          {
            rank: 1,
            user_id: "user-legacy-low",
            display_name: "LegacyLowStudent",
            avatar_url: null,
            total_study_minutes: 60,
            daily_average_minutes: 8.5,
            active_study_days: 1,
            score: 10.0,
          },
        ],
      };

      render(<AnalyticsRankingSection rankings={historicalLegacyRankings} />);
      fireEvent.click(screen.getByRole("tab", { name: /Consistency/i }));

      // MUST NOT display the low performer under the Top Consistent Students ranking
      expect(screen.queryByText("LegacyLowStudent")).toBeNull();
      // MUST gracefully display the safe empty/unavailable state
      expect(
        screen.getByText(
          "No student consistency records for this period."
        )
      ).toBeDefined();
    });

    it("historical snapshot with both fields renders consistency_rhythm_matrix and ignores low_performers", () => {
      const dualFieldRankings: GlobalAnalyticsRankings = {
        ...mockRankings,
        consistency_rhythm_matrix: [
          {
            rank: 1,
            user_id: "user-consistent-hero",
            display_name: "ConsistentHero",
            avatar_url: null,
            total_study_minutes: 2400,
            daily_average_minutes: 342.8,
            active_study_days: 7,
            score: 99.0,
          },
        ],
        low_performers: [
          {
            rank: 1,
            user_id: "user-stale-low",
            display_name: "StaleLowStudent",
            avatar_url: null,
            total_study_minutes: 30,
            daily_average_minutes: 4.2,
            active_study_days: 1,
            score: 5.0,
          },
        ],
      };

      render(<AnalyticsRankingSection rankings={dualFieldRankings} />);
      fireEvent.click(screen.getByRole("tab", { name: /Consistency/i }));

      // MUST render the canonical consistent hero
      expect(screen.getByText("ConsistentHero")).toBeDefined();
      expect(screen.getByText("7 / 7")).toBeDefined();
      // MUST NOT render the stale low performer
      expect(screen.queryByText("StaleLowStudent")).toBeNull();
    });

    it("snapshot with neither field gracefully renders empty/unavailable state", () => {
      const neitherFieldRankings: GlobalAnalyticsRankings = {
        ...mockRankings,
        consistency_rhythm_matrix: undefined,
        low_performers: undefined,
      };

      render(<AnalyticsRankingSection rankings={neitherFieldRankings} />);
      fireEvent.click(screen.getByRole("tab", { name: /Consistency/i }));

      expect(
        screen.getByText(
          "No student consistency records for this period."
        )
      ).toBeDefined();
    });
  });

  describe("4. Achievers — Hall of Fame & Recognition Vault", () => {
    it("renders #1 Grand Achiever showcase with title count and cumulative study duration", () => {
      render(<AnalyticsRankingSection rankings={mockRankings} />);
      fireEvent.click(screen.getByRole("tab", { name: /Achievers/i }));

      expect(
        screen.getByText("Grand Master Achiever · #1 Hall of Fame")
      ).toBeDefined();
      expect(screen.getByText("×4")).toBeDefined();
      expect(screen.getByText("158.3h finalized study duration")).toBeDefined();

      // Contender
      expect(screen.getByText("Aman")).toBeDefined();
      expect(screen.getByText("×2")).toBeDefined();
      expect(screen.getByText("86.7h finalized study duration")).toBeDefined();
    });
  });

  describe("5. Goal Chasers — Precision Execution Gauges", () => {
    it("renders SVG precision gauges with completion percentages and task ratios", () => {
      render(<AnalyticsRankingSection rankings={mockRankings} />);
      fireEvent.click(screen.getByRole("tab", { name: /Goals/i }));

      expect(screen.getByText("Precision Leader · #1 Execution")).toBeDefined();
      expect(screen.getAllByText("25").length).toBe(2); // 25 of 25 tasks fulfilled
      expect(screen.getByText(/tasks fulfilled/i)).toBeDefined();

      expect(screen.getByText("Sanya")).toBeDefined();
      expect(screen.getByText("95%")).toBeDefined();
      expect(screen.getByText(/19\/20 tasks/i)).toBeDefined();
    });
  });

  describe("6. Touch Swipe Gestures & 3D Page Turn Navigation", () => {
    it("advances to next section upon right-to-left touch swipe", () => {
      render(<AnalyticsRankingSection rankings={mockRankings} />);

      const observatorySection = screen.getByLabelText(
        "Global Analytics Observatory"
      );
      const cardSheet = observatorySection.querySelector(".touch-pan-y");
      expect(cardSheet).toBeDefined();

      // Initial page is Study (Page 1/4)
      expect(screen.getByText("Top Study Velocity · #1")).toBeDefined();
      expect(screen.getByText("Page 1/4")).toBeDefined();

      // Swipe right-to-left: touchStart at x=200, move to x=100, end at x=100 (diffX = -100)
      fireEvent.touchStart(cardSheet!, {
        touches: [{ clientX: 200, clientY: 100 }],
      });
      fireEvent.touchMove(cardSheet!, {
        touches: [{ clientX: 100, clientY: 100 }],
      });
      fireEvent.touchEnd(cardSheet!, {
        changedTouches: [{ clientX: 100, clientY: 100 }],
      });

      // Moves to Consistency (Page 2/4)
      expect(
        screen.getByText("Top Consistent Students • 7-Day Habit Continuity")
      ).toBeDefined();
      expect(screen.getByText("Page 2/4")).toBeDefined();

      // Swipe right-to-left again -> Achievers (Page 3/4)
      fireEvent.touchStart(cardSheet!, {
        touches: [{ clientX: 200, clientY: 100 }],
      });
      fireEvent.touchMove(cardSheet!, {
        touches: [{ clientX: 100, clientY: 100 }],
      });
      fireEvent.touchEnd(cardSheet!, {
        changedTouches: [{ clientX: 100, clientY: 100 }],
      });

      expect(
        screen.getByText("Grand Master Achiever · #1 Hall of Fame")
      ).toBeDefined();
      expect(screen.getByText("Page 3/4")).toBeDefined();
    });

    it("navigates to previous section upon left-to-right touch swipe", () => {
      render(<AnalyticsRankingSection rankings={mockRankings} />);

      const observatorySection = screen.getByLabelText(
        "Global Analytics Observatory"
      );
      const cardSheet = observatorySection.querySelector(".touch-pan-y");

      // First click Achievers (Page 3/4)
      fireEvent.click(screen.getByRole("tab", { name: /Achievers/i }));
      expect(screen.getByText("Page 3/4")).toBeDefined();

      // Swipe left-to-right: touchStart at x=100, move to x=200, end at x=200 (diffX = +100)
      fireEvent.touchStart(cardSheet!, {
        touches: [{ clientX: 100, clientY: 100 }],
      });
      fireEvent.touchMove(cardSheet!, {
        touches: [{ clientX: 200, clientY: 100 }],
      });
      fireEvent.touchEnd(cardSheet!, {
        changedTouches: [{ clientX: 200, clientY: 100 }],
      });

      // Moves back to Consistency (Page 2/4)
      expect(
        screen.getByText("Top Consistent Students • 7-Day Habit Continuity")
      ).toBeDefined();
      expect(screen.getByText("Page 2/4")).toBeDefined();
    });

    it("does NOT trigger page turn during vertical scrolling (deltaY > deltaX)", () => {
      render(<AnalyticsRankingSection rankings={mockRankings} />);

      const observatorySection = screen.getByLabelText(
        "Global Analytics Observatory"
      );
      const cardSheet = observatorySection.querySelector(".touch-pan-y");

      // Vertical scroll gesture: diffY = 150, diffX = 10
      fireEvent.touchStart(cardSheet!, {
        touches: [{ clientX: 100, clientY: 100 }],
      });
      fireEvent.touchMove(cardSheet!, {
        touches: [{ clientX: 110, clientY: 250 }],
      });
      fireEvent.touchEnd(cardSheet!, {
        changedTouches: [{ clientX: 110, clientY: 250 }],
      });

      // Remains on Study Volume (Page 1/4)
      expect(screen.getByText("Top Study Velocity · #1")).toBeDefined();
      expect(screen.getByText("Page 1/4")).toBeDefined();
    });

    it("supports mouse/pointer drag gestures for desktop users", () => {
      render(<AnalyticsRankingSection rankings={mockRankings} />);

      const observatorySection = screen.getByLabelText(
        "Global Analytics Observatory"
      );
      const cardSheet = observatorySection.querySelector(".touch-pan-y");

      // Desktop drag right-to-left
      fireEvent.mouseDown(cardSheet!, {
        clientX: 250,
        clientY: 100,
        button: 0,
      });
      fireEvent.mouseMove(cardSheet!, {
        clientX: 150,
        clientY: 100,
      });
      fireEvent.mouseUp(cardSheet!, {
        clientX: 150,
        clientY: 100,
      });

      // Transitions to Consistency
      expect(
        screen.getByText("Top Consistent Students • 7-Day Habit Continuity")
      ).toBeDefined();
      expect(screen.getByText("Page 2/4")).toBeDefined();
    });
  });
});
