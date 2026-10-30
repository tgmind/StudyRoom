#!/usr/bin/env node

/**
 * Build-time Deployment & Cache-Busting Version Generator for StudyRoom
 *
 * Runs automatically prior to `next build` on Netlify and local builds:
 * 1. Resolves authoritative buildId (Netlify DEPLOY_ID, COMMIT_REF, git SHA, or timestamp)
 * 2. Emits `public/version.json` for instant 0ms CDN version verification
 * 3. Injects dynamic build cache signature into `public/sw.js` so browsers detect new SW
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

function getGitCommit() {
  try {
    return execSync("git rev-parse --short HEAD", { cwd: rootDir, stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

// 1. Resolve Build ID
const netlifyDeployId = process.env.DEPLOY_ID;
const netlifyCommit = process.env.COMMIT_REF ? process.env.COMMIT_REF.slice(0, 8) : null;
const netlifyBuildId = process.env.BUILD_ID;
const gitCommit = getGitCommit();
const timestamp = Date.now().toString(36);

const buildId =
  netlifyDeployId ||
  netlifyCommit ||
  netlifyBuildId ||
  gitCommit ||
  `sr-${timestamp}`;

const buildTime = new Date().toISOString();

// Read package.json version if available
let packageVersion = "1.0.0";
try {
  const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf8"));
  if (pkg.version) packageVersion = pkg.version;
} catch {}

const buildInfo = {
  buildId,
  buildTime,
  version: packageVersion,
};

// 2. Write `public/version.json`
const versionJsonPath = path.join(rootDir, "public", "version.json");
fs.writeFileSync(versionJsonPath, JSON.stringify(buildInfo, null, 2) + "\n", "utf8");
console.log(`[BuildInfo] Wrote public/version.json -> buildId: ${buildId}, buildTime: ${buildTime}`);

// 3. Update `public/sw.js` with dynamic cache version so browser detects SW change on every Netlify deploy
const swPath = path.join(rootDir, "public", "sw.js");
if (fs.existsSync(swPath)) {
  let swContent = fs.readFileSync(swPath, "utf8");

  // Replace CACHE_NAME with unique build version
  const cacheNameRegex = /const CACHE_NAME = ["'][^"']+["'];/;
  const targetCacheName = `const CACHE_NAME = "studyroom-${buildId}";`;

  if (cacheNameRegex.test(swContent)) {
    swContent = swContent.replace(cacheNameRegex, targetCacheName);
  } else {
    swContent = `// Build: ${buildId}\n` + swContent;
  }

  // Ensure SKIP_WAITING and CLEAR_CACHES message handlers exist in sw.js
  if (!swContent.includes("SKIP_WAITING")) {
    const messageEventRegex = /self\.addEventListener\("message",\s*\(event\)\s*=>\s*\{/;
    if (messageEventRegex.test(swContent)) {
      swContent = swContent.replace(
        messageEventRegex,
        `self.addEventListener("message", (event) => {\n  if (event.data && event.data.type === "SKIP_WAITING") {\n    self.skipWaiting();\n  }\n  if (event.data && event.data.type === "CLEAR_CACHES") {\n    event.waitUntil(\n      caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))\n    );\n  }`
      );
    }
  }

  fs.writeFileSync(swPath, swContent, "utf8");
  console.log(`[BuildInfo] Updated public/sw.js with CACHE_NAME -> "studyroom-${buildId}"`);
}
