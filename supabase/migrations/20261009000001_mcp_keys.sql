-- AI assistant MCP integration: access keys + usage counter + service-role resolver.
-- Spec: docs/superpowers/specs/2026-10-09-ai-assistant-mcp-design.md (Data model)

-- ---------- mcp_keys ----------
create table public.mcp_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles (id) on delete cascade,
  label text not null,
  key_hash text not null unique,
  key_prefix text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_used_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references public.user_profiles (id)
);
create index mcp_keys_user_idx on public.mcp_keys (user_id);

-- ---------- mcp_key_usage ----------
-- written only by the SECURITY DEFINER mcp_bump_usage() below; no client-facing policy grants
-- any privilege here at all (RLS is enabled with zero policies -- a hard deny for every role
-- that isn't the table owner/a SECURITY DEFINER function owned by it).
create table public.mcp_key_usage (
  key_id uuid not null references public.mcp_keys (id) on delete cascade,
  minute timestamptz not null,
  calls int not null default 0,
  primary key (key_id, minute)
);

-- ---------- RLS: mcp_keys ----------
alter table public.mcp_keys enable row level security;

create policy "view own mcp_keys" on public.mcp_keys for select
  using (user_id = auth.uid() or public.is_admin());

create policy "insert own mcp_keys" on public.mcp_keys for insert
  with check (
    user_id = auth.uid()
    and revoked_at is null
    and revoked_by is null
    and last_used_at is null
    and expires_at > now()
    and expires_at <= now() + interval '366 days'
  );

-- revoke (and label rename) only; which columns can actually be written is enforced below by
-- the column-level grant, not by this USING/WITH CHECK pair.
create policy "update own mcp_keys" on public.mcp_keys for update
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

-- no delete policy: keys are retired via revoke, never removed.

-- Revocation is permanent and server-stamped: once revoked_at is set, no update (owner or
-- admin -- RLS's USING/WITH CHECK above allows both to reach this row) may clear it or
-- reattribute who revoked it; and revoked_at/revoked_by can only move together, on the one
-- transition from null -> set, with server-controlled values (never a client-supplied
-- revoked_at/revoked_by, however the column grant below would otherwise allow it).
create or replace function public.mcp_keys_guard_revocation()
returns trigger
language plpgsql
as $$
begin
  if old.revoked_at is not null then
    if new.revoked_at is distinct from old.revoked_at or new.revoked_by is distinct from old.revoked_by then
      raise exception 'A revoked key cannot be un-revoked or reattributed' using errcode = '42501';
    end if;
  elsif new.revoked_at is not null then
    new.revoked_at := now();
    new.revoked_by := auth.uid();
  else
    if new.revoked_by is distinct from old.revoked_by then
      raise exception 'revoked_by can only be set together with revoked_at' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger mcp_keys_guard_revocation
  before update on public.mcp_keys
  for each row execute function public.mcp_keys_guard_revocation();

alter table public.mcp_key_usage enable row level security;

grant select on public.mcp_keys to authenticated;
grant insert (user_id, label, key_hash, key_prefix, expires_at) on public.mcp_keys to authenticated;
grant update (revoked_at, revoked_by, label) on public.mcp_keys to authenticated;
grant select, insert, update, delete on public.mcp_keys, public.mcp_key_usage to service_role;

-- ---------- mcp_resolve_key: service-role-only lookup used by the MCP route handler ----------
-- Resolves a hashed key to (key_id, user_id) iff the key is not revoked, not expired and the
-- owning profile is 'active'; stamps last_used_at in the same statement. Returns zero rows for
-- any other reason (revoked/expired/disabled/unknown hash) -- the caller cannot distinguish why.
create or replace function public.mcp_resolve_key(p_hash text)
returns table (key_id uuid, user_id uuid)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.mcp_keys k
     set last_used_at = now()
   where k.key_hash = p_hash
     and k.revoked_at is null
     and k.expires_at > now()
     and exists (
       select 1 from public.user_profiles p
       where p.id = k.user_id and p.status = 'active'
     )
  returning k.id, k.user_id;
end;
$$;

revoke all on function public.mcp_resolve_key(text) from public, anon, authenticated;
grant execute on function public.mcp_resolve_key(text) to service_role;

-- ---------- mcp_bump_usage: service-role-only per-minute call counter ----------
-- Upserts (key_id, current minute) calls+1, prunes rows for this key older than an hour, and
-- returns the current minute's count.
create or replace function public.mcp_bump_usage(p_key_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_minute timestamptz := date_trunc('minute', now());
  v_calls int;
begin
  insert into public.mcp_key_usage (key_id, minute, calls)
  values (p_key_id, v_minute, 1)
  on conflict (key_id, minute) do update set calls = mcp_key_usage.calls + 1
  returning calls into v_calls;

  delete from public.mcp_key_usage
   where key_id = p_key_id and minute < now() - interval '1 hour';

  return v_calls;
end;
$$;

revoke all on function public.mcp_bump_usage(uuid) from public, anon, authenticated;
grant execute on function public.mcp_bump_usage(uuid) to service_role;
