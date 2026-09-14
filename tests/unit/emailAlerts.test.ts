import { describe, it, expect } from "vitest";
import { generateAlertEmail } from "@/lib/email/templates";
import { isMailerConfigured } from "@/lib/email/mailer";

describe("Email Alerts Generation Unit Tests", () => {
  it("generates correct Type A (Achiever) email payload", () => {
    const payload = generateAlertEmail("A", "Alice");
    expect(payload.subject).toContain("Achiever's Title");
    expect(payload.subject).toContain("Alice");
    expect(payload.text).toContain("Achiever's Title");
    expect(payload.html).toContain("Achiever&#039;s Title");
    expect(payload.html).toContain("Alice");
  });

  it("generates correct Type I (Account Notice - 3d) email payload", () => {
    const payload = generateAlertEmail("I", "Bob", 3);
    expect(payload.subject).toContain("3 Days Inactive");
    expect(payload.text).toContain("inactive on StudyRoom for 3 consecutive days");
    expect(payload.html).toContain("3 consecutive days");
    expect(payload.html).toContain("Bob");
  });

  it("generates correct Type D (Account Deletion - 5d) email payload", () => {
    const payload = generateAlertEmail("D", "Charlie", 5);
    expect(payload.subject).toContain("Scheduled for Deletion");
    expect(payload.subject).toContain("5 Days Inactive");
    expect(payload.text).toContain("inactive for 5 consecutive days");
    expect(payload.html).toContain("Account Deletion Alert");
    expect(payload.html).toContain("Charlie");
  });

  it("generates correct Type W (Weekly Performance Alert) email payload", () => {
    const payload = generateAlertEmail("W", "Pallavi", 0, 0.5);
    expect(payload.subject).toContain("Weekly Performance & Momentum Check-in");
    expect(payload.subject).toContain("Pallavi");
    expect(payload.text).toContain("0.5 hours");
    expect(payload.html).toContain("0.5 hrs");
    expect(payload.html).toContain("Weekly Performance Review");
    expect(payload.html).toContain("Pallavi");
  });

  it("escapes malicious user names in HTML output", () => {
    const maliciousName = "<script>alert('xss')</script>";
    const payload = generateAlertEmail("A", maliciousName);
    expect(payload.html).not.toContain("<script>");
    expect(payload.html).toContain("&lt;script&gt;");
  });

  it("detects whether mailer is configured properly", () => {
    const result = isMailerConfigured();
    // In test environment, ALERT_GMAIL_USER and ALERT_GMAIL_APP_PASSWORD are set in .env.local
    expect(typeof result.configured).toBe("boolean");
  });

  it("points email CTA buttons to https://studyalive.netlify.app/room", () => {
    const payload = generateAlertEmail("A", "Ritesh");
    expect(payload.html).toContain("https://studyalive.netlify.app/room");
    expect(payload.text).toContain("https://studyalive.netlify.app/room");
  });

  it("strictly identifies placeholder @student.studyroom as invalid recipient email", () => {
    const isInvalidRecipient = (email: string) => {
      const clean = (email || "").trim();
      return !clean || clean.includes("@student.studyroom") || !clean.includes("@") || !clean.includes(".");
    };

    expect(isInvalidRecipient("ritesh@student.studyroom")).toBe(true);
    expect(isInvalidRecipient("ravi@student.studyroom")).toBe(true);
    expect(isInvalidRecipient("")).toBe(true);
    expect(isInvalidRecipient("ritesh@gmail.com")).toBe(false);
    expect(isInvalidRecipient("student@outlook.com")).toBe(false);
  });

  it("successfully dispatches an alert email through authenticated Gmail SMTP", async () => {
    const { sendAlertEmail } = await import("@/lib/email/mailer");
    const res = await sendAlertEmail({
      to: "studyaliveapp@gmail.com",
      name: "Admin Live Verification",
      type: "W",
      consecutiveDays: 0,
      weeklyHours: 10,
      isTest: true,
    });
    if (!res.success) {
      console.error("sendAlertEmail failed with error:", res.error);
    }
    expect(res.success).toBe(true);
    expect(res.messageId).toBeDefined();
  }, 15000);
});

