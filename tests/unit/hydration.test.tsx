import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import ReactDOMServer from "react-dom/server";
import { render, screen } from "@testing-library/react";
import { SessionController } from "@/components/session/SessionController";
import { RivalryWinCelebration } from "@/components/room/RivalryWinCelebration";

describe("Deterministic SSR and Client Hydration Architecture", () => {
  const dummyProps = {
    onStartSession: vi.fn(),
    onPauseSession: vi.fn(),
    onResumeSession: vi.fn(),
    onFinishSession: vi.fn(),
    onCreateGoal: vi.fn(),
    activeGoal: null,
    countdown: {
      remainingSeconds: 0,
      formattedText: "Expired",
      isExpired: true,
    },
  };

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("SSR RENDER: SessionController in hydrating state produces skeleton markup without false 'Start Studying' button or timer", () => {
    const html = ReactDOMServer.renderToString(
      <SessionController
        status="offline"
        elapsedSeconds={0}
        isLoading={false}
        isHydrating={true}
        {...dummyProps}
      />
    );

    // 1. Must contain the hydrating pulse skeleton
    expect(html).toContain("animate-pulse");

    // 2. Must NOT render a false "Start Studying" button during SSR hydration
    expect(html).not.toContain("Start Studying");

    // 3. Must NOT render an uncalibrated ActiveTimer or 00:00 timer display
    expect(html).not.toContain("Active Live Study");
    expect(html).not.toContain("Active Study (Paused)");
  });

  it("CLIENT HYDRATION PARITY: Client first render with isHydrating matches SSR markup structurally", () => {
    const { container } = render(
      <SessionController
        status="offline"
        elapsedSeconds={0}
        isLoading={false}
        isHydrating={true}
        {...dummyProps}
      />
    );

    // Initial DOM contains skeleton, no Start button
    expect(screen.queryByText("Start Studying")).toBeNull();
    expect(screen.queryByText("Active Live Study")).toBeNull();
    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  it("POST-HYDRATION TRANSITION TO IDLE: Renders 'Start Studying' button once hydration completes and user is confirmed offline", () => {
    const { rerender } = render(
      <SessionController
        status="offline"
        elapsedSeconds={0}
        isLoading={false}
        isHydrating={true}
        {...dummyProps}
      />
    );

    // Hydration finishes, auth resolves: user has no active session
    rerender(
      <SessionController
        status="offline"
        elapsedSeconds={0}
        isLoading={false}
        isHydrating={false}
        {...dummyProps}
      />
    );

    expect(screen.getByText("Start Studying")).toBeInTheDocument();
  });

  it("POST-HYDRATION TRANSITION TO STUDYING: Renders ActiveTimer and Pause/Stop buttons once disk/auth session is recovered", () => {
    const { rerender } = render(
      <SessionController
        status="offline"
        elapsedSeconds={0}
        isLoading={false}
        isHydrating={true}
        {...dummyProps}
      />
    );

    // Hydration finishes, disk session restored with 1816 accrued seconds
    rerender(
      <SessionController
        status="studying"
        elapsedSeconds={1816}
        isLoading={false}
        isHydrating={false}
        {...dummyProps}
      />
    );

    expect(screen.queryByText("Start Studying")).toBeNull();
    expect(screen.getByText("Pause")).toBeInTheDocument();
    expect(screen.getByText("Stop")).toBeInTheDocument();
    expect(screen.getByText("Active Live Study")).toBeInTheDocument();
    expect(screen.getByText("30:16")).toBeInTheDocument();
  });

  it("POST-HYDRATION TRANSITION TO BREAK: Renders ActiveTimer with break countdown and Resume/Stop buttons", () => {
    const breakStart = new Date(Date.now() - 300000).toISOString(); // 5 min ago

    const { rerender } = render(
      <SessionController
        status="offline"
        elapsedSeconds={0}
        isLoading={false}
        isHydrating={true}
        {...dummyProps}
      />
    );

    rerender(
      <SessionController
        status="break"
        elapsedSeconds={600}
        breakStartedAt={breakStart}
        isLoading={false}
        isHydrating={false}
        {...dummyProps}
      />
    );

    expect(screen.queryByText("Start Studying")).toBeNull();
    expect(screen.getByText("Resume")).toBeInTheDocument();
    expect(screen.getByText("Stop")).toBeInTheDocument();
    expect(screen.getByText("Break Countdown")).toBeInTheDocument();
    expect(screen.getByText(/55:00 left/i)).toBeInTheDocument();
  });

  it("SSR RENDER: RivalryWinCelebration renders deterministically on server without localStorage access", () => {
    const now = Date.now();
    const testEvents = [
      {
        id: "win-1",
        resolutionId: "res-1",
        winnerId: "w1",
        winnerName: "Alice",
        loserId: "l1",
        loserName: "Bob",
        timestamp: now - 5000,
      },
    ];

    const html = ReactDOMServer.renderToString(
      <RivalryWinCelebration winEvents={testEvents} />
    );

    expect(html).toContain("Alice");
    expect(html).toContain("Bob");
  });
});
