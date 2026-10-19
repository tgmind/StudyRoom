/**
 * STUDYROOM — 1,000-STUDENT POPULATION SEEDING SCRIPT
 * 
 * Target Environment: Isolated Staging Supabase Database ONLY
 * URL: https://wppnfezoqpcgmowdkofp.supabase.co
 * Safety: Uses deterministic email prefix "student_XXXX@studyroom.staging".
 */

import { execSync } from "child_process";

const DB_HOST = "db.wppnfezoqpcgmowdkofp.supabase.co";
const DB_PW = "@Subodh2003@";
const TARGET_TOTAL_STUDENTS = 1000;

function runSql(sql) {
  return execSync(
    `PGPASSWORD='${DB_PW}' psql -h ${DB_HOST} -p 5432 -U postgres -d postgres -t -A`,
    { input: sql, encoding: "utf8" }
  );
}

async function seed1000Students() {
  console.log("===============================================================================");
  console.log("  STUDYROOM: PROVISIONING 1,000 SYNTHETIC TEST STUDENTS ON STAGING");
  console.log("===============================================================================");
  console.log(`Target Database: ${DB_HOST}`);

  // 1. Check current count of synthetic students
  const currentCountRaw = runSql("SELECT count(*) FROM auth.users WHERE email LIKE '%@studyroom.staging';");
  const currentCount = parseInt(currentCountRaw.trim() || "0", 10);
  console.log(`Current synthetic students in auth.users: ${currentCount}`);

  const toCreate = TARGET_TOTAL_STUDENTS - currentCount;
  if (toCreate > 0) {
    console.log(`Generating ${toCreate} new synthetic accounts (student_${currentCount + 1} to student_${TARGET_TOTAL_STUDENTS})...`);
    
    // Batch insert into auth.users in chunks of 200 for fast execution
    const CHUNK_SIZE = 200;
    for (let start = currentCount + 1; start <= TARGET_TOTAL_STUDENTS; start += CHUNK_SIZE) {
      const end = Math.min(start + CHUNK_SIZE - 1, TARGET_TOTAL_STUDENTS);
      console.log(`  Inserting auth accounts ${start} through ${end}...`);
      
      const insertSql = `
        DO $$
        DECLARE
          i INTEGER;
          new_uid UUID;
          disp TEXT;
          em TEXT;
        BEGIN
          FOR i IN ${start}..${end} LOOP
            new_uid := gen_random_uuid();
            disp := 'Student ' || LPAD(i::text, 4, '0');
            em := 'student_' || LPAD(i::text, 4, '0') || '@studyroom.staging';
            
            IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = em) THEN
              INSERT INTO auth.users (
                id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at
              ) VALUES (
                new_uid,
                '00000000-0000-0000-0000-000000000000',
                'authenticated',
                'authenticated',
                em,
                crypt('password123', gen_salt('bf')),
                NOW(),
                jsonb_build_object('display_name', disp),
                NOW() - (i || ' minutes')::interval,
                NOW()
              );
            END IF;
          END LOOP;
        END $$;
      `;
      runSql(insertSql);
    }
  }

  // 2. Ensure all public.users profiles exist
  console.log("\nEnsuring all public.users rows exist from auth.users...");
  runSql(`
    INSERT INTO public.users (id, display_name, avatar_url, created_at, updated_at)
    SELECT 
      id,
      COALESCE(raw_user_meta_data->>'display_name', SPLIT_PART(email, '@', 1)),
      NULL,
      created_at,
      NOW()
    FROM auth.users
    WHERE email LIKE '%@studyroom.staging'
    ON CONFLICT (id) DO UPDATE SET
      display_name = EXCLUDED.display_name;
  `);

  // 3. Populate realistic, diverse user statuses:
  // - First 200: studying (diverse start times, active seconds snapshots)
  // - Next 100: on break (break_started_at in last 10 mins)
  // - Remaining 700: offline (diverse last_offline_at over past 72h)
  console.log("\nConfiguring realistic student statuses (200 Studying, 100 Break, 700 Offline)...");
  runSql(`
    WITH ranked_users AS (
      SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) as rnk
      FROM public.users
      WHERE id IN (SELECT id FROM auth.users WHERE email LIKE '%@studyroom.staging')
    )
    UPDATE public.users u
    SET 
      current_status = CASE 
        WHEN r.rnk <= 200 THEN 'studying'
        WHEN r.rnk <= 300 THEN 'break'
        ELSE 'offline'
      END,
      session_start_time = CASE
        WHEN r.rnk <= 200 THEN NOW() - ((r.rnk % 90 + 5) || ' minutes')::interval
        WHEN r.rnk <= 300 THEN NOW() - ((r.rnk % 60 + 30) || ' minutes')::interval
        ELSE NULL
      END,
      last_resumed_at = CASE
        WHEN r.rnk <= 200 THEN NOW() - ((r.rnk % 30 + 1) || ' minutes')::interval
        ELSE NULL
      END,
      break_started_at = CASE
        WHEN r.rnk > 200 AND r.rnk <= 300 THEN NOW() - ((r.rnk % 10 + 1) || ' minutes')::interval
        ELSE NULL
      END,
      active_study_seconds_snapshot = CASE
        WHEN r.rnk <= 200 THEN (r.rnk % 50 * 60)
        WHEN r.rnk <= 300 THEN (r.rnk % 45 * 60)
        ELSE 0
      END,
      last_offline_at = CASE
        WHEN r.rnk > 300 THEN NOW() - ((r.rnk % 2880 + 10) || ' minutes')::interval
        ELSE NULL
      END,
      current_focus = CASE
        WHEN r.rnk <= 200 THEN 'Chapter ' || (r.rnk % 12 + 1) || ' Study'
        ELSE NULL
      END,
      state_version = 1,
      updated_at = NOW()
    FROM ranked_users r
    WHERE u.id = r.id;
  `);

  // 4. Seed active 20h daily goals with tasks for each student
  console.log("\nSeeding active 20h daily goals with varied tasks...");
  runSql(`
    INSERT INTO public.daily_goals (user_id, tasks, expires_at, created_at, is_locked)
    SELECT 
      u.id,
      jsonb_build_array(
        jsonb_build_object('id', gen_random_uuid(), 'text', 'Read Section 1', 'completed', (ROW_NUMBER() OVER ()) % 2 = 0),
        jsonb_build_object('id', gen_random_uuid(), 'text', 'Practice Exercises', 'completed', (ROW_NUMBER() OVER ()) % 3 = 0),
        jsonb_build_object('id', gen_random_uuid(), 'text', 'Review Formulas', 'completed', false)
      ),
      NOW() + ((ROW_NUMBER() OVER () % 18 + 2) || ' hours')::interval,
      NOW() - ((ROW_NUMBER() OVER () % 4) || ' hours')::interval,
      true
    FROM public.users u
    WHERE u.id IN (SELECT id FROM auth.users WHERE email LIKE '%@studyroom.staging')
    ON CONFLICT DO NOTHING;
  `);

  // 5. Seed historical study sessions across the current week for leaderboard realism
  console.log("\nSeeding historical study sessions across current week ($2,000+$ sessions)...");
  runSql(`
    -- Session 1: 2 days ago
    INSERT INTO public.study_sessions (user_id, start_time, end_time, duration_minutes, break_minutes)
    SELECT 
      u.id,
      NOW() - INTERVAL '2 days' - ((ROW_NUMBER() OVER () % 180) || ' minutes')::interval,
      NOW() - INTERVAL '2 days',
      (ROW_NUMBER() OVER () % 90 + 30),
      15
    FROM public.users u
    WHERE u.id IN (SELECT id FROM auth.users WHERE email LIKE '%@studyroom.staging')
    LIMIT 1000;

    -- Session 2: Yesterday
    INSERT INTO public.study_sessions (user_id, start_time, end_time, duration_minutes, break_minutes)
    SELECT 
      u.id,
      NOW() - INTERVAL '1 day' - ((ROW_NUMBER() OVER () % 120) || ' minutes')::interval,
      NOW() - INTERVAL '1 day',
      (ROW_NUMBER() OVER () % 60 + 45),
      10
    FROM public.users u
    WHERE u.id IN (SELECT id FROM auth.users WHERE email LIKE '%@studyroom.staging')
    LIMIT 1000;
  `);

  // 6. Verify total seeded counts
  const finalUsers = parseInt(runSql("SELECT count(*) FROM public.users WHERE id IN (SELECT id FROM auth.users WHERE email LIKE '%@studyroom.staging');").trim(), 10);
  const studyingCount = parseInt(runSql("SELECT count(*) FROM public.users WHERE current_status = 'studying';").trim(), 10);
  const breakCount = parseInt(runSql("SELECT count(*) FROM public.users WHERE current_status = 'break';").trim(), 10);
  const offlineCount = parseInt(runSql("SELECT count(*) FROM public.users WHERE current_status = 'offline';").trim(), 10);
  const totalGoals = parseInt(runSql("SELECT count(*) FROM public.daily_goals;").trim(), 10);
  const totalSessions = parseInt(runSql("SELECT count(*) FROM public.study_sessions;").trim(), 10);

  console.log("\n=== 1,000-STUDENT SEEDING VERIFICATION COMPLETE ===");
  console.log(`  - Total Synthetic Users in public.users: ${finalUsers}`);
  console.log(`  - Users in 'studying' status: ${studyingCount}`);
  console.log(`  - Users in 'break' status: ${breakCount}`);
  console.log(`  - Users in 'offline' status: ${offlineCount}`);
  console.log(`  - Total Active Daily Goals: ${totalGoals}`);
  console.log(`  - Total Historical Study Sessions: ${totalSessions}`);

  process.exit(0);
}

seed1000Students().catch(err => {
  console.error("Seeding failed:", err);
  process.exit(1);
});
