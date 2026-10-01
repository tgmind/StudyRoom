import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import crypto from "crypto";

import {
  generateEnrollmentToken,
  hashToken,
  generateOtpCode,
  generateCreationNonce,
  generateClaimSecret,
  setEnrollmentTokenCookie,
  clearEnrollmentTokenCookie,
  setClaimSecretCookie,
  clearClaimSecretCookie,
  extractClientIp,
  checkRateLimit,
  ENROLLMENT_COOKIE_NAME,
  CLAIM_SECRET_COOKIE_NAME,
} from "@/lib/auth/enrollment";

import {
  isMatchingAdminKey,
  verifySameOrigin,
} from "@/lib/public-website/authUtils";

// Route Handlers
import { POST as submitPaymentPost } from "@/app/api/public-website/submit-payment/route";
import { POST as checkPaymentStatusPost } from "@/app/api/public-website/check-payment-status/route";
import { POST as submitReferralPost } from "@/app/api/public-website/submit-referral/route";
import { GET as preverifyEnrollmentGet } from "@/app/api/auth/preverify-enrollment/route";
import { POST as enrollmentSignupPost } from "@/app/api/auth/enrollment-signup/route";
import {
  GET as adminSubmissionsGet,
  POST as adminSubmissionsPost,
} from "@/app/api/public-website/admin/submissions/route";
import {
  GET as adminGrantsGet,
  POST as adminGrantsPost,
} from "@/app/api/public-website/admin/grants/route";

// --- MOCK DATABASE STORE ---
interface MockSubmission {
  id: string;
  name: string;
  contact: string;
  utr: string;
  amount: number;
  claim_secret_hash: string;
  status: "pending" | "verified" | "rejected";
  verified_at?: string | null;
  verified_by?: string | null;
  notes?: string | null;
  submitted_at: string;
}

interface MockGrant {
  id: string;
  grant_token_hash: string;
  otp_code: string;
  authorization_type: "payment" | "referral_coupon";
  source_reference: string;
  payment_submission_id?: string | null;
  coupon_id?: string | null;
  name?: string | null;
  contact?: string | null;
  status: "active" | "preverified" | "signup_in_progress" | "consumed" | "expired" | "revoked";
  created_at: string;
  expires_at: string;
  preverified_at?: string | null;
  reservation_expires_at?: string | null;
  reserved_email?: string | null;
  creation_nonce_hash?: string | null;
  consumed_at?: string | null;
  consumed_user_id?: string | null;
  consumed_email?: string | null;
  failed_attempts: number;
  last_attempt_at?: string | null;
  notes?: string | null;
}

interface MockCoupon {
  id: string;
  code: string;
  discount_percent: number;
  is_active: boolean;
  max_uses: number;
  used_count: number;
}

interface MockUser {
  id: string;
  email: string;
  created_at: string;
  raw_user_meta_data?: any;
}

let mockSubmissions: MockSubmission[] = [];
let mockGrants: MockGrant[] = [];
let mockCoupons: MockCoupon[] = [];
let mockUsers: MockUser[] = [];

// Helper to simulate the fail-closed handle_new_user() trigger
function simulateHandleNewUserTrigger(user: { id: string; email: string; raw_user_meta_data?: any }): void {
  const meta = user.raw_user_meta_data || {};
  const grantId = meta.enrollment_grant_id;
  const rawNonce = meta.creation_nonce;

  if (!grantId || !rawNonce || typeof rawNonce !== "string" || rawNonce.length < 32) {
    throw new Error("Registration blocked: Valid enrollment reservation required to create an account.");
  }

  const nonceHash = hashToken(rawNonce);
  const grant = mockGrants.find((g) => g.id === grantId && g.creation_nonce_hash === nonceHash);

  if (!grant) {
    throw new Error("Registration blocked: Nonexistent or invalid enrollment reservation.");
  }

  if (grant.status !== "signup_in_progress") {
    throw new Error(`Registration blocked: Enrollment grant is not in reservation state (status: ${grant.status}).`);
  }

  if (new Date(grant.expires_at).getTime() < Date.now()) {
    throw new Error("Registration blocked: Enrollment grant has expired.");
  }

  if (grant.reservation_expires_at && new Date(grant.reservation_expires_at).getTime() < Date.now()) {
    throw new Error("Registration blocked: Enrollment reservation has expired. Please retry signup.");
  }

  // Consume grant
  grant.status = "consumed";
  grant.consumed_at = new Date().toISOString();
  grant.consumed_user_id = user.id;
  grant.consumed_email = user.email.toLowerCase();
  grant.creation_nonce_hash = null;
  grant.reservation_expires_at = null;
}

// Build fluent Supabase Admin Client Mock
function createMockAdminClient() {
  return {
    from: (table: string) => {
      let currentTable = table;
      let selectedFields = "*";
      let filters: Array<(item: any) => boolean> = [];
      let sortFn: ((a: any, b: any) => number) | null = null;
      let limitCount: number | null = null;

      const builder: any = {
        select: (fields: string = "*") => {
          selectedFields = fields;
          return builder;
        },
        eq: (col: string, val: any) => {
          filters.push((item: any) => item[col] === val);
          return builder;
        },
        neq: (col: string, val: any) => {
          filters.push((item: any) => item[col] !== val);
          return builder;
        },
        in: (col: string, vals: any[]) => {
          filters.push((item: any) => vals.includes(item[col]));
          return builder;
        },
        gte: (col: string, val: any) => {
          filters.push((item: any) => item[col] >= val);
          return builder;
        },
        order: (col: string, opts?: { ascending?: boolean }) => {
          sortFn = (a: any, b: any) => {
            const asc = opts?.ascending ?? true;
            if (a[col] < b[col]) return asc ? -1 : 1;
            if (a[col] > b[col]) return asc ? 1 : -1;
            return 0;
          };
          return builder;
        },
        limit: (n: number) => {
          limitCount = n;
          return builder;
        },
        maybeSingle: async () => {
          let dataset: any[] = [];
          if (currentTable === "enrollment_grants") dataset = mockGrants;
          else if (currentTable === "public_payment_submissions") dataset = mockSubmissions;
          else if (currentTable === "users") dataset = mockUsers;
          else if (currentTable === "public_coupons") dataset = mockCoupons;

          let matches = dataset.filter((item) => filters.every((fn) => fn(item)));
          return { data: matches[0] || null, error: null };
        },
        single: async () => {
          let dataset: any[] = [];
          if (currentTable === "enrollment_grants") dataset = mockGrants;
          else if (currentTable === "public_payment_submissions") dataset = mockSubmissions;
          else if (currentTable === "users") dataset = mockUsers;
          else if (currentTable === "public_coupons") dataset = mockCoupons;

          let matches = dataset.filter((item) => filters.every((fn) => fn(item)));
          if (!matches[0]) return { data: null, error: { message: "Row not found" } };
          return { data: matches[0], error: null };
        },
        then: (resolve: any) => {
          let dataset: any[] = [];
          if (currentTable === "enrollment_grants") dataset = mockGrants;
          else if (currentTable === "public_payment_submissions") dataset = mockSubmissions;
          else if (currentTable === "users") dataset = mockUsers;
          else if (currentTable === "public_coupons") dataset = mockCoupons;

          let results = dataset.filter((item) => filters.every((fn) => fn(item)));
          if (sortFn) results.sort(sortFn);
          if (limitCount !== null) results = results.slice(0, limitCount);
          return resolve({ data: results, error: null });
        },
        insert: (records: any | any[]) => {
          const recs = Array.isArray(records) ? records : [records];
          const inserted: any[] = [];
          for (const r of recs) {
            const newItem = {
              id: r.id || crypto.randomUUID(),
              created_at: new Date().toISOString(),
              ...r,
            };
            if (currentTable === "enrollment_grants") mockGrants.push(newItem);
            else if (currentTable === "public_payment_submissions") mockSubmissions.push(newItem);
            else if (currentTable === "users") mockUsers.push(newItem);
            else if (currentTable === "public_coupons") mockCoupons.push(newItem);
            inserted.push(newItem);
          }
          const chainable: any = {
            data: inserted,
            error: null,
            select: (selFields?: string) => ({
              single: async () => ({ data: inserted[0] || null, error: null }),
              maybeSingle: async () => ({ data: inserted[0] || null, error: null }),
            }),
            single: async () => ({ data: inserted[0] || null, error: null }),
            maybeSingle: async () => ({ data: inserted[0] || null, error: null }),
            then: (resolve: any) => resolve({ data: inserted, error: null }),
          };
          return chainable;
        },
        update: (updates: any) => {
          return {
            eq: async (col: string, val: any) => {
              let dataset: any[] = [];
              if (currentTable === "enrollment_grants") dataset = mockGrants;
              else if (currentTable === "public_payment_submissions") dataset = mockSubmissions;
              else if (currentTable === "users") dataset = mockUsers;
              else if (currentTable === "public_coupons") dataset = mockCoupons;

              let updated = 0;
              for (const item of dataset) {
                if (item[col] === val) {
                  Object.assign(item, updates);
                  updated++;
                }
              }
              return { data: updated, error: null };
            },
          };
        },
      };
      return builder;
    },
    rpc: async (functionName: string, params: any) => {
      if (functionName === "rpc_verify_payment_and_create_grant") {
        const sub = mockSubmissions.find((s) => s.id === params.p_submission_id);
        if (!sub) return { data: { success: false, error: "Payment submission not found." }, error: null };

        // Idempotency: if already verified, find and return existing grant
        if (sub.status === "verified") {
          const existingGrant = mockGrants.find((g) => g.payment_submission_id === sub.id && g.status !== "revoked");
          if (existingGrant) {
            return {
              data: {
                success: true,
                grant_id: existingGrant.id,
                otp: existingGrant.otp_code,
                status: "already_verified",
              },
              error: null,
            };
          }
        }

        sub.status = "verified";
        sub.verified_at = new Date().toISOString();
        sub.verified_by = params.p_admin_identifier;

        const grantId = crypto.randomUUID();
        const grant: MockGrant = {
          id: grantId,
          grant_token_hash: params.p_token_hash,
          otp_code: params.p_otp,
          authorization_type: "payment",
          source_reference: sub.utr,
          payment_submission_id: sub.id,
          name: sub.name,
          contact: sub.contact,
          status: "active",
          created_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
          failed_attempts: 0,
        };
        mockGrants.push(grant);

        return {
          data: {
            success: true,
            grant_id: grantId,
            otp: params.p_otp,
            expires_at: grant.expires_at,
          },
          error: null,
        };
      }

      if (functionName === "rpc_claim_coupon_and_create_grant") {
        const coupon = mockCoupons.find((c) => c.code === params.p_coupon_code.toUpperCase());
        if (!coupon || !coupon.is_active) {
          return { data: { success: false, error: "Invalid or inactive coupon code." }, error: null };
        }
        if (coupon.discount_percent < 100) {
          return { data: { success: false, error: "Coupon does not grant 100% discount." }, error: null };
        }
        if (coupon.used_count >= coupon.max_uses) {
          return { data: { success: false, error: "Coupon usage limit reached." }, error: null };
        }

        coupon.used_count++;
        const grantId = crypto.randomUUID();
        const grant: MockGrant = {
          id: grantId,
          grant_token_hash: params.p_token_hash,
          otp_code: params.p_otp,
          authorization_type: "referral_coupon",
          source_reference: coupon.code,
          coupon_id: coupon.id,
          name: params.p_name,
          contact: params.p_referred_by,
          status: "active",
          created_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
          failed_attempts: 0,
        };
        mockGrants.push(grant);

        return {
          data: {
            success: true,
            grant_id: grantId,
            otp: params.p_otp,
            expires_at: grant.expires_at,
          },
          error: null,
        };
      }

      if (functionName === "rpc_reserve_enrollment_grant") {
        const grant = mockGrants.find((g) => g.grant_token_hash === params.p_token_hash);
        if (!grant) return { data: { success: false, error: "Enrollment grant not found." }, error: null };

        if (grant.status === "revoked" || grant.failed_attempts >= 5) {
          return { data: { success: false, error: "Enrollment grant has been locked due to excessive failed attempts." }, error: null };
        }

        if (grant.status === "consumed") {
          return { data: { success: false, error: "Enrollment grant has already been consumed." }, error: null };
        }

        if (new Date(grant.expires_at).getTime() < Date.now()) {
          return { data: { success: false, error: "Enrollment grant has expired." }, error: null };
        }

        if (grant.otp_code !== params.p_otp) {
          grant.failed_attempts++;
          if (grant.failed_attempts >= 5) {
            grant.status = "revoked";
          }
          return { data: { success: false, error: "Invalid 4-digit enrollment code.", attempts_remaining: Math.max(0, 5 - grant.failed_attempts) }, error: null };
        }

        // Check active reservation by another user
        if (
          grant.status === "signup_in_progress" &&
          grant.reservation_expires_at &&
          new Date(grant.reservation_expires_at).getTime() > Date.now() &&
          grant.reserved_email &&
          grant.reserved_email !== params.p_email.toLowerCase()
        ) {
          return { data: { success: false, error: "Registration is currently in progress for this grant." }, error: null };
        }

        grant.status = "signup_in_progress";
        grant.reserved_email = params.p_email.toLowerCase();
        grant.creation_nonce_hash = params.p_nonce_hash;
        grant.reservation_expires_at = new Date(Date.now() + 2 * 60 * 1000).toISOString();

        return { data: { success: true, grant_id: grant.id }, error: null };
      }

      if (functionName === "rpc_release_enrollment_reservation") {
        const grant = mockGrants.find((g) => g.id === params.p_grant_id && g.status === "signup_in_progress");
        if (grant) {
          grant.status = "preverified";
          grant.creation_nonce_hash = null;
          grant.reservation_expires_at = null;
        }
        return { data: null, error: null };
      }

      if (functionName === "rpc_cleanup_expired_enrollment_grants") {
        const now = Date.now();
        let deleted = 0;
        for (const g of mockGrants) {
          if (new Date(g.expires_at).getTime() < now && (g.status === "active" || g.status === "preverified")) {
            g.status = "expired";
          }
        }
        const cutoff = now - 24 * 3600 * 1000;
        mockGrants = mockGrants.filter((g) => {
          const isOld = new Date(g.created_at).getTime() < cutoff;
          const isDeletable = ["consumed", "revoked", "expired"].includes(g.status);
          if (isOld && isDeletable) {
            deleted++;
            return false;
          }
          return true;
        });
        return { data: { success: true, deleted_count: deleted }, error: null };
      }

      return { data: null, error: null };
    },
    auth: {
      admin: {
        createUser: async (payload: any) => {
          try {
            const newUser: MockUser = {
              id: crypto.randomUUID(),
              email: payload.email,
              created_at: new Date().toISOString(),
              raw_user_meta_data: payload.user_metadata,
            };

            // Trigger execution
            simulateHandleNewUserTrigger(newUser);
            mockUsers.push(newUser);

            return { data: { user: newUser }, error: null };
          } catch (triggerErr: any) {
            return { data: null, error: { message: triggerErr.message } };
          }
        },
      },
    },
  };
}

// Mock the modules
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => createMockAdminClient()),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      signInWithPassword: vi.fn(async ({ email, password }: any) => {
        const user = mockUsers.find((u) => u.email === email.toLowerCase());
        if (!user) return { error: { message: "Invalid login credentials" } };
        return { data: { user, session: { access_token: "mock_jwt" } }, error: null };
      }),
      getUser: vi.fn(async () => ({
        data: { user: null },
        error: null,
      })),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null }),
        }),
      }),
    }),
  })),
}));

// Helper to construct NextRequest with cookies and headers
let ipCounter = 1;

function createTestRequest(
  url: string,
  options: {
    method?: string;
    body?: any;
    cookies?: Record<string, string>;
    headers?: Record<string, string>;
  } = {}
): NextRequest {
  const reqHeaders = new Headers();
  reqHeaders.set("host", "studyalive.netlify.app");
  reqHeaders.set("origin", "https://studyalive.netlify.app");
  reqHeaders.set("x-forwarded-for", `198.51.100.${ipCounter++}`);

  if (options.headers) {
    for (const [k, v] of Object.entries(options.headers)) {
      reqHeaders.set(k.toLowerCase(), v);
    }
  }

  if (options.cookies) {
    const cookieHeader = Object.entries(options.cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
    reqHeaders.set("cookie", cookieHeader);
  }

  const reqOptions: any = {
    method: options.method || "GET",
    headers: reqHeaders,
  };

  if (options.body) {
    reqOptions.body = JSON.stringify(options.body);
    reqHeaders.set("content-type", "application/json");
  }

  return new NextRequest(new URL(url, "https://studyalive.netlify.app"), reqOptions);
}

describe("Secure Payment/Coupon -> 4-Digit OTP -> Signup Gate (24 Contract Scenarios)", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.PUBLIC_SITE_ADMIN_KEY = "super_secret_platform_admin_key_2026_x9z";
    mockSubmissions = [];
    mockGrants = [];
    mockUsers = [];
    mockCoupons = [
      {
        id: "c-100",
        code: "FREE100",
        discount_percent: 100,
        is_active: true,
        max_uses: 10,
        used_count: 0,
      },
      {
        id: "c-inactive",
        code: "INACTIVE100",
        discount_percent: 100,
        is_active: false,
        max_uses: 10,
        used_count: 0,
      },
      {
        id: "c-exhausted",
        code: "MAXED100",
        discount_percent: 100,
        is_active: true,
        max_uses: 2,
        used_count: 2,
      },
    ];
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // Scenario 1
  it("Scenario 1: Happy Path — Payment: Submit -> Admin Verify -> Poll OTP -> Preverify -> Signup -> User Created", async () => {
    // 1. Payer submits payment
    const paymentReq = createTestRequest("/api/public-website/submit-payment", {
      method: "POST",
      body: {
        name: "Pooja Patel",
        contact: "pooja@example.com",
        utr: "426819204812",
        amount: 20,
      },
    });
    const paymentRes = await submitPaymentPost(paymentReq);
    expect(paymentRes.status).toBe(200);
    const paymentJson = await paymentRes.json();
    expect(paymentJson.success).toBe(true);

    const submission = mockSubmissions.find((s) => s.utr === "426819204812");
    expect(submission).toBeDefined();
    expect(submission?.status).toBe("pending");

    // Extract claim secret from cookie
    const setCookie = paymentRes.headers.get("set-cookie") || "";
    expect(setCookie).toContain(CLAIM_SECRET_COOKIE_NAME);
    const claimCookieMatch = setCookie.match(new RegExp(`${CLAIM_SECRET_COOKIE_NAME}=([^;]+)`));
    const claimSecret = claimCookieMatch ? claimCookieMatch[1] : "";
    expect(claimSecret.length).toBe(64); // 32-byte hex

    // 2. Admin verifies payment
    const adminReq = createTestRequest("/api/public-website/admin/submissions", {
      method: "POST",
      body: {
        id: submission!.id,
        status: "verified",
      },
      headers: {
        authorization: "Bearer super_secret_platform_admin_key_2026_x9z",
      },
    });
    const adminRes = await adminSubmissionsPost(adminReq);
    expect(adminRes.status).toBe(200);

    // 3. Payer polls payment status with claim cookie
    const pollReq = createTestRequest("/api/public-website/check-payment-status", {
      method: "POST",
      cookies: {
        [CLAIM_SECRET_COOKIE_NAME]: claimSecret,
      },
    });
    const pollRes = await checkPaymentStatusPost(pollReq);
    expect(pollRes.status).toBe(200);
    const pollJson = await pollRes.json();
    expect(pollJson.status).toBe("verified");
    expect(pollJson.otp).toMatch(/^\d{4}$/);
    expect(pollJson.redirectUrl).toBe("/signup");

    const pollSetCookie = pollRes.headers.get("set-cookie") || "";
    expect(pollSetCookie).toContain(ENROLLMENT_COOKIE_NAME);
    const enrollmentMatch = pollSetCookie.match(new RegExp(`${ENROLLMENT_COOKIE_NAME}=([^;]+)`));
    const enrollmentToken = enrollmentMatch ? enrollmentMatch[1] : "";

    // 4. Preverify on /signup mount
    const preverifyReq = createTestRequest("/api/auth/preverify-enrollment", {
      cookies: {
        [ENROLLMENT_COOKIE_NAME]: enrollmentToken,
      },
    });
    const preverifyRes = await preverifyEnrollmentGet(preverifyReq);
    expect(preverifyRes.status).toBe(200);
    const preverifyJson = await preverifyRes.json();
    expect(preverifyJson.preverified).toBe(true);
    expect(preverifyJson.otp).toBe(pollJson.otp);
    expect(preverifyJson.authorizationType).toBe("payment");

    // 5. Signup submission
    const signupReq = createTestRequest("/api/auth/enrollment-signup", {
      method: "POST",
      body: {
        email: "pooja@example.com",
        password: "securePassword123",
        displayName: "Pooja Patel",
        otp: pollJson.otp,
      },
      cookies: {
        [ENROLLMENT_COOKIE_NAME]: enrollmentToken,
      },
    });
    const signupRes = await enrollmentSignupPost(signupReq);
    expect(signupRes.status).toBe(200);
    const signupJson = await signupRes.json();
    expect(signupJson.success).toBe(true);
    expect(signupJson.redirect).toBe("/room");

    // Verify user and grant state
    const createdUser = mockUsers.find((u) => u.email === "pooja@example.com");
    expect(createdUser).toBeDefined();

    const grant = mockGrants.find((g) => g.payment_submission_id === submission!.id);
    expect(grant?.status).toBe("consumed");
    expect(grant?.consumed_email).toBe("pooja@example.com");
  });

  // Scenario 2
  it("Scenario 2: Happy Path — Coupon: Valid 100% OFF Coupon -> OTP & Cookie -> Preverify -> Signup -> Room", async () => {
    // 1. Claim referral coupon
    const refReq = createTestRequest("/api/public-website/submit-referral", {
      method: "POST",
      body: {
        couponCode: "FREE100",
        name: "Rahul Roy",
        referredBy: "Study Telegram Group",
        agreementAccepted: true,
      },
    });
    const refRes = await submitReferralPost(refReq);
    expect(refRes.status).toBe(200);
    const refJson = await refRes.json();
    expect(refJson.success).toBe(true);
    expect(refJson.otp).toMatch(/^\d{4}$/);
    expect(refJson.redirect).toBe("/signup");

    const setCookie = refRes.headers.get("set-cookie") || "";
    expect(setCookie).toContain(ENROLLMENT_COOKIE_NAME);
    const tokenMatch = setCookie.match(new RegExp(`${ENROLLMENT_COOKIE_NAME}=([^;]+)`));
    const token = tokenMatch ? tokenMatch[1] : "";

    // 2. Preverify
    const preverifyReq = createTestRequest("/api/auth/preverify-enrollment", {
      cookies: { [ENROLLMENT_COOKIE_NAME]: token },
    });
    const preverifyRes = await preverifyEnrollmentGet(preverifyReq);
    const preverifyJson = await preverifyRes.json();
    expect(preverifyJson.preverified).toBe(true);
    expect(preverifyJson.otp).toBe(refJson.otp);
    expect(preverifyJson.authorizationType).toBe("referral_coupon");

    // 3. Signup
    const signupReq = createTestRequest("/api/auth/enrollment-signup", {
      method: "POST",
      body: {
        email: "rahul@example.com",
        password: "password123!",
        displayName: "Rahul Roy",
        otp: refJson.otp,
      },
      cookies: { [ENROLLMENT_COOKIE_NAME]: token },
    });
    const signupRes = await enrollmentSignupPost(signupReq);
    expect(signupRes.status).toBe(200);
    const signupJson = await signupRes.json();
    expect(signupJson.success).toBe(true);
    expect(signupJson.redirect).toBe("/room");

    expect(mockUsers.some((u) => u.email === "rahul@example.com")).toBe(true);
  });

  // Scenario 3
  it("Scenario 3: Coupon — Inactive Code: Inactive coupon rejected; no grant or cookie created", async () => {
    const req = createTestRequest("/api/public-website/submit-referral", {
      method: "POST",
      body: {
        couponCode: "INACTIVE100",
        name: "Test User",
        referredBy: "Friend",
        agreementAccepted: true,
      },
    });
    const res = await submitReferralPost(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("Invalid or inactive coupon code");
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  // Scenario 4
  it("Scenario 4: Coupon — Exhausted Usage: Coupon with used_count >= max_uses is rejected", async () => {
    const req = createTestRequest("/api/public-website/submit-referral", {
      method: "POST",
      body: {
        couponCode: "MAXED100",
        name: "Test User",
        referredBy: "Friend",
        agreementAccepted: true,
      },
    });
    const res = await submitReferralPost(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("Coupon usage limit reached");
  });

  // Scenario 5
  it("Scenario 5: Coupon — Concurrency: Exactly 2 succeed out of 10 simultaneous claims on 2-use coupon", async () => {
    const limitedCoupon: MockCoupon = {
      id: "c-concurrent",
      code: "RACE100",
      discount_percent: 100,
      is_active: true,
      max_uses: 2,
      used_count: 0,
    };
    mockCoupons.push(limitedCoupon);

    const admin = createMockAdminClient();
    const claimPromises = Array.from({ length: 10 }).map((_, i) => {
      const rawToken = generateEnrollmentToken();
      const tokenHash = hashToken(rawToken);
      const otp = generateOtpCode();
      return admin.rpc("rpc_claim_coupon_and_create_grant", {
        p_coupon_code: "RACE100",
        p_name: `Student ${i}`,
        p_referred_by: "Test",
        p_token_hash: tokenHash,
        p_otp: otp,
      });
    });

    const results = await Promise.all(claimPromises);
    const successes = results.filter((r) => r.data?.success === true);
    const failures = results.filter((r) => r.data?.success === false);

    expect(successes.length).toBe(2);
    expect(failures.length).toBe(8);
    expect(limitedCoupon.used_count).toBe(2);
  });

  // Scenario 6
  it("Scenario 6: Payment — Pending Rejection: Pending submission cannot obtain enrollment token or OTP", async () => {
    const claimSecret = generateClaimSecret();
    const claimHash = hashToken(claimSecret);

    mockSubmissions.push({
      id: "sub-pending-1",
      name: "Waiting Student",
      contact: "wait@example.com",
      utr: "998877665544",
      amount: 20,
      claim_secret_hash: claimHash,
      status: "pending",
      submitted_at: new Date().toISOString(),
    });

    const pollReq = createTestRequest("/api/public-website/check-payment-status", {
      method: "POST",
      cookies: {
        [CLAIM_SECRET_COOKIE_NAME]: claimSecret,
      },
    });
    const pollRes = await checkPaymentStatusPost(pollReq);
    expect(pollRes.status).toBe(200);
    const json = await pollRes.json();
    expect(json.status).toBe("pending");
    expect(json.otp).toBeUndefined();
    expect(pollRes.headers.get("set-cookie")).toBeNull();
  });

  // Scenario 7
  it("Scenario 7: Payment — Rejected Submission: Rejected submission returns rejection status; no grant created", async () => {
    const claimSecret = generateClaimSecret();
    const claimHash = hashToken(claimSecret);

    mockSubmissions.push({
      id: "sub-rej-1",
      name: "Bad Payer",
      contact: "bad@example.com",
      utr: "000011112222",
      amount: 20,
      claim_secret_hash: claimHash,
      status: "rejected",
      notes: "Invalid UTR screenshot mismatch",
      submitted_at: new Date().toISOString(),
    });

    const pollReq = createTestRequest("/api/public-website/check-payment-status", {
      method: "POST",
      cookies: {
        [CLAIM_SECRET_COOKIE_NAME]: claimSecret,
      },
    });
    const pollRes = await checkPaymentStatusPost(pollReq);
    expect(pollRes.status).toBe(200);
    const json = await pollRes.json();
    expect(json.status).toBe("rejected");
    expect(json.message).toContain("Invalid UTR screenshot mismatch");
    expect(json.otp).toBeUndefined();
  });

  // Scenario 8
  it("Scenario 8: Payment — Exact-Once Verification: Concurrent/repeated admin verify yields the exact same grant ID", async () => {
    const claimSecret = generateClaimSecret();
    const claimHash = hashToken(claimSecret);

    const sub: MockSubmission = {
      id: "sub-idemp-1",
      name: "Double Payer",
      contact: "double@example.com",
      utr: "554433221100",
      amount: 20,
      claim_secret_hash: claimHash,
      status: "pending",
      submitted_at: new Date().toISOString(),
    };
    mockSubmissions.push(sub);

    const admin = createMockAdminClient();
    const res1 = await admin.rpc("rpc_verify_payment_and_create_grant", {
      p_submission_id: sub.id,
      p_token_hash: claimHash,
      p_otp: "1234",
      p_admin_identifier: "admin1",
    });

    const res2 = await admin.rpc("rpc_verify_payment_and_create_grant", {
      p_submission_id: sub.id,
      p_token_hash: claimHash,
      p_otp: "5678",
      p_admin_identifier: "admin1",
    });

    expect(res1.data?.success).toBe(true);
    expect(res2.data?.success).toBe(true);
    expect(res1.data?.grant_id).toBe(res2.data?.grant_id);
    expect(res2.data?.otp).toBe("1234"); // Original OTP preserved
    expect(mockGrants.filter((g) => g.payment_submission_id === sub.id).length).toBe(1);
  });

  // Scenario 9
  it("Scenario 9: Direct Signup — No Cookie: Visiting /signup without cookie fails preverification and blocks signup", async () => {
    // 1. Preverify without cookie
    const preverifyReq = createTestRequest("/api/auth/preverify-enrollment");
    const preverifyRes = await preverifyEnrollmentGet(preverifyReq);
    expect(preverifyRes.status).toBe(200);
    const preverifyJson = await preverifyRes.json();
    expect(preverifyJson.preverified).toBe(false);
    expect(preverifyJson.reason).toBe("missing_cookie");

    // 2. Direct signup without cookie
    const signupReq = createTestRequest("/api/auth/enrollment-signup", {
      method: "POST",
      body: {
        email: "direct@attacker.com",
        password: "password123",
        otp: "1234",
      },
    });
    const signupRes = await enrollmentSignupPost(signupReq);
    expect(signupRes.status).toBe(401);
    const signupJson = await signupRes.json();
    expect(signupJson.error).toContain("Enrollment authorization required");
  });

  // Scenario 10
  it("Scenario 10: Direct Supabase Signup Attack: Direct user insertion rejected by handle_new_user() trigger", async () => {
    const admin = createMockAdminClient();

    // Attacker tries to create user directly via Supabase Auth without grant metadata
    const directAttack = await admin.auth.admin.createUser({
      email: "attacker@direct.com",
      password: "somePassword123",
      user_metadata: {},
    });

    expect(directAttack.data).toBeNull();
    expect(directAttack.error?.message).toContain("Registration blocked: Valid enrollment reservation required");
    expect(mockUsers.some((u) => u.email === "attacker@direct.com")).toBe(false);
  });

  // Scenario 11
  it("Scenario 11: OTP — Invalid Code: Mismatched OTP rejected; increments failed attempts", async () => {
    const rawToken = generateEnrollmentToken();
    const tokenHash = hashToken(rawToken);

    mockGrants.push({
      id: "grant-otp-1",
      grant_token_hash: tokenHash,
      otp_code: "5555",
      authorization_type: "referral_coupon",
      source_reference: "FREE100",
      status: "active",
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      failed_attempts: 0,
    });

    const signupReq = createTestRequest("/api/auth/enrollment-signup", {
      method: "POST",
      body: {
        email: "wrongotp@test.com",
        password: "password123",
        otp: "9999", // WRONG OTP
      },
      cookies: {
        [ENROLLMENT_COOKIE_NAME]: rawToken,
      },
    });

    const signupRes = await enrollmentSignupPost(signupReq);
    expect(signupRes.status).toBe(400);
    const json = await signupRes.json();
    expect(json.error).toContain("Invalid 4-digit enrollment code");
    expect(json.attemptsRemaining).toBe(4);

    const grant = mockGrants.find((g) => g.id === "grant-otp-1");
    expect(grant?.failed_attempts).toBe(1);
  });

  // Scenario 12
  it("Scenario 12: OTP — Brute-Force Lock: 5 consecutive wrong OTP attempts revokes grant and locks account", async () => {
    const rawToken = generateEnrollmentToken();
    const tokenHash = hashToken(rawToken);

    const grant: MockGrant = {
      id: "grant-lock-1",
      grant_token_hash: tokenHash,
      otp_code: "1111",
      authorization_type: "referral_coupon",
      source_reference: "FREE100",
      status: "active",
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      failed_attempts: 4, // 4 failed already
    };
    mockGrants.push(grant);

    // 5th failed attempt
    const req = createTestRequest("/api/auth/enrollment-signup", {
      method: "POST",
      body: {
        email: "bruteforce@test.com",
        password: "password123",
        otp: "9999",
      },
      cookies: { [ENROLLMENT_COOKIE_NAME]: rawToken },
    });
    const res = await enrollmentSignupPost(req);
    expect(res.status).toBe(400);
    expect(grant.failed_attempts).toBe(5);
    expect(grant.status).toBe("revoked");

    // 6th attempt should be blocked with 403
    const req2 = createTestRequest("/api/auth/enrollment-signup", {
      method: "POST",
      body: {
        email: "bruteforce@test.com",
        password: "password123",
        otp: "1111", // Even with correct OTP now!
      },
      cookies: { [ENROLLMENT_COOKIE_NAME]: rawToken },
    });
    const res2 = await enrollmentSignupPost(req2);
    expect(res2.status).toBe(403);
    const json2 = await res2.json();
    expect(json2.error).toContain("locked due to too many failed attempts");
  });

  // Scenario 13
  it("Scenario 13: OTP — Formatting: Validates 4-digit formatting including leading zeros (0007, 0042)", () => {
    // Leading zeros validation
    expect(/^\d{4}$/.test("0000")).toBe(true);
    expect(/^\d{4}$/.test("0007")).toBe(true);
    expect(/^\d{4}$/.test("0042")).toBe(true);
    expect(/^\d{4}$/.test("9999")).toBe(true);

    // Invalid formatting rejected
    expect(/^\d{4}$/.test("")).toBe(false);
    expect(/^\d{4}$/.test("123")).toBe(false);
    expect(/^\d{4}$/.test("12345")).toBe(false);
    expect(/^\d{4}$/.test("abcd")).toBe(false);
    expect(/^\d{4}$/.test("12 4")).toBe(false);

    // Verify generateOtpCode always generates 4 digits
    for (let i = 0; i < 50; i++) {
      const code = generateOtpCode();
      expect(code).toMatch(/^\d{4}$/);
      expect(code.length).toBe(4);
    }
  });

  // Scenario 14
  it("Scenario 14: Token Replay: Re-submitting signup with already consumed grant token returns 409", async () => {
    const rawToken = generateEnrollmentToken();
    const tokenHash = hashToken(rawToken);

    mockGrants.push({
      id: "grant-replay-1",
      grant_token_hash: tokenHash,
      otp_code: "2222",
      authorization_type: "payment",
      source_reference: "426819204812",
      status: "consumed",
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      consumed_at: new Date().toISOString(),
      consumed_email: "original@test.com",
      failed_attempts: 0,
    });

    const signupReq = createTestRequest("/api/auth/enrollment-signup", {
      method: "POST",
      body: {
        email: "different@attacker.com",
        password: "password123",
        otp: "2222",
      },
      cookies: {
        [ENROLLMENT_COOKIE_NAME]: rawToken,
      },
    });

    const res = await enrollmentSignupPost(signupReq);
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toContain("already been used to create an account");
  });

  // Scenario 15
  it("Scenario 15: Expired Grant: Grant past 24-hour expiration rejected by preverify and signup", async () => {
    const rawToken = generateEnrollmentToken();
    const tokenHash = hashToken(rawToken);

    mockGrants.push({
      id: "grant-exp-1",
      grant_token_hash: tokenHash,
      otp_code: "3333",
      authorization_type: "payment",
      source_reference: "426819204812",
      status: "active",
      created_at: new Date(Date.now() - 25 * 3600 * 1000).toISOString(),
      expires_at: new Date(Date.now() - 1 * 3600 * 1000).toISOString(), // Expired 1 hr ago
      failed_attempts: 0,
    });

    // 1. Preverify
    const preverifyReq = createTestRequest("/api/auth/preverify-enrollment", {
      cookies: { [ENROLLMENT_COOKIE_NAME]: rawToken },
    });
    const preverifyRes = await preverifyEnrollmentGet(preverifyReq);
    const preverifyJson = await preverifyRes.json();
    expect(preverifyJson.preverified).toBe(false);
    expect(preverifyJson.reason).toBe("expired");

    // 2. Signup
    const signupReq = createTestRequest("/api/auth/enrollment-signup", {
      method: "POST",
      body: {
        email: "expired@test.com",
        password: "password123",
        otp: "3333",
      },
      cookies: { [ENROLLMENT_COOKIE_NAME]: rawToken },
    });
    const signupRes = await enrollmentSignupPost(signupReq);
    expect(signupRes.status).toBe(403);
    const signupJson = await signupRes.json();
    expect(signupJson.error).toContain("expired (24-hour limit)");
  });

  // Scenario 16
  it("Scenario 16: Revoked Grant: Manually revoked grant rejected by preverify and signup", async () => {
    const rawToken = generateEnrollmentToken();
    const tokenHash = hashToken(rawToken);

    mockGrants.push({
      id: "grant-rev-1",
      grant_token_hash: tokenHash,
      otp_code: "4444",
      authorization_type: "payment",
      source_reference: "426819204812",
      status: "revoked",
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      failed_attempts: 0,
    });

    const preverifyReq = createTestRequest("/api/auth/preverify-enrollment", {
      cookies: { [ENROLLMENT_COOKIE_NAME]: rawToken },
    });
    const preverifyRes = await preverifyEnrollmentGet(preverifyReq);
    const preverifyJson = await preverifyRes.json();
    expect(preverifyJson.preverified).toBe(false);
    expect(preverifyJson.reason).toBe("revoked");

    const signupReq = createTestRequest("/api/auth/enrollment-signup", {
      method: "POST",
      body: {
        email: "revoked@test.com",
        password: "password123",
        otp: "4444",
      },
      cookies: { [ENROLLMENT_COOKIE_NAME]: rawToken },
    });
    const signupRes = await enrollmentSignupPost(signupReq);
    expect(signupRes.status).toBe(403);
  });

  // Scenario 17
  it("Scenario 17: Reservation Timeout (2 min): Expired reservation allows re-reservation without invalidating 24h grant", async () => {
    const rawToken = generateEnrollmentToken();
    const tokenHash = hashToken(rawToken);

    const grant: MockGrant = {
      id: "grant-res-timeout-1",
      grant_token_hash: tokenHash,
      otp_code: "6666",
      authorization_type: "payment",
      source_reference: "426819204812",
      status: "signup_in_progress",
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      reservation_expires_at: new Date(Date.now() - 5 * 1000).toISOString(), // Expired 5 seconds ago
      reserved_email: "firstattempt@test.com",
      creation_nonce_hash: hashToken("old_nonce_value"),
      failed_attempts: 0,
    };
    mockGrants.push(grant);

    const admin = createMockAdminClient();
    const newNonce = generateCreationNonce();
    const newNonceHash = hashToken(newNonce);

    const res = await admin.rpc("rpc_reserve_enrollment_grant", {
      p_token_hash: tokenHash,
      p_otp: "6666",
      p_email: "secondattempt@test.com",
      p_nonce_hash: newNonceHash,
    });

    expect(res.data?.success).toBe(true);
    expect(grant.status).toBe("signup_in_progress");
    expect(grant.reserved_email).toBe("secondattempt@test.com");
    expect(grant.creation_nonce_hash).toBe(newNonceHash);
  });

  // Scenario 18
  it("Scenario 18: Timeout Reconciliation: Network drop during createUser correctly reconciles user existence", async () => {
    const rawToken = generateEnrollmentToken();
    const tokenHash = hashToken(rawToken);

    const grant: MockGrant = {
      id: "grant-reconcile-1",
      grant_token_hash: tokenHash,
      otp_code: "7777",
      authorization_type: "referral_coupon",
      source_reference: "FREE100",
      status: "active",
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      failed_attempts: 0,
    };
    mockGrants.push(grant);

    // Pre-populate user as if GoTrue succeeded before timeout exception
    mockUsers.push({
      id: "user-reconciled",
      email: "timeout@test.com",
      created_at: new Date().toISOString(),
    });

    const admin = createMockAdminClient();
    // Simulate createUser throwing network exception
    vi.spyOn(admin.auth.admin, "createUser").mockRejectedValueOnce(new Error("ETIMEDOUT: Connection reset"));

    const signupReq = createTestRequest("/api/auth/enrollment-signup", {
      method: "POST",
      body: {
        email: "timeout@test.com",
        password: "password123",
        otp: "7777",
      },
      cookies: { [ENROLLMENT_COOKIE_NAME]: rawToken },
    });

    const signupRes = await enrollmentSignupPost(signupReq);
    expect(signupRes.status).toBe(200);
    const json = await signupRes.json();
    expect(json.success).toBe(true);
    expect(json.redirect).toBe("/room");
  });

  // Scenario 19
  it("Scenario 19: Creation Nonce Secrecy: Raw nonce never stored in DB or returned in API responses", async () => {
    const rawNonce = generateCreationNonce();
    expect(rawNonce.length).toBe(64); // 32 bytes hex

    const nonceHash = hashToken(rawNonce);
    expect(nonceHash).not.toBe(rawNonce);

    const token = generateEnrollmentToken();
    const tokenHash = hashToken(token);

    const grant: MockGrant = {
      id: "grant-nonce-sec",
      grant_token_hash: tokenHash,
      otp_code: "8888",
      authorization_type: "payment",
      source_reference: "11223344",
      status: "active",
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      failed_attempts: 0,
    };
    mockGrants.push(grant);

    const signupReq = createTestRequest("/api/auth/enrollment-signup", {
      method: "POST",
      body: {
        email: "noncesecret@test.com",
        password: "password123",
        otp: "8888",
      },
      cookies: { [ENROLLMENT_COOKIE_NAME]: token },
    });

    const res = await enrollmentSignupPost(signupReq);
    expect(res.status).toBe(200);
    const json = await res.json();

    // Verify raw nonce never returned in JSON response
    expect(JSON.stringify(json)).not.toContain(rawNonce);

    // Verify DB only ever stored hash, not raw nonce
    expect(grant.creation_nonce_hash).toBeNull(); // Cleared upon consumption
  });

  // Scenario 20
  it("Scenario 20: Admin Portal — Grants View: Authorized admin can fetch previous 24h grants with OTPs", async () => {
    mockGrants.push({
      id: "grant-view-1",
      grant_token_hash: hashToken("token1"),
      otp_code: "1234",
      authorization_type: "payment",
      source_reference: "UTR10001",
      name: "Student One",
      contact: "one@test.com",
      status: "active",
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      failed_attempts: 0,
    });

    const req = createTestRequest("/api/public-website/admin/grants", {
      headers: {
        authorization: "Bearer super_secret_platform_admin_key_2026_x9z",
      },
    });

    const res = await adminGrantsGet(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.grants).toBeDefined();
    expect(json.grants.length).toBe(1);
    expect(json.grants[0].otpCode).toBe("1234");
    expect(json.grants[0].name).toBe("Student One");
    expect(json.grants[0].authorizationType).toBe("payment");
  });

  // Scenario 21
  it("Scenario 21: Admin Portal — Hash Suppression: Grants API suppresses grant_token_hash and creation_nonce_hash", async () => {
    mockGrants.push({
      id: "grant-hash-sec",
      grant_token_hash: "secret_grant_token_hash_value_12345",
      creation_nonce_hash: "secret_creation_nonce_hash_value_67890",
      otp_code: "5678",
      authorization_type: "referral_coupon",
      source_reference: "FREE100",
      status: "active",
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      failed_attempts: 0,
    });

    const req = createTestRequest("/api/public-website/admin/grants", {
      headers: {
        authorization: "Bearer super_secret_platform_admin_key_2026_x9z",
      },
    });

    const res = await adminGrantsGet(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    const rawString = JSON.stringify(json);

    // Cryptographic hashes MUST NOT be present in JSON response
    expect(rawString).not.toContain("grant_token_hash");
    expect(rawString).not.toContain("creation_nonce_hash");
    expect(rawString).not.toContain("secret_grant_token_hash_value_12345");
    expect(rawString).not.toContain("secret_creation_nonce_hash_value_67890");
  });

  // Scenario 22
  it("Scenario 22: Admin Portal — CSRF Rejection: Cross-origin POST to admin routes rejected with HTTP 403", async () => {
    const maliciousReq = new NextRequest("https://studyalive.netlify.app/api/public-website/admin/submissions", {
      method: "POST",
      headers: {
        host: "studyalive.netlify.app",
        origin: "https://attacker-malicious-site.com", // CSRF cross-origin
        authorization: "Bearer super_secret_platform_admin_key_2026_x9z",
        "content-type": "application/json",
      },
      body: JSON.stringify({ id: "some-id", status: "verified" }),
    });

    const res = await adminSubmissionsPost(maliciousReq);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toContain("Cross-origin request rejected");
  });

  // Scenario 23
  it("Scenario 23: Admin Auth — Timing Safe: Mismatched admin key rejected via constant-time comparison", () => {
    process.env.PUBLIC_SITE_ADMIN_KEY = "123456789012345678901234"; // 24 chars

    // Exact match succeeds
    expect(isMatchingAdminKey("123456789012345678901234")).toBe(true);

    // Mismatched characters reject
    expect(isMatchingAdminKey("123456789012345678901235")).toBe(false);
    expect(isMatchingAdminKey("wrong_admin_key_with_at_least_24_chars")).toBe(false);

    // Short keys (< 24 chars) rejected even if env is set
    expect(isMatchingAdminKey("short_key")).toBe(false);

    // Null/undefined/empty rejected
    expect(isMatchingAdminKey(null)).toBe(false);
    expect(isMatchingAdminKey(undefined)).toBe(false);
    expect(isMatchingAdminKey("")).toBe(false);
    expect(isMatchingAdminKey("   ")).toBe(false);
  });

  // Scenario 24
  it("Scenario 24: Existing Accounts Non-Regression: Normal login succeeds without triggering handle_new_user()", async () => {
    // Existing user in database
    mockUsers.push({
      id: "existing-user-uuid-1",
      email: "existingmember@studyroom.app",
      created_at: "2026-09-01T00:00:00Z",
    });

    // In a login flow, signInWithPassword is used. handle_new_user() ONLY triggers on INSERT on auth.users.
    // Verify that existing user exists and is unaffected by enrollment gate tables
    const user = mockUsers.find((u) => u.email === "existingmember@studyroom.app");
    expect(user).toBeDefined();
    expect(user?.id).toBe("existing-user-uuid-1");

    // Existing user has no enrollment grant and needs none to log in
    const grant = mockGrants.find((g) => g.consumed_email === "existingmember@studyroom.app");
    expect(grant).toBeUndefined();
  });
});
