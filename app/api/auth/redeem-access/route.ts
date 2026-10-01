import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  hashToken,
  generateEnrollmentToken,
  setEnrollmentTokenCookie,
} from "@/lib/auth/enrollment";
import { getAppUrl } from "@/lib/email/templates";

function escapeHtml(str: string): string {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderHtmlResponse(htmlContent: string, status: number = 200): NextResponse {
  return new NextResponse(htmlContent, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      Pragma: "no-cache",
    },
  });
}

function renderErrorPage(title: string, message: string, appUrl: string): NextResponse {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="referrer" content="no-referrer" />
  <title>${escapeHtml(title)} &bull; StudyRoom</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: #0b0f19;
      color: #e2e8f0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .card {
      background: #151d30;
      border: 1px solid #27354f;
      border-radius: 20px;
      max-width: 480px;
      width: 100%;
      padding: 36px 32px;
      text-align: center;
      box-shadow: 0 20px 40px -15px rgba(0,0,0,0.5);
    }
    .icon { font-size: 40px; margin-bottom: 16px; }
    h1 { font-size: 20px; font-weight: 800; color: #f87171; margin-bottom: 12px; }
    p { font-size: 14px; line-height: 1.6; color: #94a3b8; margin-bottom: 24px; }
    .btn {
      display: inline-block;
      background: #2563eb;
      color: #ffffff;
      padding: 12px 28px;
      border-radius: 12px;
      font-size: 14px;
      font-weight: 700;
      text-decoration: none;
      transition: background-color 0.2s ease;
    }
    .btn:hover { background: #1d4ed8; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">⚠️</div>
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(message)}</p>
    <a href="${escapeHtml(appUrl)}" class="btn">Return to StudyRoom</a>
  </div>
</body>
</html>`;
  return renderHtmlResponse(html, 400);
}

/**
 * GET /api/auth/redeem-access?token=...
 *
 * CRITICAL FIX #1 & #2:
 * DO NOT consume the token on GET.
 * Automated email crawlers and virus scanners inspect links via GET requests.
 * Consuming on GET would burn the single-use token before the user opens the link!
 *
 * GET only checks validity, sets no-referrer policy, and renders a clean confirmation page
 * with a POST button to explicitly complete redemption.
 */
export async function GET(request: NextRequest) {
  const appUrl = getAppUrl();
  const token = request.nextUrl.searchParams.get("token")?.trim();

  // 1. Validate token format (32-byte CSPRNG hex string = 64 characters)
  if (!token || !/^[a-fA-F0-9]{64}$/.test(token)) {
    return renderErrorPage(
      "Invalid Access Link",
      "The access link is incomplete or malformed. Please check your email or contact support.",
      appUrl
    );
  }

  const adminClient = createAdminClient();
  if (!adminClient) {
    return renderErrorPage(
      "Service Temporarily Unavailable",
      "Unable to connect to verification database. Please try again in a few moments.",
      appUrl
    );
  }

  try {
    const tokenHash = hashToken(token);

    // 2. Query enrollment grant matching access_token_hash (READ ONLY)
    const { data: grant, error } = await adminClient
      .from("enrollment_grants")
      .select("id, status, expires_at, access_token_expires_at, email")
      .eq("access_token_hash", tokenHash)
      .maybeSingle();

    if (error || !grant) {
      return renderErrorPage(
        "Access Link Expired or Already Used",
        "This single-use access link has already been used or does not exist. If you need a new link, contact support or request an admin resend.",
        appUrl
      );
    }

    // 3. Check lifecycle states
    if (grant.status === "consumed") {
      return renderErrorPage(
        "Account Already Created",
        "An account has already been registered with this enrollment authorization. Please proceed to the login page.",
        `${appUrl}/login`
      );
    }

    if (grant.status === "revoked") {
      return renderErrorPage(
        "Access Revoked",
        "This enrollment authorization has been revoked by administration.",
        appUrl
      );
    }

    const now = Date.now();
    if (new Date(grant.expires_at).getTime() < now) {
      return renderErrorPage(
        "Enrollment Grant Expired",
        "This enrollment authorization has expired (validity was 24 hours). Please contact administration.",
        appUrl
      );
    }

    if (grant.access_token_expires_at && new Date(grant.access_token_expires_at).getTime() < now) {
      return renderErrorPage(
        "Access Link Expired",
        "This access link has expired. Please contact administration to resend your link.",
        appUrl
      );
    }

    // 4. Render clean, safe HTML confirmation page (Zero external assets, no-referrer)
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="referrer" content="no-referrer" />
  <title>Complete Your StudyRoom Access &bull; StudyRoom</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: #0b0f19;
      color: #e2e8f0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .card {
      background: #151d30;
      border: 1px solid #27354f;
      border-radius: 20px;
      max-width: 480px;
      width: 100%;
      padding: 40px 32px;
      text-align: center;
      box-shadow: 0 20px 40px -15px rgba(0,0,0,0.5);
    }
    .badge {
      display: inline-block;
      padding: 4px 14px;
      background: #064e3b;
      color: #34d399;
      border: 1px solid #059669;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 1px;
      text-transform: uppercase;
      border-radius: 999px;
      margin-bottom: 16px;
    }
    .icon { font-size: 42px; margin-bottom: 12px; }
    h1 {
      font-size: 22px;
      font-weight: 800;
      color: #ffffff;
      margin-bottom: 12px;
      letter-spacing: -0.5px;
    }
    p {
      font-size: 14px;
      line-height: 1.6;
      color: #94a3b8;
      margin-bottom: 28px;
    }
    .info-box {
      background: #0b0f19;
      border: 1px solid #1e293b;
      border-radius: 12px;
      padding: 14px 18px;
      margin-bottom: 28px;
      text-align: left;
      font-size: 13px;
      color: #cbd5e1;
      line-height: 1.5;
    }
    .btn {
      display: inline-block;
      width: 100%;
      background: #10b981;
      color: #ffffff;
      padding: 16px 28px;
      border-radius: 12px;
      font-size: 15px;
      font-weight: 800;
      border: none;
      cursor: pointer;
      text-align: center;
      transition: background-color 0.2s ease, transform 0.1s ease;
      box-shadow: 0 4px 15px rgba(16,185,129,0.35);
    }
    .btn:hover { background: #059669; }
    .btn:active { transform: scale(0.98); }
    .note {
      font-size: 11px;
      color: #64748b;
      margin-top: 18px;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">🎓</div>
    <span class="badge">Payment Confirmed</span>
    <h1>Complete Your Access</h1>
    <p>Your ₹20 enrollment fee has been verified by the administrator. Click below to activate your access and set up your StudyRoom account.</p>

    <div class="info-box">
      🔒 <strong>Security Verification:</strong><br />
      This single-use access link will securely bind your pre-verified status to this browser session.
    </div>

    <form method="POST" action="/api/auth/redeem-access">
      <input type="hidden" name="token" value="${escapeHtml(token)}" />
      <button type="submit" class="btn">Continue to StudyRoom &rarr;</button>
    </form>

    <div class="note">
      This link is single-use and will expire in 24 hours.
    </div>
  </div>
</body>
</html>`;

    return renderHtmlResponse(html, 200);
  } catch (err: any) {
    console.error("[Redeem Access] Unexpected error on GET:", err);
    return renderErrorPage(
      "Unexpected Error",
      "An unexpected error occurred while verifying your link. Please try again.",
      appUrl
    );
  }
}

/**
 * POST /api/auth/redeem-access
 *
 * CRITICAL FIX #1 & #4:
 * Atomic single-use token consumption under concurrency.
 * - Parses token from POST form body or JSON.
 * - Atomically executes:
 *   UPDATE enrollment_grants
 *   SET access_token_hash = NULL, grant_token_hash = $new, status = 'preverified'
 *   WHERE access_token_hash = $hash AND status IN ('active', 'preverified') AND expires_at > now()
 *   RETURNING id
 * - Exactly ONE request succeeds; concurrent requests get 0 rows and are safely rejected.
 * - Sets HttpOnly enrollment cookie and issues a clean 303 See Other redirect to /signup (0 tokens in URL).
 */
export async function POST(request: NextRequest) {
  const appUrl = getAppUrl();

  // 1. Extract token from request body (form data, JSON, or searchParams fallback)
  let token: string | null = null;
  const contentType = request.headers.get("content-type") || "";

  try {
    if (contentType.includes("application/json")) {
      const body = await request.json().catch(() => ({}));
      token = body?.token?.trim() || null;
    } else {
      const formData = await request.formData().catch(() => null);
      if (formData) {
        token = (formData.get("token") as string)?.trim() || null;
      }
      if (!token) {
        const body = await request.json().catch(() => ({}));
        token = body?.token?.trim() || null;
      }
    }
  } catch {
    token = null;
  }

  if (!token) {
    token = request.nextUrl.searchParams.get("token")?.trim() || null;
  }

  // 2. Validate token format (64-char CSPRNG hex string)
  if (!token || !/^[a-fA-F0-9]{64}$/.test(token)) {
    return NextResponse.redirect(new URL("/signup?error=invalid_link", appUrl), 303);
  }

  const adminClient = createAdminClient();
  if (!adminClient) {
    console.error("[Redeem Access] Database admin client unavailable");
    return NextResponse.redirect(new URL("/signup?error=service_unavailable", appUrl), 303);
  }

  try {
    const tokenHash = hashToken(token);
    const enrollmentToken = generateEnrollmentToken();
    const grantTokenHash = hashToken(enrollmentToken);
    const nowIso = new Date().toISOString();

    // 3. Race-Safe Atomic Single-Use Consumption:
    //    Atomically update matching row. If already consumed by a concurrent request,
    //    access_token_hash is already NULL and this statement updates 0 rows.
    const { data: updatedRows, error: updateErr } = await adminClient
      .from("enrollment_grants")
      .update({
        access_token_hash: null, // Atomically nullify so it can never be used again
        grant_token_hash: grantTokenHash,
        status: "preverified",
        failed_attempts: 0,
        preverified_at: nowIso,
        updated_at: nowIso,
      })
      .eq("access_token_hash", tokenHash)
      .in("status", ["active", "preverified"])
      .gt("expires_at", nowIso)
      .select("id, email");

    if (updateErr) {
      console.error("[Redeem Access] Database error during atomic consumption:", updateErr.message);
      return NextResponse.redirect(new URL("/signup?error=redemption_failed", appUrl), 303);
    }

    if (!updatedRows || updatedRows.length === 0) {
      // Token was already consumed, does not exist, or expired
      console.warn("[Redeem Access] Atomic update matched 0 rows (token already used or invalid).");
      return NextResponse.redirect(new URL("/signup?error=link_used_or_expired", appUrl), 303);
    }

    // 4. Issue HttpOnly cookie and return 303 See Other redirect to /signup (0 tokens in URL)
    const response = NextResponse.redirect(new URL("/signup", appUrl), 303);
    setEnrollmentTokenCookie(response, enrollmentToken);
    return response;
  } catch (err: any) {
    console.error("[Redeem Access] Unexpected error on POST:", err);
    return NextResponse.redirect(new URL("/signup?error=unexpected", appUrl), 303);
  }
}

