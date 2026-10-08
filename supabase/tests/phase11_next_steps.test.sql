begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, encrypted_password, created_at, updated_at) values
  ('ad000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','s1@ns.test','{"full_name":"Sara"}','{}','',now(),now()),
  ('ad000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','s2@ns.test','{"full_name":"Anna"}','{}','',now(),now()),
  ('ad000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','pm@ns.test','{"full_name":"Pete"}','{}','',now(),now());
update public.user_profiles set status='active' where id::text like 'ad000000-%';
insert into public.user_roles (user_id, role_key) values
  ('ad000000-0000-4000-8000-000000000001','member'), ('ad000000-0000-4000-8000-000000000001','sales'),
  ('ad000000-0000-4000-8000-000000000002','member'), ('ad000000-0000-4000-8000-000000000002','sales'),
  ('ad000000-0000-4000-8000-000000000003','project_manager');
insert into public.clients (id, name) values ('ad100000-0000-4000-8000-000000000001','Step Co'), ('ad100000-0000-4000-8000-000000000002','No Deal Co');
insert into public.deals (id, client_id, title, owner_id) values ('ad200000-0000-4000-8000-000000000001','ad100000-0000-4000-8000-000000000001','Deal A','ad000000-0000-4000-8000-000000000001');

-- 1-3 constraints
select throws_ok($$ insert into public.crm_activities (client_id, kind, body, status, actor_id) values ('ad100000-0000-4000-8000-000000000001','call','x','planned','ad000000-0000-4000-8000-000000000001') $$, '23514', null, 'planned needs due_on and assignee');
select is((select is_sales_assignable('ad000000-0000-4000-8000-000000000002')), true, 'sales user is assignable');
select is((select is_sales_assignable('ad000000-0000-4000-8000-000000000003')), false, 'PM without sales is not assignable');

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"ad000000-0000-4000-8000-000000000001","role":"authenticated"}';
-- 4-7 planning + insert policy hardening
select lives_ok($$ insert into public.crm_activities (id, client_id, deal_id, kind, body, status, due_on, assignee_id)
  values ('ad300000-0000-4000-8000-000000000001','ad100000-0000-4000-8000-000000000001','ad200000-0000-4000-8000-000000000001','call','Call Kristjan','planned','2026-10-14','ad000000-0000-4000-8000-000000000002') $$, 'sales user plans a step for a colleague');
select throws_ok($$ insert into public.crm_activities (client_id, kind, body, status, due_on, assignee_id)
  values ('ad100000-0000-4000-8000-000000000001','call','x','planned','2026-10-14','ad000000-0000-4000-8000-000000000003') $$, '42501', null, 'cannot assign to a non-sales user');
select throws_ok($$ insert into public.crm_activities (client_id, kind, body, status, assignee_id)
  values ('ad100000-0000-4000-8000-000000000001','call','x','done','ad000000-0000-4000-8000-000000000002') $$, '42501', null, 'done row cannot set assignee_id');
select lives_ok($$ insert into public.crm_activities (id, client_id, kind, body, status, due_on, assignee_id)
  values ('ad300000-0000-4000-8000-000000000002','ad100000-0000-4000-8000-000000000002','email','Send intro','planned','2026-10-20','ad000000-0000-4000-8000-000000000001') $$, 'step on a company without deals');

-- 8-10 views
insert into public.crm_activities (id, client_id, kind, body, status, due_on, assignee_id)
  values ('ad300000-0000-4000-8000-000000000003','ad100000-0000-4000-8000-000000000001','meeting','Later step','planned','2026-10-30','ad000000-0000-4000-8000-000000000001');
select is((select activity_id from public.company_next_steps where client_id='ad100000-0000-4000-8000-000000000001'),
  'ad300000-0000-4000-8000-000000000001'::uuid, 'company next step = earliest open step');
select is((select activity_id from public.deal_next_steps where deal_id='ad200000-0000-4000-8000-000000000001'),
  'ad300000-0000-4000-8000-000000000001'::uuid, 'deal next step');
select is((select count(*)::int from public.company_next_steps where client_id='ad100000-0000-4000-8000-000000000002'), 1, 'company without deals has a next step');

-- 11-13 reschedule
select lives_ok($$ select public.reschedule_activity('ad300000-0000-4000-8000-000000000001','2026-10-21') $$, 'reschedule');
select ok(exists(select 1 from public.crm_activities where kind='system' and body='Next step moved: 14.10.2026 → 21.10.2026'
  and actor_id='ad000000-0000-4000-8000-000000000001'), 'reschedule logs a system entry with the actor');
select public.reschedule_activity('ad300000-0000-4000-8000-000000000001','2026-10-21');
select is((select count(*)::int from public.crm_activities where body like 'Next step moved%'), 1, 'same-date reschedule writes nothing');

-- 14-15 reassign
select lives_ok($$ select public.reassign_activity('ad300000-0000-4000-8000-000000000001','ad000000-0000-4000-8000-000000000001') $$, 'reassign');
select ok(exists(select 1 from public.crm_activities where kind='system' and body='Next step reassigned to Sara'), 'reassign logs');

-- 16-20 complete (anna completes a step sara created)
set local "request.jwt.claims" to '{"sub":"ad000000-0000-4000-8000-000000000002","role":"authenticated"}';
select throws_ok($$ select public.complete_activity('ad300000-0000-4000-8000-000000000001', null, 'ad000000-0000-4000-8000-000000000002', 'x') $$, '22004', null, 'complete_activity rejects a null done_on');
select throws_ok($$ select public.complete_activity('ad300000-0000-4000-8000-000000000001', (now() at time zone 'Europe/Tallinn')::date + 1, 'ad000000-0000-4000-8000-000000000002', 'x') $$, '22004', null, 'complete_activity rejects a future done_on');
select lives_ok($$ select public.complete_activity('ad300000-0000-4000-8000-000000000001', (now() at time zone 'Europe/Tallinn')::date, 'ad000000-0000-4000-8000-000000000002','Talked, wants v3') $$, 'any sales user completes any step');
select is((select status::text || '|' || done_by::text || '|' || done_comment from public.crm_activities where id='ad300000-0000-4000-8000-000000000001'),
  'done|ad000000-0000-4000-8000-000000000002|Talked, wants v3', 'done fields recorded');
select throws_ok($$ select public.complete_activity('ad300000-0000-4000-8000-000000000001', (now() at time zone 'Europe/Tallinn')::date, 'ad000000-0000-4000-8000-000000000002',null) $$, 'P0002', null, 'cannot complete twice');

-- 21-22 non-sales
set local "request.jwt.claims" to '{"sub":"ad000000-0000-4000-8000-000000000003","role":"authenticated"}';
select throws_ok($$ select public.complete_activity('ad300000-0000-4000-8000-000000000003','2026-10-21','ad000000-0000-4000-8000-000000000003',null) $$, '42501', null, 'non-sales cannot complete');
select is((select count(*)::int from public.company_next_steps), 0, 'non-sales sees no next steps');

-- 23-26 steps on closed (won/lost) deals are not next steps; reopening restores them
set local "request.jwt.claims" to '{"sub":"ad000000-0000-4000-8000-000000000001","role":"authenticated"}';
insert into public.crm_activities (id, client_id, deal_id, kind, body, status, due_on, assignee_id)
  values ('ad300000-0000-4000-8000-000000000004','ad100000-0000-4000-8000-000000000001','ad200000-0000-4000-8000-000000000001','call','Early deal step','planned','2026-10-10','ad000000-0000-4000-8000-000000000001');
update public.deals set stage='lost', lost_reason='Price' where id='ad200000-0000-4000-8000-000000000001';
select is((select activity_id from public.company_next_steps where client_id='ad100000-0000-4000-8000-000000000001'),
  'ad300000-0000-4000-8000-000000000003'::uuid, 'step on a lost deal is not the company next step');
select is((select count(*)::int from public.deal_next_steps where deal_id='ad200000-0000-4000-8000-000000000001'), 0, 'lost deal has no deal next step');
update public.deals set stage='negotiation', lost_reason=null where id='ad200000-0000-4000-8000-000000000001';
select is((select activity_id from public.company_next_steps where client_id='ad100000-0000-4000-8000-000000000001'),
  'ad300000-0000-4000-8000-000000000004'::uuid, 'reopened deal''s step is the company next step again');
select is((select activity_id from public.deal_next_steps where deal_id='ad200000-0000-4000-8000-000000000001'),
  'ad300000-0000-4000-8000-000000000004'::uuid, 'reopened deal has its next step again');
reset role;

-- 27 follow-up column gone
select hasnt_column('public', 'deals', 'next_follow_up_on', 'deal follow-up date retired');

-- 28-29 backfill exercised: migrate_deal_follow_ups() converts an open deal's legacy follow-up
-- into a planned step (and skips a won deal's), on a transaction-local temp column standing in
-- for the now-dropped deals.next_follow_up_on.
alter table public.deals add column next_follow_up_on date;
insert into public.deals (id, client_id, title, stage, source, owner_id, next_follow_up_on) values
  ('ad200000-0000-4000-8000-000000000002','ad100000-0000-4000-8000-000000000001','Deal Open','new','inbound','ad000000-0000-4000-8000-000000000001','2026-11-01'),
  ('ad200000-0000-4000-8000-000000000003','ad100000-0000-4000-8000-000000000001','Deal Won','won','inbound','ad000000-0000-4000-8000-000000000001','2026-11-05');
select is(public.migrate_deal_follow_ups(), 1, 'backfill converts exactly the one open deal''s follow-up (won deal excluded)');
select is((select body || '|' || due_on::text || '|' || assignee_id::text || '|' || actor_id::text || '|' || status::text
           from public.crm_activities where deal_id='ad200000-0000-4000-8000-000000000002' and kind='call'),
          'Follow up: Deal Open|2026-11-01|ad000000-0000-4000-8000-000000000001|ad000000-0000-4000-8000-000000000001|planned',
          'backfilled step carries the deal''s title/date/owner as a planned call');

select * from finish();
rollback;
