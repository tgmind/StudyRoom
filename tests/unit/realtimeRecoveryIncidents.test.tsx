import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import fs from "fs";
import path from "path";
import { MemberList } from "@/components/room/MemberList";
import { UserProfile } from "@/lib/supabase/types";

describe("Realtime Critical Recovery Incidents Verification", () => {
  describe("Incident A: Android & Web Offline Fallback Hygiene", () => {
    it("ensures public/sw.js has a 10-second navigation timeout to avoid false offline aborts on mobile cold starts", () => {
      const swPath = path.resolve(process.cwd(), "public/sw.js");
      const swContent = fs.readFileSync(swPath, "utf-8");

      expect(swContent).toContain("10000");
      expect(swContent).not.toMatch(/setTimeout\(\(\)\s*=>\s*controller\.abort\(\),\s*3000\)/);
      expect(swContent).toMatch(/setTimeout\(\(\)\s*=>\s*controller\.abort\(\),\s*10000\)/);
    });

    it("ensures public/offline.html includes auto-reconnect listeners and exponential backoff polling", () => {
      const offlinePath = path.resolve(process.cwd(), "public/offline.html");
      const offlineContent = fs.readFileSync(offlinePath, "utf-8");

      expect(offlineContent).toContain("window.addEventListener('online', recover)");
      expect(offlineContent).toContain("visibilitychange");
      expect(offlineContent).toContain("pollConnectivity");
      expect(offlineContent).toContain("window.location.replace('/room')");
    });
  });

  describe("Incident B: Global Room Status Pill States & Secondary Enrichment Isolation", () => {
    const mockMembers: UserProfile[] = [
      {
        id: "student-1",
        display_name: "Aman",
        current_status: "studying",
        session_start_time: new Date(Date.now() - 600000).toISOString(),
        last_resumed_at: new Date(Date.now() - 600000).toISOString(),
        active_study_seconds_snapshot: 0,
        weekly_study_seconds: 12000,
        total_sessions_count: 5,
        is_present: true,
      } as UserProfile,
      {
        id: "student-2",
        display_name: "Priya",
        current_status: "break",
        break_started_at: new Date(Date.now() - 60000).toISOString(),
        active_study_seconds_snapshot: 1800,
        weekly_study_seconds: 9000,
        total_sessions_count: 4,
        is_present: true,
      } as UserProfile,
    ];

    it("displays 'Live Sync' (fuchsia pulse) when realtime is connected and members are loaded with reconciliation complete", () => {
      render(
        <MemberList
          members={mockMembers}
          currentUserId="student-1"
          isRealtimeConnected={true}
          connectionState="connected"
          isLoading={false}
          isReconciling={false}
        />
      );

      expect(screen.getByText("Live Sync")).toBeDefined();
      const dot = screen.getByText("Live Sync").previousSibling as HTMLElement;
      expect(dot.className).toContain("bg-fuchsia-400");
    });

    it("displays 'Syncing...' (blue pulse) when isReconciling is true and members are present", () => {
      render(
        <MemberList
          members={mockMembers}
          currentUserId="student-1"
          isRealtimeConnected={true}
          connectionState="connected"
          isLoading={false}
          isReconciling={true}
        />
      );

      expect(screen.getByText("Syncing...")).toBeDefined();
      const dot = screen.getByText("Syncing...").previousSibling as HTMLElement;
      expect(dot.className).toContain("bg-blue-400");
    });

    it("renders skeleton placeholder cards when isLoading is true (initial load)", () => {
      const { container } = render(
        <MemberList
          members={mockMembers}
          currentUserId="student-1"
          isRealtimeConnected={true}
          connectionState="connected"
          isLoading={true}
          isReconciling={true}
        />
      );

      // MemberList renders 6 skeleton cards matching responsive 2xl:grid-cols-6 columns
      expect(container.querySelectorAll(".animate-pulse").length).toBe(6);
    });

    it("displays 'Connecting...' (sky pulse) when connectionState is connecting", () => {
      render(
        <MemberList
          members={mockMembers}
          currentUserId="student-1"
          isRealtimeConnected={false}
          connectionState="connecting"
          isLoading={false}
          isReconciling={false}
        />
      );

      expect(screen.getByText("Connecting...")).toBeDefined();
      const dot = screen.getByText("Connecting...").previousSibling as HTMLElement;
      expect(dot.className).toContain("bg-sky-400");
    });

    it("displays 'Reconnecting...' (amber pulse) when connectionState is reconnecting", () => {
      render(
        <MemberList
          members={mockMembers}
          currentUserId="student-1"
          isRealtimeConnected={false}
          connectionState="reconnecting"
          isLoading={false}
          isReconciling={false}
        />
      );

      expect(screen.getByText("Reconnecting...")).toBeDefined();
      const dot = screen.getByText("Reconnecting...").previousSibling as HTMLElement;
      expect(dot.className).toContain("bg-amber-400");
    });

    it("displays 'Offline' when connectionState is offline", () => {
      render(
        <MemberList
          members={mockMembers}
          currentUserId="student-1"
          isRealtimeConnected={false}
          connectionState="offline"
          isLoading={false}
          isReconciling={false}
        />
      );

      expect(screen.getByText("Offline")).toBeDefined();
      const dot = screen.getByText("Offline").previousSibling as HTMLElement;
      expect(dot.className).toContain("bg-zinc-500");
    });
  });
});
