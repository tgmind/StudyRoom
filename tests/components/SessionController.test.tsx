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
      formattedText: "Expired",
      isExpired: true,
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

  it("renders 'Resume' and 'Stop' buttons and break countdown when on break", () => {
    const breakStart = new Date(Date.now() - 300000).toISOString(); // 5 min ago

    render(
      <SessionController
        status="break"
        elapsedSeconds={120}
        breakStartedAt={breakStart}
        {...dummyProps}
      />
    );

    expect(screen.getByText("Resume")).toBeInTheDocument();
    expect(screen.getByText("Stop")).toBeInTheDocument();
    expect(screen.getByText("Break Countdown")).toBeInTheDocument();
    expect(screen.getByText(/55:00 left/i)).toBeInTheDocument();
  });

  it("calls onStartSession directly when Start Studying is clicked with active goal", async () => {
    const onStartSessionMock = vi.fn().mockResolvedValue(undefined);
    const mockGoal = {
      id: "goal-123",
      user_id: "user-123",
      tasks: [{ id: "t1", task: "Math revision", completed: false }],
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 3600000).toISOString(),
      is_locked: false,
      archived_at: null,
    };

    render(
      <SessionController
        status="offline"
        elapsedSeconds={0}
        {...dummyProps}
        onStartSession={onStartSessionMock}
        activeGoal={mockGoal}
        countdown={{
          remainingSeconds: 3600,
          formattedText: "01:00:00 remaining",
          isExpired: false,
        }}
      />
    );

    const startBtn = screen.getByText("Start Studying");
    startBtn.click();

    expect(onStartSessionMock).toHaveBeenCalledTimes(1);
  });
});
