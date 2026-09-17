import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Atomic Server Time Endpoint
 *
 * Returns current server time with zero-cache headers.
 * Used by clockSync.ts on application boot and tab activation to calibrate
 * client clocks and eliminate device clock skew with zero database overhead.
 */
export async function GET() {
  return NextResponse.json(
    { server_now: new Date().toISOString() },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        Pragma: "no-cache",
      },
    }
  );
}
