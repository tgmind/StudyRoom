# Supabase Automated GitHub Deployments (Method A)

This project is configured with a GitHub Actions workflow ([`.github/workflows/supabase-deploy.yml`](../.github/workflows/supabase-deploy.yml)) that automatically applies SQL schema updates to your live Supabase database whenever changes are pushed to GitHub `main` (just like Netlify automatically deploys your Next.js frontend).

---

## 3-Minute Setup Instructions (Do this whenever you are ready)

### Step 1: Locate Your Supabase Project Details
1. Open your [Supabase Dashboard](https://supabase.com/dashboard/project/mshudehtxhsmnojrjlls).
2. Note your **Project Reference ID**:
   * It is in the URL: `mshudehtxhsmnojrjlls`
3. Note your **Database Password**:
   * The password you set when creating the Supabase project.
   * *(If you forgot it, you can reset it in **Project Settings -> Database -> Database Password**)*.

---

### Step 2: Generate a Supabase Personal Access Token
1. In the Supabase Dashboard, click your **User Avatar** (top-right corner) -> **Access Tokens** (or visit [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens)).
2. Click **Generate New Token**.
3. Name it: `StudyRoom GitHub Actions`
4. Copy the generated token (it starts with `sbp_...`).

---

### Step 3: Add the 3 Secrets to Your GitHub Repository
1. Open your GitHub repository in your browser:
   **[github.com/tgmind/StudyRoom](https://github.com/tgmind/StudyRoom)**
2. Click **Settings** (tab at the top).
3. In the left sidebar, expand **Secrets and variables** -> click **Actions**.
4. Click the green **New repository secret** button and add these three secrets:

| Secret Name | Value to Enter |
| :--- | :--- |
| `SUPABASE_PROJECT_ID` | `mshudehtxhsmnojrjlls` |
| `SUPABASE_DB_PASSWORD` | *(your Supabase database password)* |
| `SUPABASE_ACCESS_TOKEN` | *(the token starting with `sbp_...` from Step 2)* |

---

## How It Works Once Configured

1. Whenever code is pushed to GitHub that modifies files under `supabase/**` (such as `supabase/schema.sql`):
   * **Netlify** automatically deploys the frontend web app.
   * **GitHub Actions** automatically runs the `Deploy Supabase SQL Migrations` workflow to apply the SQL changes directly to your live database.
2. You can also manually trigger the workflow anytime from the **Actions** tab in GitHub by clicking **Deploy Supabase SQL Migrations** -> **Run workflow**.
