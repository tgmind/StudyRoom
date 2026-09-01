import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { SessionController } from "@/components/session/SessionController";

describe("SessionController Component", () => {
  const dummyProps = {
    onStartSession: vi.fn(),
    onPauseSession: vi.fn(),
    onResumeSession: vi.fn(),
    onFinishSession: vi.fn(),
    onCreateGoal: vi.fn(),
    activeGoal: null,
    countdown: {
      remainingSeconds: 0,
      formattedTime: "00:00:00",
      formattedText: "Expired",
      isWarnZone: false,
      isExpired: true,
      totalSeconds: 0,
    },
  };

  it("renders 'Start Studying' button when offline / idle", () => {
    render(
      <SessionController
        status="offline"
        elapsedSeconds={0}
        {...dummyProps}
      />
    );

    expect(screen.getByText("Start Studying")).toBeInTheDocument();
  });

  it("renders 'Pause' and 'Stop' buttons when studying", () => {
    render(
      <SessionController
        status="studying"
        elapsedSeconds={120}
        {...dummyProps}
      />
    );

    expect(screen.getByText("Pause")).toBeInTheDocument();
    expect(screen.getByText("Stop")).toBeInTheDocument();
  });

  it("renders 'Resume' and 'Stop' buttons when on break", () => {
    render(
      <SessionController
        status="break"
        elapsedSeconds={120}
        {...dummyProps}
      />
    );

    expect(screen.getByText("Resume")).toBeInTheDocument();
    expect(screen.getByText("Stop")).toBeInTheDocument();
  });
});
