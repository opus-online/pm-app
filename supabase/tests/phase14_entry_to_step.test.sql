begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, encrypted_password, created_at, updated_at) values
  ('b0000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','s1@conv.test','{"full_name":"Sara"}','{}','',now(),now()),
  ('b0000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','s2@conv.test','{"full_name":"Anna"}','{}','',now(),now()),
  ('b0000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','pm@conv.test','{"full_name":"Pete"}','{}','',now(),now());
update public.user_profiles set status='active' where id::text like 'b0000000-%';
insert into public.user_roles (user_id, role_key) values
  ('b0000000-0000-4000-8000-000000000001','member'), ('b0000000-0000-4000-8000-000000000001','sales'),
  ('b0000000-0000-4000-8000-000000000002','member'), ('b0000000-0000-4000-8000-000000000002','sales'),
  ('b0000000-0000-4000-8000-000000000003','project_manager');
insert into public.clients (id, name) values ('b0100000-0000-4000-8000-000000000001','Conv Co');
insert into public.deals (id, client_id, title, stage, owner_id, lost_reason) values
  ('b0200000-0000-4000-8000-000000000001','b0100000-0000-4000-8000-000000000001','Lost deal','lost','b0000000-0000-4000-8000-000000000001','Too pricey');
insert into public.crm_activities (id, client_id, deal_id, kind, body, actor_id) values
  ('b0300000-0000-4000-8000-000000000001','b0100000-0000-4000-8000-000000000001', null,'call','Aleksei helistab Markusele','b0000000-0000-4000-8000-000000000001'),
  ('b0300000-0000-4000-8000-000000000002','b0100000-0000-4000-8000-000000000001','b0200000-0000-4000-8000-000000000001','call','On lost deal','b0000000-0000-4000-8000-000000000001'),
  ('b0300000-0000-4000-8000-000000000003','b0100000-0000-4000-8000-000000000001', null,'system','Stage: new → contacted', null);

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"b0000000-0000-4000-8000-000000000002","role":"authenticated"}';
select lives_ok($$ select public.convert_entry_to_step('b0300000-0000-4000-8000-000000000001', current_date + 2, 'b0000000-0000-4000-8000-000000000001') $$, 'another sales user moves an entry to next steps');
select is((select status::text || '|' || assignee_id::text || '|' || edited_by::text from public.crm_activities where id='b0300000-0000-4000-8000-000000000001'),
  'planned|b0000000-0000-4000-8000-000000000001|b0000000-0000-4000-8000-000000000002', 'it is now a planned step with the chosen responsible');
select ok(exists(select 1 from public.company_next_steps where activity_id='b0300000-0000-4000-8000-000000000001'), 'it shows as the company next step');
select throws_ok($$ select public.convert_entry_to_step('b0300000-0000-4000-8000-000000000001', current_date, 'b0000000-0000-4000-8000-000000000001') $$, 'P0002', null, 'cannot move twice');
select throws_ok($$ select public.convert_entry_to_step('b0300000-0000-4000-8000-000000000003', current_date, 'b0000000-0000-4000-8000-000000000001') $$, 'P0002', null, 'system entries cannot be moved');
select throws_ok($$ select public.convert_entry_to_step('b0300000-0000-4000-8000-000000000002', current_date, 'b0000000-0000-4000-8000-000000000001') $$, '22023', null, 'entry on a closed deal cannot become a step');
select throws_ok($$ select public.convert_entry_to_step('b0300000-0000-4000-8000-000000000002', current_date, 'b0000000-0000-4000-8000-000000000003') $$, '42501', null, 'responsible must have Sales');
set local "request.jwt.claims" to '{"sub":"b0000000-0000-4000-8000-000000000003","role":"authenticated"}';
select throws_ok($$ select public.convert_entry_to_step('b0300000-0000-4000-8000-000000000002', current_date, 'b0000000-0000-4000-8000-000000000001') $$, '42501', null, 'non-sales cannot move entries');
reset role;

select * from finish();
rollback;
