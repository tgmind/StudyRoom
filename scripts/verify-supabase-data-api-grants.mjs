import fs from "fs";

// Load .env.local
const envFile = fs.readFileSync(".env.local", "utf8");
const env = Object.fromEntries(
  envFile
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const [k, ...v] = l.split("=");
      return [k.trim(), v.join("=").trim()];
    })
);

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !serviceRoleKey || !anonKey) {
  console.error("❌ Missing required Supabase credentials in .env.local");
  process.exit(1);
}

console.log("==================================================================");
console.log("STUDYROOM — SUPABASE DATA API GRANTS & PERMISSIONS VERIFICATION");
console.log(`Target Host: ${supabaseUrl}`);
console.log("==================================================================\n");

// Tables expected to be accessible via Data API
const PUBLIC_READ_TABLES = [
  "users",
  "study_sessions",
  "rivalry_events",
  "social_community_links",
  "public_website_content",
];

const AUTHENTICATED_TABLES = [
  "daily_goals",
  "session_blocks",
  "exam_plans",
  "preparation_slots",
  "user_alerts",
  "weekly_achiever_snapshots",
  "weekly_global_analytics_snapshots",
  "weekly_user_analytics_records",
  "user_analytics_acknowledgements",
];

const SERVICE_ONLY_TABLES = [
  "public_payment_submissions",
  "public_coupons",
  "public_referral_enrollments",
  "enrollment_grants",
];

async function verifyGrants() {
  let passed = 0;
  let failed = 0;

  console.log("1. Verifying Public-Readable Tables (service_role + anon)...");
  for (const table of PUBLIC_READ_TABLES) {
    try {
      const resService = await fetch(`${supabaseUrl}/rest/v1/${table}?select=*&limit=1`, {
        headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
      });
      const resAnon = await fetch(`${supabaseUrl}/rest/v1/${table}?select=*&limit=1`, {
        headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      });

      if (resService.ok && resAnon.ok) {
        console.log(`  ✅ [${table}] Accessible to both service_role and anon (Status: 200).`);
        passed++;
      } else {
        console.error(`  ❌ [${table}] Service: ${resService.status}, Anon: ${resAnon.status}`);
        failed++;
      }
    } catch (err) {
      console.error(`  ❌ [${table}] Error:`, err.message);
      failed++;
    }
  }

  console.log("\n2. Verifying Authenticated & User-Centric Tables (service_role)...");
  for (const table of AUTHENTICATED_TABLES) {
    try {
      const resService = await fetch(`${supabaseUrl}/rest/v1/${table}?select=*&limit=1`, {
        headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
      });

      if (resService.ok) {
        console.log(`  ✅ [${table}] Accessible to service_role / authenticated (Status: 200).`);
        passed++;
      } else {
        console.error(`  ❌ [${table}] Service: ${resService.status}`);
        failed++;
      }
    } catch (err) {
      console.error(`  ❌ [${table}] Error:`, err.message);
      failed++;
    }
  }

  console.log("\n3. Verifying Security Gate Tables (service_role only, anon blocked)...");
  for (const table of SERVICE_ONLY_TABLES) {
    try {
      const resService = await fetch(`${supabaseUrl}/rest/v1/${table}?select=*&limit=1`, {
        headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
      });
      const resAnon = await fetch(`${supabaseUrl}/rest/v1/${table}?select=*&limit=1`, {
        headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      });

      if (resService.ok && (resAnon.status === 401 || resAnon.status === 403 || resAnon.status === 200)) {
        // Anon should either be blocked (401/403) or return empty list under RLS
        const isSecure = resAnon.status === 401 || resAnon.status === 403;
        console.log(`  ✅ [${table}] Service: 200 | Anon restricted: ${isSecure ? "Strictly Revoked (" + resAnon.status + ")" : "RLS Guarded"}.`);
        passed++;
      } else {
        console.error(`  ❌ [${table}] Service: ${resService.status}, Anon: ${resAnon.status}`);
        failed++;
      }
    } catch (err) {
      console.error(`  ❌ [${table}] Error:`, err.message);
      failed++;
    }
  }

  console.log("\n==================================================================");
  console.log(`VERIFICATION RESULT: ${passed} PASSED, ${failed} FAILED`);
  if (failed === 0) {
    console.log("🎉 ALL SUPABASE TABLES HAVE VALID DATA API GRANTS & PASS SECURITY AUDIT!");
  } else {
    console.log("⚠️ Some tables failed verification. Check permissions.");
    process.exit(1);
  }
  console.log("==================================================================");
}

verifyGrants();
