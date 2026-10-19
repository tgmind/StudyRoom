import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// We will test both with mocked Supabase client and with isolated in-memory test store
import {
  findCouponByCode,
  validateCouponCode,
  getAllCoupons,
  saveCoupon,
  deleteCoupon,
  recordReferralEnrollment,
  getAllReferralEnrollments,
  deleteReferralEnrollment,
  clearAllReferralEnrollments,
  resetTestStore,
  inMemoryCoupons,
  inMemoryReferrals,
} from "@/lib/public-website/couponStore";

import { GET as adminCouponsGet, POST as adminCouponsPost, DELETE as adminCouponsDelete } from "@/app/api/public-website/admin/coupons/route";
import { POST as validateCouponPost } from "@/app/api/public-website/validate-coupon/route";
import * as authUtils from "@/lib/public-website/authUtils";
import * as adminModule from "@/lib/supabase/admin";

describe("Coupon Management & Validation — Comprehensive Audit Regression Suite", () => {
  beforeEach(() => {
    resetTestStore();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    resetTestStore();
    vi.restoreAllMocks();
  });

  // --------------------------------------------------------------------------
  // 1. REPOSITORY TESTS: LOOKUP & VALIDATION
  // --------------------------------------------------------------------------
  describe("Coupon Repository - Lookup & Validation", () => {
    it("1. finds a legitimate active coupon and normalizes case/whitespace", async () => {
      await saveCoupon({
        code: "SPECIAL5",
        discountPercent: 100,
        isActive: true,
        maxUses: 10,
        note: "Special 10 redemptions",
      });

      const coupon = await findCouponByCode("  special5  ");
      expect(coupon).not.toBeNull();
      expect(coupon?.code).toBe("SPECIAL5");
      expect(coupon?.discountPercent).toBe(100);
      expect(coupon?.maxUses).toBe(10);
      expect(coupon?.isActive).toBe(true);

      const valRes = await validateCouponCode("special5");
      expect(valRes.valid).toBe(true);
      expect(valRes.coupon?.code).toBe("SPECIAL5");
    });

    it("2. rejects inactive coupons with a generic user-facing message", async () => {
      await saveCoupon({
        code: "INACTIVE100",
        discountPercent: 100,
        isActive: false,
      });

      const res = await validateCouponCode("INACTIVE100");
      expect(res.valid).toBe(false);
      expect(res.errorMessage).toBe("Invalid or inactive coupon code.");
    });

    it("3. rejects nonexistent coupons with a generic user-facing message", async () => {
      const res = await validateCouponCode("DOESNOTEXIST999");
      expect(res.valid).toBe(false);
      expect(res.errorMessage).toBe("Invalid or inactive coupon code.");
    });

    it("4. rejects exhausted coupons where usedCount >= maxUses", async () => {
      await saveCoupon({
        code: "LIMIT1",
        discountPercent: 100,
        isActive: true,
        maxUses: 1,
      });
      const inMem = inMemoryCoupons.find((c) => c.code === "LIMIT1");
      if (inMem) inMem.usedCount = 1;

      const res = await validateCouponCode("LIMIT1");
      expect(res.valid).toBe(false);
      expect(res.errorMessage).toBe("Invalid or inactive coupon code.");
    });

    it("5. surfaces database query failures as operational errors without returning fake coupons", async () => {
      // Mock adminClient to simulate a database query error
      const mockClient = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            ilike: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: null,
                error: { message: "connection timeout" },
              }),
            })),
          })),
        })),
      };
      vi.spyOn(adminModule, "createAdminClient").mockReturnValue(mockClient as any);

      const res = await validateCouponCode("ANYCODE");
      expect(res.valid).toBe(false);
      expect(res.isError).toBe(true);
      expect(res.errorMessage).toContain("Service temporarily unavailable");
    });

    it("6. rejects legacy placeholder coupons (REFERRAL100, STUDY100, VIP100) if not in DB", async () => {
      // With clean empty store and no DB entry, placeholders must fail validation
      const res1 = await validateCouponCode("REFERRAL100");
      expect(res1.valid).toBe(false);
      const res2 = await validateCouponCode("STUDY100");
      expect(res2.valid).toBe(false);
      const res3 = await validateCouponCode("VIP100");
      expect(res3.valid).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // 2. REPOSITORY TESTS: ADMINISTRATIVE LISTING (getAllCoupons)
  // --------------------------------------------------------------------------
  describe("Coupon Repository - Administrative Listing", () => {
    it("7. maps createdAt correctly per-row from d.created_at and preserves ordering", async () => {
      const mockData = [
        {
          id: "cpn_1",
          code: "RUPAN10",
          discount_percent: 100,
          is_active: true,
          max_uses: 10,
          used_count: 2,
          note: "Rupan referral",
          created_at: "2026-10-08T03:55:45.623Z",
        },
        {
          id: "cpn_2",
          code: "SUBHRA",
          discount_percent: 100,
          is_active: true,
          max_uses: 1,
          used_count: 0,
          note: "Subhra pass",
          created_at: "2026-10-05T15:16:41.823Z",
        },
      ];

      const mockClient = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            order: vi.fn().mockResolvedValue({ data: mockData, error: null }),
          })),
        })),
      };
      vi.spyOn(adminModule, "createAdminClient").mockReturnValue(mockClient as any);

      const coupons = await getAllCoupons();
      expect(coupons.length).toBe(2);
      expect(coupons[0].createdAt).toBe("2026-10-08T03:55:45.623Z");
      expect(coupons[1].createdAt).toBe("2026-10-05T15:16:41.823Z");
      expect(coupons[0].usedCount).toBe(2);
      expect(coupons[0].note).toBe("Rupan referral");
    });

    it("8. returns an empty list when the database has zero records", async () => {
      const mockClient = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
          })),
        })),
      };
      vi.spyOn(adminModule, "createAdminClient").mockReturnValue(mockClient as any);

      const coupons = await getAllCoupons();
      expect(coupons).toEqual([]);
    });

    it("9. throws an error when database query fails (never misleads as successful empty list)", async () => {
      const mockClient = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            order: vi.fn().mockResolvedValue({ data: null, error: { message: "DB read error" } }),
          })),
        })),
      };
      vi.spyOn(adminModule, "createAdminClient").mockReturnValue(mockClient as any);

      await expect(getAllCoupons()).rejects.toThrow("Failed to fetch coupons from database");
    });
  });

  // --------------------------------------------------------------------------
  // 3. REPOSITORY TESTS: NON-DESTRUCTIVE UPDATES & METADATA INTEGRITY
  // --------------------------------------------------------------------------
  describe("Coupon Repository - Non-Destructive saveCoupon", () => {
    it("10. updating an existing coupon preserves ID, createdAt, usedCount, maxUses, and note", async () => {
      const existingDbRecord = {
        id: "cpn_fixed_id_123",
        code: "SPECIAL5",
        discount_percent: 100,
        is_active: true,
        max_uses: 10,
        used_count: 3,
        note: "Important client note",
        created_at: "2026-10-14T07:34:50.020Z",
      };

      let capturedUpdate: any = null;
      const mockClient = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            ilike: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: existingDbRecord, error: null }),
            })),
          })),
          update: vi.fn((payload) => {
            capturedUpdate = payload;
            return {
              eq: vi.fn(() => ({
                select: vi.fn(() => ({
                  single: vi.fn().mockResolvedValue({
                    data: { ...existingDbRecord, ...payload },
                    error: null,
                  }),
                })),
              })),
            };
          }),
        })),
      };
      vi.spyOn(adminModule, "createAdminClient").mockReturnValue(mockClient as any);

      // Status toggle only: deactivating coupon
      const updated = await saveCoupon({
        code: "SPECIAL5",
        isActive: false,
      });

      // Verify that ONLY is_active was updated in the DB
      expect(capturedUpdate).toEqual({ is_active: false });
      expect(updated.id).toBe("cpn_fixed_id_123");
      expect(updated.isActive).toBe(false);
      expect(updated.maxUses).toBe(10); // NOT wiped out to null
      expect(updated.note).toBe("Important client note"); // NOT wiped out to ""
      expect(updated.usedCount).toBe(3); // NOT reset
      expect(updated.createdAt).toBe("2026-10-14T07:34:50.020Z");
    });

    it("11. explicitly updating maxUses modifies max_uses without altering note or usedCount", async () => {
      const existingDbRecord = {
        id: "cpn_fixed_id_456",
        code: "RUPAN10",
        discount_percent: 100,
        is_active: true,
        max_uses: 10,
        used_count: 5,
        note: "Retained note",
        created_at: "2026-10-08T03:55:45.623Z",
      };

      let capturedUpdate: any = null;
      const mockClient = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            ilike: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: existingDbRecord, error: null }),
            })),
          })),
          update: vi.fn((payload) => {
            capturedUpdate = payload;
            return {
              eq: vi.fn(() => ({
                select: vi.fn(() => ({
                  single: vi.fn().mockResolvedValue({
                    data: { ...existingDbRecord, ...payload },
                    error: null,
                  }),
                })),
              })),
            };
          }),
        })),
      };
      vi.spyOn(adminModule, "createAdminClient").mockReturnValue(mockClient as any);

      const updated = await saveCoupon({
        code: "RUPAN10",
        maxUses: 25,
      });

      expect(capturedUpdate).toEqual({ max_uses: 25 });
      expect(updated.maxUses).toBe(25);
      expect(updated.note).toBe("Retained note");
      expect(updated.usedCount).toBe(5);
    });

    it("12. validates input constraints: rejects invalid discounts and negative maxUses", async () => {
      await expect(
        saveCoupon({ code: "BAD1", discountPercent: 150 })
      ).rejects.toThrow("Discount percent must be an integer between 1 and 100.");

      await expect(
        saveCoupon({ code: "BAD2", maxUses: -5 })
      ).rejects.toThrow("Maximum uses must be a positive integer or null.");

      await expect(
        saveCoupon({ code: "" })
      ).rejects.toThrow("Invalid coupon code.");
    });
  });

  // --------------------------------------------------------------------------
  // 4. PRODUCTION SAFETY & DEFENSE-IN-DEPTH GUARD
  // --------------------------------------------------------------------------
  describe("Production Safety Guard", () => {
    it("13. createAdminClient throws Security Violation in unit test mode if unmocked and live DB not explicitly allowed", () => {
      vi.restoreAllMocks();
      const origEnv = process.env.ALLOW_LIVE_DB_TESTS;
      delete process.env.ALLOW_LIVE_DB_TESTS;

      try {
        expect(() => adminModule.createAdminClient()).toThrow(/Security Violation/);
      } finally {
        if (origEnv !== undefined) {
          process.env.ALLOW_LIVE_DB_TESTS = origEnv;
        }
      }
    });
  });

  // --------------------------------------------------------------------------
  // 5. ADMINISTRATIVE ROUTE HANDLER (API Regression)
  // --------------------------------------------------------------------------
  describe("Admin Route API (/api/public-website/admin/coupons)", () => {
    it("14. rejects unauthorized administrative requests with 401", async () => {
      vi.spyOn(authUtils, "isAuthorizedAdmin").mockResolvedValue(false);

      const reqGet = new NextRequest("http://localhost/api/public-website/admin/coupons");
      const resGet = await adminCouponsGet(reqGet);
      expect(resGet.status).toBe(401);

      const reqPost = new NextRequest("http://localhost/api/public-website/admin/coupons", {
        method: "POST",
        body: JSON.stringify({ code: "TESTCODE", isActive: true }),
      });
      const resPost = await adminCouponsPost(reqPost);
      expect(resPost.status).toBe(401);

      const reqDel = new NextRequest("http://localhost/api/public-website/admin/coupons", {
        method: "DELETE",
        body: JSON.stringify({ code: "TESTCODE" }),
      });
      const resDel = await adminCouponsDelete(reqDel);
      expect(resDel.status).toBe(401);
    });

    it("15. POST handler validates input types and rejects invalid maxUses and code length", async () => {
      vi.spyOn(authUtils, "isAuthorizedAdmin").mockResolvedValue(true);

      // Invalid code (too short)
      const resShort = await adminCouponsPost(
        new NextRequest("http://localhost/api/public-website/admin/coupons", {
          method: "POST",
          body: JSON.stringify({ code: "X" }),
        })
      );
      expect(resShort.status).toBe(400);

      // Invalid maxUses
      const resBadUses = await adminCouponsPost(
        new NextRequest("http://localhost/api/public-website/admin/coupons", {
          method: "POST",
          body: JSON.stringify({ code: "VALIDCODE", maxUses: "invalid-number" }),
        })
      );
      expect(resBadUses.status).toBe(400);

      // Invalid isActive
      const resBadActive = await adminCouponsPost(
        new NextRequest("http://localhost/api/public-website/admin/coupons", {
          method: "POST",
          body: JSON.stringify({ code: "VALIDCODE", isActive: "yes" }),
        })
      );
      expect(resBadActive.status).toBe(400);
    });

    it("16. status toggle request does not send destructive defaults for omitted maxUses or note", async () => {
      vi.spyOn(authUtils, "isAuthorizedAdmin").mockResolvedValue(true);

      // Seed coupon in test memory
      await saveCoupon({
        code: "SPECIAL5",
        discountPercent: 100,
        isActive: true,
        maxUses: 10,
        note: "Original Note",
      });

      // Send status toggle request: only code and isActive provided
      const req = new NextRequest("http://localhost/api/public-website/admin/coupons", {
        method: "POST",
        body: JSON.stringify({ code: "SPECIAL5", isActive: false }),
      });

      const res = await adminCouponsPost(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.coupon.isActive).toBe(false);
      expect(data.coupon.maxUses).toBe(10); // Preserved!
      expect(data.coupon.note).toBe("Original Note"); // Preserved!
    });
  });

  // --------------------------------------------------------------------------
  // 6. PUBLIC VALIDATION ROUTE HANDLER (API Regression)
  // --------------------------------------------------------------------------
  describe("Public Validation Route (/api/public-website/validate-coupon)", () => {
    it("17. returns 200 with code and discountPercent without disclosing internal notes", async () => {
      await saveCoupon({
        code: "SECRETNOTE",
        discountPercent: 100,
        isActive: true,
        maxUses: 10,
        note: "TOP SECRET INTERNAL NOTE",
      });

      const req = new NextRequest("http://localhost/api/public-website/validate-coupon", {
        method: "POST",
        body: JSON.stringify({ code: "SECRETNOTE" }),
      });

      const res = await validateCouponPost(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.valid).toBe(true);
      expect(data.code).toBe("SECRETNOTE");
      expect(data.discountPercent).toBe(100);
      expect(data.note).toBeUndefined(); // Must NOT leak internal note!
    });

    it("18. returns 503 on database operational failure rather than misleading as invalid coupon", async () => {
      const mockClient = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            ilike: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: null,
                error: { message: "Database unreachable" },
              }),
            })),
          })),
        })),
      };
      vi.spyOn(adminModule, "createAdminClient").mockReturnValue(mockClient as any);

      const req = new NextRequest("http://localhost/api/public-website/validate-coupon", {
        method: "POST",
        body: JSON.stringify({ code: "ANYCODE" }),
      });

      const res = await validateCouponPost(req);
      expect(res.status).toBe(503);
      const data = await res.json();
      expect(data.valid).toBe(false);
      expect(data.message).toContain("Service temporarily unavailable");
    });
  });

  // --------------------------------------------------------------------------
  // 7. REDEMPTION & CONCURRENCY SAFETY
  // --------------------------------------------------------------------------
  describe("Coupon Redemption & Concurrency Safety", () => {
    it("19. enrollment cannot redeem a coupon that has reached max_uses", async () => {
      await saveCoupon({
        code: "SINGLEUSE",
        discountPercent: 100,
        isActive: true,
        maxUses: 1,
      });

      // First enrollment succeeds
      const res1 = await recordReferralEnrollment({
        couponCode: "SINGLEUSE",
        name: "Student One",
        referredBy: "Friend",
        agreementAccepted: true,
      });
      expect(res1.success).toBe(true);

      // Second enrollment must fail
      const res2 = await recordReferralEnrollment({
        couponCode: "SINGLEUSE",
        name: "Student Two",
        referredBy: "Friend",
        agreementAccepted: true,
      });
      expect(res2.success).toBe(false);
      expect(res2.errorMessage).toContain("Invalid or inactive coupon code.");
    });

    it("20. handles unlimited coupons (maxUses === null) correctly", async () => {
      await saveCoupon({
        code: "UNLIMITED",
        discountPercent: 100,
        isActive: true,
        maxUses: null,
      });

      for (let i = 1; i <= 5; i++) {
        const res = await recordReferralEnrollment({
          couponCode: "UNLIMITED",
          name: `Student ${i}`,
          referredBy: "Community",
          agreementAccepted: true,
        });
        expect(res.success).toBe(true);
      }

      const coupon = await findCouponByCode("UNLIMITED");
      expect(coupon?.usedCount).toBe(5);
    });
  });
});
