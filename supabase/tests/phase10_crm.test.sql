begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

-- fixtures: admin, sales, pm (no sales)
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, encrypted_password, created_at, updated_at) values
  ('ac000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','adm@crm.test','{"full_name":"Adm"}','{}','',now(),now()),
  ('ac000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','sal@crm.test','{"full_name":"Sal"}','{}','',now(),now()),
  ('ac000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','pm@crm.test','{"full_name":"Pem"}','{}','',now(),now());
update public.user_profiles set status='active' where id::text like 'ac000000-%';
insert into public.user_roles (user_id, role_key) values
  ('ac000000-0000-4000-8000-000000000001','admin'),
  ('ac000000-0000-4000-8000-000000000002','member'),
  ('ac000000-0000-4000-8000-000000000002','sales'),
  ('ac000000-0000-4000-8000-000000000003','project_manager');

insert into public.clients (id, name, reg_code) values
  ('ac100000-0000-4000-8000-000000000001','Acme OÜ','12345678');
insert into public.deals (id, client_id, title, stage, source, owner_id) values
  ('ac200000-0000-4000-8000-000000000001','ac100000-0000-4000-8000-000000000001','E-shop','new','inbound','ac000000-0000-4000-8000-000000000002');

-- 1-2 reg code uniqueness is case/space-insensitive
select throws_ok($$ insert into public.clients (name, reg_code) values ('Dup', '12 345 678') $$, '23505', null, 'spaced reg code is a duplicate');
select lives_ok($$ insert into public.clients (name, reg_code) values ('NoCode1', null), ('NoCode2', null) $$, 'many clients may lack a reg code');

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

-- as sales user
set local "request.jwt.claims" to '{"sub":"ac000000-0000-4000-8000-000000000002","role":"authenticated"}';
select is((select count(*)::int from public.deals where id='ac200000-0000-4000-8000-000000000001'), 1, 'sales user sees deals');
select lives_ok($$ insert into public.crm_activities (client_id, kind, body) values ('ac100000-0000-4000-8000-000000000001','call','Called Mari') $$, 'sales user logs a call');
select throws_ok($$ insert into public.crm_activities (client_id, kind, body) values ('ac100000-0000-4000-8000-000000000001','system','fake') $$, '42501', null, 'users cannot insert system entries');
select throws_ok($$ insert into public.crm_activities (client_id, kind, body, actor_id) values ('ac100000-0000-4000-8000-000000000001','note','x','ac000000-0000-4000-8000-000000000001') $$, '42501', null, 'actor cannot be forged');
select lives_ok($$ insert into public.clients (name) values ('Prospect from sales') $$, 'sales user can create a company');

-- role change keeps sales add-on
set local "request.jwt.claims" to '{"sub":"ac000000-0000-4000-8000-000000000001","role":"authenticated"}';
select public.set_user_role('ac000000-0000-4000-8000-000000000002','finance');
reset role;
select is((select count(*)::int from public.user_roles where user_id='ac000000-0000-4000-8000-000000000002' and role_key='sales'), 1, 'set_user_role keeps sales access');
select is((select count(*)::int from public.user_roles where user_id='ac000000-0000-4000-8000-000000000002' and role_key<>'sales'), 1, 'exactly one main role remains');

select * from finish();
rollback;
