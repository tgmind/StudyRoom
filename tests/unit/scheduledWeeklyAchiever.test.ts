import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Import handler from Netlify function
import { handler } from "../../netlify/functions/scheduled-weekly-achiever.js";


describe("Netlify Scheduled Function: scheduled-weekly-achiever", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("1. loads properly and exports an asynchronous handler", () => {
    expect(handler).toBeDefined();
    expect(typeof handler).toBe("function");
  });

  it("2. fails closed with status 500 when CRON_SECRET is unconfigured", async () => {
    delete process.env.CRON_SECRET;
    const res = await handler({}, {});

    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body);
    expect(body.error).toContain("Missing CRON_SECRET");
  });

  it("3. creates an authenticated request with Authorization Bearer token", async () => {
    process.env.CRON_SECRET = "super-secret-token";
    process.env.NEXT_PUBLIC_APP_URL = "https://studyalive.netlify.app";

    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      text: async () => JSON.stringify({ success: true, processed: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await handler({}, {});

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://studyalive.netlify.app/api/cron/weekly-achiever");
    expect(options.method).toBe("POST");
    expect(options.headers["Authorization"]).toBe("Bearer super-secret-token");
    expect(options.headers["Content-Type"]).toBe("application/json");
    expect(res.statusCode).toBe(200);
  });

  it("4. resolves canonical production URL safely and ignores DEPLOY_PRIME_URL", async () => {
    process.env.CRON_SECRET = "test-secret";
    process.env.DEPLOY_PRIME_URL = "https://deploy-preview-99--studyalive.netlify.app"; // should be ignored!
    process.env.URL = "https://studyalive.netlify.app";
    delete process.env.NEXT_PUBLIC_APP_URL;

    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      text: async () => JSON.stringify({ success: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await handler({}, {});

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe("https://studyalive.netlify.app/api/cron/weekly-achiever");
    expect(url).not.toContain("deploy-preview-99");
  });

  it("5. formats target URL accurately removing trailing slashes from base URL", async () => {
    process.env.CRON_SECRET = "test-secret";
    process.env.NEXT_PUBLIC_APP_URL = "https://studyalive.netlify.app/";

    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      text: async () => JSON.stringify({ success: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await handler({}, {});

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe("https://studyalive.netlify.app/api/cron/weekly-achiever");
  });

  it("6. surfaces non-2xx response from /api/cron/weekly-achiever without crashing", async () => {
    process.env.CRON_SECRET = "test-secret";

    const fetchMock = vi.fn().mockResolvedValue({
      status: 401,
      text: async () => JSON.stringify({ success: false, error: "Unauthorized cron request" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await handler({}, {});

    expect(res.statusCode).toBe(401);
    expect(res.body).toContain("Unauthorized cron request");
  });

  it("7. surfaces network or connectivity errors cleanly with 500", async () => {
    process.env.CRON_SECRET = "test-secret";

    const fetchMock = vi.fn().mockRejectedValue(new Error("Network connection refused"));
    vi.stubGlobal("fetch", fetchMock);

    const res = await handler({}, {});

    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body);
    expect(body.error).toContain("Network connection refused");
  });

  it("8. handles request timeout cleanly within the 26s guard window", async () => {
    process.env.CRON_SECRET = "test-secret";

    const abortError = new Error("This operation was aborted");
    abortError.name = "AbortError";
    const fetchMock = vi.fn().mockRejectedValue(abortError);
    vi.stubGlobal("fetch", fetchMock);

    const res = await handler({}, {});

    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body);
    expect(body.timedOut).toBe(true);
    expect(body.error).toContain("timed out after 26s");
  });

  it("9. contains zero duplicated business logic or direct database queries", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(
      path.resolve(__dirname, "../../netlify/functions/scheduled-weekly-achiever.js"),
      "utf8"
    );

    // Verify it doesn't query Supabase directly or calculate Achiever
    expect(content).not.toContain("supabase");
    expect(content).not.toContain("rpc_calculate_weekly_achiever");
    expect(content).not.toContain("rpc_finalize_weekly_global_analytics");
    expect(content).not.toContain("weekly_achiever_snapshots");
    expect(content).not.toContain("weekly_global_analytics_snapshots");
    expect(content).not.toContain("sendAlertEmail");
  });

  it("10. demonstrates client abort semantics: caller aborts connection while server transaction commits independently, retry receives already_finalized", async () => {
    process.env.CRON_SECRET = "test-secret";

    // First call: client aborts after 26s
    const abortErr = new Error("This operation was aborted");
    abortErr.name = "AbortError";
    const fetchMock1 = vi.fn().mockRejectedValue(abortErr);
    vi.stubGlobal("fetch", fetchMock1);

    const res1 = await handler({}, {});
    expect(res1.statusCode).toBe(500);
    expect(JSON.parse(res1.body).timedOut).toBe(true);

    // Second call (retry): server-side operation had finished and committed; returns already_finalized
    const fetchMock2 = vi.fn().mockResolvedValue({
      status: 200,
      text: async () => JSON.stringify({ success: true, action: "already_finalized", already_finalized: true }),
    });
    vi.stubGlobal("fetch", fetchMock2);

    const res2 = await handler({}, {});
    expect(res2.statusCode).toBe(200);
    const body2 = JSON.parse(res2.body);
    expect(body2.already_finalized).toBe(true);
  });
});

