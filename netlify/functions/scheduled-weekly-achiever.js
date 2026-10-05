/**
 * Netlify Scheduled Function: Weekly Achiever & Global Analytics Finalization
 *
 * Runs automatically via Netlify's scheduler every Sunday at 22:30 UTC (= Monday 04:00 AM IST).
 * Invokes the authoritative Next.js endpoint /api/cron/weekly-achiever with CRON_SECRET authentication.
 *
 * Contract:
 * - Extremely thin trigger: delegates 100% of business logic to /api/cron/weekly-achiever.
 * - Fails closed if CRON_SECRET is unconfigured.
 * - Always targets canonical production origin (never a deploy preview or branch deploy).
 * - Enforces a 26-second fetch timeout to guarantee clean exit before Netlify's 30s hard limit.
 */
exports.handler = async (event, context) => {
  const cronSecret = process.env.CRON_SECRET?.trim();

  if (!cronSecret) {
    console.error("[Scheduled Weekly Achiever] CRON_SECRET is not configured on Netlify (Fail-Closed)");
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Missing CRON_SECRET on server" }),
    };
  }

  // Canonical Production URL resolution:
  // Netlify automatically provides read-only process.env.URL pointing to the primary site.
  // Explicitly avoid DEPLOY_PRIME_URL to prevent targeting deploy previews or branch builds.
  const rawBase =
    process.env.URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://studyalive.netlify.app";
  const siteUrl = rawBase.replace(/\/$/, "");


  const targetUrl = `${siteUrl}/api/cron/weekly-achiever`;
  console.log(`[Scheduled Weekly Achiever] Triggering authoritative route: ${targetUrl}`);

  try {
    // 26-second timeout ensures graceful failure handling before Netlify's hard 30s execution limit
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 26000);

    const response = await fetch(targetUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cronSecret}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    }).finally(() => {
      clearTimeout(timeoutId);
    });

    const body = await response.text();
    console.log(`[Scheduled Weekly Achiever] Response status ${response.status}: ${body}`);

    return {
      statusCode: response.status,
      body,
    };
  } catch (error) {
    const isTimeout = error && (error.name === "AbortError" || error.name === "TimeoutError");
    const message = isTimeout
      ? "Weekly Achiever HTTP execution timed out after 26s"
      : error instanceof Error
        ? error.message
        : "Unknown error";

    console.error(`[Scheduled Weekly Achiever] Invocation failed: ${message}`);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: message, timedOut: Boolean(isTimeout) }),
    };
  }
};
