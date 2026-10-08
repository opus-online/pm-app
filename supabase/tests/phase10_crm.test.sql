begin;
create extension if not exists pgtap with schema extensions;
select plan(37);

-- fixtures: admin, sales (sal), second sales user (sal2), pm (no sales)
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, encrypted_password, created_at, updated_at) values
  ('ac000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','adm@crm.test','{"full_name":"Adm"}','{}','',now(),now()),
  ('ac000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','sal@crm.test','{"full_name":"Sal"}','{}','',now(),now()),
  ('ac000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','pm@crm.test','{"full_name":"Pem"}','{}','',now(),now()),
  ('ac000000-0000-4000-8000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','sal2@crm.test','{"full_name":"Sal2"}','{}','',now(),now());
update public.user_profiles set status='active' where id::text like 'ac000000-%';
insert into public.user_roles (user_id, role_key) values
  ('ac000000-0000-4000-8000-000000000001','admin'),
  ('ac000000-0000-4000-8000-000000000002','member'),
  ('ac000000-0000-4000-8000-000000000002','sales'),
  ('ac000000-0000-4000-8000-000000000003','project_manager'),
  ('ac000000-0000-4000-8000-000000000004','member'),
  ('ac000000-0000-4000-8000-000000000004','sales');

insert into public.clients (id, name, reg_code) values
  ('ac100000-0000-4000-8000-000000000001','Acme OÜ','12345678');
insert into public.deals (id, client_id, title, stage, source, owner_id) values
  ('ac200000-0000-4000-8000-000000000001','ac100000-0000-4000-8000-000000000001','E-shop','new','inbound','ac000000-0000-4000-8000-000000000002');

-- 1-2 reg code uniqueness is case/space-insensitive
select throws_ok($$ insert into public.clients (name, reg_code) values ('Dup', '12 345 678') $$, '23505', null, 'spaced reg code is a duplicate');
select lives_ok($$ insert into public.clients (name, reg_code) values ('NoCode1', null), ('NoCode2', null) $$, 'many clients may lack a reg code');
insert into public.clients (name, reg_code) values ('CaseDup1', 'ee123abc');
select throws_ok($$ insert into public.clients (name, reg_code) values ('CaseDup2', 'EE 123 ABC') $$, '23505', null, 'reg code uniqueness is case-insensitive');

-- 3 lost requires reason
select throws_ok($$ update public.deals set stage='lost' where id='ac200000-0000-4000-8000-000000000001' $$, '23514', null, 'lost needs a reason');

-- 4 company_kind
select is(public.company_kind('ac100000-0000-4000-8000-000000000001'), 'prospect', 'company with only an open deal is a prospect');

-- as PM without sales
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"ac000000-0000-4000-8000-000000000003","role":"authenticated"}';
select is((select count(*)::int from public.deals), 0, 'non-sales user sees no deals');
select is((select count(*)::int from public.offers), 0, 'non-sales user sees no offers');
select is((select count(*)::int from public.crm_activities), 0, 'non-sales user sees no activities');
select is(public.company_kind('ac100000-0000-4000-8000-000000000001'), 'prospect', 'company_kind identical for non-sales viewer');
select throws_ok($$ insert into public.deals (client_id, title, owner_id) values ('ac100000-0000-4000-8000-000000000001','x','ac000000-0000-4000-8000-000000000003') $$, '42501', null, 'non-sales cannot create deals');
select throws_ok($$ select public.set_sales_access('ac000000-0000-4000-8000-000000000003', true) $$, 'P0001', 'admin permission required', 'non-admin cannot call set_sales_access');

-- as sales user (sal)
set local "request.jwt.claims" to '{"sub":"ac000000-0000-4000-8000-000000000002","role":"authenticated"}';
select is((select count(*)::int from public.deals where id='ac200000-0000-4000-8000-000000000001'), 1, 'sales user sees deals');
select lives_ok($$ insert into public.crm_activities (client_id, kind, body) values ('ac100000-0000-4000-8000-000000000001','call','Called Mari') $$, 'sales user logs a call');
select throws_ok($$ insert into public.crm_activities (client_id, kind, body) values ('ac100000-0000-4000-8000-000000000001','system','fake') $$, '42501', null, 'users cannot insert system entries');
select throws_ok($$ insert into public.crm_activities (client_id, kind, body, actor_id) values ('ac100000-0000-4000-8000-000000000001','note','x','ac000000-0000-4000-8000-000000000001') $$, '42501', null, 'actor cannot be forged');
select lives_ok($$ insert into public.clients (name) values ('Prospect from sales') $$, 'sales user can create a company');
with d as (delete from public.clients where name='Prospect from sales' returning 1)
select is((select count(*)::int from d), 0, 'sales-only user cannot delete a client (manage_clients required)');

-- fixture activity owned by sal, used by the update-guard tests below
insert into public.crm_activities (id, client_id, kind, body) values
  ('ac300000-0000-4000-8000-000000000001','ac100000-0000-4000-8000-000000000001','note','Fixture for update tests');
select throws_ok($$ update public.crm_activities set kind='system' where id='ac300000-0000-4000-8000-000000000001' $$, '42501', null, 'sales user cannot update own activity to kind=system');
select throws_ok($$ update public.crm_activities set actor_id='ac000000-0000-4000-8000-000000000001' where id='ac300000-0000-4000-8000-000000000001' $$, '42501', null, 'actor_id is immutable on update (no column grant)');

-- a different sales user cannot touch sal's activity
set local "request.jwt.claims" to '{"sub":"ac000000-0000-4000-8000-000000000004","role":"authenticated"}';
with d as (update public.crm_activities set body='hacked' where id='ac300000-0000-4000-8000-000000000001' returning 1)
select is((select count(*)::int from d), 0, 'a different sales user cannot update someone else''s activity');
with d as (delete from public.crm_activities where id='ac300000-0000-4000-8000-000000000001' returning 1)
select is((select count(*)::int from d), 1, 'a different sales user can delete someone else''s logged activity (any Sales user, audited)');

-- role change keeps sales add-on
set local "request.jwt.claims" to '{"sub":"ac000000-0000-4000-8000-000000000001","role":"authenticated"}';
select lives_ok($$ select public.set_user_role('ac000000-0000-4000-8000-000000000002','finance') $$, 'admin can swap a main role');
select throws_ok($$ select public.set_user_role('ac000000-0000-4000-8000-000000000002','sales') $$, 'P0001', 'use set_sales_access for sales', 'set_user_role rejects sales as a direct role');
reset role;
select is((select count(*)::int from public.user_roles where user_id='ac000000-0000-4000-8000-000000000002' and role_key='sales'), 1, 'set_user_role keeps sales access');
select is((select count(*)::int from public.user_roles where user_id='ac000000-0000-4000-8000-000000000002' and role_key<>'sales'), 1, 'exactly one main role remains');

-- triggers + create_lead rpc
reset role;
select ok('ac100000-0000-4000-8000-000000000001'::uuid = any(array(select public.prospect_client_ids())), 'open-deal-only company listed as prospect');
-- triggers (run as owner, actor from claims)
set local "request.jwt.claims" to '{"sub":"ac000000-0000-4000-8000-000000000002","role":"authenticated"}';
update public.deals set stage='contacted' where id='ac200000-0000-4000-8000-000000000001';
-- within one pgTAP transaction now() is frozen, so created_at ties with the "Deal created" row
-- from the earlier fixture insert; discriminate on metadata (only stage/owner-change rows carry
-- a 'from' key) rather than trusting created_at ordering alone.
select is((select body from public.crm_activities where deal_id='ac200000-0000-4000-8000-000000000001' and kind='system' and metadata ? 'from' order by created_at desc limit 1),
          'Stage: new → contacted', 'stage change writes a system entry');
insert into public.offers (id, deal_id, title, amount) values ('ac400000-0000-4000-8000-000000000001','ac200000-0000-4000-8000-000000000001','v1',12000);
select ok(exists(select 1 from public.crm_activities where kind='system' and body='Offer added: v1'), 'offer insert writes a system entry');
update public.deals set stage='won' where id='ac200000-0000-4000-8000-000000000001';
select isnt((select won_at from public.deals where id='ac200000-0000-4000-8000-000000000001'), null, 'won sets won_at');
select is(public.company_kind('ac100000-0000-4000-8000-000000000001'), 'client', 'won deal makes a client');

insert into public.client_contacts (client_id, name, first_name, last_name) values ('ac100000-0000-4000-8000-000000000001','', 'Mari', 'Maasikas');
select is((select name from public.client_contacts where first_name='Mari'), 'Mari Maasikas', 'contact name derived from first+last');

set local role authenticated;
select ok((public.create_lead(null,
  '{"name":"Lead Co","reg_code":"87654321"}'::jsonb,
  '{"title":"Website","source":"outbound","owner_id":"ac000000-0000-4000-8000-000000000002"}'::jsonb,
  '{"first_name":"Jaan","last_name":"Tamm"}'::jsonb) ->> 'deal_id') is not null, 'create_lead creates company+deal+contact');
set local "request.jwt.claims" to '{"sub":"ac000000-0000-4000-8000-000000000003","role":"authenticated"}';
select throws_ok($$ select public.create_lead(null,'{"name":"X"}'::jsonb,'{"title":"Y","owner_id":"ac000000-0000-4000-8000-000000000003"}'::jsonb,null) $$, null, null, 'create_lead requires manage_sales');
reset role;

-- sales_people(): definer directory of deal owners / sales users, gated on view_sales
select is(has_function_privilege('anon', 'public.sales_people()', 'EXECUTE'), false, 'anon cannot execute sales_people()');
set local role authenticated;
select is((select count(*)::int from public.sales_people()), 0, 'non-sales user gets no sales people');
set local "request.jwt.claims" to '{"sub":"ac000000-0000-4000-8000-000000000004","role":"authenticated"}';
select is((select name from public.sales_people() where id='ac000000-0000-4000-8000-000000000002'), 'Sal', 'sales user resolves another owner''s name');
select ok(not exists(select 1 from public.sales_people() where id='ac000000-0000-4000-8000-000000000003'), 'a non-sales PM is not in the sales directory');
reset role;

select * from finish();
rollback;
