import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { isAdminEmail, isAdminUserId, getAdminEmail, getAdminUserId } from "@/hooks/useAdmin";

describe("Admin Utilities", () => {
  const originalEnv = process.env;
  let mockStorage: Record<string, string> = {};

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    mockStorage = {};
    const storageMock = {
      getItem: (key: string) => mockStorage[key] ?? null,
      setItem: (key: string, val: string) => {
        mockStorage[key] = val;
      },
      removeItem: (key: string) => {
        delete mockStorage[key];
      },
      clear: () => {
        mockStorage = {};
      },
      length: 0,
      key: () => null,
    };
    vi.stubGlobal("localStorage", storageMock);
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.unstubAllGlobals();
  });

  it("identifies admin email accurately (case-insensitive)", () => {
    process.env.NEXT_PUBLIC_ADMIN_EMAIL = "sa@admin.tg";

    expect(isAdminEmail("sa@admin.tg")).toBe(true);
    expect(isAdminEmail("SA@ADMIN.TG")).toBe(true);
    expect(isAdminEmail("Sa@Admin.Tg")).toBe(true);
    expect(isAdminEmail("user@example.com")).toBe(false);
    expect(isAdminEmail("")).toBe(false);
    expect(isAdminEmail(null)).toBe(false);
    expect(isAdminEmail(undefined)).toBe(false);
  });

  it("returns configured admin email", () => {
    process.env.NEXT_PUBLIC_ADMIN_EMAIL = "sa@admin.tg";
    expect(getAdminEmail()).toBe("sa@admin.tg");
  });

  it("identifies admin user ID accurately from env or localStorage", () => {
    process.env.NEXT_PUBLIC_ADMIN_USER_ID = "00000000-0000-0000-0000-000000000001";

    expect(isAdminUserId("00000000-0000-0000-0000-000000000001")).toBe(true);
    expect(isAdminUserId("11111111-1111-1111-1111-111111111111")).toBe(false);
    expect(isAdminUserId("")).toBe(false);
    expect(isAdminUserId(null)).toBe(false);

    // Test localStorage fallback
    process.env.NEXT_PUBLIC_ADMIN_USER_ID = "";
    localStorage.setItem("studyroom_admin_uid", "test-admin-uuid-123");
    expect(getAdminUserId()).toBe("test-admin-uuid-123");
    expect(isAdminUserId("test-admin-uuid-123")).toBe(true);
  });
});
