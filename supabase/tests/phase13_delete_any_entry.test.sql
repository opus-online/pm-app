begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, encrypted_password, created_at, updated_at) values
  ('af000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','s1@del.test','{"full_name":"Sara"}','{}','',now(),now()),
  ('af000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','s2@del.test','{"full_name":"Anna"}','{}','',now(),now()),
  ('af000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','pm@del.test','{"full_name":"Pete"}','{}','',now(),now());
update public.user_profiles set status='active' where id::text like 'af000000-%';
insert into public.user_roles (user_id, role_key) values
  ('af000000-0000-4000-8000-000000000001','member'), ('af000000-0000-4000-8000-000000000001','sales'),
  ('af000000-0000-4000-8000-000000000002','member'), ('af000000-0000-4000-8000-000000000002','sales'),
  ('af000000-0000-4000-8000-000000000003','project_manager');
insert into public.clients (id, name) values ('af100000-0000-4000-8000-000000000001','Del Co');
insert into public.crm_activities (id, client_id, kind, body, actor_id) values
  ('af300000-0000-4000-8000-000000000001','af100000-0000-4000-8000-000000000001','call','Sara call','af000000-0000-4000-8000-000000000001'),
  ('af300000-0000-4000-8000-000000000002','af100000-0000-4000-8000-000000000001','note','Sara note','af000000-0000-4000-8000-000000000001'),
  ('af300000-0000-4000-8000-000000000003','af100000-0000-4000-8000-000000000001','system','Stage: new → contacted', null);
insert into public.crm_activities (id, client_id, kind, body, status, due_on, assignee_id, actor_id, cancelled_at, cancelled_by) values
  ('af300000-0000-4000-8000-000000000005','af100000-0000-4000-8000-000000000001','call','Cancelled','cancelled', current_date,'af000000-0000-4000-8000-000000000001','af000000-0000-4000-8000-000000000001', now(),'af000000-0000-4000-8000-000000000001');
insert into public.crm_activities (id, client_id, kind, body, status, due_on, assignee_id, actor_id) values
  ('af300000-0000-4000-8000-000000000004','af100000-0000-4000-8000-000000000001','call','Planned','planned', current_date,'af000000-0000-4000-8000-000000000001','af000000-0000-4000-8000-000000000001');

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"af000000-0000-4000-8000-000000000003","role":"authenticated"}';
with d as (delete from public.crm_activities where id='af300000-0000-4000-8000-000000000002' returning 1) select is((select count(*)::int from d), 0, 'non-sales user cannot delete');

set local "request.jwt.claims" to '{"sub":"af000000-0000-4000-8000-000000000002","role":"authenticated"}';
with d as (delete from public.crm_activities where id='af300000-0000-4000-8000-000000000001' returning 1) select is((select count(*)::int from d), 1, 'another sales user deletes someone else''s entry');
with d as (delete from public.crm_activities where id='af300000-0000-4000-8000-000000000003' returning 1) select is((select count(*)::int from d), 0, 'system entries cannot be deleted');
with d as (delete from public.crm_activities where id='af300000-0000-4000-8000-000000000004' returning 1) select is((select count(*)::int from d), 0, 'planned steps cannot be deleted (cancel instead)');
with d as (delete from public.crm_activities where id='af300000-0000-4000-8000-000000000005' returning 1) select is((select count(*)::int from d), 0, 'cancelled steps cannot be deleted');
reset role;
set local "request.jwt.claims" to '{}';
select is((select count(*)::int from public.audit_logs where action='crm_activity.deleted' and resource_id in ('af300000-0000-4000-8000-000000000003','af300000-0000-4000-8000-000000000004','af300000-0000-4000-8000-000000000005')), 0, 'denied deletes write no audit row');
select is((select actor_email from public.audit_logs where action='crm_activity.deleted' and resource_id='af300000-0000-4000-8000-000000000001'), 's2@del.test', 'audit records the deleter''s email');

select is((select actor_id from public.audit_logs where action='crm_activity.deleted' and resource_id='af300000-0000-4000-8000-000000000001'),
  'af000000-0000-4000-8000-000000000002'::uuid, 'delete is audited with the deleting user');
select is((select metadata->>'body' from public.audit_logs where action='crm_activity.deleted' and resource_id='af300000-0000-4000-8000-000000000001'),
  'Sara call', 'audit keeps the deleted text');

select * from finish();
rollback;
