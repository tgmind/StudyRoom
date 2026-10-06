import { describe, it, expect, vi, beforeEach } from "vitest";
import { isValidHttpUrl, normalizeUrl } from "@/lib/social/urlValidation";
import { DEFAULT_SOCIAL_LINKS, PLATFORM_PRESETS } from "@/lib/social/types";
import { GET as publicGet } from "@/app/api/social-links/route";
import { GET as adminGet, POST as adminPost } from "@/app/api/admin/social-links/route";
import { NextRequest } from "next/server";

// Mock Supabase server client
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockOrder = vi.fn();
const mockUpdate = vi.fn();
const mockUpsert = vi.fn();
const mockDelete = vi.fn();
const mockSingle = vi.fn();

const mockFrom = vi.fn().mockReturnValue({
  select: mockSelect,
  update: mockUpdate,
  upsert: mockUpsert,
  delete: mockDelete,
});

const mockGetUser = vi.fn();
const mockRpc = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve({
    from: mockFrom,
    rpc: mockRpc,
    auth: {
      getUser: mockGetUser,
    },
  })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: mockFrom,
    rpc: mockRpc,
  })),
}));

describe("Social Links Core Unit Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("URL Validation", () => {
    it("accepts valid https and http URLs", () => {
      expect(isValidHttpUrl("https://whatsapp.com/channel/0029VbDVgDFBvvseejxJ8L25")).toBe(true);
      expect(isValidHttpUrl("https://t.me/studyalive_telegram")).toBe(true);
      expect(isValidHttpUrl("https://youtube.com/@studyroom")).toBe(true);
      expect(isValidHttpUrl("http://example.com")).toBe(true);
      expect(isValidHttpUrl("http://localhost:3000")).toBe(true);
    });

    it("rejects malicious, unsupported schemes, and malformed strings", () => {
      expect(isValidHttpUrl("javascript:alert(1)")).toBe(false);
      expect(isValidHttpUrl("data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==")).toBe(false);
      expect(isValidHttpUrl("file:///etc/passwd")).toBe(false);
      expect(isValidHttpUrl("ftp://ftp.example.com")).toBe(false);
      expect(isValidHttpUrl("not-a-url")).toBe(false);
      expect(isValidHttpUrl("")).toBe(false);
      expect(isValidHttpUrl("   ")).toBe(false);
      expect(isValidHttpUrl(null)).toBe(false);
      expect(isValidHttpUrl(undefined)).toBe(false);
      expect(isValidHttpUrl(12345)).toBe(false);
    });

    it("normalizes and trims URLs", () => {
      expect(normalizeUrl("  https://t.me/studyalive_telegram  ")).toBe("https://t.me/studyalive_telegram");
    });
  });

  describe("Default Seed Configuration", () => {
    it("contains exactly WhatsApp and Telegram with correct URLs and 'Join Now' action text", () => {
      expect(DEFAULT_SOCIAL_LINKS).toHaveLength(2);

      const whatsapp = DEFAULT_SOCIAL_LINKS.find((l) => l.platform === "whatsapp");
      expect(whatsapp).toBeDefined();
      expect(whatsapp?.title).toBe("WhatsApp");
      expect(whatsapp?.url).toBe("https://whatsapp.com/channel/0029VbDVgDFBvvseejxJ8L25");
      expect(whatsapp?.action_text).toBe("Join Now");
      expect(whatsapp?.is_enabled).toBe(true);
      expect(whatsapp?.display_order).toBe(1);

      const telegram = DEFAULT_SOCIAL_LINKS.find((l) => l.platform === "telegram");
      expect(telegram).toBeDefined();
      expect(telegram?.title).toBe("Telegram");
      expect(telegram?.url).toBe("https://t.me/studyalive_telegram");
      expect(telegram?.action_text).toBe("Join Now");
      expect(telegram?.is_enabled).toBe(true);
      expect(telegram?.display_order).toBe(2);
    });

    it("provides platform presets including WhatsApp, Telegram, YouTube, Instagram, Twitter, Reddit, Custom", () => {
      const keys = PLATFORM_PRESETS.map((p) => p.key);
      expect(keys).toContain("whatsapp");
      expect(keys).toContain("telegram");
      expect(keys).toContain("youtube");
      expect(keys).toContain("instagram");
      expect(keys).toContain("twitter");
      expect(keys).toContain("reddit");
      expect(keys).toContain("custom");
    });
  });

  describe("Public API Route: /api/social-links (Database Authority)", () => {
    it("returns enabled links strictly from database", async () => {
      const dbLinks = [
        {
          id: "whatsapp",
          platform: "whatsapp",
          title: "WhatsApp",
          url: "https://whatsapp.com/channel/custom-url",
          action_text: "Join Now",
          is_enabled: true,
          display_order: 1,
        },
      ];

      mockSelect.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: dbLinks, error: null }),
        }),
      });

      const res = await publicGet();
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.links).toEqual(dbLinks);
    });

    it("never resurrects defaults when database has disabled links or returns empty", async () => {
      mockSelect.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      });

      const res = await publicGet();
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.links).toEqual([]);
      expect(json.links).not.toEqual(DEFAULT_SOCIAL_LINKS);
    });

    it("returns empty array and error status on database failure without resurrecting defaults", async () => {
      mockSelect.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: null, error: { message: "Database connection failed" } }),
        }),
      });

      const res = await publicGet();
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.links).toEqual([]);
      expect(json.error).toBe("Database connection failed");
    });
  });

  describe("Admin API Route: /api/admin/social-links (Permissions & URL Validation)", () => {
    it("rejects unauthorized non-admin requests with 403", async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: "user-123", email: "student@example.com" } },
        error: null,
      });

      mockSelect.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: { is_admin: false } }),
        }),
      });

      const req = new NextRequest("http://localhost:3000/api/admin/social-links");
      const res = await adminGet(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toContain("Administrator privileges required");
    });

    it("allows authorized admin requests and returns all links", async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: "8076296e-134a-4036-b8ed-1a9c6ff26ec1", email: "studyaliveapp@gmail.com" } },
        error: null,
      });

      const allLinks = [
        { id: "whatsapp", platform: "whatsapp", title: "WhatsApp", is_enabled: false },
        { id: "telegram", platform: "telegram", title: "Telegram", is_enabled: true },
      ];

      mockSelect.mockReturnValue({
        order: vi.fn().mockResolvedValue({ data: allLinks, error: null }),
      });

      const req = new NextRequest("http://localhost:3000/api/admin/social-links");
      const res = await adminGet(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.links).toHaveLength(2);
      expect(json.links[0].is_enabled).toBe(false);
    });

    it("rejects invalid URLs when saving with 400 error", async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: "8076296e-134a-4036-b8ed-1a9c6ff26ec1", email: "studyaliveapp@gmail.com" } },
        error: null,
      });

      const req = new NextRequest("http://localhost:3000/api/admin/social-links", {
        method: "POST",
        body: JSON.stringify({
          action: "save",
          link: {
            title: "Dangerous Link",
            url: "javascript:evil()",
          },
        }),
      });

      const res = await adminPost(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("Invalid URL");
    });

    it("successfully saves valid links", async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: "8076296e-134a-4036-b8ed-1a9c6ff26ec1", email: "studyaliveapp@gmail.com" } },
        error: null,
      });

      const savedData = {
        id: "youtube-1",
        platform: "youtube",
        title: "YouTube",
        url: "https://youtube.com/@studyalive",
        action_text: "Subscribe",
        is_enabled: true,
        display_order: 3,
      };

      mockUpsert.mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: savedData, error: null }),
        }),
      });

      const req = new NextRequest("http://localhost:3000/api/admin/social-links", {
        method: "POST",
        body: JSON.stringify({
          action: "save",
          link: savedData,
        }),
      });

      const res = await adminPost(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.link).toEqual(savedData);
    });
  });
});

  describe("Admin API Mutations (Toggle, Delete, Reorder)", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("handles toggle action by updating is_enabled", async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: "8076296e-134a-4036-b8ed-1a9c6ff26ec1", email: "studyaliveapp@gmail.com" } },
        error: null,
      });

      mockUpdate.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: "whatsapp", title: "WhatsApp", is_enabled: false },
              error: null,
            }),
          }),
        }),
      });

      const req = new NextRequest("http://localhost:3000/api/admin/social-links", {
        method: "POST",
        body: JSON.stringify({
          action: "toggle",
          id: "whatsapp",
          is_enabled: false,
        }),
      });

      const res = await adminPost(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.link.is_enabled).toBe(false);
    });

    it("handles delete action by removing link", async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: "8076296e-134a-4036-b8ed-1a9c6ff26ec1", email: "studyaliveapp@gmail.com" } },
        error: null,
      });

      mockDelete.mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });

      const req = new NextRequest("http://localhost:3000/api/admin/social-links", {
        method: "POST",
        body: JSON.stringify({
          action: "delete",
          id: "custom-link-1",
        }),
      });

      const res = await adminPost(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.deletedId).toBe("custom-link-1");
    });

    it("handles atomic reorder action via RPC transaction", async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: "8076296e-134a-4036-b8ed-1a9c6ff26ec1", email: "studyaliveapp@gmail.com" } },
        error: null,
      });

      mockRpc.mockResolvedValueOnce({
        data: { success: true },
        error: null,
      });

      const req = new NextRequest("http://localhost:3000/api/admin/social-links", {
        method: "POST",
        body: JSON.stringify({
          action: "reorder",
          items: [
            { id: "telegram", display_order: 1 },
            { id: "whatsapp", display_order: 2 },
          ],
        }),
      });

      const res = await adminPost(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(mockRpc).toHaveBeenCalledWith("rpc_admin_reorder_social_links", {
        p_items: [
          { id: "telegram", display_order: 1 },
          { id: "whatsapp", display_order: 2 },
        ],
      });
    });

    it("REGRESSION TEST: rolls back atomically when any update in reorder fails, returning 500 without partial commits", async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: "8076296e-134a-4036-b8ed-1a9c6ff26ec1", email: "studyaliveapp@gmail.com" } },
        error: null,
      });

      // RPC transaction fails and rolls back the entire batch
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: { message: "Social link not found: invalid-id" },
      });

      const req = new NextRequest("http://localhost:3000/api/admin/social-links", {
        method: "POST",
        body: JSON.stringify({
          action: "reorder",
          items: [
            { id: "whatsapp", display_order: 1 },
            { id: "invalid-id", display_order: 2 },
          ],
        }),
      });

      const res = await adminPost(req);
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.success).toBeUndefined();
      expect(json.error).toContain("Atomic reorder transaction failed: Social link not found: invalid-id");
      // Verify no partial standalone updates were performed
      expect(mockUpdate).not.toHaveBeenCalled();
    });
  });
