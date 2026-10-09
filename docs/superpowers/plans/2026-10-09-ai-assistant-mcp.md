# AI Assistant (MCP) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per-user AI access keys and a Streamable HTTP MCP endpoint (`/api/mcp`) whose tools act as the key's user under RLS, with no delete/credential/admin capabilities, rate limiting and audit.

**Architecture:** Keys live in `mcp_keys` (hash only). The route handler resolves the Bearer key via a service-role RPC, enforces a per-key rate limit, mints a 5-minute HS256 JWT for the user and builds a user-scoped Supabase client; every tool runs through that client so existing RLS/RPC permission checks apply. Tools are plain functions in `src/lib/mcp/tools/*` registered with `mcp-handler`. Settings gets a self-service key card; User access gets an admin key list.

**Tech Stack:** Next.js 16 route handler, `mcp-handler` 2.x + `@modelcontextprotocol` SDK (exact package names/APIs verified from installed `node_modules` docs/types), `jose` for JWT, Supabase (RLS, pgTAP), zod v4, vitest.

**Spec:** `docs/superpowers/specs/2026-10-09-ai-assistant-mcp-design.md`

## Global Constraints
- Next.js 16 differs from training data — read `node_modules/next/dist/docs/` (route handlers, middleware) and the installed `mcp-handler` README/types before writing endpoint code.
- The MCP route must be reachable without a session cookie: exclude `/api/mcp` from the auth middleware redirect (`src/middleware.ts` matcher or `updateSession` early return) — never let it redirect to /login.
- Never expose service-role power to tools: the service-role client is used ONLY for `mcp_resolve_key`, `mcp_bump_usage` and audit writes; every tool query uses the user-scoped client.
- Tool registry contains NO delete tools, NO credential tools, NO user/role/access/delegation/settings tools. Enforced by a vitest over the registered names.
- Every write tool: zod-validates (reuse `src/lib/validation/*` schemas), maps DB errors to friendly text (never raw), writes `audit_logs` with `metadata.via='mcp'` + `key_id`, returns a short summary + absolute app URL.
- Dates in tool output `dd.mm.yyyy` (`formatDateEt`); "today" via `appDayKey`.
- Local Supabase only during work; NEVER `--linked`. New env var `SUPABASE_JWT_SECRET` (local value from `npx supabase status`, key "JWT secret").
- base-ui `render` never `asChild`; no help texts beyond the one-time key display instructions (the connect command is content, not a help text).

## Review Focus
1. A key for a user without Sales calling a sales write tool must fail with a permission message (RLS/RPC), not succeed via any service-role path — integration test Task 3/4.
2. Revoked, expired, or disabled-user keys → 401 before any tool runs — pgTAP Task 1 + integration Task 3.
3. A key from user A can never act as user B (JWT `sub` = resolved user only) — vitest Task 2.
4. Rate limit: call 61 within a minute is refused and nothing is written — vitest Task 3.
5. Middleware does not redirect `/api/mcp` to /login (curl returns 401 JSON, not 307) — Task 3.

---

### Task 1: Database — keys, usage, resolver
**Files:** Create `supabase/migrations/20261009000001_mcp_keys.sql`, `supabase/tests/phase15_mcp_keys.test.sql`.
- `mcp_keys` + `mcp_key_usage` per spec; RLS + column grants per spec (own rows; admin all; no delete; update only `revoked_at, revoked_by, label`; insert own with `revoked_at is null`, `expires_at > now()` and `expires_at <= now() + interval '366 days'`).
- `mcp_resolve_key(p_hash text) returns table(key_id uuid, user_id uuid)` SECURITY DEFINER, `set search_path = public`, revoke from public/anon/authenticated, grant to service_role; returns a row only when key not revoked, not expired, profile status `active`; sets `last_used_at`.
- `mcp_bump_usage(p_key_id uuid) returns int` SECURITY DEFINER, service_role only; upserts `(key_id, date_trunc('minute', now()))` calls+1, deletes rows older than 1 hour for that key, returns current calls.
- pgTAP (≥10): own insert ok; insert for another user rejected; cannot read others' keys; admin reads all; cannot delete; revoke own; authenticated cannot execute the two functions; resolver returns user for valid key and nothing for revoked/expired/disabled user; bump counts 1,2,3.
- Verify `npm run db:reset && npm run test:db`; commit `feat(mcp): access keys schema and resolver`.

### Task 2: Key library + key actions
**Files:** Create `src/lib/mcp/keys.ts` (`generateKey(): { key, hash, prefix }`, `hashKey(key)`), `src/lib/mcp/user-client.ts` (`mintUserJwt(userId, secret, ttlSeconds=300)`, `createUserScopedClient(userId)`), `src/app/actions/mcp-keys.ts` (`createMcpKeyAction({label, days: 30|90|365}) → { success, key, id }`, `revokeMcpKeyAction(id)`), validation `src/lib/validation/mcp.ts`; tests `tests/mcp-keys.test.ts`, `tests/mcp-jwt.test.ts`.
- Install `jose`. JWT claims: `sub`, `role: 'authenticated'`, `aud: 'authenticated'`, `exp`, `iat`; HS256 with `SUPABASE_JWT_SECRET`. User-scoped client = supabase-js with anon key + `global.headers.Authorization: Bearer <jwt>`, `auth.persistSession=false`.
- Actions: `requireActiveUser`; insert via the user's cookie client (RLS); audit `mcp_key.created`/`mcp_key.revoked` (extend `AuditAction`). Key returned once, never stored.
- Vitest: key prefix/length/charset, hash deterministic, JWT verifies with the secret and has the exact claims, different users → different `sub`.
- Integration check: mint a JWT for sara locally and confirm `select auth.uid()`-dependent query (e.g. `has_permission` via rpc) works with the scoped client.
- Commit `feat(mcp): key generation, user-scoped client, key actions`.

### Task 3: MCP endpoint, auth, rate limit, read tools
**Files:** Install `mcp-handler` (+ its SDK peer). Create `src/app/api/mcp/route.ts` (or the path the library requires for Streamable HTTP at `/api/mcp`), `src/lib/mcp/auth.ts` (`authenticateRequest(req) → { userId, keyId } | Response 401/429`), `src/lib/mcp/instructions.ts`, `src/lib/mcp/registry.ts` (tool list + `FORBIDDEN_NAME_PATTERN`), `src/lib/mcp/tools/read.ts` (whoami, search, list_projects, get_project, list_clients, get_client, list_people, get_person, get_workload, list_time_entries, get_budget), `src/lib/mcp/format.ts` (dd.mm.yyyy, app URLs from `NEXT_PUBLIC_SITE_URL`); modify `src/middleware.ts` / `src/lib/supabase/middleware.ts` to skip `/api/mcp`; tests `tests/mcp-registry.test.ts`, `tests/mcp-auth.test.ts`.
- Auth: Bearer header required; hash → `mcp_resolve_key` (service client) → none = 401 JSON; `mcp_bump_usage` > 60 = 429-style MCP error; then tools get `{ supabase: userScopedClient, userId, keyId }`.
- Read tools return compact text/JSON, respect RLS (empty/absent finance fields when not visible), cap lists (≤50 rows) and say when truncated.
- Vitest: registry has no names matching `/delete|remove|credential|secret|password|role|access|delegat|user_admin|setting/i`; auth rejects missing/invalid headers; rate-limit decision function.
- Integration (curl against `npx next dev` on a free port with a real key): `initialize`, `tools/list`, `whoami`, `list_projects`; no-key → 401 JSON (not a 307 to /login); revoked key → 401.
- Commit `feat(mcp): endpoint, auth, rate limit, read tools`.

### Task 4: Sales tools
**Files:** Create `src/lib/mcp/tools/sales.ts` (read: sales_overview, get_company, my_next_steps; write: log_activity, plan_step, complete_step, update_step, cancel_step, move_entry_to_steps, create_lead, update_deal, save_offer); register; tests `tests/mcp-sales-tools.test.ts` (input schemas, error mapping).
- Writes call the same RPCs / table writes as `src/app/actions/sales.ts` but through the user-scoped client (extract shared pure pieces where it avoids duplication — e.g. the RPC error mappers into `src/lib/sales/rpc-errors.ts` used by both); same validation schemas; audit with via=mcp.
- Integration: as sara plan → complete a step via curl; as bella sales tools return a permission error and write nothing.
- Commit `feat(mcp): sales tools`.

### Task 5: Project tools
**Files:** Create `src/lib/mcp/tools/projects.ts` (post_status_update, update_project [allowlisted fields; preserve `_icon:` tag], log_time, add_budget_item, update_budget_item); register; tests.
- Reuse validation from `src/lib/validation/project.ts` / time-entry / budget schemas; RLS decides rights (PM own projects, finance budgets); audit via=mcp.
- Integration: anna updates her project's deadline and posts a status update; bella cannot edit a project she doesn't manage; a non-finance user's add_budget_item fails cleanly.
- Commit `feat(mcp): project tools`.

### Task 6: UI — Settings card + admin key list
**Files:** Create `src/app/(app)/settings/ai-assistant-card.tsx`, `src/app/(app)/admin/users/mcp-keys-section.tsx`; modify settings page and admin users page.
- Settings card: create (label, expiry 30/90/365 default 90) → one-time panel with key and copy buttons for the Claude Code command (`claude mcp add -s user --transport http pm-cms <origin>/api/mcp --header "Authorization: Bearer <key>"`) and the Claude Desktop `mcp-remote` JSON; table of own keys (label, prefix…, created, expires, last used — all dd.mm.yyyy — status) with Revoke (ConfirmDialog).
- Admin section on User access: all keys (user name, label, prefix, last used, expires, status) with Revoke.
- Browser check; commit `feat(mcp): settings key card and admin key list`.

### Task 7: End-to-end verification
- All suites + build. Real Claude Code connection to the local app with a key (`claude mcp add` to a temporary scope/config, run a short session: read a company, plan a step, mark it done), confirm audit rows `via=mcp`; remove the test MCP config and key afterwards.
- Deploy notes: `db push` (1 migration), add `SUPABASE_JWT_SECRET` to Vercel (Production), redeploy, test with a real key on production.
