import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React, { useState } from "react";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { Modal } from "@/components/ui/Modal";

describe("Modal Keyboard Accessibility & Focus Trap", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function ModalTestComponent() {
    const [isOpen, setIsOpen] = useState(false);

    return (
      <div>
        <button id="trigger-btn" onClick={() => setIsOpen(true)}>
          Open Modal
        </button>
        <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="Test Focus Trap">
          <input data-testid="input-1" placeholder="First input" />
          <input data-testid="input-2" placeholder="Second input" />
          <button data-testid="action-btn">Confirm</button>
        </Modal>
      </div>
    );
  }

  it("traps focus within the dialog with Tab and Shift+Tab and restores focus on close", async () => {
    render(<ModalTestComponent />);

    const triggerBtn = screen.getByRole("button", { name: "Open Modal" });
    triggerBtn.focus();
    expect(document.activeElement).toBe(triggerBtn);

    // Open modal
    fireEvent.click(triggerBtn);

    // Advance timer for initial focus
    act(() => {
      vi.advanceTimersByTime(60);
    });

    const closeBtn = screen.getByRole("button", { name: "Close dialog" });
    const input1 = screen.getByTestId("input-1");
    const input2 = screen.getByTestId("input-2");
    const actionBtn = screen.getByTestId("action-btn");

    // Close button is the first focusable element in header
    expect(document.activeElement).toBe(closeBtn);

    // Tab to input1
    fireEvent.keyDown(window, { key: "Tab" });
    // In JSDOM, native browser focus dispatching via Tab key doesn't move document.activeElement automatically
    // unless intercepted or manually focused, but our handleKeyDown intercepts boundary wrapping!

    // Let's test the boundary wrap: focus the last element (actionBtn)
    actionBtn.focus();
    expect(document.activeElement).toBe(actionBtn);

    // Press Tab on last element -> wraps to closeBtn (firstElement)
    fireEvent.keyDown(window, { key: "Tab" });
    expect(document.activeElement).toBe(closeBtn);

    // Press Shift+Tab on first element -> wraps to actionBtn (lastElement)
    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(actionBtn);

    // Close dialog with Escape
    fireEvent.keyDown(window, { key: "Escape" });

    // Focus restored to triggerBtn
    expect(document.activeElement).toBe(triggerBtn);
  });
});
