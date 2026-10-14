# Claude connector login (OAuth) — design

Date: 2026-10-14 · Status: approved direction, spec for review
Builds on: `2026-10-09-ai-assistant-mcp-design.md` (+ its 2026-10-12 hardening section)

## Goal

Business users (PMs, sales) use the PM app's AI assistant from **claude.ai** — web, desktop
app, phone app — on their **Claude subscription**, with no terminal and no copied keys:

1. claude.ai → Settings → Connectors → "PM app" → **Connect**
2. PM app opens: log in (if needed) → *"Claude wants to access PM app as <name>"* →
   **Read only** (default) / **Read and write** → **Allow**
3. Back in claude.ai, connected. "Add company Acme under Sales, next step: call Maria on
   Friday" works.

Success = that flow works against prod from claude.ai, and a user/admin can disconnect it.

## Non-goals

- No new tools and no change to tool permissions (adjustable later in the registry / roles).
- No delete tools (unchanged policy).
- Existing `pmk_` keys keep working unchanged (Claude Code / technical users).

## Approach

Use **Supabase Auth's OAuth 2.1 server** (beta, free, all plans) as the authorization server.
Supabase handles client registration (DCR), authorization codes + PKCE, token issue and refresh.
We build: the consent page, a per-connection record, protected-resource metadata, and
token acceptance on `/api/mcp`. Fallback if the beta misbehaves: our own OAuth server behind
the same consent page and endpoint — the user experience doesn't change.

## Architecture

```
claude.ai ──(1) POST /api/mcp, no token──────────────▶ 401 + WWW-Authenticate: Bearer
                                                         resource_metadata=".../.well-known/oauth-protected-resource"
claude.ai ──(2) GET /.well-known/oauth-protected-resource ─▶ { resource, authorization_servers: [<supabase>/auth/v1] }
claude.ai ──(3) Supabase discovery + DCR + /authorize ─▶ Supabase redirects browser to
                                                         <site>/oauth/consent?authorization_id=…
user      ──(4) consent page: login if needed, choose access, Allow ─▶ we upsert mcp_connections,
                                                         approveAuthorization → redirect to claude.ai callback
claude.ai ──(5) code → tokens (Supabase), then POST /api/mcp with Bearer <Supabase JWT>
/api/mcp  ──(6) verify JWT, look up mcp_connections(user, client_id) → same tool pipeline
```

## Components

### 1. Consent page — `src/app/oauth/consent/page.tsx` (+ client form, server actions)
- Outside the `(app)` shell (minimal, branded card). Needs a session: if logged out, redirect
  to `/login?next=/oauth/consent?authorization_id=…`.
- Server side: `supabase.auth.oauth.getAuthorizationDetails(authorization_id)`.
  - Already consented → redirect to returned `redirect_url`.
  - Error / unknown id → friendly error card ("This connection request expired — start again
    from Claude").
- **Redirect-URI allowlist** (anti-phishing, since DCR lets anyone register a client): only
  `https://claude.ai/api/mcp/auth_callback`, `https://claude.com/api/mcp/auth_callback`, and
  `http://localhost:<port>/…` / `http://127.0.0.1:<port>/…` (Claude Code / Desktop). Anything else:
  page shows "This app isn't allowed to connect" and denies.
- Shows: client name, the account ("as Lauri Laurits · lauri@…"), access choice
  (Read only default / Read and write), Allow / Deny.
- Allow (server action): upsert `mcp_connections` (user, client_id, can_write, client_name),
  then `approveAuthorization` → redirect. Deny: `denyAuthorization` → redirect.
- Only `active` users may approve (pending/disabled get the normal gate).

### 2. `mcp_connections` table (migration)
`id uuid pk, user_id → user_profiles, client_id text, client_name text, can_write bool default
false, created_at, last_used_at, revoked_at, revoked_by` · unique (user_id, client_id) where not
revoked.
- RLS like `mcp_keys`: own rows + admin read; insert/update own via column grants
  (`can_write`, `client_name` on insert/re-consent; `revoked_at` on revoke); permanent-revoke trigger
  reused in spirit (revoked stays revoked; re-consent creates a fresh row).
- `mcp_resolve_connection(p_user uuid, p_client text)` SECURITY DEFINER, service_role only:
  returns `(connection_id, can_write)` iff not revoked and profile `active`; throttled
  `last_used_at` stamp — mirrors `mcp_resolve_key`.
- Usage/rate limit: `mcp_key_usage` gets keyed by a generic credential id. Its FK to
  `mcp_keys` is dropped and replaced by `credential_id uuid` (key id or connection id; ids are
  uuids so no collision) — counters stay per credential.

### 3. `/api/mcp` accepts two credentials — `src/lib/mcp/auth.ts`
- `Bearer pmk_…` → existing key path (unchanged).
- `Bearer <JWT>` → verify via `supabase.auth.getClaims(token)` (works for HS256 and asymmetric
  keys); require `client_id` claim (= an OAuth token, not a stolen browser session token) →
  `mcp_resolve_connection(sub, client_id)` → `McpAuth { userId, credentialId, canWrite, kind: "oauth" }`.
- User-scoped DB client: for OAuth, use the **received access token** directly (RLS sees the
  user); for keys, keep minting the 5-min JWT.
- No/invalid credential → 401 **with** `WWW-Authenticate: Bearer resource_metadata="<origin>/.well-known/oauth-protected-resource"`
  (claude.ai needs it to start the login; replaces the earlier "no header" choice).
- Audit metadata: `via: "mcp"`, plus `key_id` or `connection_id` + `client_name`.

### 4. Discovery — `src/app/.well-known/oauth-protected-resource/route.ts`
Returns `{ resource: "<origin>/api/mcp", authorization_servers: ["<SUPABASE_URL>/auth/v1"],
bearer_methods_supported: ["header"] }`, CORS-open. Excluded from the session middleware
(like `/api/mcp`).

### 5. Login `next` support
`/login?next=…` → after sign-in, go to `next` **only if** it is a same-origin relative path
starting with `/oauth/consent` (open-redirect guard); else `/dashboard`.

### 6. Settings → AI assistant: "Connected apps"
List own connections (app name, access, connected, last used) + **Disconnect** (sets
`revoked_at` — that row is the gate, so the endpoint refuses immediately). A user's own
Disconnect also calls Supabase's revoke-grant for that client (best effort, so its refresh
tokens die too); an admin Disconnect revokes only our row, which is sufficient.
Admin User access page lists all connections next to all keys, with Disconnect.

## Configuration (one-time, by the user)

- Supabase dashboard (prod): Authentication → OAuth Server → enable, Authorization Path
  `/oauth/consent`, **allow dynamic client registration**. Site URL already = prod URL.
- Local: `supabase/config.toml` `[auth.oauth_server] enabled = true`,
  `allow_dynamic_registration = true`.
- claude.ai: Settings → Connectors → Add custom connector → `https://pm-app-eight-alpha.vercel.app/api/mcp`
  (Team/Enterprise: an owner adds it once for the org).

## Security notes

- Tokens are standard Supabase user JWTs → RLS enforces the user's real permissions, as today.
- A connection row is required on every request: Disconnect works instantly even though the
  JWT is still unexpired.
- Browser session JWTs (no `client_id`) are rejected on `/api/mcp`.
- Redirect-URI allowlist on the consent page blocks look-alike apps.
- Read only by default; write is an explicit choice per connection.
- Open DCR only creates client records; nothing is granted without a logged-in user's consent.

## Error handling

- Expired/unknown `authorization_id` → error card with "start again from Claude".
- Supabase OAuth disabled/misconfigured → consent page error card; `/api/mcp` key path unaffected.
- `getClaims` network failure → 503 (fail closed), like the key resolver.
- Revoked connection / inactive user → 401 with the `WWW-Authenticate` challenge (claude.ai
  offers reconnect).

## Testing

- Vitest: credential parsing (key vs JWT vs junk), `client_id` required, 401 header shape,
  protected-resource metadata, `next` guard, redirect-URI allowlist, `toolsForKey` for oauth.
- pgTAP: `mcp_connections` RLS/grants, permanent revoke, `mcp_resolve_connection` rules,
  usage counter keyed by credential id.
- Local end-to-end: register a client via DCR against local Supabase, run authorize → consent
  → token exchange with PKCE, call `/api/mcp` with the token (read-only vs write tool lists),
  disconnect → 401.
- Prod: real claude.ai connector after deploy.

## Implementation notes (2026-10-14)

Deliberate deviations from the sections above:
- `mcp_key_usage.key_id` keeps its name (FK dropped; holds a key id **or** a connection id)
  instead of a rename to `credential_id`.
- Connections are written only through two SECURITY DEFINER RPCs (`mcp_connect`,
  `mcp_disconnect`); `authenticated` has column-scoped SELECT and no write grants.
- **No per-connection admin Disconnect.** Supabase silently re-approves an already-consented
  client, so an admin-revoked row would leave the user in a reconnect loop. Admins see all
  connections (read-only); to cut someone off they disable the account. Users disconnect their
  own (row revoked + Supabase grant revoked → next connect asks consent again; verified).

Verified locally end to end (DCR → authorize → login detour → consent → token → `/api/mcp`):
read-only = 14 tools; read and write = 26 tools (all writes `destructiveHint`); Disconnect →
immediate 401 with the `WWW-Authenticate` challenge; a plain browser-session JWT → 401.
Local Supabase signs these tokens ES256; `getClaims` also handles HS256 (prod's legacy secret).
Local Supabase serves its OAuth metadata at `/.well-known/oauth-authorization-server` and
`/auth/v1/.well-known/oauth-authorization-server` (not the RFC 8414 path-inserted form) — MCP
clients try those fallbacks; confirm on prod during go-live.

## Go-live checklist

1. `npx supabase db push` (migrations `20261014000001_mcp_connections` + `20261014000002_mcp_oauth_hardening`).
   The second sets PostgREST's `db_pre_request` on the `authenticator` role; confirm afterwards that a
   normal login still loads the dashboard (it must) and that an OAuth token sent straight to
   `/rest/v1` gets 403.
2. Supabase dashboard → Authentication → OAuth Server: **enable**, Authorization Path
   `/oauth/consent`, **allow dynamic client registration**. (Site URL is already the prod URL.)
3. Push `master` (Vercel deploys).
4. claude.ai → Settings → Connectors → Add custom connector →
   `https://pm-app-eight-alpha.vercel.app/api/mcp` → Connect → log in → Allow.
5. If claude.ai's token step fails with an ID-token/`openid` error: switch the Supabase project to
   asymmetric JWT signing keys (Settings → JWT Keys) and keep the legacy secret active so `pmk_`
   keys keep working.

## Final-review hardening (2026-10-14)

- **Redirect allowlist on every path.** The already-consented branch only follows an allowlisted
  callback, and approval requires *every* redirect URI the client registered to be allowlisted
  (service-role `auth.admin.oauth.getClient`) — a client can't pair a Claude callback with another
  address.
- **OAuth tokens never reach the database directly.** `public.reject_oauth_client_tokens()` runs as
  PostgREST's pre-request hook and refuses any JWT with a `client_id` claim (403). `/api/mcp`
  verifies the token, then uses its own 5-minute minted JWT (as for keys) — so "Read only" and
  Disconnect hold everywhere, and the token can't mint keys or upgrade its own connection.
- **No revival after reconnect.** `mcp_resolve_connection` takes the token's `iat`; tokens issued
  before the current connection row are refused.
- **Anti-framing** (`frame-ancestors 'none'` + `X-Frame-Options: DENY`) on `/oauth/*` and `/login`.
- **Discovery origin from config** (`NEXT_PUBLIC_SITE_URL`), request headers only as a local fallback.

Residual (not code-fixable here): Supabase Auth's own endpoints (e.g. `/auth/v1/user`) and Storage
also accept the token; Storage only allows image uploads to the public avatars bucket (same as the
user's own rights). Verify on prod that `PUT /auth/v1/user` with an OAuth app token is rejected.
