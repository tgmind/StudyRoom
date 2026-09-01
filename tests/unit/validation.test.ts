import { describe, it, expect } from "vitest";
import {
  validateDisplayName,
  validateFocusTag,
  validateGoalTasks,
  validateAvatarFile,
  MAX_AVATAR_SIZE_BYTES,
} from "@/lib/validation/schemas";

describe("Input Validation Schemas", () => {
  it("validates display name correctly (2-32 chars)", () => {
    expect(validateDisplayName("").isValid).toBe(false);
    expect(validateDisplayName("A").isValid).toBe(false);
    expect(validateDisplayName("  Alex  ").isValid).toBe(true);
    expect(validateDisplayName("  Alex  ").value).toBe("Alex");
    expect(validateDisplayName("a".repeat(35)).value.length).toBe(32);
  });

  it("validates focus tag (optional, max 60 chars)", () => {
    expect(validateFocusTag("").value).toBeNull();
    expect(validateFocusTag(null).value).toBeNull();
    expect(validateFocusTag(" Quantum Mechanics ").value).toBe("Quantum Mechanics");
  });

  it("validates goal tasks list (1-10 valid non-empty tasks)", () => {
    expect(validateGoalTasks([]).isValid).toBe(false);
    expect(validateGoalTasks(["", "  "]).isValid).toBe(false);
    expect(validateGoalTasks(["Finish Ch 1", "Solve PYQs"]).isValid).toBe(true);
    expect(validateGoalTasks(["Finish Ch 1", "Solve PYQs"]).value).toEqual([
      "Finish Ch 1",
      "Solve PYQs",
    ]);
  });

  it("validates avatar file size (< 2 MB) and MIME types", () => {
    const validFile = new File(["test image content"], "avatar.jpg", { type: "image/jpeg" });
    expect(validateAvatarFile(validFile).isValid).toBe(true);

    const invalidTypeFile = new File(["test content"], "document.pdf", { type: "application/pdf" });
    expect(validateAvatarFile(invalidTypeFile).isValid).toBe(false);
    expect(validateAvatarFile(invalidTypeFile).error).toContain("Invalid file format");

    // File > 2 MB
    const oversizedBlob = new ArrayBuffer(MAX_AVATAR_SIZE_BYTES + 1024);
    const oversizedFile = new File([oversizedBlob], "large.png", { type: "image/png" });
    expect(validateAvatarFile(oversizedFile).isValid).toBe(false);
    expect(validateAvatarFile(oversizedFile).error).toContain("exceeds the 2 MB limit");
  });
});
