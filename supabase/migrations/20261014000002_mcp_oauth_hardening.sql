-- claude.ai connector hardening (final review of 20261014000001).
-- Spec: docs/superpowers/specs/2026-10-14-claude-connector-oauth-design.md

-- ---------- Critical #2: OAuth app tokens stay on /api/mcp ----------
-- Supabase OAuth access tokens are full user JWTs (role authenticated + a client_id claim). Used
-- directly against PostgREST they would ignore the connection's "Read only" choice, outlive a
-- Disconnect and could even mint a pmk_ key. PostgREST runs this before every request and refuses
-- any JWT carrying client_id; /api/mcp verifies the OAuth token itself and talks to the database
-- with its own 5-minute minted JWT (no client_id), exactly like pmk_ keys.
create function public.reject_oauth_client_tokens()
returns void
language plpgsql
stable
as $$
begin
  if coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb ? 'client_id' then
    raise exception 'App tokens can only be used through the PM app AI endpoint.' using errcode = '42501';
  end if;
end;
$$;
grant execute on function public.reject_oauth_client_tokens() to anon, authenticated, service_role;

alter role authenticator set pgrst.db_pre_request = 'public.reject_oauth_client_tokens';
notify pgrst, 'reload config';

-- ---------- Important #1: old tokens don't revive after a reconnect ----------
-- A token must be issued at or after its connection row was created (iat has whole seconds, so
-- compare against created_at truncated to the second). Disconnect + reconnect therefore kills
-- every token issued before the reconnect, even though the client id is the same.
drop function public.mcp_resolve_connection(uuid, text);

create function public.mcp_resolve_connection(p_user uuid, p_client text, p_issued_at timestamptz)
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
     and date_trunc('second', c.created_at) <= p_issued_at
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
revoke all on function public.mcp_resolve_connection(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.mcp_resolve_connection(uuid, text, timestamptz) to service_role;
