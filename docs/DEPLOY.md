# Production setup (fresh, on your own accounts)

How to stand up a clean production copy of the app on your own GitHub,
Supabase and Vercel accounts. Production starts **empty** — no demo data —
with one admin account (you). Local development is covered in the
[README](../README.md).

Allow about an hour. You need: a GitHub account, a Supabase account, a
Vercel account, and on your machine Git, Node.js 22+ and Docker Desktop.

---

## 1. Get the code

Either accept the repo transfer you were sent, or create an empty **private**
repo on GitHub and push the code to it. Then clone it locally:

```bash
git clone git@github.com:<you>/pm-app.git
cd pm-app
npm install
```

## 2. Create the Supabase project

1. In the [Supabase dashboard](https://supabase.com/dashboard) → **New project**.
   - Region: **Central EU (Frankfurt)** — the app's servers run in Frankfurt
     too (`vercel.json`), keeping them close keeps the app fast.
   - Save the database password somewhere safe.
2. Note the **project ref** (the `xxxxxxxx` in `https://xxxxxxxx.supabase.co`).
3. **Project Settings → API Keys → "Legacy API keys" tab**: copy the `anon`
   and `service_role` keys. Use these legacy JWT keys — the newer
   `sb_secret_…` key does not work with the admin calls this app makes.

> The free plan pauses the database after a week without activity (the app
> then shows a 504 error until you restore it in the dashboard). For real
> daily use, upgrade to **Pro**.

## 3. Create the database schema

From the project folder:

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push
```

`db push` runs every file in `supabase/migrations/` — all tables, security
rules (RLS), functions and the avatar storage bucket. It asks to confirm;
answer yes.

**Do not run `supabase/seed.sql` against production** — that is the demo
dataset (fake clients, projects and `@pmcms.local` logins).

## 4. Configure Supabase Auth (dashboard)

**Authentication → URL Configuration**
- Site URL: your production URL (you get it in step 5 — come back and set
  it then, e.g. `https://pm-app-xyz.vercel.app`).
- Redirect URLs: add `https://<your-prod-url>/auth/callback` and
  `http://localhost:3000/auth/callback`.

**Authentication → Providers → Email / Sign In settings**
- Minimum password length: **12**.
- Confirm email: **on** (users must verify their address).

**Authentication → Sessions** (Pro plan only): time-box user sessions to
**24 hours**. On the free plan skip this.

> Don't use `npx supabase config push` for this unless you know what it
> does: it copies `supabase/config.toml`, which holds *local* settings
> (localhost URLs, confirmations off) and would overwrite production's.

## 5. Deploy on Vercel

1. [Vercel](https://vercel.com/new) → **Add New… → Project** → import your
   GitHub repo. Framework is detected as Next.js; keep the defaults.
2. Before clicking Deploy, add **Environment Variables**:

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | legacy `anon` key |
   | `SUPABASE_SERVICE_ROLE_KEY` | legacy `service_role` key |
   | `NEXT_PUBLIC_SITE_URL` | your production URL (set after first deploy if you don't know it yet, then redeploy) |

3. Deploy. Your URL appears on the project page (e.g.
   `pm-app-xyz.vercel.app`; a custom domain can be added under
   **Settings → Domains**).
4. Go back to step 4 and put that URL into Supabase's Site URL + Redirect
   URLs. If you set `NEXT_PUBLIC_SITE_URL` only now, redeploy
   (**Deployments → ⋯ → Redeploy**).

From now on every push to `master` deploys automatically, and every other
branch gets its own preview URL.

> Vercel's free Hobby plan is for non-commercial use only; a company tool
> should run on **Pro**.

## 6. Create your admin account

Create a file `.env.production.local` (it's git-ignored — never commit it):

```
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<legacy service_role key>
SEED_ADMIN_EMAIL=<your email>
SEED_ADMIN_PASSWORD=<a strong password, 12+ characters>
```

Run:

```bash
node --env-file=.env.production.local scripts/seed-admin.mjs
```

Then sign in on the production URL. Delete `.env.production.local` (or at
least the password line) afterwards — the service_role key bypasses all
security rules and must never leave your machine or be committed.

Other people sign up on the login page and wait on "pending" until you
approve them under **Admin → Users**, where you also give them their role.

---

## Day-to-day

**Changing data** (projects, people, budgets…): do it in the app. The app
enforces permissions and records everything in the activity log. Editing
tables directly in the Supabase Table Editor skips both.

**Changing code** — never straight on `master`:

1. Work locally (`npm run db:start` → `npm run dev`; see README). The local
   database is separate from production, so nothing live can break.
2. Push to a branch → Vercel builds a preview URL → check it.
3. Merge to `master` → production deploys automatically.

**Database changes** (new migration in `supabase/migrations/`): test locally
with `npm run db:reset`, then after merging run `npx supabase db push`
against production. Push the migration *before* or together with the code
that needs it.

**Checks before merging**: `npm run test`, `npm run test:db`, `npm run build`.

## Troubleshooting

- **504 / app won't load** → the free-tier Supabase project paused. Restore
  it in the Supabase dashboard (takes ~5 min).
- **Login redirects to localhost** → `NEXT_PUBLIC_SITE_URL` or the Supabase
  Site URL still points at localhost.
- **"Invalid API key" / admin actions fail** → you used the new
  `sb_secret_…` key; switch to the legacy `service_role` key.
