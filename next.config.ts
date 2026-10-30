import type { NextConfig } from "next";
import path from "path";
import fs from "fs";

// Resolve buildId from public/version.json or environment variables
let buildId =
  process.env.DEPLOY_ID ||
  process.env.COMMIT_REF ||
  process.env.BUILD_ID ||
  "";
let buildTime = "";

try {
  const versionFile = path.resolve(__dirname, "public", "version.json");
  if (fs.existsSync(versionFile)) {
    const data = JSON.parse(fs.readFileSync(versionFile, "utf8"));
    if (data.buildId) buildId = data.buildId;
    if (data.buildTime) buildTime = data.buildTime;
  }
} catch {}

if (!buildId) {
  buildId = `sr-${Date.now().toString(36)}`;
}
if (!buildTime) {
  buildTime = new Date().toISOString();
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  env: {
    NEXT_PUBLIC_APP_BUILD_ID: buildId,
    NEXT_PUBLIC_APP_BUILD_TIME: buildTime,
  },
  turbopack: {
    root: path.resolve(__dirname),
  },
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  headers: async () => [
    {
      source: "/sw.js",
      headers: [
        {
          key: "Cache-Control",
          value: "no-cache, no-store, must-revalidate",
        },
        {
          key: "Service-Worker-Allowed",
          value: "/",
        },
      ],
    },
    {
      source: "/version.json",
      headers: [
        {
          key: "Cache-Control",
          value: "no-cache, no-store, must-revalidate",
        },
      ],
    },
    {
      source: "/api/version",
      headers: [
        {
          key: "Cache-Control",
          value: "no-cache, no-store, must-revalidate",
        },
      ],
    },
    {
      source: "/manifest.json",
      headers: [
        {
          key: "Cache-Control",
          value: "public, max-age=0, must-revalidate",
        },
      ],
    },
    {
      source: "/icons/:path*",
      headers: [
        {
          key: "Cache-Control",
          value: "public, max-age=31536000, immutable",
        },
      ],
    },
    {
      source: "/(.*)",
      headers: [
        {
          key: "X-Content-Type-Options",
          value: "nosniff",
        },
        {
          key: "X-Frame-Options",
          value: "DENY",
        },
        {
          key: "Referrer-Policy",
          value: "strict-origin-when-cross-origin",
        },
      ],
    },
  ],
};

export default nextConfig;
