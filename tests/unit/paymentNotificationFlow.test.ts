import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  validateAndNormalizeIndianPhone,
  maskPhoneNumber,
  generateAccessToken,
  generateEnrollmentToken,
  hashToken,
  ENROLLMENT_COOKIE_NAME,
} from "@/lib/auth/enrollment";
import {
  generateAdminPaymentNotificationEmail,
  generateUserPaymentPendingEmail,
  generateUserPaymentVerifiedEmail,
  generateUserPaymentRejectedEmail,
} from "@/lib/email/templates";
import { GET as redeemAccessGet, POST as redeemAccessPost } from "@/app/api/auth/redeem-access/route";
import { POST as adminSubmissionsPost } from "@/app/api/public-website/admin/submissions/route";

// --- IN-MEMORY TEST DATABASE ---
let mockGrants: any[] = [];
let mockSubmissions: any[] = [];

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      let currentTable = table;
      let filters: Array<(row: any) => boolean> = [];
      let pendingUpdates: any = null;

      const builder: any = {
        select: (cols: string = "*") => {
          if (pendingUpdates) {
            const list = currentTable === "enrollment_grants" ? mockGrants : mockSubmissions;
            const matches = list.filter((item) => filters.every((fn) => fn(item)));
            for (const item of matches) {
              Object.assign(item, pendingUpdates);
            }
            const res = { data: matches, error: null };
            return {
              ...res,
              then: (resolve: any) => resolve(res),
            };
          }
          return builder;
        },
        eq: (col: string, val: any) => {
          filters.push((row: any) => row[col] === val);
          return builder;
        },
        in: (col: string, vals: any[]) => {
          filters.push((row: any) => vals.includes(row[col]));
          return builder;
        },
        gt: (col: string, val: any) => {
          filters.push((row: any) => new Date(row[col]).getTime() > new Date(val).getTime());
          return builder;
        },
        maybeSingle: async () => {
          const list = currentTable === "enrollment_grants" ? mockGrants : mockSubmissions;
          const match = list.find((item) => filters.every((fn) => fn(item)));
          return { data: match || null, error: null };
        },
        update: (updates: any) => {
          pendingUpdates = updates;
          return builder;
        },
        then: (resolve: any) => {
          const list = currentTable === "enrollment_grants" ? mockGrants : mockSubmissions;
          if (pendingUpdates) {
            const matches = list.filter((item) => filters.every((fn) => fn(item)));
            for (const item of matches) {
              Object.assign(item, pendingUpdates);
            }
            return resolve({ data: matches, error: null });
          }
          const matches = list.filter((item) => filters.every((fn) => fn(item)));
          return resolve({ data: matches, error: null });
        },
      };

      return builder;
    },
    rpc: async () => ({
      data: { success: true, grant_id: "test-grant-id", otp: "1234" },
      error: null,
    }),
  }),
}));

vi.mock("@/lib/public-website/authUtils", async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    isAuthorizedAdmin: async () => true,
    verifySameOrigin: () => true,
  };
});

// Mock mailer so network calls are intercepted cleanly
vi.mock("@/lib/email/mailer", async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    sendUserPaymentVerifiedEmail: vi.fn(async () => ({ success: true, messageId: "msg_test_123" })),
    sendUserPaymentRejectedEmail: vi.fn(async () => ({ success: true, messageId: "msg_test_rej" })),
    sendAdminPaymentNotification: vi.fn(async () => ({ success: true })),
    sendUserPaymentPendingEmail: vi.fn(async () => ({ success: true })),
  };
});

describe("Payment Notification & Phone Contact Workflow Tests", () => {
  beforeEach(() => {
    mockGrants = [];
    mockSubmissions = [];
    vi.clearAllMocks();
  });

  /* =========================================================
     1. INDIAN PHONE NUMBER VALIDATION & NORMALIZATION
     ========================================================= */
  describe("validateAndNormalizeIndianPhone", () => {
    it("accepts valid 10-digit mobile starting with 6, 7, 8, 9", () => {
      expect(validateAndNormalizeIndianPhone("9876543210")).toEqual({
        valid: true,
        normalized: "+919876543210",
      });
      expect(validateAndNormalizeIndianPhone("8123456789")).toEqual({
        valid: true,
        normalized: "+918123456789",
      });
      expect(validateAndNormalizeIndianPhone("7012345678")).toEqual({
        valid: true,
        normalized: "+917012345678",
      });
      expect(validateAndNormalizeIndianPhone("6987654321")).toEqual({
        valid: true,
        normalized: "+916987654321",
      });
    });

    it("normalizes numbers with +91 country code and formatting", () => {
      expect(validateAndNormalizeIndianPhone("+91 98765 43210")).toEqual({
        valid: true,
        normalized: "+919876543210",
      });
      expect(validateAndNormalizeIndianPhone("+91-98765-43210")).toEqual({
        valid: true,
        normalized: "+919876543210",
      });
      expect(validateAndNormalizeIndianPhone("+91 (98765) 43210")).toEqual({
        valid: true,
        normalized: "+919876543210",
      });
    });

    it("normalizes numbers with 91 prefix without plus", () => {
      expect(validateAndNormalizeIndianPhone("919876543210")).toEqual({
        valid: true,
        normalized: "+919876543210",
      });
    });

    it("normalizes numbers with leading 0 (trunk prefix)", () => {
      expect(validateAndNormalizeIndianPhone("09876543210")).toEqual({
        valid: true,
        normalized: "+919876543210",
      });
    });

    it("rejects invalid numbers starting with 0-5", () => {
      const res1 = validateAndNormalizeIndianPhone("5123456789");
      expect(res1.valid).toBe(false);
      expect(res1.error).toContain("must start with 6, 7, 8, or 9");

      const res2 = validateAndNormalizeIndianPhone("1234567890");
      expect(res2.valid).toBe(false);
    });

    it("rejects dummy repeating numbers (e.g. 9999999999, 8888888888)", () => {
      const res = validateAndNormalizeIndianPhone("9999999999");
      expect(res.valid).toBe(false);
      expect(res.error).toContain("genuine");

      const res2 = validateAndNormalizeIndianPhone("+91 8888888888");
      expect(res2.valid).toBe(false);
    });

    it("rejects non-digits, short digits, and empty values", () => {
      expect(validateAndNormalizeIndianPhone("").valid).toBe(false);
      expect(validateAndNormalizeIndianPhone(null as any).valid).toBe(false);
      expect(validateAndNormalizeIndianPhone("12345").valid).toBe(false);
      expect(validateAndNormalizeIndianPhone("98765ABCD0").valid).toBe(false);
      expect(validateAndNormalizeIndianPhone("9876543210123").valid).toBe(false);
    });
  });

  /* =========================================================
     2. PHONE NUMBER MASKING
     ========================================================= */
  describe("maskPhoneNumber", () => {
    it("masks Indian mobile number properly preserving prefix and suffix", () => {
      expect(maskPhoneNumber("+919876543210")).toBe("+91******3210");
      expect(maskPhoneNumber("9876543210")).toBe("987***3210");
    });

    it("handles short or empty numbers gracefully", () => {
      expect(maskPhoneNumber("")).toBe("");
      expect(maskPhoneNumber(null)).toBe("");
      expect(maskPhoneNumber("123")).toBe("***");
    });
  });

  /* =========================================================
     3. ACCESS TOKEN & SECURITY UTILITIES
     ========================================================= */
  describe("Access Token Generation & Hashing", () => {
    it("generates 32-byte CSPRNG hex string (64 characters)", () => {
      const token1 = generateAccessToken();
      const token2 = generateAccessToken();
      expect(token1).toHaveLength(64);
      expect(token2).toHaveLength(64);
      expect(token1).not.toBe(token2);
      expect(/^[a-f0-9]{64}$/.test(token1)).toBe(true);
    });

    it("hashes access tokens deterministically using SHA-256", () => {
      const token = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";
      const hash1 = hashToken(token);
      const hash2 = hashToken(token);
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
      expect(hash1).not.toBe(token);
    });
  });

  /* =========================================================
     4. EMAIL TEMPLATES (CRITICAL FIX #3: NO OTP IN EMAIL)
     ========================================================= */
  describe("Email Templates", () => {
    it("generates Admin Payment Notification email with complete details", () => {
      const payload = generateAdminPaymentNotificationEmail({
        name: "Aman Sharma",
        email: "aman@example.com",
        phone: "+919876543210",
        utr: "428719283746",
        amount: 20,
        submittedAt: "2026-10-01 18:30:00",
      });

      expect(payload.subject).toContain("New ₹20 Payment Submission: Aman Sharma (428719283746)");
      expect(payload.text).toContain("Aman Sharma");
      expect(payload.text).toContain("aman@example.com");
      expect(payload.text).toContain("+919876543210");
      expect(payload.text).toContain("428719283746");
      expect(payload.text).toContain("/public/admin");
      expect(payload.html).toContain("Aman Sharma");
      expect(payload.html).toContain("428719283746");
      expect(payload.html).toContain("/public/admin");
    });

    it("generates Student Payment Pending email with reassurance and ETA", () => {
      const payload = generateUserPaymentPendingEmail({
        name: "Pooja Patel",
        email: "pooja@example.com",
        phone: "+919876543210",
        utr: "519283746192",
      });

      expect(payload.subject).toBe("StudyRoom Payment Received — Verification Pending");
      expect(payload.text).toContain("519283746192");
      expect(payload.text).toContain("15 to 30 minutes");
      expect(payload.text).toContain("You do NOT need to keep the website or browser window open");
      expect(payload.text).toContain("+919876543210");
      expect(payload.html).toContain("Pooja Patel");
      expect(payload.html).toContain("519283746192");
      expect(payload.html).toContain("Verification in Progress");
    });

    it("generates Student Verified email with single-use access link and NO OTP in content", () => {
      const testToken = generateAccessToken();
      const accessLink = `https://studyalive.netlify.app/api/auth/redeem-access?token=${testToken}`;
      const payload = generateUserPaymentVerifiedEmail({
        name: "Rahul Verma",
        email: "rahul@example.com",
        accessLink,
      });

      expect(payload.subject).toBe("StudyRoom Payment Verified — Complete Your Signup");
      expect(payload.text).toContain(accessLink);
      expect(payload.text).not.toContain("Verification Code:");
      expect(payload.text).toContain("valid for 24 hours and can be used once");
      expect(payload.html).toContain(accessLink);
      expect(payload.html).not.toContain("Your 4-Digit Verification Code");
      expect(payload.html).toContain("Complete Your Signup Now");
    });

    it("generates Student Rejected email with guidance and clear reason", () => {
      const payload = generateUserPaymentRejectedEmail({
        name: "Vikram Singh",
        email: "vikram@example.com",
        utr: "998877665544",
        reason: "UTR not reflected in bank account statement after 2 hours.",
      });

      expect(payload.subject).toBe("StudyRoom Payment Verification Update");
      expect(payload.text).toContain("998877665544");
      expect(payload.text).toContain("UTR not reflected in bank account statement");
      expect(payload.html).toContain("Vikram Singh");
      expect(payload.html).toContain("998877665544");
      expect(payload.html).toContain("Unable to Confirm Payment");
    });

    it("sanitizes HTML injection in student names and UTR inputs", () => {
      const maliciousName = '<img src=x onerror=alert("xss")>';
      const maliciousUtr = '<script>alert("hack")</script>';

      const payload = generateAdminPaymentNotificationEmail({
        name: maliciousName,
        email: "test@example.com",
        phone: "+919876543210",
        utr: maliciousUtr,
      });

      expect(payload.html).not.toContain("<script>");
      expect(payload.html).not.toContain("<img src=x");
      expect(payload.html).toContain("&lt;script&gt;");
      expect(payload.html).toContain("&lt;img src=x");
    });
  });

  /* =========================================================
     5. REDEEM ACCESS INTERSTITIAL & ATOMIC CONSUMPTION (FIX #1 & #2)
     ========================================================= */
  describe("Redeem Access Endpoint Security (Fix #1 & Fix #2)", () => {
    it("GET: rejects invalid or malformed tokens with 400 error page", async () => {
      const req = new NextRequest("http://localhost:3000/api/auth/redeem-access?token=short");
      const res = await redeemAccessGet(req);
      expect(res.status).toBe(400);
      const text = await res.text();
      expect(text).toContain("Invalid Access Link");
    });

    it("GET: does NOT consume the token, renders confirmation page with Referrer-Policy: no-referrer", async () => {
      const rawToken = generateAccessToken();
      const tokenHash = hashToken(rawToken);

      mockGrants.push({
        id: "grant-test-1",
        access_token_hash: tokenHash,
        status: "active",
        expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
        email: "student@example.com",
      });

      const req = new NextRequest(`http://localhost:3000/api/auth/redeem-access?token=${rawToken}`);
      const res = await redeemAccessGet(req);

      // Verify HTTP status & security headers
      expect(res.status).toBe(200);
      expect(res.headers.get("referrer-policy")).toBe("no-referrer");
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
      expect(res.headers.get("cache-control")).toContain("no-store");

      const html = await res.text();
      // Body includes no-referrer meta
      expect(html).toContain('<meta name="referrer" content="no-referrer" />');
      // Body contains POST form with the token
      expect(html).toContain('form method="POST" action="/api/auth/redeem-access"');
      expect(html).toContain(`value="${rawToken}"`);
      expect(html).toContain("Continue to StudyRoom");

      // Verify ZERO external resources
      expect(html).not.toContain("<script");
      expect(html).not.toContain('<link rel="stylesheet"');

      // CRITICAL: Token in DB was NOT consumed by GET
      const grantInDb = mockGrants.find((g) => g.id === "grant-test-1");
      expect(grantInDb.access_token_hash).toBe(tokenHash);
      expect(grantInDb.status).toBe("active");
    });

    it("POST: atomically consumes access_token_hash, sets cookie, and redirects to /signup", async () => {
      const rawToken = generateAccessToken();
      const tokenHash = hashToken(rawToken);

      mockGrants.push({
        id: "grant-test-2",
        access_token_hash: tokenHash,
        status: "active",
        expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
        email: "student2@example.com",
      });

      const req = new NextRequest("http://localhost:3000/api/auth/redeem-access", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: rawToken }).toString(),
      });

      const res = await redeemAccessPost(req);

      // 303 Redirect to /signup (clean URL, 0 tokens)
      expect(res.status).toBe(303);
      expect(res.headers.get("location")).toBe("https://studyalive.netlify.app/signup");
      expect(res.headers.get("location")).not.toContain("token=");

      // Sets HttpOnly enrollment cookie
      const cookie = res.cookies.get(ENROLLMENT_COOKIE_NAME);
      expect(cookie?.value).toBeTruthy();
      expect(cookie?.httpOnly).toBe(true);

      // DB row was atomically consumed
      const grantInDb = mockGrants.find((g) => g.id === "grant-test-2");
      expect(grantInDb.access_token_hash).toBeNull();
      expect(grantInDb.status).toBe("preverified");
    });

    it("POST: second concurrent POST with the same token finds 0 rows and is rejected", async () => {
      const rawToken = generateAccessToken();
      const tokenHash = hashToken(rawToken);

      mockGrants.push({
        id: "grant-test-3",
        access_token_hash: tokenHash,
        status: "active",
        expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
        email: "student3@example.com",
      });

      const req1 = new NextRequest("http://localhost:3000/api/auth/redeem-access", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: rawToken }).toString(),
      });

      // First request consumes the token
      const res1 = await redeemAccessPost(req1);
      expect(res1.status).toBe(303);
      expect(res1.headers.get("location")).toBe("https://studyalive.netlify.app/signup");

      // Second concurrent or replay request
      const req2 = new NextRequest("http://localhost:3000/api/auth/redeem-access", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: rawToken }).toString(),
      });

      const res2 = await redeemAccessPost(req2);
      expect(res2.status).toBe(303);
      expect(res2.headers.get("location")).toContain("error=link_used_or_expired");
    });
  });

  /* =========================================================
     6. ADMIN RESEND ACCESS & EMAIL DELIVERY TRACKING (FIX #5 & #6)
     ========================================================= */
  describe("Admin Resend Access & Email Delivery Tracking (Fix #5 & Fix #6)", () => {
    it("resend_access: invalidates old token, sets fresh token, and returns success", async () => {
      const oldToken = generateAccessToken();
      const oldHash = hashToken(oldToken);

      const submissionId = "sub-test-10";
      mockSubmissions.push({
        id: submissionId,
        name: "Test Student",
        email: "teststudent@example.com",
        utr: "123456789012",
        status: "verified",
        email_delivery_status: "NOT SENT",
      });

      mockGrants.push({
        id: "grant-test-10",
        payment_submission_id: submissionId,
        name: "Test Student",
        email: "teststudent@example.com",
        access_token_hash: oldHash,
        status: "active",
        expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      });

      const req = new NextRequest("http://localhost:3000/api/public-website/admin/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: submissionId, action: "resend_access" }),
      });

      const res = await adminSubmissionsPost(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.emailDeliveryStatus).toBe("SENT");

      // Grant token hash has been rotated
      const grantInDb = mockGrants.find((g) => g.id === "grant-test-10");
      expect(grantInDb.access_token_hash).not.toBe(oldHash);

      // Submission delivery status updated
      const subInDb = mockSubmissions.find((s) => s.id === submissionId);
      expect(subInDb.email_delivery_status).toBe("SENT");
    });

    it("resend_access: rejects resend if grant is already consumed", async () => {
      const submissionId = "sub-test-consumed";
      mockSubmissions.push({
        id: submissionId,
        name: "Registered Student",
        email: "reg@example.com",
        status: "verified",
      });

      mockGrants.push({
        id: "grant-test-consumed",
        payment_submission_id: submissionId,
        status: "consumed", // Student already created account!
        email: "reg@example.com",
      });

      const req = new NextRequest("http://localhost:3000/api/public-website/admin/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: submissionId, action: "resend_access" }),
      });

      const res = await adminSubmissionsPost(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toContain("already created");
    });

    it("resend_access: rate limits rapid consecutive resend requests", async () => {
      const submissionId = "sub-test-rate";
      mockSubmissions.push({
        id: submissionId,
        name: "Fast Student",
        email: "fast@example.com",
        status: "verified",
      });

      mockGrants.push({
        id: "grant-test-rate",
        payment_submission_id: submissionId,
        status: "active",
        email: "fast@example.com",
      });

      // Call 1: success
      const req1 = new NextRequest("http://localhost:3000/api/public-website/admin/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: submissionId, action: "resend_access" }),
      });
      const res1 = await adminSubmissionsPost(req1);
      expect(res1.status).toBe(200);

      // Call 2 immediately: rate-limited (429)
      const req2 = new NextRequest("http://localhost:3000/api/public-website/admin/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: submissionId, action: "resend_access" }),
      });
      const res2 = await adminSubmissionsPost(req2);
      expect(res2.status).toBe(429);
      const data2 = await res2.json();
      expect(data2.error).toContain("wait 30 seconds");
    });
  });
});

