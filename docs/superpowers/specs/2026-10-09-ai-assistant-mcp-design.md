# AI assistant connection (MCP) — design

Date: 2026-10-09 · Status: approved in conversation, awaiting spec review
Reference implementation studied: `Opus/opus-ee-web` (Payload CMS `@payloadcms/plugin-mcp`) — pattern reused, code not.

## Purpose
Let each user connect their own AI assistant (Claude Code, Claude Desktop) to the PM app so it can read and change data **as that user, with exactly that user's permissions**, without being able to do harm: no deletes, no credentials, no user/permission administration, everything audited.

## Decisions
| Topic | Decision |
|---|---|
| Who creates keys | Each active user, self-service, in **Settings → AI assistant**. Admins see and can revoke all keys on **User access**. |
| Key format & storage | `pmk_` + 32 random bytes base64url. Only `sha256(key)` and a 10-char display prefix are stored. Shown once on creation. |
| Expiry | Chosen at creation: 30 / 90 (default) days (max 90 since the 2026-10-12 hardening). Expired or revoked keys get HTTP 401. |
| Identity | Server verifies the key, then mints a **5-minute Supabase JWT** for the key's user (HS256 with the project JWT secret, `role: authenticated`, `sub: user_id`) and uses a user-scoped Supabase client. All existing RLS, `has_permission` and RPC checks apply unchanged. A disabled/pending user's key is refused. |
| Transport | Streamable HTTP MCP endpoint at `POST /api/mcp` (Next.js route handler, `mcp-handler` + `@modelcontextprotocol` SDK, versions verified at build time). |
| Scope (option C) | Read everything the user can read; write Sales and project-work data. **No delete tools, no credential tools, no user/role/access/delegation tools, no settings.** |
| Rate limit | 60 tool calls per key per minute (DB counter); over the limit → MCP error "Rate limit reached, try again in a minute". |
| Audit | Every write tool writes `audit_logs` with `metadata.via = 'mcp'` and `metadata.key_id`; read tools only bump `last_used_at`. |
| Instructions | Server `instructions` string (rules below) shipped to every client. |

## Data model (migration `2026100900000x_mcp_keys.sql`)
- `mcp_keys(id uuid pk, user_id uuid → user_profiles on delete cascade, label text not null, key_hash text unique not null, key_prefix text not null, created_at, expires_at timestamptz not null, last_used_at timestamptz, revoked_at timestamptz, revoked_by uuid)`.
- RLS: a user selects/inserts/updates (revoke only) **their own** rows; admins (`is_admin()`) select/update all. No delete. Column grants: update only `revoked_at, revoked_by, label`.
- `mcp_key_usage(key_id uuid, minute timestamptz, calls int, primary key(key_id, minute))` — written only by a SECURITY DEFINER `mcp_bump_usage(p_key_id)` returning the current minute's count; old rows pruned by the same function (> 1 hour).
- `mcp_resolve_key(p_hash text)` SECURITY DEFINER, executable by `service_role` only: returns `key_id, user_id` when not revoked, not expired and the user's profile is `active`; also sets `last_used_at = now()`.
- Env: `SUPABASE_JWT_SECRET` (local: from `npx supabase status`; production: Supabase dashboard → Project Settings → JWT keys → legacy JWT secret) added to Vercel.

## Tools (all run as the key's user)
**Read:** `whoami`, `search` (projects/clients/people), `list_projects` (filters: status, PM), `get_project` (parts, team, milestones, recent status updates, budget summary if allowed), `list_clients`, `get_client`, `list_people`, `get_person` (current allocation, time off), `get_workload` (week range), `list_time_entries` (person/project/month), `get_budget` (project; finance columns only when RLS returns them), `sales_overview` (companies with next step, filters as in the list), `get_company` (contacts, deals with offers, next steps, last 50 history entries), `my_next_steps`.
**Write (Sales):** `log_activity`, `plan_step`, `complete_step`, `update_step`, `cancel_step`, `move_entry_to_steps`, `create_lead`, `update_deal` (stage/title/source/owner; Lost requires reason), `save_offer` (create/update).
**Write (Projects):** `post_status_update`, `update_project` (allowlisted fields: name, description, status, start_date, deadline, tags (icon tag preserved)), `log_time` (monthly entry). Budget writes (`add_budget_item` / `update_budget_item`) were REMOVED in the 2026-10-12 hardening -- financial entries stay a human action in the app.
Every write tool: zod-validated input reusing the app's existing schemas; maps DB errors to friendly text; returns what changed plus the app URL of the affected page.

## Server instructions (summary)
Act only on what the user asked; before any change, state exactly what will change and get the user's confirmation; never invent names, numbers, dates or amounts — ask; never claim something was done unless the tool returned success; after a change report the result and the link; dates `dd.mm.yyyy`; you cannot delete, reveal credentials or change permissions — tell the user to do those in the app.

## Settings UI
**Settings → AI assistant** card: "Create key" (label, expiry) → one-time display of the key + copy buttons for `claude mcp add -s user --transport http pm-cms <origin>/api/mcp --header "Authorization: Bearer <key>"` and the Claude Desktop `mcp-remote` JSON snippet; table of the user's keys (label, prefix, created, expires, last used, status) with Revoke. **User access** page gets a "AI keys" section listing all keys (user, label, last used, status) with Revoke.

## Testing
- pgTAP: key RLS (own vs others, admin), `mcp_resolve_key` rejects revoked/expired/inactive and is service-role only, usage counter.
- Vitest: key generation/hashing, JWT minting claims, each tool's input schema, error mapping, rate-limit decision, tool registry contains no delete/credential/admin tool names.
- Integration: local route handler called with a real key (curl `initialize` / `tools/list` / `tools/call`) as sara (sales), bella (PM without sales: sales tools return permission errors), admin; revoked key → 401.
- End-to-end: Claude Code connected to the local app with a key — read a company, plan a step, mark it done; verify audit rows `via=mcp`.

## Out of scope
OAuth login flow for MCP clients, per-key tool scopes, in-app chat UI, prompts/resources beyond tools + instructions.

## Hardening (2026-10-12)

- Per-key access chosen at creation: **Read only** (default) or **Read and write** (`mcp_keys.can_write`, no UPDATE grant -- fixed for the key's life). Read-only keys are only shown the read tools; `runTool` refuses write tools for them as a second layer; server instructions tell the model the key is read-only.
- Max expiry 90 days (RLS: `expires_at <= now() + 91 days`).
- Every write tool carries `destructiveHint: true` so MCP clients ask the user before running it.
- No budget write tools.
