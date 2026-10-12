-- AI assistant hardening (2026-10-12):
--   1. Per-key access: keys are read-only unless created with can_write. Fixed at creation --
--      to change it, create a new key (no UPDATE grant on the column).
--   2. Expiry capped at 90 days (was 366).
--   3. mcp_resolve_key also returns can_write, so the endpoint only exposes write tools to
--      write-enabled keys.

-- ---------- 1. can_write ----------
-- Existing keys default to read-only: anyone who wants writes creates a new key deliberately.
alter table public.mcp_keys add column can_write boolean not null default false;

grant select (can_write) on public.mcp_keys to authenticated;
grant insert (can_write) on public.mcp_keys to authenticated;

-- ---------- 2. 90-day cap ----------
-- 91 days of slack over the UI's 90 so a key created at 23:59 isn't rejected by clock skew.
drop policy "insert own mcp_keys" on public.mcp_keys;
create policy "insert own mcp_keys" on public.mcp_keys for insert
  with check (
    user_id = auth.uid()
    and revoked_at is null
    and revoked_by is null
    and last_used_at is null
    and expires_at > now()
    and expires_at <= now() + interval '91 days'
  );

-- ---------- 3. mcp_resolve_key returns can_write ----------
-- Return type changes, so drop + recreate (same body otherwise; see 20261009000001).
drop function public.mcp_resolve_key(text);

create function public.mcp_resolve_key(p_hash text)
returns table (key_id uuid, user_id uuid, can_write boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_user uuid;
  v_write boolean;
begin
  select k.id, k.user_id, k.can_write into v_id, v_user, v_write
    from public.mcp_keys k
   where k.key_hash = p_hash
     and k.revoked_at is null
     and k.expires_at > now()
     and exists (
       select 1 from public.user_profiles p
       where p.id = k.user_id and p.status = 'active'
     );

  if v_id is null then
    return;
  end if;

  update public.mcp_keys
     set last_used_at = now()
   where id = v_id
     and (last_used_at is null or last_used_at < now() - interval '1 minute');

  key_id := v_id;
  user_id := v_user;
  can_write := v_write;
  return next;
end;
$$;

revoke all on function public.mcp_resolve_key(text) from public, anon, authenticated;
grant execute on function public.mcp_resolve_key(text) to service_role;
