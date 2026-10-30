import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  let buildId =
    process.env.DEPLOY_ID ||
    process.env.COMMIT_REF ||
    process.env.BUILD_ID ||
    process.env.NEXT_PUBLIC_APP_BUILD_ID ||
    "";
  let buildTime =
    process.env.NEXT_PUBLIC_APP_BUILD_TIME ||
    "";

  // If not injected via environment, read from public/version.json
  if (!buildId) {
    try {
      const versionFile = path.join(process.cwd(), "public", "version.json");
      if (fs.existsSync(versionFile)) {
        const data = JSON.parse(fs.readFileSync(versionFile, "utf8"));
        if (data.buildId) buildId = data.buildId;
        if (data.buildTime) buildTime = data.buildTime;
      }
    } catch {}
  }

  if (!buildId) {
    buildId = "production";
  }
  if (!buildTime) {
    buildTime = new Date().toISOString();
  }

  return NextResponse.json(
    {
      buildId,
      buildTime,
      version: process.env.npm_package_version || "1.0.0",
      timestamp: Date.now(),
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
        "CDN-Cache-Control": "no-store",
        "Netlify-CDN-Cache-Control": "no-store",
        "Surrogate-Control": "no-store",
        Pragma: "no-cache",
        Expires: "0",
      },
    }
  );
}
