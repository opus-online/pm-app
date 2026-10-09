begin;
create extension if not exists pgtap with schema extensions;
select plan(33);

-- Phase 15: AI assistant MCP -- access keys, usage counter, service-role resolver.
-- Spec: docs/superpowers/specs/2026-10-09-ai-assistant-mcp-design.md (Data model)

-- fixtures: u1, u2 (active members), adm (admin), dis (disabled)
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, encrypted_password, created_at, updated_at) values
  ('fe000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','u1-mcp@test.local','{"full_name":"U1"}','{}','',now(),now()),
  ('fe000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','u2-mcp@test.local','{"full_name":"U2"}','{}','',now(),now()),
  ('fe000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','adm-mcp@test.local','{"full_name":"Adm"}','{}','',now(),now()),
  ('fe000000-0000-4000-8000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dis-mcp@test.local','{"full_name":"Dis"}','{}','',now(),now());
update public.user_profiles set status='active' where id::text like 'fe000000-%';
update public.user_profiles set status='disabled' where id='fe000000-0000-4000-8000-000000000004';
insert into public.user_roles (user_id, role_key) values
  ('fe000000-0000-4000-8000-000000000001','member'),
  ('fe000000-0000-4000-8000-000000000002','member'),
  ('fe000000-0000-4000-8000-000000000003','admin'),
  ('fe000000-0000-4000-8000-000000000004','member');

-- key fixtures, written as the superuser (not through the authenticated-role insert path, which
-- is column-scoped and never grants `id` -- a real client never sets id/created_at either, it
-- lets them default): u1's key 0001, u2's key 0002, and the resolver fixtures (valid, revoked,
-- expired, disabled-owner).
insert into public.mcp_keys (id, user_id, label, key_hash, key_prefix, expires_at) values
  ('fe100000-0000-4000-8000-000000000001','fe000000-0000-4000-8000-000000000001','Laptop','hash-u1-a','pm_abcd', now() + interval '30 days'),
  ('fe100000-0000-4000-8000-000000000002','fe000000-0000-4000-8000-000000000002','U2 key','hash-u2-a','pm_efgh', now() + interval '30 days'),
  ('fe100000-0000-4000-8000-000000000010','fe000000-0000-4000-8000-000000000001','Valid','hash-valid','pm_v1v1', now() + interval '10 days'),
  ('fe100000-0000-4000-8000-000000000012','fe000000-0000-4000-8000-000000000001','Expired','hash-expired','pm_expd', now() - interval '1 day'),
  ('fe100000-0000-4000-8000-000000000013','fe000000-0000-4000-8000-000000000004','Disabled owner','hash-disabled','pm_disd', now() + interval '10 days');
insert into public.mcp_keys (id, user_id, label, key_hash, key_prefix, expires_at, revoked_at) values
  ('fe100000-0000-4000-8000-000000000011','fe000000-0000-4000-8000-000000000001','Revoked','hash-revoked','pm_rvkd', now() + interval '10 days', now());

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"fe000000-0000-4000-8000-000000000001","role":"authenticated"}';

-- 1. own insert ok (a real client-shaped insert: no id/created_at/revoked_*/last_used_at)
with d as (
  insert into public.mcp_keys (user_id, label, key_hash, key_prefix, expires_at)
  values ('fe000000-0000-4000-8000-000000000001','New key','hash-u1-new','pm_newk', now() + interval '30 days')
  returning 1
)
select is((select count(*)::int from d), 1, 'u1 can insert their own key');

-- 2. insert for another user rejected
select throws_ok(
  $$ insert into public.mcp_keys (user_id, label, key_hash, key_prefix, expires_at)
     values ('fe000000-0000-4000-8000-000000000002','Spoofed','hash-spoof','pm_zzzz', now() + interval '30 days') $$,
  '42501', null, 'insert for another user is rejected');

-- 3. insert with expires_at beyond 366 days is rejected
select throws_ok(
  $$ insert into public.mcp_keys (user_id, label, key_hash, key_prefix, expires_at)
     values ('fe000000-0000-4000-8000-000000000001','Too long','hash-toolong','pm_yyyy', now() + interval '400 days') $$,
  '42501', null, 'insert with expires_at beyond 366 days is rejected');

-- insert hygiene: a pre-revoked key cannot be created (the insert column grant doesn't even
-- include revoked_at/revoked_by, so this fails before RLS is reached)
select throws_ok(
  $$ insert into public.mcp_keys (user_id, label, key_hash, key_prefix, expires_at, revoked_at)
     values ('fe000000-0000-4000-8000-000000000001','Pre-revoked','hash-prerevoked','pm_prrv', now() + interval '30 days', now()) $$,
  '42501', null, 'insert of a pre-revoked key is rejected');

-- insert hygiene: expires_at <= now() is rejected
select throws_ok(
  $$ insert into public.mcp_keys (user_id, label, key_hash, key_prefix, expires_at)
     values ('fe000000-0000-4000-8000-000000000001','Already expired','hash-alreadyexpired','pm_alex', now() - interval '1 day') $$,
  '42501', null, 'insert with expires_at <= now() is rejected');

-- u2 can insert their own key too (same client-shaped insert)
set local "request.jwt.claims" to '{"sub":"fe000000-0000-4000-8000-000000000002","role":"authenticated"}';
with d as (
  insert into public.mcp_keys (user_id, label, key_hash, key_prefix, expires_at)
  values ('fe000000-0000-4000-8000-000000000002','U2 new key','hash-u2-new','pm_u2nw', now() + interval '30 days')
  returning 1
)
select is((select count(*)::int from d), 1, 'u2 can insert their own key');

-- 4. u2 cannot read u1's key
select is(
  (select count(*)::int from public.mcp_keys where id='fe100000-0000-4000-8000-000000000001'),
  0,
  'u2 cannot read u1''s key');

-- 5. admin reads all keys
set local "request.jwt.claims" to '{"sub":"fe000000-0000-4000-8000-000000000003","role":"authenticated"}';
select is(
  (select count(*)::int from public.mcp_keys where id in
    ('fe100000-0000-4000-8000-000000000001','fe100000-0000-4000-8000-000000000002')),
  2,
  'admin reads all keys');

-- 6. nobody can delete a key (no delete grant)
select is(
  has_table_privilege('authenticated', 'public.mcp_keys', 'DELETE'),
  false,
  'authenticated has no DELETE privilege on mcp_keys');

-- an actual delete attempt (not just the privilege check above) is rejected and removes nothing
set local "request.jwt.claims" to '{"sub":"fe000000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok(
  $$ delete from public.mcp_keys where id = 'fe100000-0000-4000-8000-000000000001' $$,
  '42501', null, 'an actual delete attempt by the owner is rejected');
select is(
  (select count(*)::int from public.mcp_keys where id='fe100000-0000-4000-8000-000000000001'),
  1,
  'the delete attempt affected 0 rows -- the key still exists');

-- 7. u1 revokes their own key
update public.mcp_keys set revoked_at = now(), revoked_by = auth.uid()
 where id = 'fe100000-0000-4000-8000-000000000001';
select is(
  (select revoked_by::text from public.mcp_keys where id='fe100000-0000-4000-8000-000000000001'),
  'fe000000-0000-4000-8000-000000000001',
  'u1 revokes their own key');

-- revocation is permanent: the owner cannot un-revoke
select throws_ok(
  $$ update public.mcp_keys set revoked_at = null where id = 'fe100000-0000-4000-8000-000000000001' $$,
  '42501', null, 'owner cannot un-revoke a revoked key');

-- revocation is permanent: an admin cannot un-revoke it either
set local "request.jwt.claims" to '{"sub":"fe000000-0000-4000-8000-000000000003","role":"authenticated"}';
select throws_ok(
  $$ update public.mcp_keys set revoked_at = null where id = 'fe100000-0000-4000-8000-000000000001' $$,
  '42501', null, 'admin cannot un-revoke a revoked key either');

-- revoking with a spoofed revoked_by is overwritten with the actual caller: u2 revokes their
-- own key but names u1 as the revoker
set local "request.jwt.claims" to '{"sub":"fe000000-0000-4000-8000-000000000002","role":"authenticated"}';
update public.mcp_keys
   set revoked_at = now(), revoked_by = 'fe000000-0000-4000-8000-000000000001'
 where id = 'fe100000-0000-4000-8000-000000000002';
select is(
  (select revoked_by::text from public.mcp_keys where id='fe100000-0000-4000-8000-000000000002'),
  'fe000000-0000-4000-8000-000000000002',
  'a spoofed revoked_by is overwritten with the actual caller');
select isnt(
  (select revoked_at from public.mcp_keys where id='fe100000-0000-4000-8000-000000000002'),
  null,
  'the revocation itself still takes effect');

-- 8. column grant restricts updates to revoked_at/revoked_by/label -- key_hash is not updatable
select throws_ok(
  $$ update public.mcp_keys set key_hash = 'hacked' where id = 'fe100000-0000-4000-8000-000000000002' $$,
  '42501', null, 'authenticated cannot update mcp_keys.key_hash (column grant)');
reset role;

-- 9/10. authenticated cannot execute mcp_resolve_key / mcp_bump_usage (service-role only)
select is(has_function_privilege('authenticated', 'public.mcp_resolve_key(text)', 'EXECUTE'),
  false, 'authenticated cannot execute mcp_resolve_key');
select is(has_function_privilege('authenticated', 'public.mcp_bump_usage(uuid)', 'EXECUTE'),
  false, 'authenticated cannot execute mcp_bump_usage');
select is(has_function_privilege('anon', 'public.mcp_resolve_key(text)', 'EXECUTE'),
  false, 'anon cannot execute mcp_resolve_key');
select is(has_function_privilege('anon', 'public.mcp_bump_usage(uuid)', 'EXECUTE'),
  false, 'anon cannot execute mcp_bump_usage');
select is(has_function_privilege('service_role', 'public.mcp_resolve_key(text)', 'EXECUTE'),
  true, 'service_role can execute mcp_resolve_key');
select is(has_function_privilege('service_role', 'public.mcp_bump_usage(uuid)', 'EXECUTE'),
  true, 'service_role can execute mcp_bump_usage');

-- authenticated has no privilege at all on mcp_key_usage (zero policies + no grants)
select is(has_table_privilege('authenticated', 'public.mcp_key_usage', 'SELECT'),
  false, 'authenticated cannot select mcp_key_usage');
select is(has_table_privilege('authenticated', 'public.mcp_key_usage', 'INSERT'),
  false, 'authenticated cannot insert mcp_key_usage');

-- 11. resolver returns the user for a valid key, and stamps last_used_at
select is(
  (select user_id from public.mcp_resolve_key('hash-valid')),
  'fe000000-0000-4000-8000-000000000001'::uuid,
  'mcp_resolve_key returns the owning user for a valid key');
select isnt(
  (select last_used_at from public.mcp_keys where id='fe100000-0000-4000-8000-000000000010'),
  null,
  'mcp_resolve_key stamps last_used_at on success');

-- 12. resolver returns nothing for a revoked key
select is(
  (select count(*)::int from public.mcp_resolve_key('hash-revoked')),
  0,
  'mcp_resolve_key returns nothing for a revoked key');

-- 13. resolver returns nothing for an expired key
select is(
  (select count(*)::int from public.mcp_resolve_key('hash-expired')),
  0,
  'mcp_resolve_key returns nothing for an expired key');

-- 14. resolver returns nothing when the owning profile is disabled
select is(
  (select count(*)::int from public.mcp_resolve_key('hash-disabled')),
  0,
  'mcp_resolve_key returns nothing for a disabled user''s key');

-- ---------- mcp_bump_usage: counts 1, 2, 3 within the same minute ----------
select is(public.mcp_bump_usage('fe100000-0000-4000-8000-000000000010'), 1, 'mcp_bump_usage first call returns 1');
select is(public.mcp_bump_usage('fe100000-0000-4000-8000-000000000010'), 2, 'mcp_bump_usage second call returns 2');
select is(public.mcp_bump_usage('fe100000-0000-4000-8000-000000000010'), 3, 'mcp_bump_usage third call returns 3');

select * from finish();
rollback;
