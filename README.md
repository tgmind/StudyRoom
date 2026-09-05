# StudyRoom — Minimalist Live Group Study PWA

**StudyRoom** is a production-ready, mobile-first Progressive Web App (PWA) designed for serious, high-accountability group study.

The product philosophy is grounded in:
- **Long-term consistency over cheap gamification**
- **Accountability over entertainment**
- **Transparent data over vanity metrics**
- **Peer motivation over social-media engagement**
- **User autonomy over forced productivity mechanics**
- **Minimalist monochrome UI with zero distraction**

---

## 🚀 Tech Stack

- **Framework**: Next.js 15+ (App Router, Strict TypeScript)
- **Styling**: Tailwind CSS (Monochrome Dark Theme, Responsive Safe Area Insets)
- **Backend & Database**: Supabase (PostgreSQL, Supabase Auth, Supabase Storage, Supabase Realtime)
- **PWA**: Custom Web App Manifest, Service Worker (`sw.js`), Offline Shell
- **Icons**: Lucide React
- **Testing**: Vitest, React Testing Library, JSDOM

---

## ⚙️ Key Architectural Features

### 1. Authoritative Timestamp-Based Timers
- **`setInterval` is NEVER the source of truth.**
- Study duration is derived strictly from server-side PostgreSQL timestamps (`session_blocks` and `study_sessions`).
- If a user closes their browser, backgrounds the app, or locks their phone screen, elapsed study time remains 100% accurate.

### 2. Global Profile Pictures & Supabase Storage
- Users can upload profile pictures directly in **Onboarding** or **Settings**.
- Stored in Supabase Storage public bucket `avatars`.
- Enforces a strict **2 MB file size limit** and image format validation (`image/jpeg`, `image/png`, `image/webp`, `image/gif`).
- Displayed globally across Live Room member cards, Top Header, Leaderboard, and Settings.

### 3. Active Study & Break Exclusion
- Sessions distinguish between active `study` blocks and `break` blocks.
- **Break time is completely excluded** from study session duration, leaderboard scores, and streak qualifications.

### 4. Rolling 24-Hour Goals (Non-Midnight Reset)
- Goal sets expire exactly **24 hours** after creation (`expires_at = created_at + INTERVAL '24 hours'`).
- Task text is immutable once locked.
- Goal completion states are recorded progressively across sessions using the **Stop Hook**.

### 5. Atomic Stop Hook Transaction
- Finishing a session executes `rpc_finish_session` as an atomic PostgreSQL transaction (`SECURITY DEFINER`).
- Locks the user profile row (`FOR UPDATE`), closes open study/break blocks at server `NOW()`, computes active study minutes, saves checked goal tasks, inserts `study_sessions`, and sets user status to `offline`.

### 6. Dual-Pillar Goal Index Leaderboard Engine (50/30/20)
Score is calculated out of 100 points:
- **50% Study Hours Component (Volume Output)**: `(user_weekly_study_minutes / peak_group_weekly_study_minutes) * 100`
- **30% Goal Completion Component (Discipline Follow-Through)**: Dual-Pillar blend:
  - 60% Task Volume Factor: `MIN((completed_tasks / target_completed_tasks) * 100, 100)` (Dynamic benchmark, min 3, max 15)
  - 40% Follow-Through Factor: `(completed_tasks / MAX(3, total_tasks)) * 100` (Honors planning discipline)
- **20% Consistency / Streak Component**: `MIN(qualifying_streak_days / 7.0, 1.0) * 100` (Qualifying day = >= 30 active study minutes).

### 7. Weekly Achiever Badge
- Every Monday morning, `rpc_calculate_weekly_achiever()` evaluates the previous week's performance (Monday to Sunday) and awards the **⭐ Achiever Badge** to the #1 top performer.

---

## 🛠️ Supabase Manual Setup Guide

### 1. Database & Storage Initialization
Run `supabase/schema.sql` against your Supabase PostgreSQL instance:
1. Open your Supabase Dashboard -> **SQL Editor**.
2. Copy and paste the complete contents of `supabase/schema.sql`.
3. Click **Run**.

This automatically initializes:
- All database tables (`users`, `daily_goals`, `study_sessions`, `session_blocks`, `push_subscriptions`)
- Row Level Security (RLS) policies for user data privacy
- RPC Functions (`rpc_start_session`, `rpc_pause_session`, `rpc_resume_session`, `rpc_finish_session`, `rpc_stop_user_session`, `rpc_acknowledge_break_expiry`, `rpc_cleanup_expired_breaks`, `rpc_create_daily_goal`, `rpc_get_leaderboard`, `rpc_calculate_weekly_achiever`)
- Supabase Realtime publication configuration with `REPLICA IDENTITY FULL` for `public.users`, `public.study_sessions`, and `public.daily_goals`
- **Supabase Storage Bucket `avatars`** (Public bucket with 2 MB file size limit and storage RLS policies)

### 2. Manual Storage Bucket Verification (Dashboard UI Alternative)
If you prefer configuring the `avatars` bucket manually in the Supabase Dashboard UI:
1. Go to **Storage** -> **New Bucket**.
2. Bucket Name: `avatars`.
3. Toggle **Public Bucket**: **ON** (Enabled).
4. File size limit: `2097152` (2 MB).
5. Allowed MIME types: `image/jpeg, image/jpg, image/png, image/webp, image/gif`.
6. Click **Save**.

### 3. Environment Variables Setup
Create `.env.local` based on `.env.example`:
```bash
cp .env.example .env.local
```
Add your Supabase project credentials:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
NEXT_PUBLIC_APP_TIMEZONE=UTC
```

### 4. Weekly Achiever Scheduling (pg_cron)
To automatically calculate the weekly achiever every Monday at 00:00 UTC:
```sql
SELECT cron.schedule(
  'weekly-achiever-badge',
  '0 0 * * 1',
  $$SELECT public.rpc_calculate_weekly_achiever()$$
);
```

---

## 🧪 Running Validation & Tests

```bash
# 1. Run Unit & Component Tests (Vitest)
npm test

# 2. Run TypeScript Validation
npx tsc --noEmit

# 3. Run ESLint Code Quality Audit
npm run lint

# 4. Run Next.js Production Build
npm run build

# 5. Start Production Server
npm start
```

---

## 📱 PWA Features & Responsive Viewports

- **Installable PWA**: Includes standalone manifest (`public/manifest.json`), service worker (`public/sw.js`), and offline fallback shell (`public/offline.html`).
- **Mobile-First Touch Navigation**: Sticky bottom navigation bar with `min-h-[44px]` touch targets and safe area inset padding (`pb-[env(safe-area-inset-bottom)]`).
- **Responsive Viewport Support**: Tested across 360×800, 390×844, 412×915, 768×1024, and 1440×900 layout viewports.
