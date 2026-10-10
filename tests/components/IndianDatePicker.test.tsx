import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { IndianDatePicker } from "@/components/planner/IndianDatePicker";

describe("IndianDatePicker Component", () => {
  it("renders with formatted Indian date DD/MM/YYYY from initial ISO value", () => {
    const handleChange = vi.fn();
    render(
      <IndianDatePicker
        value="2027-07-10"
        onChange={handleChange}
        label="Exam Date"
        id="exam-date"
      />
    );

    const input = screen.getByLabelText("Exam Date");
    expect(input).toHaveValue("10/07/2027");
  });

  it("updates value and calls onChange with canonical YYYY-MM-DD when typing valid Indian date", () => {
    const handleChange = vi.fn();
    render(
      <IndianDatePicker
        value=""
        onChange={handleChange}
        label="Target Date"
        id="target-date"
      />
    );

    const input = screen.getByLabelText("Target Date");
    fireEvent.change(input, { target: { value: "01/02/2027" } });

    expect(handleChange).toHaveBeenCalledWith("2027-02-01");
  });

  it("displays validation error when typing impossible calendar date like 31/02/2027", () => {
    const handleChange = vi.fn();
    render(
      <IndianDatePicker
        value=""
        onChange={handleChange}
        label="Target Date"
        id="target-date"
      />
    );

    const input = screen.getByLabelText("Target Date");
    fireEvent.change(input, { target: { value: "31/02/2027" } });
    fireEvent.blur(input);

    expect(screen.getByText(/Invalid calendar date/i)).toBeInTheDocument();
    // User typing preserved
    expect(input).toHaveValue("31/02/2027");
  });

  it("opens calendar popup on clicking calendar button and closes on Escape", () => {
    const handleChange = vi.fn();
    render(
      <IndianDatePicker
        value="2027-07-10"
        onChange={handleChange}
        label="Target Date"
      />
    );

    const openBtn = screen.getByRole("button", { name: /Open calendar/i });
    fireEvent.click(openBtn);

    expect(screen.getByRole("dialog", { name: /Calendar date picker/i })).toBeInTheDocument();

    // Press Escape
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: /Calendar date picker/i })).not.toBeInTheDocument();
  });

  it("selects a day from the calendar and updates date", () => {
    const handleChange = vi.fn();
    render(
      <IndianDatePicker
        value="2027-07-10"
        onChange={handleChange}
        label="Target Date"
      />
    );

    const openBtn = screen.getByRole("button", { name: /Open calendar/i });
    fireEvent.click(openBtn);

    // Pick 15 July 2027
    const day15 = screen.getByRole("button", { name: "15 July 2027" });
    fireEvent.click(day15);

    expect(handleChange).toHaveBeenCalledWith("2027-07-15");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("selects today when clicking Today button in calendar", () => {
    const handleChange = vi.fn();
    render(
      <IndianDatePicker
        value=""
        onChange={handleChange}
        label="Target Date"
      />
    );

    const openBtn = screen.getByRole("button", { name: /Open calendar/i });
    fireEvent.click(openBtn);

    const todayBtn = screen.getByRole("button", { name: "Today" });
    fireEvent.click(todayBtn);

    expect(handleChange).toHaveBeenCalled();
  });

  it("disables dates exceeding maxDate boundary", () => {
    const handleChange = vi.fn();
    render(
      <IndianDatePicker
        value="2027-07-10"
        onChange={handleChange}
        label="Slot End Date"
        maxDate="2027-07-15"
      />
    );

    const openBtn = screen.getByRole("button", { name: /Open calendar/i });
    fireEvent.click(openBtn);

    const day16 = screen.getByRole("button", { name: "16 July 2027" });
    expect(day16).toBeDisabled();

    const day15 = screen.getByRole("button", { name: "15 July 2027" });
    expect(day15).not.toBeDisabled();
  });
});
