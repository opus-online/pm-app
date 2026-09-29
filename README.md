# pm

Internal project-management CMS. Phase 1 covers authentication, session
management, and the admin user-approval workflow.

**Stack:** Next.js 16 (App Router, TypeScript, server components by default)
+ Supabase (Postgres, Auth, Row Level Security) running locally via Docker.
Cookie-based auth via `@supabase/ssr`; every request passes through
middleware that validates the session and gates routes based on user status
(`pending` / `active` / `disabled`). All mutations are Next.js server
actions. Sessions are **time-boxed to 24 hours** (`[auth.sessions] timebox =
"24h"` in `supabase/config.toml`) with refresh-token rotation on.

> Setting up production on your own accounts? See [docs/DEPLOY.md](docs/DEPLOY.md).

## Prerequisites

- Node.js 22+
- Docker (required to run the local Supabase stack)
- npm

## Setup

```bash
npm install

# Start the local Supabase stack (Postgres, Auth, Studio, etc. in Docker)
npm run db:start

# Copy the env template and fill in the Supabase keys
cp .env.example .env.local
npx supabase status   # prints anon key / service role key for the values below
```

Fill in `.env.local`:

```
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<from `npx supabase status`>
SUPABASE_SERVICE_ROLE_KEY=<from `npx supabase status`>

# Leave the Azure values empty to keep Microsoft sign-in disabled locally —
# see "Microsoft Entra ID setup" below to enable it.
SUPABASE_AUTH_AZURE_CLIENT_ID=
SUPABASE_AUTH_AZURE_SECRET=
SUPABASE_AUTH_AZURE_TENANT_URL=https://login.microsoftonline.com/YOUR-TENANT-ID/v2.0

# Credentials for the first admin account (scripts/seed-admin.mjs)
SEED_ADMIN_EMAIL=admin@example.com
SEED_ADMIN_PASSWORD=change-me-locally
```

Then apply the schema and seed the first admin:

```bash
npm run db:reset      # applies supabase/migrations against a clean local DB,
                       # then loads supabase/seed.sql (demo dataset, below)
npm run seed:admin    # adds your own personal admin on top of the demo data
                       # (reads .env.local)
npm run dev
```

Open http://localhost:3000. Sign in with the seeded admin credentials, or
sign up a new account — new accounts land on `/pending` until an admin
approves them from `/admin/users`.

> `npm run db:reset` wipes all users and reloads the demo dataset below.
> Re-run `npm run seed:admin` immediately after any reset if you want your
> own personal admin login in addition to the demo accounts.

### Demo dataset

`npm run db:reset` runs `supabase/seed.sql` after the migrations, seeding a
demo portfolio: 3 clients, 9 projects (all three billing types and health
states), 16 people with skills/rates/capacities/vacations, budgets with
item history, project links, Vault-backed credentials, and one active
delegation. It also creates six demo logins, one per role, all sharing the
password `Password123!`:

| Email | Role | Notes |
|---|---|---|
| `admin.demo@pmcms.local` | admin | Full access |
| `anna.pm@pmcms.local` | project_manager | PM on 5 projects |
| `bella.pm@pmcms.local` | project_manager | PM on 4 projects; currently on vacation — her active projects are delegated to Milo |
| `frank.fin@pmcms.local` | finance | Global budget + internal-cost + rates access |
| `milo.dev@pmcms.local` | member | Also a `people` row (Senior Backend Developer); holds Bella's active delegation |
| `vera.view@pmcms.local` | viewer | No role permissions — access comes entirely from an explicit, time-limited `view_project`/`view_links` grant on one project |

`npm run seed:admin` creates a **separate** personal admin
(`SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` from `.env.local`) on top of the
demo dataset — it does not replace or depend on the demo accounts above, and
is safe to run before or after them.

## Tests

```bash
npm run test      # Vitest — pure logic: route gate, JWT session-id decode, zod schemas
npm run test:db   # pgTAP — RLS policies + session-management RPCs, run against the local DB
npm run build     # production build / typecheck
```

`npm run test:db` creates its own fixture users inside a rolled-back
transaction and scopes every assertion to those fixtures, so it's safe to run
in either order — against a freshly reset database, or after
`npm run seed:admin` has already created the first admin.

Other useful scripts:

```bash
npm run db:stop    # stop the local Supabase stack
npm run db:types   # regenerate src/lib/database.types.ts from the local DB schema
```

## Microsoft Entra ID setup (optional, for local testing of the Microsoft sign-in button)

1. In the Azure Portal, create an **App registration**.
2. Add a **Web** redirect URI: `http://127.0.0.1:54321/auth/v1/callback`
   (this is Supabase Auth's callback endpoint, not the Next.js app).
3. Create a client secret under **Certificates & secrets**.
4. Note the **Application (client) ID**, the **client secret value**, and
   your **Directory (tenant) ID**.
5. Put them in `.env.local`:
   ```
   SUPABASE_AUTH_AZURE_CLIENT_ID=<application client id>
   SUPABASE_AUTH_AZURE_SECRET=<client secret value>
   SUPABASE_AUTH_AZURE_TENANT_URL=https://login.microsoftonline.com/<tenant id>/v2.0
   ```
6. In `supabase/config.toml`, flip the provider on:
   ```toml
   [auth.external.azure]
   enabled = true
   ```
7. Restart the local stack so the config takes effect:
   ```bash
   npx supabase stop
   npx supabase start
   ```

With the provider disabled (default), the "Sign in with Microsoft" button on
`/login` shows a friendly error instead of failing — email/password auth is
fully functional either way.

## Production checklist

Local dev intentionally runs with some auth settings loosened for
testability. Before deploying to a real (hosted) Supabase project:

- **Enable email confirmations** — local dev has
  `[auth.email] enable_confirmations = false` so signup → pending is
  testable without an inbox. Turn this on in production so users must
  verify their email before it's usable.
- **Set a real `site_url`** — `[auth] site_url` (and
  `additional_redirect_urls`) must point at the production domain, not
  `http://localhost:3000`.
- **Set `NEXT_PUBLIC_SITE_URL`** to the real deployed origin (e.g.
  `https://pm.example.com`) — it feeds the OAuth `redirectTo` for the
  Microsoft sign-in callback (`src/app/actions/auth.ts`); left unset or
  pointed at localhost, production OAuth sign-ins will redirect users back to
  a dead `localhost` URL after authenticating.
- **Match the hosted project's auth settings to `config.toml`:**
  - Session timebox: 24h (`[auth.sessions] timebox = "24h"`), refresh-token
    rotation on (`enable_refresh_token_rotation = true`).
  - Rate limits: `[auth.rate_limit]` — sign-in/sign-up (15 / 5 min/IP),
    token refresh (150 / 5 min/IP), email sends (2/hour), etc. The Supabase
    dashboard's Auth → Rate Limits settings must mirror these.
  - Azure/Entra ID provider settings (client ID/secret/tenant, redirect URI)
    carry over as configured above, pointed at the production callback URL.
- **Rotate the seed-admin password** immediately after first login in any
  non-local environment; `scripts/seed-admin.mjs` is a local-dev bootstrap
  convenience, not a production provisioning tool.
- **Service role key** (`SUPABASE_SERVICE_ROLE_KEY`) must only ever be used
  server-side (it already is, in `src/lib/supabase/admin.ts` for audit
  writes and notifications) — never expose it to the client.

## Architecture notes

- `src/middleware.ts` → `src/lib/supabase/middleware.ts` validates the
  session on every request (`supabase.auth.getUser()`, never
  `getSession()`, per Supabase's guidance) and calls the pure
  `decideRedirect()` gate in `src/lib/auth/gate.ts` to route
  unauthenticated → `/login`, pending → `/pending`, disabled → signed out
  and redirected to `/login?error=account_disabled`.
- All mutations are server actions under `src/app/actions/` (`auth.ts`,
  `admin.ts`, `sessions.ts`); every action re-checks authorization
  server-side via `requireActiveUser()` / `requireAdmin()`
  (`src/lib/auth/session.ts`) — the UI never is the security boundary.
- RLS is enabled on every table (`supabase/migrations/`); session
  listing/revocation goes through `security definer` Postgres functions
  (`list_my_sessions`, `revoke_session`, `admin_revoke_user_sessions`) over
  `auth.sessions`. Audit log writes go through the service-role client so
  the table stays append-only and unreadable to non-admins under RLS.
- Every auth-relevant action (login, failed login, logout, signup,
  approval, status change, session revocation) is recorded in
  `audit_logs`; in-app notifications (`notifications` table) tell admins
  about pending signups and tell users when they've been approved.
