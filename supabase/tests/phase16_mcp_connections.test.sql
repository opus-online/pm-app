begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

-- Phase 16: claude.ai connector (OAuth) -- per-user app connections.
-- Spec: docs/superpowers/specs/2026-10-14-claude-connector-oauth-design.md

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
