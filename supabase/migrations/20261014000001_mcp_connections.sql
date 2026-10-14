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
