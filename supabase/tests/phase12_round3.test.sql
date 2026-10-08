begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

-- Sales round 3: cancelled status, audit columns, update_step/cancel_step/edit_entry RPCs,
-- and the new prospect rule (prospect = no project and no won deal).

-- fixtures: sara + anna (sales), pm (project_manager only, no sales)
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, encrypted_password, created_at, updated_at) values
  ('ae000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','sara@r3.test','{"full_name":"Sara"}','{}','',now(),now()),
  ('ae000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','anna@r3.test','{"full_name":"Anna"}','{}','',now(),now()),
  ('ae000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','pm@r3.test','{"full_name":"Pete"}','{}','',now(),now());
update public.user_profiles set status='active' where id::text like 'ae000000-%';
insert into public.user_roles (user_id, role_key) values
  ('ae000000-0000-4000-8000-000000000001','member'), ('ae000000-0000-4000-8000-000000000001','sales'),
  ('ae000000-0000-4000-8000-000000000002','member'), ('ae000000-0000-4000-8000-000000000002','sales'),
  ('ae000000-0000-4000-8000-000000000003','project_manager');

-- clients: A (open+lost deal), B (contact only), C (nothing), D (a project)
insert into public.clients (id, name) values
  ('ae100000-0000-4000-8000-000000000001','Client A'),
  ('ae100000-0000-4000-8000-000000000002','Client B'),
  ('ae100000-0000-4000-8000-000000000003','Client C'),
  ('ae100000-0000-4000-8000-000000000004','Client D');
insert into public.deals (id, client_id, title, stage, source, owner_id) values
  ('ae200000-0000-4000-8000-000000000001','ae100000-0000-4000-8000-000000000001','Open Deal','new','inbound','ae000000-0000-4000-8000-000000000001');
insert into public.deals (id, client_id, title, stage, source, owner_id, lost_reason) values
  ('ae200000-0000-4000-8000-000000000002','ae100000-0000-4000-8000-000000000001','Lost Deal','lost','inbound','ae000000-0000-4000-8000-000000000001','Price');
insert into public.client_contacts (client_id, name, first_name, last_name) values
  ('ae100000-0000-4000-8000-000000000002','', 'Kati', 'Kask');
update public.client_contacts set id = 'ae400000-0000-4000-8000-000000000002' where first_name='Kati';
insert into public.projects (id, client_id, name, budget_type, pm_id) values
  ('ae500000-0000-4000-8000-000000000001','ae100000-0000-4000-8000-000000000004','D Project','fixed','ae000000-0000-4000-8000-000000000003');

-- planned step fixtures (client A, assignee sara) for update_step tests
insert into public.crm_activities (id, client_id, deal_id, kind, body, status, due_on, assignee_id, actor_id) values
  ('ae300000-0000-4000-8000-000000000001','ae100000-0000-4000-8000-000000000001',null,'call','Call Mari','planned','2026-10-14','ae000000-0000-4000-8000-000000000001','ae000000-0000-4000-8000-000000000001'),
  ('ae300000-0000-4000-8000-000000000002','ae100000-0000-4000-8000-000000000001',null,'call','Follow up','planned','2026-10-15','ae000000-0000-4000-8000-000000000001','ae000000-0000-4000-8000-000000000001'),
  ('ae300000-0000-4000-8000-000000000003','ae100000-0000-4000-8000-000000000001',null,'call','Follow up','planned','2026-10-16','ae000000-0000-4000-8000-000000000001','ae000000-0000-4000-8000-000000000001'),
  ('ae300000-0000-4000-8000-000000000004','ae100000-0000-4000-8000-000000000001',null,'call','Follow up','planned','2026-10-17','ae000000-0000-4000-8000-000000000001','ae000000-0000-4000-8000-000000000001'),
  ('ae300000-0000-4000-8000-000000000005','ae100000-0000-4000-8000-000000000001',null,'call','Follow up','planned','2026-10-18','ae000000-0000-4000-8000-000000000001','ae000000-0000-4000-8000-000000000001'),
  ('ae300000-0000-4000-8000-000000000006','ae100000-0000-4000-8000-000000000001',null,'call','Follow up','planned','2026-10-19','ae000000-0000-4000-8000-000000000001','ae000000-0000-4000-8000-000000000001'),
  ('ae300000-0000-4000-8000-000000000008','ae100000-0000-4000-8000-000000000001',null,'call','Follow up','planned','2026-10-20','ae000000-0000-4000-8000-000000000001','ae000000-0000-4000-8000-000000000001');

-- a done row (not system) for the done-row update_step guard
insert into public.crm_activities (id, client_id, kind, body, status, done_at, done_by, actor_id) values
  ('ae300000-0000-4000-8000-000000000007','ae100000-0000-4000-8000-000000000001','note','Done note','done',now(),'ae000000-0000-4000-8000-000000000001','ae000000-0000-4000-8000-000000000001');

-- a done call (not system), created by sara, for edit_entry tests
insert into public.crm_activities (id, client_id, kind, body, status, done_at, done_by, actor_id) values
  ('ae300000-0000-4000-8000-000000000009','ae100000-0000-4000-8000-000000000001','call','Talked to Mari','done',now(),'ae000000-0000-4000-8000-000000000001','ae000000-0000-4000-8000-000000000001');

-- a system row (always done), for the edit_entry system-row guard
insert into public.crm_activities (id, client_id, kind, body, status, done_at, done_by, actor_id) values
  ('ae300000-0000-4000-8000-00000000000a','ae100000-0000-4000-8000-000000000001','system','Deal created: Open Deal','done',now(),null,null);

-- another done call for the 22023 contact-move test
insert into public.crm_activities (id, client_id, kind, body, status, done_at, done_by, actor_id) values
  ('ae300000-0000-4000-8000-00000000000b','ae100000-0000-4000-8000-000000000001','call','Talked again','done',now(),'ae000000-0000-4000-8000-000000000001','ae000000-0000-4000-8000-000000000001');

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"ae000000-0000-4000-8000-000000000001","role":"authenticated"}';

-- 1. update_step on a planned step changes body/kind; edited_by = caller
select public.update_step('ae300000-0000-4000-8000-000000000001','Call Mari updated','meeting','2026-10-14','ae000000-0000-4000-8000-000000000001',null,null);
select is(
  (select body || '|' || kind::text || '|' || edited_by::text from public.crm_activities where id='ae300000-0000-4000-8000-000000000001'),
  'Call Mari updated|meeting|ae000000-0000-4000-8000-000000000001',
  'update_step changes body/kind and stamps edited_by');

-- 2. update_step with a new due date writes a moved system entry
select public.update_step('ae300000-0000-4000-8000-000000000002','Follow up','call','2026-10-25','ae000000-0000-4000-8000-000000000001',null,null);
select ok(
  exists(select 1 from public.crm_activities where kind='system' and body='Next step moved: 15.10.2026 → 25.10.2026'),
  'update_step logs a moved system entry on due date change');

-- 3. update_step with a new assignee writes a reassigned entry
select public.update_step('ae300000-0000-4000-8000-000000000003','Follow up','call','2026-10-16','ae000000-0000-4000-8000-000000000002',null,null);
select ok(
  exists(select 1 from public.crm_activities where kind='system' and body='Next step reassigned to Anna'),
  'update_step logs a reassigned system entry on assignee change');

-- 4. update_step with B's contact on A's step -> 22023
select throws_ok(
  $$ select public.update_step('ae300000-0000-4000-8000-000000000004','Follow up','call','2026-10-17','ae000000-0000-4000-8000-000000000001','ae400000-0000-4000-8000-000000000002',null) $$,
  '22023', null, 'update_step rejects a contact from a different company');

-- 5. update_step with the lost deal -> 22023
select throws_ok(
  $$ select public.update_step('ae300000-0000-4000-8000-000000000004','Follow up','call','2026-10-17','ae000000-0000-4000-8000-000000000001',null,'ae200000-0000-4000-8000-000000000002') $$,
  '22023', null, 'update_step rejects a closed (lost) deal');

-- 6. update_step with a non-sales assignee -> 42501
select throws_ok(
  $$ select public.update_step('ae300000-0000-4000-8000-000000000005','Follow up','call','2026-10-18','ae000000-0000-4000-8000-000000000003',null,null) $$,
  '42501', null, 'update_step rejects a non-sales assignee');

-- 7. update_step on a done row -> P0002
select throws_ok(
  $$ select public.update_step('ae300000-0000-4000-8000-000000000007','x','call','2026-10-18','ae000000-0000-4000-8000-000000000001',null,null) $$,
  'P0002', null, 'update_step on a done row is rejected');

-- 8. anna cancel_step on sara's step -> cancelled, cancelled_by = anna, reason stored
set local "request.jwt.claims" to '{"sub":"ae000000-0000-4000-8000-000000000002","role":"authenticated"}';
select public.cancel_step('ae300000-0000-4000-8000-000000000006','No longer needed');
select is(
  (select status::text || '|' || cancelled_by::text || '|' || cancel_reason from public.crm_activities where id='ae300000-0000-4000-8000-000000000006'),
  'cancelled|ae000000-0000-4000-8000-000000000002|No longer needed',
  'cancel_step cancels, stamps cancelled_by, stores the reason');

-- 9. cancelled step not in company_next_steps
select is(
  (select count(*)::int from public.company_next_steps where activity_id='ae300000-0000-4000-8000-000000000006'),
  0,
  'cancelled step is not a company next step');

-- 10. cancel_step twice -> P0002
select throws_ok(
  $$ select public.cancel_step('ae300000-0000-4000-8000-000000000006','again') $$,
  'P0002', null, 'cancel_step twice is rejected');

-- 11. anna edit_entry on sara's done call -> body changed, edited_by = anna, actor_id still sara
select public.edit_entry('ae300000-0000-4000-8000-000000000009','Talked to Mari, wants a demo','call',null,null,null);
select is(
  (select body || '|' || edited_by::text || '|' || actor_id::text from public.crm_activities where id='ae300000-0000-4000-8000-000000000009'),
  'Talked to Mari, wants a demo|ae000000-0000-4000-8000-000000000002|ae000000-0000-4000-8000-000000000001',
  'edit_entry updates body/edited_by but keeps the original actor');

-- 12. edit_entry on a system row -> P0002
select throws_ok(
  $$ select public.edit_entry('ae300000-0000-4000-8000-00000000000a','x','call',null,null,null) $$,
  'P0002', null, 'edit_entry on a system row is rejected');

-- 13. edit_entry moving to B's contact -> 22023
select throws_ok(
  $$ select public.edit_entry('ae300000-0000-4000-8000-00000000000b','Talked again','call',null,'ae400000-0000-4000-8000-000000000002',null) $$,
  '22023', null, 'edit_entry rejects a contact from a different company');

-- 14. PM (non-sales) cannot call any of the three RPCs
set local "request.jwt.claims" to '{"sub":"ae000000-0000-4000-8000-000000000003","role":"authenticated"}';
select throws_ok(
  $$ select public.update_step('ae300000-0000-4000-8000-000000000001','x','call','2026-10-14','ae000000-0000-4000-8000-000000000001',null,null) $$,
  '42501', null, 'PM cannot call update_step');
select throws_ok(
  $$ select public.cancel_step('ae300000-0000-4000-8000-000000000001','x') $$,
  '42501', null, 'PM cannot call cancel_step');
select throws_ok(
  $$ select public.edit_entry('ae300000-0000-4000-8000-000000000009','x','call',null,null,null) $$,
  '42501', null, 'PM cannot call edit_entry');
reset role;

-- 15. company_kind: new prospect rule (no project and no won deal)
select is(public.company_kind('ae100000-0000-4000-8000-000000000003'), 'prospect', 'a company with nothing is a prospect');
select is(public.company_kind('ae100000-0000-4000-8000-000000000004'), 'client', 'a company with a project is a client');
select is(public.company_kind('ae100000-0000-4000-8000-000000000001'), 'prospect', 'a company with only open/lost deals is a prospect');

-- 16. anon has no EXECUTE on the three new functions
select is(has_function_privilege('anon', 'public.update_step(uuid, text, public.activity_kind, date, uuid, uuid, uuid)', 'EXECUTE'),
  false, 'anon cannot execute update_step');
select is(has_function_privilege('anon', 'public.cancel_step(uuid, text)', 'EXECUTE'),
  false, 'anon cannot execute cancel_step');
select is(has_function_privilege('anon', 'public.edit_entry(uuid, text, public.activity_kind, timestamptz, uuid, uuid)', 'EXECUTE'),
  false, 'anon cannot execute edit_entry');

-- 17. insert crm_activities with edited_by set -> 42501 (audit columns are locked on insert)
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"ae000000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok(
  $$ insert into public.crm_activities (client_id, kind, body, status, actor_id, edited_by)
     values ('ae100000-0000-4000-8000-000000000001','call','New entry','done','ae000000-0000-4000-8000-000000000001','ae000000-0000-4000-8000-000000000001') $$,
  '42501', null, 'insert with edited_by set is rejected');

-- 18. insert crm_activities with cancelled_at set -> 42501
select throws_ok(
  $$ insert into public.crm_activities (client_id, kind, body, status, actor_id, cancelled_at)
     values ('ae100000-0000-4000-8000-000000000001','call','New entry','done','ae000000-0000-4000-8000-000000000001', now()) $$,
  '42501', null, 'insert with cancelled_at set is rejected');
reset role;
-- clear the lingering jwt claims from the block above so the superuser fixture writes below
-- (profile insert/update) aren't seen as a non-admin edit by protect_profile_columns().
set local "request.jwt.claims" to '{}';

-- 19. sales_people(): a user who only cancelled a step and now holds no sales role is still returned
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, encrypted_password, created_at, updated_at) values
  ('ae000000-0000-4000-8000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dana@r3.test','{"full_name":"Dana"}','{}','',now(),now());
update public.user_profiles set status='active' where id='ae000000-0000-4000-8000-000000000004';
insert into public.user_roles (user_id, role_key) values ('ae000000-0000-4000-8000-000000000004','sales');
-- actor/assignee are sara, not dana: dana's only link to this row is cancelled_by, so this
-- only passes once sales_people() adds cancelled_by to its id-match list.
insert into public.crm_activities (id, client_id, kind, body, status, due_on, assignee_id, actor_id) values
  ('ae300000-0000-4000-8000-00000000000c','ae100000-0000-4000-8000-000000000001','call','Follow up','planned','2026-10-21','ae000000-0000-4000-8000-000000000001','ae000000-0000-4000-8000-000000000001');
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"ae000000-0000-4000-8000-000000000004","role":"authenticated"}';
select public.cancel_step('ae300000-0000-4000-8000-00000000000c','Not needed');
reset role;
delete from public.user_roles where user_id='ae000000-0000-4000-8000-000000000004';
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"ae000000-0000-4000-8000-000000000001","role":"authenticated"}';
select ok(
  exists(select 1 from public.sales_people() where id='ae000000-0000-4000-8000-000000000004'),
  'sales_people returns a canceller who now holds no sales role');

-- 20. author cannot delete their own cancelled step (0 rows deleted)
delete from public.crm_activities where id='ae300000-0000-4000-8000-000000000006';
reset role;
select is(
  (select count(*)::int from public.crm_activities where id='ae300000-0000-4000-8000-000000000006'),
  1,
  'author cannot delete their own cancelled step');

select * from finish();
rollback;
