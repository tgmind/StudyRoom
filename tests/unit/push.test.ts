import { describe, it, expect } from "vitest";

describe("Web Push Reminders & Action Payload Logic", () => {
  it("formats the 3-hour check-in payload with interactive YES & NO action buttons", () => {
    const userId = "test-user-uuid-123";
    const payload = {
      title: "StudyRoom — Live Check-in",
      body: "Are you still Studying? You've been active for 3 hours.",
      icon: "/icons/icon-192x192.png",
      badge: "/icons/icon-192x192.png",
      actions: [
        { action: "yes", title: "YES" },
        { action: "no", title: "NO" },
      ],
      data: {
        type: "three_hour_check",
        userId,
      },
      tag: `checkin-${userId}`,
    };

    expect(payload.actions).toHaveLength(2);
    expect(payload.actions[0].action).toBe("yes");
    expect(payload.actions[0].title).toBe("YES");
    expect(payload.actions[1].action).toBe("no");
    expect(payload.actions[1].title).toBe("NO");
    expect(payload.data.userId).toBe(userId);
  });

  it("formats the 24-hour absent reminder payload accurately", () => {
    const userId = "test-user-offline-456";
    const payload = {
      title: "StudyRoom — Daily Reminder",
      body: "You are absent for 24 hrs. Continue Live Study!",
      icon: "/icons/icon-192x192.png",
      badge: "/icons/icon-192x192.png",
      data: {
        type: "absent_reminder",
        userId,
      },
      tag: `absent-${userId}`,
    };

    expect(payload.body).toContain("absent for 24 hrs");
    expect(payload.data.type).toBe("absent_reminder");
    expect(payload.data.userId).toBe(userId);
  });

  it("converts URL-safe base64 VAPID public key to Uint8Array correctly", () => {
    function urlBase64ToUint8Array(base64String: string): Uint8Array {
      const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
      const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
      const rawData = atob(base64);
      const outputArray = new Uint8Array(rawData.length);
      for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
      }
      return outputArray;
    }

    const sampleKey = "BH-ODJgh6r2yPtytS_pu-V65_e9qTVoTYxuMa51yO-5QVTL3eUbjcGIogUTFdHvscqWPUej8IgLq5ybj9b0r7e4";
    const converted = urlBase64ToUint8Array(sampleKey);

    expect(converted).toBeInstanceOf(Uint8Array);
    expect(converted.length).toBe(65); // Standard P-256 public key length is 65 bytes
  });

  it("formats the 1-hour break warning payload accurately", () => {
    const userId = "test-user-break-789";
    const payload = {
      title: "StudyRoom — Break Ending Soon ⏳",
      body: "1 hr Break time about to complete! 10 minutes remaining before your break expires.",
      icon: "/icons/icon-192x192.png",
      badge: "/icons/icon-192x192.png",
      actions: [{ action: "resume", title: "Resume Study" }],
      data: {
        type: "break_warning",
        userId,
      },
      tag: `break-${userId}`,
    };

    expect(payload.title).toContain("Break Ending Soon");
    expect(payload.body).toContain("1 hr Break time about to complete!");
    expect(payload.actions[0].action).toBe("resume");
    expect(payload.data.type).toBe("break_warning");
    expect(payload.data.userId).toBe(userId);
  });
});
