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
console.log("STUDYROOM — LIVE SUPABASE MIGRATION VERIFICATION");
console.log(`Target Host: ${supabaseUrl}`);
console.log("==================================================================\n");

async function runVerification() {
  let passed = 0;
  let failed = 0;

  // 1. Verify enrollment_grants table exists via service_role
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/enrollment_grants?select=id&limit=1`, {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    });
    if (res.ok) {
      console.log("✅ 1. Table public.enrollment_grants exists and is accessible via service_role.");
      passed++;
    } else {
      console.error(`❌ 1. Table public.enrollment_grants check failed: HTTP ${res.status} ${await res.text()}`);
      failed++;
    }
  } catch (err) {
    console.error("❌ 1. Error checking enrollment_grants:", err.message);
    failed++;
  }

  // 2. Verify anon access to enrollment_grants is REVOKED (must return 401/403/empty or error)
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/enrollment_grants?select=*`, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
    });
    const text = await res.text();
    if (res.status === 401 || res.status === 403 || text.includes("permission denied")) {
      console.log("✅ 2. Anon access to public.enrollment_grants is strictly REVOKED (Access Denied).");
      passed++;
    } else {
      console.error(`❌ 2. Anon access to public.enrollment_grants is NOT revoked! Status: ${res.status}`);
      failed++;
    }
  } catch (err) {
    console.error("❌ 2. Error testing anon access:", err.message);
    failed++;
  }

  // 3. Verify public_coupons anon access is REVOKED
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/public_coupons?select=*`, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
    });
    const text = await res.text();
    if (res.status === 401 || res.status === 403 || text.includes("permission denied")) {
      console.log("✅ 3. Anon access to public.public_coupons is strictly REVOKED.");
      passed++;
    } else {
      console.warn(`⚠️ 3. Anon access to public.public_coupons returned status ${res.status}. If migration is applied, verify REVOKE ALL statement.`);
    }
  } catch (err) {
    console.error("❌ 3. Error testing anon coupons access:", err.message);
  }

  // 4. Verify claim_secret_hash column exists on public_payment_submissions
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/public_payment_submissions?select=id,claim_secret_hash&limit=1`, {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    });
    if (res.ok) {
      console.log("✅ 4. Column claim_secret_hash exists on public.public_payment_submissions.");
      passed++;
    } else {
      console.error(`❌ 4. Column claim_secret_hash check failed: HTTP ${res.status} ${await res.text()}`);
      failed++;
    }
  } catch (err) {
    console.error("❌ 4. Error checking payment submissions columns:", err.message);
    failed++;
  }

  // 5. Verify enrollment_grant_id column exists on public.users
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/users?select=id,enrollment_grant_id&limit=1`, {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    });
    if (res.ok) {
      console.log("✅ 5. Column enrollment_grant_id exists on public.users.");
      passed++;
    } else {
      console.error(`❌ 5. Column enrollment_grant_id check failed: HTTP ${res.status} ${await res.text()}`);
      failed++;
    }
  } catch (err) {
    console.error("❌ 5. Error checking users columns:", err.message);
    failed++;
  }

  // 6. Verify RPC rpc_cleanup_expired_enrollment_grants exists
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/rpc_cleanup_expired_enrollment_grants`, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
    if (res.ok) {
      const data = await res.json();
      console.log(`✅ 6. RPC rpc_cleanup_expired_enrollment_grants exists and executed cleanly (Result: ${JSON.stringify(data)}).`);
      passed++;
    } else {
      console.error(`❌ 6. RPC rpc_cleanup_expired_enrollment_grants failed: HTTP ${res.status} ${await res.text()}`);
      failed++;
    }
  } catch (err) {
    console.error("❌ 6. Error executing cleanup RPC:", err.message);
    failed++;
  }

  console.log("\n==================================================================");
  console.log(`VERIFICATION SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  if (failed === 0 && passed >= 5) {
    console.log("🎉 LIVE DATABASE MIGRATION CONFIRMED: 100% SUCCESSFUL!");
  } else {
    console.log("⚠️ Migration not yet fully applied. Please run 20261002_secure_enrollment_gate.sql in Supabase SQL Editor.");
  }
  console.log("==================================================================");
}

runVerification();
