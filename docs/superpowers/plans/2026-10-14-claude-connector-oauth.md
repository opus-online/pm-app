# Claude Connector Login (OAuth) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Business users connect claude.ai (web/desktop/phone, on their Claude subscription) to the PM app's existing `/api/mcp` endpoint by logging in and approving access — no terminal, no copied keys.

**Architecture:** Supabase Auth's OAuth 2.1 server (beta) is the authorization server (client registration, codes+PKCE, tokens, refresh). We add: a consent page at `/oauth/consent`, an `mcp_connections` table (one row per user+client, with Read only / Read and write), RFC 9728 protected-resource metadata, and acceptance of Supabase OAuth access tokens on `/api/mcp` next to the existing `pmk_` keys. After authentication everything (tools, RLS, rate limit, audit, read-only rules) is the existing pipeline.

**Tech Stack:** Next.js 16 App Router, Supabase (Auth OAuth server, Postgres/RLS, pgTAP), supabase-js 2.110.4 (`auth.oauth.*`, `auth.getClaims`), mcp-handler (`getPublicOrigin`), zod v4, vitest, shadcn base-nova on @base-ui/react.

**Spec:** `docs/superpowers/specs/2026-10-14-claude-connector-oauth-design.md`

## Global Constraints

- Read `node_modules/next/dist/docs/` before Next-specific code (AGENTS.md): this Next version differs from training data.
- Existing `pmk_` key auth must keep working unchanged (all current mcp tests stay green).
- Read only is the default everywhere a connection is created; write is an explicit choice.
- No delete tools; tool registry unchanged.
- No help texts/explanatory paragraphs in app UI (client rule); short labels only. The consent page may state *what is being granted* (that's the decision, not help text).
- base-ui components: `render` prop, never `asChild`; `onClick` not `onSelect`.
- Every new table: RLS on + explicit grants (local `auto_expose_new_tables` is off).
- Server→client props: allowlisted row shapes only (never spread DB rows).
- Allowed OAuth redirect URIs: exactly `https://claude.ai/api/mcp/auth_callback`, `https://claude.com/api/mcp/auth_callback`, or any `http://localhost:<port>/<path>` / `http://127.0.0.1:<port>/<path>`.
- `next` after login is honoured only for `/oauth/consent` (open-redirect guard).
- Commit after each task with `Co-Authored-By: Claude <noreply@anthropic.com>`.

**Deviations from spec (deliberate, small):**
- `mcp_key_usage.key_id` keeps its name (FK dropped, now holds a key id *or* connection id) instead of a rename to `credential_id` — avoids rewriting the counter function; documented with a column comment.
- Connections are created/revoked via two SECURITY DEFINER RPCs (`mcp_connect`, `mcp_disconnect`) instead of column grants + trigger — smaller surface.
- Admin sees all connections (read-only list); per-connection admin Disconnect is dropped: Supabase would silently re-approve an admin-revoked client on reconnect (consent already given), leaving a broken loop. To cut someone off, admins disable the user (already blocks everything). Users disconnect their own.

## Review Focus

1. A disconnected connection whose access token hasn't expired yet → `/api/mcp` must answer 401 immediately (Task 1 pgTAP `mcp_resolve_connection` revoked case; Task 2 resolver test).
2. An ordinary browser-session JWT (no `client_id` claim) sent to `/api/mcp` → 401, never treated as a connection (Task 2 `oauthIdentity` test).
3. `/login?next=` with `//evil.com`, `https://evil.com`, `/oauth/consent/../dashboard`, `/\evil` → falls back to `/dashboard` (Task 4 `safeNextPath` tests).
4. Look-alike redirect URIs (`https://claude.ai.evil.com/api/mcp/auth_callback`, `http://claude.ai/...`, callback with `?x=1`, `https://user@claude.ai/...`) → consent refused (Task 5 `isAllowedRedirectUri` tests).
5. Approving an authorization that belongs to a different logged-in user → refused, no connection row created (Task 5 `consentProblem` test + action ordering).

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/20261014000001_mcp_connections.sql` | table, RLS, `mcp_connect` / `mcp_disconnect` / `mcp_resolve_connection`, usage FK drop |
| `supabase/tests/phase16_mcp_connections.test.sql` | pgTAP for the above |
| `supabase/config.toml` | enable local OAuth server + DCR |
| `src/lib/mcp/auth.ts` | credential parsing (key vs JWT), `oauthIdentity`, `authenticateRequest` w/ both resolvers + `WWW-Authenticate` |
| `src/lib/mcp/oauth-metadata.ts` (new, pure) | resource/metadata URLs + RFC 9728 document |
| `src/lib/mcp/oauth-consent.ts` (new, pure) | `isAllowedRedirectUri`, `consentProblem` |
| `src/lib/mcp/access-labels.ts` (new, pure) | Read only / Read and write labels shared by settings + consent |
| `src/lib/mcp/server.ts` | `resolveOAuthToken`, client choice per credential kind, audit metadata |
| `src/lib/mcp/user-client.ts` | `createTokenClient(accessToken)` |
| `src/lib/mcp/types.ts`, `tools/read.ts` | `via` on ToolContext; whoami for connections |
| `src/app/api/mcp/route.ts` | wire OAuth resolver + challenge URL |
| `src/app/.well-known/oauth-protected-resource/[[...path]]/route.ts` (new) | discovery document |
| `src/middleware.ts`, `src/lib/supabase/middleware.ts` | skip session for `/.well-known/…`; pass `search` to gate |
| `src/lib/auth/gate.ts` | `safeNextPath`, consent-aware login redirects |
| `src/app/(auth)/login/page.tsx`, `login-form.tsx`, `src/app/actions/auth.ts` | carry `next` through sign-in |
| `src/app/oauth/layout.tsx`, `src/app/oauth/consent/page.tsx`, `consent-form.tsx` (new) | consent UI |
| `src/app/actions/mcp-connections.ts` (new) | approve / deny / disconnect |
| `src/lib/mcp/key-display.ts` | `McpConnectionRow` + `toMcpConnectionRows` |
| `src/app/(app)/settings/ai-assistant-card.tsx`, `settings/page.tsx` | Connected apps list + Disconnect |
| `src/app/(app)/admin/users/mcp-keys-section.tsx` | all connections (read-only) |
| `src/lib/audit.ts`, `src/app/(app)/activity/types.ts` | `mcp_connection.created` / `.revoked` |

---

### Task 1: Database — connections table, RPCs, local OAuth server

**Files:**
- Create: `supabase/migrations/20261014000001_mcp_connections.sql`
- Create: `supabase/tests/phase16_mcp_connections.test.sql`
- Modify: `supabase/config.toml` (`[auth.oauth_server]` section)
- Modify: `src/lib/database.types.ts` (regenerated)

**Interfaces:**
- Produces: `public.mcp_connections(id, user_id, client_id, client_name, can_write, created_at, last_used_at, revoked_at, revoked_by)`; RPCs `mcp_connect(p_client_id text, p_client_name text, p_can_write boolean) → uuid` (authenticated), `mcp_disconnect(p_id uuid) → text` (authenticated; returns the client_id or null), `mcp_resolve_connection(p_user uuid, p_client text) → table(connection_id uuid, can_write boolean)` (service_role only).

- [ ] **Step 1: Write the pgTAP test** `supabase/tests/phase16_mcp_connections.test.sql`

```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

-- fixtures: u1, u2 (active), dis (disabled)
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, encrypted_password, created_at, updated_at) values
  ('fd000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','u1-conn@test.local','{"full_name":"U1"}','{}','',now(),now()),
  ('fd000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','u2-conn@test.local','{"full_name":"U2"}','{}','',now(),now()),
  ('fd000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dis-conn@test.local','{"full_name":"Dis"}','{}','',now(),now());
update public.user_profiles set status='active' where id::text like 'fd000000-%';
update public.user_profiles set status='disabled' where id='fd000000-0000-4000-8000-000000000003';
-- u1's connection with a known id, so u2's disconnect attempt targets a real row it can't see
insert into public.mcp_connections (id, user_id, client_id, client_name) values
  ('fd100000-0000-4000-8000-000000000001','fd000000-0000-4000-8000-000000000001','client-b','Other app');

-- privileges
select is(has_table_privilege('authenticated', 'public.mcp_connections', 'INSERT'), false, 'authenticated cannot insert connections directly');
select is(has_table_privilege('authenticated', 'public.mcp_connections', 'UPDATE'), false, 'authenticated cannot update connections directly');
select is(has_function_privilege('authenticated', 'public.mcp_resolve_connection(uuid, text)', 'EXECUTE'), false, 'authenticated cannot resolve connections');
select is(has_function_privilege('anon', 'public.mcp_connect(text, text, boolean)', 'EXECUTE'), false, 'anon cannot connect');
select is(has_function_privilege('service_role', 'public.mcp_resolve_connection(uuid, text)', 'EXECUTE'), true, 'service_role can resolve connections');

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"fd000000-0000-4000-8000-000000000001","role":"authenticated"}';

-- connect: default read-only, then reconnect with write replaces the active row
select isnt(public.mcp_connect('client-a', 'Claude', false), null, 'u1 can connect a client');
select is((select count(*)::int from public.mcp_connections where client_id='client-a' and revoked_at is null), 1, 'one active connection');
select isnt(public.mcp_connect('client-a', 'Claude', true), null, 'u1 can reconnect the same client');
select is((select count(*)::int from public.mcp_connections where client_id='client-a' and revoked_at is null), 1, 'reconnect leaves exactly one active row');
select is((select can_write from public.mcp_connections where client_id='client-a' and revoked_at is null), true, 'reconnect stores the new access');

-- u2 cannot see or disconnect u1's connection
set local "request.jwt.claims" to '{"sub":"fd000000-0000-4000-8000-000000000002","role":"authenticated"}';
select is((select count(*)::int from public.mcp_connections where user_id='fd000000-0000-4000-8000-000000000001'), 0, 'u2 cannot see u1 connections');
select is(public.mcp_disconnect('fd100000-0000-4000-8000-000000000001'), null, 'u2 cannot disconnect u1 connections');

-- disabled user cannot connect
set local "request.jwt.claims" to '{"sub":"fd000000-0000-4000-8000-000000000003","role":"authenticated"}';
select throws_ok($$ select public.mcp_connect('client-a', 'Claude', false) $$, '42501', null, 'disabled user cannot connect');

reset role;
-- resolver: active row resolves with can_write; after disconnect it doesn't
select is((select can_write from public.mcp_resolve_connection('fd000000-0000-4000-8000-000000000001', 'client-a')), true, 'resolver returns can_write for an active connection');

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"fd000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is(public.mcp_disconnect((select id from public.mcp_connections where client_id='client-a' and revoked_at is null)), 'client-a', 'u1 disconnect returns the client id');

reset role;
select is((select count(*)::int from public.mcp_resolve_connection('fd000000-0000-4000-8000-000000000001', 'client-a')), 0, 'resolver returns nothing after disconnect');

select * from finish();
rollback;
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx supabase test db`
Expected: FAIL in `phase16_mcp_connections` (relation `public.mcp_connections` does not exist).

- [ ] **Step 3: Write the migration** `supabase/migrations/20261014000001_mcp_connections.sql`

```sql
-- claude.ai connector login (OAuth): one row per (user, OAuth client) the user approved, with the
-- access level chosen on the consent page. Spec: docs/superpowers/specs/2026-10-14-claude-connector-oauth-design.md
-- Supabase Auth issues the tokens; this row is the gate /api/mcp checks on every request, so a
-- disconnect works immediately even while an access token is still unexpired.

create table public.mcp_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles (id) on delete cascade,
  client_id text not null check (char_length(client_id) between 1 and 200),
  client_name text not null check (char_length(client_name) between 1 and 200),
  can_write boolean not null default false,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references public.user_profiles (id)
);
create unique index mcp_connections_active_uidx
  on public.mcp_connections (user_id, client_id) where revoked_at is null;

alter table public.mcp_connections enable row level security;
create policy "view own mcp_connections" on public.mcp_connections for select
  using (user_id = auth.uid() or public.is_admin());

-- Reads only; every write goes through the definer functions below.
revoke all on public.mcp_connections from anon, authenticated;
grant select (id, user_id, client_id, client_name, can_write, created_at, last_used_at, revoked_at, revoked_by)
  on public.mcp_connections to authenticated;
grant select, insert, update, delete on public.mcp_connections to service_role;

-- Called by the consent page's Allow action as the logged-in user. Replaces any active row for
-- the same client (reconnect = fresh choice of access).
create function public.mcp_connect(p_client_id text, p_client_name text, p_can_write boolean)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null or not exists (
    select 1 from public.user_profiles where id = v_uid and status = 'active'
  ) then
    raise exception 'Only active users can connect apps' using errcode = '42501';
  end if;

  update public.mcp_connections
     set revoked_at = now(), revoked_by = v_uid
   where user_id = v_uid and client_id = p_client_id and revoked_at is null;

  insert into public.mcp_connections (user_id, client_id, client_name, can_write)
  values (v_uid, p_client_id, left(p_client_name, 200), coalesce(p_can_write, false))
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.mcp_connect(text, text, boolean) from public, anon;
grant execute on function public.mcp_connect(text, text, boolean) to authenticated;

-- Own connections only. Returns the OAuth client id (so the caller can also revoke the Supabase
-- grant) or null when nothing matched.
create function public.mcp_disconnect(p_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client text;
begin
  update public.mcp_connections
     set revoked_at = now(), revoked_by = auth.uid()
   where id = p_id and user_id = auth.uid() and revoked_at is null
  returning client_id into v_client;
  return v_client;
end;
$$;
revoke all on function public.mcp_disconnect(uuid) from public, anon;
grant execute on function public.mcp_disconnect(uuid) to authenticated;

-- Service-role lookup used by /api/mcp for OAuth tokens; mirrors mcp_resolve_key (active row,
-- active profile, throttled last_used_at stamp).
create function public.mcp_resolve_connection(p_user uuid, p_client text)
returns table (connection_id uuid, can_write boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_write boolean;
begin
  select c.id, c.can_write into v_id, v_write
    from public.mcp_connections c
   where c.user_id = p_user
     and c.client_id = p_client
     and c.revoked_at is null
     and exists (select 1 from public.user_profiles p where p.id = c.user_id and p.status = 'active');

  if v_id is null then
    return;
  end if;

  update public.mcp_connections
     set last_used_at = now()
   where id = v_id
     and (last_used_at is null or last_used_at < now() - interval '1 minute');

  connection_id := v_id;
  can_write := v_write;
  return next;
end;
$$;
revoke all on function public.mcp_resolve_connection(uuid, text) from public, anon, authenticated;
grant execute on function public.mcp_resolve_connection(uuid, text) to service_role;

-- Rate-limit counters now serve both credential kinds (uuids never collide).
alter table public.mcp_key_usage drop constraint mcp_key_usage_key_id_fkey;
comment on column public.mcp_key_usage.key_id is 'mcp_keys.id or mcp_connections.id';
```

- [ ] **Step 4: Enable the local OAuth server** — in `supabase/config.toml` `[auth.oauth_server]` set `enabled = true` and `allow_dynamic_registration = true` (leave `authorization_url_path = "/oauth/consent"`).

- [ ] **Step 5: Apply, regenerate types, run tests**

```
npx supabase stop
npx supabase start
npx supabase migration up --local
npx supabase gen types typescript --local > src/lib/database.types.ts
npx supabase test db
```
Expected: all pgTAP files PASS (incl. phase15 and new phase16). `git diff --stat src/lib/database.types.ts` shows only additions for `mcp_connections` and the three functions. If `supabase start` fails on the new config keys, run `npx supabase --version` (needs ≥ 2.54.11) and report.
Verify OAuth server is up: `curl -s http://127.0.0.1:54321/.well-known/oauth-authorization-server/auth/v1` → JSON containing `"registration_endpoint"`.

- [ ] **Step 6: Commit**

```
git add supabase/migrations/20261014000001_mcp_connections.sql supabase/tests/phase16_mcp_connections.test.sql supabase/config.toml src/lib/database.types.ts
git commit -m "feat(mcp): mcp_connections table and OAuth connection RPCs"
```

---

### Task 2: `/api/mcp` accepts OAuth tokens

**Files:**
- Modify: `src/lib/mcp/auth.ts`, `src/lib/mcp/server.ts`, `src/lib/mcp/user-client.ts`, `src/lib/mcp/types.ts`, `src/lib/mcp/tools/read.ts`, `src/app/api/mcp/route.ts`
- Create: `src/lib/mcp/oauth-metadata.ts`
- Test: `tests/mcp-auth.test.ts`, `tests/mcp-oauth-metadata.test.ts` (new)

**Interfaces:**
- Consumes: `mcp_resolve_connection` (Task 1).
- Produces:
  - `type ResolvedCredential = { userId: string; keyId: string; canWrite: boolean }` (`keyId` = mcp_keys.id **or** mcp_connections.id)
  - `type McpAuth = ResolvedCredential & ({ kind: "key" } | { kind: "oauth"; accessToken: string })`
  - `type OAuthResolver = (token: string) => Promise<ResolvedCredential | null>`
  - `extractBearerCredential(header): { kind: "key"; key: string } | { kind: "oauth"; token: string } | null`
  - `oauthIdentity(claims: unknown): { userId: string; clientId: string } | null`
  - `authenticateRequest(req, resolveKey, opts?: { resolveOAuth?: OAuthResolver; resourceMetadataUrl?: string })`
  - `unauthorized(message, resourceMetadataUrl?)`
  - `oauth-metadata.ts`: `MCP_RESOURCE_PATH = "/api/mcp"`, `resourceMetadataUrl(origin)`, `authServerUrl(supabaseUrl)`, `protectedResourceMetadata(origin, supabaseUrl)`
  - `ToolContext.via: "key" | "oauth"`

- [ ] **Step 1: Write failing tests**

Create `tests/mcp-oauth-metadata.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { authServerUrl, protectedResourceMetadata, resourceMetadataUrl } from "@/lib/mcp/oauth-metadata";

describe("oauth metadata", () => {
  it("points the MCP resource at Supabase's auth server", () => {
    expect(protectedResourceMetadata("https://pm.example.com", "https://abc.supabase.co/")).toEqual({
      resource: "https://pm.example.com/api/mcp",
      authorization_servers: ["https://abc.supabase.co/auth/v1"],
      bearer_methods_supported: ["header"],
      resource_name: "PM app",
    });
  });
  it("builds the path-suffixed metadata URL", () => {
    expect(resourceMetadataUrl("https://pm.example.com")).toBe(
      "https://pm.example.com/.well-known/oauth-protected-resource/api/mcp",
    );
    expect(authServerUrl("http://127.0.0.1:54321")).toBe("http://127.0.0.1:54321/auth/v1");
  });
});
```

Append to `tests/mcp-auth.test.ts` (and change line 2 import to also import `extractBearerCredential, oauthIdentity`):
```ts
describe("OAuth credentials", () => {
  const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.c2ln";

  it("tells keys and JWTs apart and rejects junk", () => {
    const { key } = generateKey();
    expect(extractBearerCredential(`Bearer ${key}`)).toEqual({ kind: "key", key });
    expect(extractBearerCredential(`Bearer ${jwt}`)).toEqual({ kind: "oauth", token: jwt });
    expect(extractBearerCredential("Bearer nope")).toBeNull();
    expect(extractBearerCredential("Basic abc")).toBeNull();
    expect(extractBearerCredential(null)).toBeNull();
  });

  it("requires a client_id claim (browser session tokens are not connections)", () => {
    const sub = "11111111-1111-4111-8111-111111111111";
    expect(oauthIdentity({ sub, client_id: "c1" })).toEqual({ userId: sub, clientId: "c1" });
    expect(oauthIdentity({ sub })).toBeNull();
    expect(oauthIdentity({ sub, client_id: "" })).toBeNull();
    expect(oauthIdentity({ sub: "not-a-uuid", client_id: "c1" })).toBeNull();
    expect(oauthIdentity(null)).toBeNull();
  });

  it("resolves a JWT through the OAuth resolver and keeps the token", async () => {
    const resolveKey = vi.fn();
    const resolveOAuth = vi.fn().mockResolvedValue({ ...ids, canWrite: false });
    const res = await authenticateRequest(req(`Bearer ${jwt}`), resolveKey, { resolveOAuth });
    expect(res).toEqual({ ...ids, canWrite: false, kind: "oauth", accessToken: jwt });
    expect(resolveOAuth).toHaveBeenCalledWith(jwt);
    expect(resolveKey).not.toHaveBeenCalled();
  });

  it("401 with a WWW-Authenticate challenge when the OAuth token doesn't resolve (e.g. disconnected)", async () => {
    const res = await authenticateRequest(req(`Bearer ${jwt}`), vi.fn(), {
      resolveOAuth: vi.fn().mockResolvedValue(null),
      resourceMetadataUrl: "https://pm.example.com/.well-known/oauth-protected-resource/api/mcp",
    });
    expect(res).toBeInstanceOf(Response);
    expect((res as Response).status).toBe(401);
    expect((res as Response).headers.get("www-authenticate")).toBe(
      'Bearer resource_metadata="https://pm.example.com/.well-known/oauth-protected-resource/api/mcp"',
    );
  });

  it("401 challenge also when no header is sent", async () => {
    const res = (await authenticateRequest(req(), vi.fn(), { resourceMetadataUrl: "https://x/m" })) as Response;
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toBe('Bearer resource_metadata="https://x/m"');
  });

  it("JWT without an OAuth resolver configured is a 401, never a pass-through", async () => {
    const res = (await authenticateRequest(req(`Bearer ${jwt}`), vi.fn())) as Response;
    expect(res.status).toBe(401);
  });

  it("503 when the OAuth resolver throws", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = (await authenticateRequest(req(`Bearer ${jwt}`), vi.fn(), {
      resolveOAuth: vi.fn().mockRejectedValue(new Error("auth down")),
    })) as Response;
    spy.mockRestore();
    expect(res.status).toBe(503);
  });
});
```
Also update the existing test "looks the key up by its sha256 hash only, and returns the resolved identity": its expectation becomes `expect(res).toEqual({ ...ids, kind: "key" })`.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/mcp-auth.test.ts tests/mcp-oauth-metadata.test.ts`
Expected: FAIL (missing exports / module).

- [ ] **Step 3: Implement `src/lib/mcp/oauth-metadata.ts`**

```ts
// RFC 9728 protected-resource metadata for /api/mcp: tells MCP clients (claude.ai) that
// Supabase Auth's OAuth 2.1 server issues tokens for it. Pure -- unit-tested directly.
// Spec: docs/superpowers/specs/2026-10-14-claude-connector-oauth-design.md
export const MCP_RESOURCE_PATH = "/api/mcp";

const trim = (url: string) => url.replace(/\/+$/, "");

export function authServerUrl(supabaseUrl: string): string {
  return `${trim(supabaseUrl)}/auth/v1`;
}

export function resourceMetadataUrl(origin: string): string {
  return `${trim(origin)}/.well-known/oauth-protected-resource${MCP_RESOURCE_PATH}`;
}

export function protectedResourceMetadata(origin: string, supabaseUrl: string) {
  return {
    resource: `${trim(origin)}${MCP_RESOURCE_PATH}`,
    authorization_servers: [authServerUrl(supabaseUrl)],
    bearer_methods_supported: ["header"],
    resource_name: "PM app",
  };
}
```

- [ ] **Step 4: Implement auth.ts changes** — replace the `McpAuth`/`KeyResolver` types, `extractBearerKey`, `unauthorized` and `authenticateRequest` with:

```ts
import { z } from "zod";

/** A resolved credential. `keyId` is mcp_keys.id for keys, mcp_connections.id for OAuth
 * connections (also the rate-limit counter key). */
export type ResolvedCredential = { userId: string; keyId: string; canWrite: boolean };

/** `canWrite` false = read-only: only readOnly tools are exposed (see ./server.ts). */
export type McpAuth = ResolvedCredential & ({ kind: "key" } | { kind: "oauth"; accessToken: string });

/** Looks a key hash up; null when unknown, revoked, expired or its user is not active. */
export type KeyResolver = (keyHash: string) => Promise<ResolvedCredential | null>;

/** Verifies a Supabase OAuth access token and looks up its connection; null when the token is
 * invalid/expired, not an OAuth token, or the connection is gone. Throws on infrastructure errors. */
export type OAuthResolver = (token: string) => Promise<ResolvedCredential | null>;

const KEY_PATTERN = /^pmk_[A-Za-z0-9_-]{43}$/;
const JWT_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

export type BearerCredential = { kind: "key"; key: string } | { kind: "oauth"; token: string };

/** Parses `Authorization: Bearer <pmk_ key | JWT>`; null for anything else (no DB round trip). */
export function extractBearerCredential(header: string | null): BearerCredential | null {
  if (!header) return null;
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header.trim());
  if (!match) return null;
  const value = match[1];
  if (KEY_PATTERN.test(value)) return { kind: "key", key: value };
  if (JWT_PATTERN.test(value)) return { kind: "oauth", token: value };
  return null;
}

/** Kept for existing callers/tests: the key, or null. */
export function extractBearerKey(header: string | null): string | null {
  const credential = extractBearerCredential(header);
  return credential?.kind === "key" ? credential.key : null;
}

const oauthClaims = z.object({ sub: z.uuid(), client_id: z.string().min(1) });

/** An OAuth access token carries `client_id`; a normal browser session token doesn't and is
 * refused here, so a stolen session cookie can't be replayed against /api/mcp. */
export function oauthIdentity(claims: unknown): { userId: string; clientId: string } | null {
  const parsed = oauthClaims.safeParse(claims);
  return parsed.success ? { userId: parsed.data.sub, clientId: parsed.data.client_id } : null;
}
```

`unauthorized` gains the challenge (replace its doc comment — the old "no WWW-Authenticate" reasoning no longer holds: claude.ai needs the header to start the login):
```ts
/** 401 JSON. With `resourceMetadataUrl`, adds the RFC 9728 `WWW-Authenticate` challenge MCP
 * clients (claude.ai) use to discover the OAuth login. */
export function unauthorized(message: string, resourceMetadataUrl?: string): Response {
  return jsonError(
    401,
    "unauthorized",
    message,
    resourceMetadataUrl ? { "www-authenticate": `Bearer resource_metadata="${resourceMetadataUrl}"` } : undefined,
  );
}
```

`authenticateRequest`:
```ts
export async function authenticateRequest(
  req: Request,
  resolveKey: KeyResolver,
  opts: { resolveOAuth?: OAuthResolver; resourceMetadataUrl?: string } = {},
): Promise<McpAuth | Response> {
  const credential = extractBearerCredential(req.headers.get("authorization"));
  if (!credential || (credential.kind === "oauth" && !opts.resolveOAuth)) {
    return unauthorized("Missing or malformed access key. Send 'Authorization: Bearer <key>'.", opts.resourceMetadataUrl);
  }

  let resolved: ResolvedCredential | null;
  try {
    resolved = credential.kind === "key"
      ? await resolveKey(hashKey(credential.key))
      : await opts.resolveOAuth!(credential.token);
  } catch (err) {
    console.error("mcp credential resolve failed:", err instanceof Error ? err.message : err);
    return jsonError(503, "unavailable", "Could not verify the access key right now. Try again shortly.");
  }

  if (!resolved) {
    return unauthorized(
      credential.kind === "key"
        ? "Invalid or revoked key — create a new one in Settings → AI assistant."
        : "This connection is no longer valid — reconnect PM app in Claude.",
      opts.resourceMetadataUrl,
    );
  }
  return credential.kind === "key"
    ? { ...resolved, kind: "key" }
    : { ...resolved, kind: "oauth", accessToken: credential.token };
}
```
`enforceRequestCeiling(auth: McpAuth, …)` keeps using `auth.keyId` — no change.

- [ ] **Step 5: Run the auth tests** — `npx vitest run tests/mcp-auth.test.ts tests/mcp-oauth-metadata.test.ts` → PASS.

- [ ] **Step 6: Server side** —

`src/lib/mcp/user-client.ts`, add below `createUserScopedClient`:
```ts
/** A supabase-js client acting with a Supabase-issued OAuth access token (claude.ai connector).
 * The token already identifies the user, so RLS applies exactly as for keys -- nothing minted. */
export function createTokenClient(accessToken: string) {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    }
  );
}
```

`src/lib/mcp/types.ts` — in `ToolContext` add after `canWrite`:
```ts
  /** Which credential this call came in with -- key (pmk_) or oauth (claude.ai connector). */
  via: "key" | "oauth";
```
and change the `keyId` doc to: `/** mcp_keys.id or mcp_connections.id -- the rate-limit counter key. */`.

`src/lib/mcp/server.ts`:
- imports: `import { createClient as createSupabaseClient, isAuthRetryableFetchError } from "@supabase/supabase-js";`, `import { createTokenClient, createUserScopedClient } from "@/lib/mcp/user-client";`, `import { oauthIdentity, type KeyResolver, type McpAuth, type OAuthResolver } from "@/lib/mcp/auth";`
- add (the module's service-role list comment now also names `mcp_resolve_connection`):
```ts
/** Real OAuth resolver: verifies the Supabase-issued access token (getClaims handles both HS256
 * and asymmetric signing), requires an OAuth client_id claim, then the service-role
 * `mcp_resolve_connection` -- empty for disconnected connections or inactive users. Network
 * failures throw (-> 503); invalid/expired tokens return null (-> 401 + challenge). */
export const resolveOAuthToken: OAuthResolver = async (token) => {
  const anon = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await anon.auth.getClaims(token);
  if (error) {
    if (isAuthRetryableFetchError(error)) throw new Error(`getClaims: ${error.message}`);
    return null;
  }
  const identity = oauthIdentity(data?.claims);
  if (!identity) return null;

  const { data: rows, error: rpcError } = await createAdminClient().rpc("mcp_resolve_connection", {
    p_user: identity.userId,
    p_client: identity.clientId,
  });
  if (rpcError) throw new Error(`mcp_resolve_connection: ${rpcError.message}`);
  const row = rows?.[0];
  return row ? { userId: identity.userId, keyId: row.connection_id, canWrite: row.can_write === true } : null;
};
```
- in `buildMcpHandler`: `const supabase = auth.kind === "oauth" ? createTokenClient(auth.accessToken) : await createUserScopedClient(auth.userId);`, add `via: auth.kind,` to `ctx`, and the audit metadata becomes:
```ts
        metadata: {
          ...entry.metadata,
          via: "mcp",
          ...(auth.kind === "key" ? { key_id: auth.keyId } : { connection_id: auth.keyId }),
        },
```

`src/lib/mcp/tools/read.ts` whoami: replace the `mcp_keys` query in the `Promise.all` with
```ts
      ctx.via === "oauth"
        ? supabase.from("mcp_connections").select("client_name, created_at").eq("id", keyId).maybeSingle()
        : supabase.from("mcp_keys").select("label, key_prefix, expires_at").eq("id", keyId).maybeSingle(),
```
and the `key:` output with
```ts
        key: keyRes.data
          ? "client_name" in keyRes.data
            ? { connected_app: keyRes.data.client_name, access: ctx.canWrite ? "read and write" : "read only", since: fmtDate(keyRes.data.created_at) }
            : {
                label: keyRes.data.label,
                prefix: keyRes.data.key_prefix,
                access: ctx.canWrite ? "read and write" : "read only",
                expires: fmtDate(keyRes.data.expires_at),
              }
          : null,
```
(If TypeScript can't narrow the union with `in`, give each branch its own variable before `Promise.all` returns — keep behaviour identical.)

`src/app/api/mcp/route.ts`:
```ts
import { getPublicOrigin } from "mcp-handler";
import { authenticateRequest, enforceRequestCeiling, jsonError } from "@/lib/mcp/auth";
import { resourceMetadataUrl } from "@/lib/mcp/oauth-metadata";
import { buildMcpHandler, bumpRequests, resolveKeyHash, resolveOAuthToken } from "@/lib/mcp/server";
…
  const auth = await authenticateRequest(req, resolveKeyHash, {
    resolveOAuth: resolveOAuthToken,
    resourceMetadataUrl: resourceMetadataUrl(getPublicOrigin(req)),
  });
```
Update the route's header comment: Bearer `pmk_` key **or** Supabase OAuth access token; 401s carry the RFC 9728 challenge. Check `getPublicOrigin`'s signature in `node_modules/mcp-handler/dist/index.d.ts` (it takes the `Request`).

- [ ] **Step 7: Full verification** — `npx tsc --noEmit`, `npx vitest run`, `npx eslint src/lib/mcp src/app/api/mcp tests/mcp-*.ts` → all clean. Existing tool tests construct ctx `as never`, so they need no change; if any fail on `via`, add `via: "key"` to that ctx.

- [ ] **Step 8: Commit** — `git commit -m "feat(mcp): accept Supabase OAuth access tokens on /api/mcp"` (stage the files above).

---

### Task 3: Discovery endpoint + middleware exclusion

**Files:**
- Create: `src/app/.well-known/oauth-protected-resource/[[...path]]/route.ts`
- Modify: `src/middleware.ts`, `src/lib/supabase/middleware.ts`
- Test: `tests/middleware-mcp.test.ts` if it exists (grep `isMcpPath` in `tests/`), else add to `tests/mcp-oauth-metadata.test.ts`

**Interfaces:**
- Consumes: `protectedResourceMetadata` (Task 2).
- Produces: `GET /.well-known/oauth-protected-resource` and `/.well-known/oauth-protected-resource/api/mcp` → JSON metadata, CORS `*`; `isSessionlessPath(pathname)` replacing `isMcpPath`.

- [ ] **Step 1: Failing test** (in the file that tests `isMcpPath`, or new in `tests/mcp-oauth-metadata.test.ts`):
```ts
import { isSessionlessPath } from "@/lib/supabase/middleware";

describe("isSessionlessPath", () => {
  it("skips the session for the MCP endpoint and OAuth discovery only", () => {
    expect(isSessionlessPath("/api/mcp")).toBe(true);
    expect(isSessionlessPath("/.well-known/oauth-protected-resource")).toBe(true);
    expect(isSessionlessPath("/.well-known/oauth-protected-resource/api/mcp")).toBe(true);
    expect(isSessionlessPath("/api/mcp/x")).toBe(false);
    expect(isSessionlessPath("/oauth/consent")).toBe(false);
    expect(isSessionlessPath("/dashboard")).toBe(false);
  });
});
```
(If `src/lib/supabase/middleware.ts` imports server-only things that break under vitest, move `isSessionlessPath` into `src/lib/auth/gate.ts` and import it from there in both places.)

- [ ] **Step 2: Run** — `npx vitest run <that file>` → FAIL.

- [ ] **Step 3: Implement** — rename `isMcpPath` → `isSessionlessPath` (update all callers/tests found by grep):
```ts
/** Paths that authenticate on their own (Bearer credential) or are public discovery documents:
 * never touch the session or redirect to /login. */
export function isSessionlessPath(pathname: string): boolean {
  return pathname === "/api/mcp" || pathname === "/.well-known/oauth-protected-resource"
    || pathname.startsWith("/.well-known/oauth-protected-resource/");
}
```
`src/middleware.ts` matcher: add `\\.well-known/oauth-protected-resource|` after `api/mcp$|`, and extend the comment.

Route `src/app/.well-known/oauth-protected-resource/[[...path]]/route.ts`:
```ts
import { getPublicOrigin } from "mcp-handler";
import { protectedResourceMetadata } from "@/lib/mcp/oauth-metadata";

// RFC 9728 discovery for /api/mcp (served at the root and the path-suffixed URL MCP clients try
// first). Public and CORS-open: browser-based MCP clients fetch it cross-origin.
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "*",
};

export function GET(req: Request) {
  return Response.json(protectedResourceMetadata(getPublicOrigin(req), process.env.NEXT_PUBLIC_SUPABASE_URL!), {
    headers: { ...CORS, "cache-control": "public, max-age=3600" },
  });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
```
(Confirm in `node_modules/next/dist/docs/` that a route folder named `.well-known` and an optional catch-all `[[...path]]` are supported in this Next version; if `.well-known` isn't routable, use `src/app/[...wellKnown]`-free alternative: a `rewrites()` entry in `next.config.ts` from `/.well-known/oauth-protected-resource/:path*` to `/api/oauth-protected-resource` and put the handler there.)

- [ ] **Step 4: Verify** — `npx vitest run`, `npm run build`, then with `npx next start -p 3200` running:
`curl -s http://localhost:3200/.well-known/oauth-protected-resource/api/mcp` → the JSON with `"authorization_servers":["http://127.0.0.1:54321/auth/v1"]`;
`curl -s -i -X POST http://localhost:3200/api/mcp | grep -i www-authenticate` → `Bearer resource_metadata="http://localhost:3200/.well-known/oauth-protected-resource/api/mcp"`.

- [ ] **Step 5: Commit** — `git commit -m "feat(mcp): OAuth protected-resource discovery endpoint"`.

---

### Task 4: Login returns to the consent page

**Files:**
- Modify: `src/lib/auth/gate.ts`, `src/lib/supabase/middleware.ts` (pass `search`), `src/app/actions/auth.ts`, `src/app/(auth)/login/page.tsx`, `src/app/(auth)/login/login-form.tsx`
- Test: the existing gate test file (grep `decideRedirect` in `tests/`)

**Interfaces:**
- Produces: `safeNextPath(next: string | null | undefined): string | null`; `GateInput.search?: string`; `signInAction(input, next?: string)`.

- [ ] **Step 1: Failing tests** (append to the gate test file):
```ts
import { decideRedirect, safeNextPath } from "@/lib/auth/gate";

describe("safeNextPath", () => {
  it("allows only the OAuth consent page, same-origin", () => {
    expect(safeNextPath("/oauth/consent?authorization_id=abc")).toBe("/oauth/consent?authorization_id=abc");
    for (const bad of [
      null, "", "/dashboard", "//evil.com/oauth/consent", "https://evil.com/oauth/consent",
      "/oauth/consent/../dashboard", "/\\evil.com", "oauth/consent", "/oauth/consentx",
    ]) {
      expect(safeNextPath(bad)).toBeNull();
    }
  });
});

describe("decideRedirect with consent", () => {
  it("sends logged-out consent visits to login with next", () => {
    expect(decideRedirect({ pathname: "/oauth/consent", search: "?authorization_id=abc", isAuthenticated: false, status: null }))
      .toBe("/login?next=%2Foauth%2Fconsent%3Fauthorization_id%3Dabc");
  });
  it("other logged-out visits still go to plain /login", () => {
    expect(decideRedirect({ pathname: "/dashboard", search: "?x=1", isAuthenticated: false, status: null })).toBe("/login");
  });
  it("an active user on /login with a safe next goes there, otherwise dashboard", () => {
    expect(decideRedirect({ pathname: "/login", search: "?next=%2Foauth%2Fconsent%3Fauthorization_id%3Dabc", isAuthenticated: true, status: "active" }))
      .toBe("/oauth/consent?authorization_id=abc");
    expect(decideRedirect({ pathname: "/login", search: "?next=%2F%2Fevil.com", isAuthenticated: true, status: "active" }))
      .toBe("/dashboard");
  });
  it("active users may open the consent page", () => {
    expect(decideRedirect({ pathname: "/oauth/consent", search: "?authorization_id=abc", isAuthenticated: true, status: "active" })).toBeNull();
  });
});
```

- [ ] **Step 2: Run** → FAIL (`safeNextPath` not exported).

- [ ] **Step 3: Implement** in `src/lib/auth/gate.ts`:
```ts
export type GateInput = {
  pathname: string;
  /** Raw query string incl. leading "?" (or ""). */
  search?: string;
  isAuthenticated: boolean;
  status: UserStatus | null;
};

const CONSENT_PATH = "/oauth/consent";
const GATE_ORIGIN = "http://gate.local";

/** Where to go after login: only the OAuth consent page, same-origin (open-redirect guard). */
export function safeNextPath(next: string | null | undefined): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return null;
  let url: URL;
  try {
    url = new URL(next, GATE_ORIGIN);
  } catch {
    return null;
  }
  if (url.origin !== GATE_ORIGIN || url.pathname !== CONSENT_PATH) return null;
  return `${url.pathname}${url.search}`;
}
```
In `decideRedirect`:
- unauthenticated branch: `if (!isAuthenticated) { if (isPublicPath(pathname)) return null; return pathname === CONSENT_PATH ? \`/login?next=${encodeURIComponent(pathname + (input.search ?? ""))}\` : "/login"; }`
- in the active section, before `if (isPublicPath(pathname) && …)`: `if (pathname === "/login") { const next = safeNextPath(new URLSearchParams(input.search ?? "").get("next")); if (next) return next; }`

`src/lib/supabase/middleware.ts`: pass `search: request.nextUrl.search` into `decideRedirect`.

`src/app/actions/auth.ts`: `export async function signInAction(input: LoginInput, next?: string)` and replace `redirect("/dashboard")` with `redirect(safeNextPath(next) ?? "/dashboard"); // middleware reroutes pending/disabled users` (import `safeNextPath` from `@/lib/auth/gate`).

`login/page.tsx`: `searchParams: Promise<{ error?: string; next?: string }>`, read `next`, render `<LoginForm next={next} />`.
`login-form.tsx`: `export function LoginForm({ next }: { next?: string })` and `await signInAction(values, next)`.

- [ ] **Step 4: Run** — `npx vitest run`, `npx tsc --noEmit` → PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(auth): return to OAuth consent after login"`.

---

### Task 5: Consent page

**Files:**
- Create: `src/lib/mcp/oauth-consent.ts`, `src/lib/mcp/access-labels.ts`, `src/app/oauth/layout.tsx`, `src/app/oauth/consent/page.tsx`, `src/app/oauth/consent/consent-form.tsx`, `src/app/actions/mcp-connections.ts`
- Modify: `src/app/(app)/settings/ai-assistant-card.tsx` (use shared access labels), `src/lib/audit.ts`, `src/app/(app)/activity/types.ts`
- Test: `tests/mcp-oauth-consent.test.ts` (new)

**Interfaces:**
- Consumes: `mcp_connect` / `mcp_disconnect` (Task 1); login `next` (Task 4).
- Produces: `isAllowedRedirectUri(uri: string): boolean`; `consentProblem(details: { redirect_uri: string; user: { id: string } }, userId: string): string | null`; `ACCESS_LABEL`, `ACCESS_ITEMS`; actions `approveConnectionAction({ authorizationId, canWrite }) → { error } | { url }`, `denyConnectionAction(authorizationId) → { error } | { url }`, `disconnectConnectionAction(id) → { error } | { success: true }` (the last one is used by Task 6).

- [ ] **Step 1: Failing tests** `tests/mcp-oauth-consent.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { consentProblem, isAllowedRedirectUri } from "@/lib/mcp/oauth-consent";

describe("isAllowedRedirectUri", () => {
  it("allows Claude's callbacks and local clients", () => {
    for (const ok of [
      "https://claude.ai/api/mcp/auth_callback",
      "https://claude.com/api/mcp/auth_callback",
      "http://localhost:53123/callback",
      "http://127.0.0.1:8080/oauth/callback",
    ]) expect(isAllowedRedirectUri(ok)).toBe(true);
  });
  it("refuses look-alikes and anything else", () => {
    for (const bad of [
      "https://claude.ai.evil.com/api/mcp/auth_callback",
      "http://claude.ai/api/mcp/auth_callback",
      "https://claude.ai/api/mcp/auth_callback?x=1",
      "https://claude.ai/api/mcp/other",
      "https://user@claude.ai/api/mcp/auth_callback",
      "https://evil.com/callback",
      "http://localhost.evil.com/cb",
      "javascript:alert(1)",
      "not a url",
    ]) expect(isAllowedRedirectUri(bad)).toBe(false);
  });
});

describe("consentProblem", () => {
  const me = "11111111-1111-4111-8111-111111111111";
  const ok = { redirect_uri: "https://claude.ai/api/mcp/auth_callback", user: { id: me } };
  it("is null for a valid request by the same user", () => {
    expect(consentProblem(ok, me)).toBeNull();
  });
  it("refuses another user's authorization", () => {
    expect(consentProblem(ok, "22222222-2222-4222-8222-222222222222")).toMatch(/different account/);
  });
  it("refuses a disallowed app", () => {
    expect(consentProblem({ ...ok, redirect_uri: "https://evil.com/cb" }, me)).toMatch(/isn't allowed/);
  });
});
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement pure helpers**

`src/lib/mcp/oauth-consent.ts`:
```ts
// Consent-page rules for the claude.ai connector. Pure -- unit-tested directly.
// Dynamic client registration lets anyone register an OAuth client with any name, so the page
// only lets users approve clients that send them back to Claude (or a local Claude Code/Desktop).
const CLAUDE_CALLBACKS = new Set([
  "https://claude.ai/api/mcp/auth_callback",
  "https://claude.com/api/mcp/auth_callback",
]);
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

export function isAllowedRedirectUri(uri: string): boolean {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return false;
  }
  if (url.username || url.password || url.hash) return false;
  if (url.protocol === "https:") return !url.search && CLAUDE_CALLBACKS.has(`${url.origin}${url.pathname}`);
  return url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname);
}

/** Why this authorization can't be approved by `userId`, or null if it can. */
export function consentProblem(details: { redirect_uri: string; user: { id: string } }, userId: string): string | null {
  if (details.user.id !== userId) return "This request was started from a different account. Start again from Claude.";
  if (!isAllowedRedirectUri(details.redirect_uri)) return "This app isn't allowed to connect to PM app.";
  return null;
}
```

`src/lib/mcp/access-labels.ts`:
```ts
export const ACCESS_LABEL = { false: "Read only", true: "Read and write" } as const;
export const ACCESS_ITEMS = [
  { value: "false", label: ACCESS_LABEL.false },
  { value: "true", label: ACCESS_LABEL.true },
];
export const accessLabel = (canWrite: boolean) => ACCESS_LABEL[canWrite ? "true" : "false"];
```
In `ai-assistant-card.tsx` delete the local `ACCESS_LABEL`/`ACCESS_ITEMS`, import from `@/lib/mcp/access-labels`, and render `{accessLabel(k.canWrite)}` in the Access cell.

- [ ] **Step 4: Run** — `npx vitest run tests/mcp-oauth-consent.test.ts` → PASS.

- [ ] **Step 5: Audit actions** — in `src/lib/audit.ts` extend the `AuditAction` union after `"mcp_key.revoked"` with `| "mcp_connection.created" | "mcp_connection.revoked"`; in `src/app/(app)/activity/types.ts` add labels next to the existing `mcp_key.*` entries, following their exact pattern (e.g. "Connected an AI app" / "Disconnected an AI app").

- [ ] **Step 6: Server actions** `src/app/actions/mcp-connections.ts`:
```ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActiveUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { consentProblem } from "@/lib/mcp/oauth-consent";

type UrlResult = { error: string } | { url: string };
type DisconnectResult = { error: string } | { success: true };

const authorizationIdSchema = z.string().trim().min(1).max(200);
const EXPIRED = "This connection request has expired. Start again from Claude.";

/** Consent page → Allow. Re-reads the authorization server-side (never trusts client-sent
 * client ids), checks it belongs to this user and an allowed app, records the connection with the
 * chosen access, then approves it at Supabase and returns Claude's callback URL. */
export async function approveConnectionAction(input: { authorizationId: string; canWrite: boolean }): Promise<UrlResult> {
  const id = authorizationIdSchema.safeParse(input.authorizationId);
  if (!id.success || typeof input.canWrite !== "boolean") return { error: EXPIRED };
  const current = await requireActiveUser();
  const supabase = await createClient();

  const { data: details, error } = await supabase.auth.oauth.getAuthorizationDetails(id.data);
  if (error || !details || !("authorization_id" in details)) return { error: EXPIRED };
  const problem = consentProblem(details, current.user.id);
  if (problem) return { error: problem };

  const clientName = details.client.name?.trim() || "Unknown app";
  const { data: connectionId, error: connectError } = await supabase.rpc("mcp_connect", {
    p_client_id: details.client.id,
    p_client_name: clientName,
    p_can_write: input.canWrite,
  });
  if (connectError || !connectionId) return { error: "Could not save the connection. Try again." };

  const { data: approved, error: approveError } = await supabase.auth.oauth.approveAuthorization(id.data, {
    skipBrowserRedirect: true,
  });
  if (approveError || !approved) {
    await supabase.rpc("mcp_disconnect", { p_id: connectionId });
    return { error: EXPIRED };
  }

  await writeAudit({
    action: "mcp_connection.created",
    actorId: current.user.id,
    actorEmail: current.profile.email,
    resourceType: "mcp_connection",
    resourceId: connectionId,
    metadata: { client_id: details.client.id, client_name: clientName, can_write: input.canWrite },
  });
  revalidatePath("/settings");
  return { url: approved.redirect_url };
}

/** Consent page → Deny: tells Supabase, returns Claude's callback URL (with the error). */
export async function denyConnectionAction(authorizationId: string): Promise<UrlResult> {
  const id = authorizationIdSchema.safeParse(authorizationId);
  if (!id.success) return { error: EXPIRED };
  await requireActiveUser();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.oauth.denyAuthorization(id.data, { skipBrowserRedirect: true });
  if (error || !data) return { error: EXPIRED };
  return { url: data.redirect_url };
}

/** Settings → Connected apps → Disconnect (own connections only, enforced by mcp_disconnect).
 * Our row is the gate (endpoint refuses at once); revoking the Supabase grant as well kills the
 * client's refresh tokens and makes a reconnect ask for consent again -- best effort. */
export async function disconnectConnectionAction(id: string): Promise<DisconnectResult> {
  if (!z.uuid().safeParse(id).success) return { error: "Invalid connection." };
  const current = await requireActiveUser();
  const supabase = await createClient();

  const { data: clientId, error } = await supabase.rpc("mcp_disconnect", { p_id: id });
  if (error) return { error: "Could not disconnect. Try again." };
  if (!clientId) return { error: "Connection not found." };

  const { error: revokeError } = await supabase.auth.oauth.revokeGrant({ clientId });
  if (revokeError) console.error("mcp revokeGrant failed:", revokeError.message);

  await writeAudit({
    action: "mcp_connection.revoked",
    actorId: current.user.id,
    actorEmail: current.profile.email,
    resourceType: "mcp_connection",
    resourceId: id,
    metadata: { client_id: clientId },
  });
  revalidatePath("/settings");
  revalidatePath("/admin/users");
  return { success: true as const };
}
```

- [ ] **Step 7: Page + layout + form**

`src/app/oauth/layout.tsx`:
```tsx
export default function OAuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
```

`src/app/oauth/consent/page.tsx`:
```tsx
import { redirect } from "next/navigation";
import { requireActiveUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { consentProblem } from "@/lib/mcp/oauth-consent";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConsentForm } from "./consent-form";

// claude.ai connector consent. Supabase Auth's OAuth server sends the browser here with
// ?authorization_id=…; the middleware has already ensured a logged-in session (logged-out
// visitors go to /login?next=… and come back).
export default async function ConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ authorization_id?: string }>;
}) {
  const { authorization_id: authorizationId } = await searchParams;
  const current = await requireActiveUser();
  if (!authorizationId) return <Problem text="This connection request is missing. Start again from Claude." />;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
  if (error || !data) return <Problem text="This connection request has expired. Start again from Claude." />;
  if (!("authorization_id" in data)) redirect(data.redirect_url);

  const problem = consentProblem(data, current.user.id);
  if (problem) return <Problem text={problem} />;

  return (
    <ConsentForm
      authorizationId={authorizationId}
      appName={data.client.name?.trim() || "Unknown app"}
      userName={current.profile.full_name ?? current.profile.email}
      userEmail={current.profile.email}
    />
  );
}

function Problem({ text }: { text: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Can&apos;t connect</CardTitle>
        <CardDescription>{text}</CardDescription>
      </CardHeader>
      <CardContent />
    </Card>
  );
}
```

`src/app/oauth/consent/consent-form.tsx`:
```tsx
"use client";

import { useId, useState, useTransition } from "react";
import { approveConnectionAction, denyConnectionAction } from "@/app/actions/mcp-connections";
import { ACCESS_ITEMS } from "@/lib/mcp/access-labels";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function ConsentForm({
  authorizationId, appName, userName, userEmail,
}: { authorizationId: string; appName: string; userName: string; userEmail: string }) {
  const ids = useId();
  const [canWrite, setCanWrite] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function decide(allow: boolean) {
    setError(null);
    startTransition(async () => {
      try {
        const result = allow
          ? await approveConnectionAction({ authorizationId, canWrite })
          : await denyConnectionAction(authorizationId);
        if ("error" in result) setError(result.error);
        else window.location.assign(result.url);
      } catch {
        setError("Something went wrong. Start again from Claude.");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connect {appName}</CardTitle>
        <CardDescription>
          {appName} will work in PM app as {userName} ({userEmail}), with your permissions.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <div className="grid gap-1.5">
          <Label htmlFor={`${ids}-access`}>Access</Label>
          <Select items={ACCESS_ITEMS} value={String(canWrite)} onValueChange={(v) => v && setCanWrite(v === "true")}>
            <SelectTrigger id={`${ids}-access`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACCESS_ITEMS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
      <CardFooter className="justify-end gap-2">
        <Button type="button" variant="outline" disabled={isPending} onClick={() => decide(false)}>
          Deny
        </Button>
        <Button type="button" disabled={isPending} onClick={() => decide(true)}>
          {isPending ? "Connecting…" : "Allow"}
        </Button>
      </CardFooter>
    </Card>
  );
}
```
(If `CardFooter` isn't exported by `src/components/ui/card.tsx`, use a `div className="flex justify-end gap-2 px-6 pb-6"` instead.)

- [ ] **Step 8: Verify** — `npx tsc --noEmit`, `npx vitest run`, `npx eslint src/app/oauth src/app/actions/mcp-connections.ts src/lib/mcp` → clean.

- [ ] **Step 9: Commit** — `git commit -m "feat(mcp): claude.ai connector consent page"`.

---

### Task 6: Connected apps in Settings + admin list

**Files:**
- Modify: `src/lib/mcp/key-display.ts`, `src/app/(app)/settings/ai-assistant-card.tsx`, `src/app/(app)/settings/page.tsx`, `src/app/(app)/admin/users/mcp-keys-section.tsx`
- Test: `tests/mcp-key-display.test.ts`

**Interfaces:**
- Consumes: `disconnectConnectionAction` (Task 5), `accessLabel` (Task 5).
- Produces: `type McpConnectionRow = { id: string; appName: string; canWrite: boolean; createdAt: string; lastUsedAt: string | null; owner?: { name: string; email: string } }`; `toMcpConnectionRows(rows, owner?)`; `<McpConnectionsTable connections showOwner? />`; `AiAssistantCard` prop `connections: McpConnectionRow[]`.

- [ ] **Step 1: Failing test** — append to `tests/mcp-key-display.test.ts` (import `toMcpConnectionRows`):
```ts
describe("toMcpConnectionRows", () => {
  const conn = {
    id: "c1", client_id: "secret-client", client_name: "Claude", can_write: true,
    created_at: "2026-10-01T10:00:00Z", last_used_at: null, revoked_at: null, user_id: "u",
  };
  it("allowlists fields (never client_id/user_id), newest first", () => {
    const rows = toMcpConnectionRows([conn, { ...conn, id: "c2", created_at: "2026-10-05T00:00:00Z" }]);
    expect(rows.map((r) => r.id)).toEqual(["c2", "c1"]);
    expect(Object.keys(rows[0]).sort()).toEqual(["appName", "canWrite", "createdAt", "id", "lastUsedAt"]);
    expect(rows[0]).toMatchObject({ appName: "Claude", canWrite: true });
  });
  it("adds the owner when a resolver is given", () => {
    const [row] = toMcpConnectionRows([conn], () => ({ name: "Sara", email: "s@x.ee" }));
    expect(row.owner).toEqual({ name: "Sara", email: "s@x.ee" });
  });
});
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement** in `src/lib/mcp/key-display.ts`:
```ts
/** Connected OAuth apps (claude.ai connector) -- the only fields that reach client components. */
export type McpConnectionRow = {
  id: string;
  appName: string;
  canWrite: boolean;
  createdAt: string;
  lastUsedAt: string | null;
  /** Owner -- present only on the admin list. */
  owner?: { name: string; email: string };
};

type DbConnection = {
  id: string;
  client_name: string;
  can_write: boolean;
  created_at: string;
  last_used_at: string | null;
};

/** Field-by-field allowlist; newest first. Callers pass active (non-revoked) rows only. */
export function toMcpConnectionRows<T extends DbConnection>(
  rows: T[],
  owner?: (row: T) => McpConnectionRow["owner"],
): McpConnectionRow[] {
  return rows
    .map((c) => ({
      id: c.id,
      appName: c.client_name,
      canWrite: c.can_write,
      createdAt: c.created_at,
      lastUsedAt: c.last_used_at,
      ...(owner ? { owner: owner(c) } : {}),
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
```

- [ ] **Step 4: UI** — in `ai-assistant-card.tsx`:
- `AiAssistantCard({ keys, connections }: { keys: McpKeyRow[]; connections: McpConnectionRow[] })`; inside `CardContent` render `<div className="grid gap-6">` containing the keys table and, **only when `connections.length > 0`**, a block with a small heading `<h3 className="text-sm font-medium">Connected apps</h3>` and `<McpConnectionsTable connections={connections} />`.
- Add:
```tsx
/** Shared by Settings (own connections, with Disconnect) and User access (all, read-only). */
export function McpConnectionsTable({
  connections,
  showOwner = false,
}: {
  connections: McpConnectionRow[];
  showOwner?: boolean;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {showOwner && <TableHead>User</TableHead>}
          <TableHead>App</TableHead>
          <TableHead>Access</TableHead>
          <TableHead>Connected</TableHead>
          <TableHead>Last used</TableHead>
          {!showOwner && (
            <TableHead className="w-0">
              <span className="sr-only">Actions</span>
            </TableHead>
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {connections.map((c) => (
          <TableRow key={c.id}>
            {showOwner && (
              <TableCell>
                <div className="font-medium">{c.owner?.name ?? "—"}</div>
                <div className="text-xs text-muted-foreground">{c.owner?.email}</div>
              </TableCell>
            )}
            <TableCell className="max-w-48 truncate font-medium" title={c.appName}>{c.appName}</TableCell>
            <TableCell className="whitespace-nowrap">{accessLabel(c.canWrite)}</TableCell>
            <TableCell className="tabular-nums">{formatDateEt(c.createdAt)}</TableCell>
            <TableCell className="tabular-nums">{c.lastUsedAt ? formatDateEt(c.lastUsedAt) : "Never"}</TableCell>
            {!showOwner && (
              <TableCell className="text-right">
                <DisconnectButton connection={c} />
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function DisconnectButton({ connection }: { connection: McpConnectionRow }) {
  return (
    <ConfirmDialog
      trigger={<Button variant="ghost" size="sm" className={DESTRUCTIVE_ACTION_CLASS} />}
      triggerLabel="Disconnect"
      title={`Disconnect ${connection.appName}?`}
      description="It stops working immediately. You can connect it again from Claude."
      confirmLabel="Disconnect"
      pendingLabel="Disconnecting…"
      onConfirm={async () => {
        try {
          const result = await disconnectConnectionAction(connection.id);
          if ("success" in result) toast.success("Disconnected");
          return result;
        } catch {
          return { error: "Could not disconnect. Try again." };
        }
      }}
    />
  );
}
```
(imports: `disconnectConnectionAction` from `@/app/actions/mcp-connections`, `accessLabel` from `@/lib/mcp/access-labels`, `McpConnectionRow` type from `@/lib/mcp/key-display`.)

`settings/page.tsx`: add a 4th query to the `Promise.all`:
```ts
    supabase
      .from("mcp_connections")
      .select("id, client_name, can_write, created_at, last_used_at")
      .eq("user_id", current.user.id)
      .is("revoked_at", null),
```
destructure as `{ data: mcpConnections }` and render `<AiAssistantCard keys={toMcpKeyRows(mcpKeys ?? [])} connections={toMcpConnectionRows(mcpConnections ?? [])} />`; extend the comment above the queries ("mcp_connections: own active connections").

`admin/users/mcp-keys-section.tsx`: fetch connections in parallel with keys:
```ts
  const [{ data, error }, { data: conns, error: connError }] = await Promise.all([
    supabase.from("mcp_keys").select(/* unchanged */),
    supabase
      .from("mcp_connections")
      .select("id, client_name, can_write, created_at, last_used_at, owner:user_profiles!mcp_connections_user_id_fkey(full_name, email)")
      .is("revoked_at", null),
  ]);
  const connections = toMcpConnectionRows(conns ?? [], (c) => ({
    name: c.owner?.full_name ?? c.owner?.email ?? "Unknown user",
    email: c.owner?.email ?? "",
  }));
```
and under the keys table render, only when `connections.length > 0`, `<h3 className="pt-4 text-sm font-medium">Connected apps</h3>` + `<McpConnectionsTable connections={connections} showOwner />` (or `connError` → `<p className="text-sm text-destructive">Failed to load connected apps.</p>`).

- [ ] **Step 5: Verify** — `npx tsc --noEmit`, `npx vitest run`, `npx eslint "src/app/(app)/settings" "src/app/(app)/admin/users" src/lib/mcp` → clean.

- [ ] **Step 6: Commit** — `git commit -m "feat(mcp): connected apps list and disconnect"`.

---

### Task 7: Local end-to-end run + docs

**Files:**
- Create (scratchpad, not committed): `<scratchpad>/oauth-e2e.mjs`
- Modify: `docs/superpowers/specs/2026-10-14-claude-connector-oauth-design.md` (deviations + setup checklist)

- [ ] **Step 1: Build and start** — `npm run build`, then `npx next start -p 3200` (background). Local Supabase running with OAuth server enabled (Task 1).

- [ ] **Step 2: Write the E2E script** `<scratchpad>/oauth-e2e.mjs` (node 22, no deps; run with `node -I`):
```js
// Local OAuth E2E: DCR → authorize → (consent via app) → token → /api/mcp. Usage:
//   node oauth-e2e.mjs register|authorize|exchange <args>
import crypto from "node:crypto";
const AUTH = "http://127.0.0.1:54321/auth/v1";
const ANON = process.env.ANON; // local anon key from `npx supabase status`
const REDIRECT = "http://localhost:8765/callback";
const [cmd, ...rest] = process.argv.slice(2);

if (cmd === "register") {
  const r = await fetch(`${AUTH}/oauth/clients/register`, {
    method: "POST", headers: { "content-type": "application/json", apikey: ANON },
    body: JSON.stringify({ client_name: "Claude", redirect_uris: [REDIRECT], token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"] }),
  });
  console.log(r.status, await r.text());
} else if (cmd === "authorize") {
  const [clientId] = rest;
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  const url = `${AUTH}/oauth/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(REDIRECT)}&code_challenge=${challenge}&code_challenge_method=S256&state=xyz`;
  const r = await fetch(url, { redirect: "manual", headers: { apikey: ANON } });
  console.log(JSON.stringify({ verifier, status: r.status, location: r.headers.get("location") }));
} else if (cmd === "exchange") {
  const [clientId, code, verifier] = rest;
  const r = await fetch(`${AUTH}/oauth/token`, {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", apikey: ANON },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: REDIRECT, client_id: clientId, code_verifier: verifier }),
  });
  console.log(r.status, await r.text());
}
```
(Endpoint paths come from `curl http://127.0.0.1:54321/.well-known/oauth-authorization-server/auth/v1` — use the `registration_endpoint`, `authorization_endpoint`, `token_endpoint` values it reports if they differ.)

- [ ] **Step 3: Run the flow**
1. `register` → note `client_id`.
2. `authorize <client_id>` → `location` is `http://localhost:3000/oauth/consent?authorization_id=…` (local site_url is :3000); note `verifier`.
3. With Playwright: log in at `http://localhost:3200/login` as `admin.demo@pmcms.local` / `Password123!`, open `http://localhost:3200/oauth/consent?authorization_id=<id>` → page shows "Connect Claude", Access = Read only → click **Allow** → browser goes to `http://localhost:8765/callback?code=…&state=xyz` (connection refused is fine — read `code` from the URL).
4. `exchange <client_id> <code> <verifier>` → 200 with `access_token`.
5. `curl` `tools/list` on `http://localhost:3200/api/mcp` with `Authorization: Bearer <access_token>` (headers as in the key E2E: `accept: application/json, text/event-stream`) → **14 tools**; `whoami` → `connected_app: "Claude"`, `access: "read only"`.
6. Settings → AI assistant shows "Connected apps: Claude · Read only" → **Disconnect** → same `tools/list` call now returns **401** with the `www-authenticate` header.
7. Logged-out check: in a fresh context open the consent URL → lands on `/login?next=…`; log in → returns to the consent page.
8. Repeat authorize → Allow with **Read and write** → `tools/list` shows 26 tools. Disconnect afterwards.
Record each result. Any mismatch is a bug: fix it in the owning task's files, re-run that task's tests, commit `fix(mcp): …`.

- [ ] **Step 4: Full suite** — `npx tsc --noEmit`, `npx vitest run`, `npx supabase test db`, `npm run build` → all green.

- [ ] **Step 5: Docs** — append to the spec a "## Implementation notes" section listing the three plan deviations (usage column name, RPCs, no admin disconnect) and a "## Go-live checklist":
  1. `npx supabase db push` (migration `20261014000001`).
  2. Supabase dashboard → Authentication → OAuth Server: enable, Authorization Path `/oauth/consent`, allow dynamic client registration.
  3. Push `master` (Vercel deploys).
  4. claude.ai → Settings → Connectors → Add custom connector → `https://pm-app-eight-alpha.vercel.app/api/mcp` → Connect → log in → Allow.
  5. If claude.ai's token step fails with an ID-token error: switch the Supabase project to asymmetric JWT signing keys (Settings → JWT Keys); keep the legacy secret active so `pmk_` keys keep working.
Commit: `git commit -m "docs(mcp): connector implementation notes and go-live checklist"`.
