begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

-- Phase 17: claude.ai connector hardening (final review).
-- Critical #2: OAuth app tokens (JWTs with a client_id claim) must not reach the database
-- directly through PostgREST -- only /api/mcp may use them, and it re-mints its own short JWT.
-- Important #1: a token issued before the current connection existed must not resolve.

-- pre-request guard
set local "request.jwt.claims" to '{"sub":"fc000000-0000-4000-8000-000000000001","role":"authenticated","client_id":"some-client"}';
select throws_ok($$ select public.reject_oauth_client_tokens() $$, '42501', null, 'an OAuth app token is rejected by the pre-request guard');

set local "request.jwt.claims" to '{"sub":"fc000000-0000-4000-8000-000000000001","role":"authenticated"}';
select lives_ok($$ select public.reject_oauth_client_tokens() $$, 'a normal session token passes the guard');

set local "request.jwt.claims" to '';
select lives_ok($$ select public.reject_oauth_client_tokens() $$, 'anonymous requests (no claims) pass the guard');

select ok(
  exists (
    select 1 from pg_db_role_setting s join pg_roles r on r.oid = s.setrole
    where r.rolname = 'authenticator'
      and 'pgrst.db_pre_request=public.reject_oauth_client_tokens' = any (s.setconfig)
  ),
  'PostgREST runs the guard before every request');

-- connection tokens must be newer than the connection
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, encrypted_password, created_at, updated_at) values
  ('fc000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','u1-hard@test.local','{"full_name":"U1"}','{}','',now(),now());
update public.user_profiles set status='active' where id='fc000000-0000-4000-8000-000000000001';
insert into public.mcp_connections (user_id, client_id, client_name, created_at) values
  ('fc000000-0000-4000-8000-000000000001','client-x','Claude', '2026-10-14 12:00:00.700+00');

select is((select count(*)::int from public.mcp_resolve_connection('fc000000-0000-4000-8000-000000000001', 'client-x', '2026-10-14 11:59:00+00')),
  0, 'a token issued before the connection was created does not resolve');
select is((select count(*)::int from public.mcp_resolve_connection('fc000000-0000-4000-8000-000000000001', 'client-x', '2026-10-14 12:00:00+00')),
  1, 'a token issued in the same second as the connection resolves (iat has whole seconds)');
select is((select count(*)::int from public.mcp_resolve_connection('fc000000-0000-4000-8000-000000000001', 'client-x', '2026-10-14 13:00:00+00')),
  1, 'a later token resolves');

select * from finish();
rollback;
