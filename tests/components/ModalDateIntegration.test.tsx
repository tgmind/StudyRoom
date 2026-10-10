import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CreateExamModal } from "@/components/planner/CreateExamModal";
import { EditExamModal } from "@/components/planner/EditExamModal";
import { SlotModal } from "@/components/planner/SlotModal";
import { ExamPlanWithSlots } from "@/lib/supabase/types";

describe("Planner Modals Indian Date Picker Integration", () => {
  const mockPlan: ExamPlanWithSlots = {
    id: "plan-1",
    user_id: "user-1",
    exam_name: "SSC CGL",
    exam_date: "2027-07-10",
    description: "Target Tier 1",
    show_in_streaks: true,
    is_locked: false,
    sort_order: 0,
    created_at: "",
    updated_at: "",
    slots: [],
  };

  it("CreateExamModal accepts typed Indian date 15/08/2027 and submits canonical 2027-08-15", async () => {
    const handleConfirm = vi.fn().mockResolvedValue(undefined);
    const handleClose = vi.fn();

    render(
      <CreateExamModal
        isOpen={true}
        onClose={handleClose}
        onConfirmCreate={handleConfirm}
      />
    );

    fireEvent.change(screen.getByPlaceholderText(/e.g., SSC CGL/i), {
      target: { value: "CDS Examination" },
    });

    const dateInput = screen.getByLabelText(/Exam Date/i);
    fireEvent.change(dateInput, { target: { value: "15/08/2027" } });

    fireEvent.click(screen.getByRole("button", { name: /Save Exam Plan/i }));

    await waitFor(() => {
      expect(handleConfirm).toHaveBeenCalledWith(
        expect.objectContaining({
          exam_name: "CDS Examination",
          exam_date: "2027-08-15",
        })
      );
    });
  });

  it("EditExamModal pre-populates Indian date 10/07/2027 and updates to 25/12/2027", async () => {
    const handleConfirm = vi.fn().mockResolvedValue(undefined);
    const handleClose = vi.fn();

    render(
      <EditExamModal
        isOpen={true}
        onClose={handleClose}
        plan={mockPlan}
        onConfirmEdit={handleConfirm}
      />
    );

    const dateInput = screen.getByLabelText(/Exam Date/i);
    expect(dateInput).toHaveValue("10/07/2027");

    fireEvent.change(dateInput, { target: { value: "25/12/2027" } });

    fireEvent.click(screen.getByRole("button", { name: /Update Exam Plan/i }));

    await waitFor(() => {
      expect(handleConfirm).toHaveBeenCalledWith(
        "plan-1",
        expect.objectContaining({
          exam_date: "2027-12-25",
        })
      );
    });
  });

  it("SlotModal accepts Indian dates for Start and End dates and submits canonical ISO dates", async () => {
    const handleSaveSlot = vi.fn().mockResolvedValue(undefined);
    const handleClose = vi.fn();

    render(
      <SlotModal
        isOpen={true}
        onClose={handleClose}
        plan={mockPlan}
        onSaveSlot={handleSaveSlot}
      />
    );

    fireEvent.change(screen.getByPlaceholderText(/e.g., Syllabus Covering/i), {
      target: { value: "History Coverage" },
    });

    const startDateInput = screen.getByLabelText(/Start Date/i);
    const endDateInput = screen.getByLabelText(/End Date/i);

    fireEvent.change(startDateInput, { target: { value: "01/05/2027" } });
    fireEvent.change(endDateInput, { target: { value: "31/05/2027" } });

    fireEvent.click(screen.getByRole("button", { name: /Create Slot/i }));

    await waitFor(() => {
      expect(handleSaveSlot).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "History Coverage",
          start_date: "2027-05-01",
          end_date: "2027-05-31",
        })
      );
    });
  });
});
