-- Phase 2 seed. Runs on `supabase db reset` AFTER migrations. Idempotent by reset-only usage.
-- Demo password for every demo user: Password123!
create extension if not exists pgcrypto with schema extensions;

-- ===== 1. demo auth users (trigger creates pending profiles) =====
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token)
select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u.email,
  extensions.crypt('Password123!', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', u.full_name), now(), now(), '', '', '', ''
from (values
  ('10000001-0000-4000-8000-000000000001'::uuid,'admin.demo@pmcms.local','Deemo Admin'),
  ('10000002-0000-4000-8000-000000000002'::uuid,'anna.pm@pmcms.local','Anna Tamm'),
  ('10000003-0000-4000-8000-000000000003'::uuid,'bella.pm@pmcms.local','Bella Kask'),
  ('10000004-0000-4000-8000-000000000004'::uuid,'frank.fin@pmcms.local','Frank Raha'),
  ('10000005-0000-4000-8000-000000000005'::uuid,'milo.dev@pmcms.local','Milo Sepp'),
  ('10000006-0000-4000-8000-000000000006'::uuid,'vera.view@pmcms.local','Vera Klient')
) as u(id, email, full_name);

update public.user_profiles set status = 'active', approved_at = now()
  where id::text like '1000000%';
insert into public.user_roles (user_id, role_key) values
  ('10000001-0000-4000-8000-000000000001','admin'),
  ('10000002-0000-4000-8000-000000000002','project_manager'),
  ('10000003-0000-4000-8000-000000000003','project_manager'),
  ('10000004-0000-4000-8000-000000000004','finance'),
  ('10000005-0000-4000-8000-000000000005','member'),
  ('10000006-0000-4000-8000-000000000006','viewer');

-- ===== 2. clients =====
insert into public.clients (id, name, contact_name, contact_email) values
  ('20000001-0000-4000-8000-000000000001','Baltic Retail Group','Kadri Mets','kadri@balticretail.ee'),
  ('20000002-0000-4000-8000-000000000002','Nordic Logistics OÜ','Lars Nielsen','lars@nordlog.dk'),
  ('20000003-0000-4000-8000-000000000003','FinServ AS','Piret Kivi','piret@finserv.ee');

-- ===== 3. people (16) — first two rows are the PMs, #3 is Milo (member user) =====
insert into public.people (id, user_id, full_name, email, role_title, department, employment_type, weekly_capacity_hours) values
  ('50000001-0000-4000-8000-000000000001','10000002-0000-4000-8000-000000000002','Anna Tamm','anna.pm@pmcms.local','Project Manager','PMO','employee',40),
  ('50000002-0000-4000-8000-000000000002','10000003-0000-4000-8000-000000000003','Bella Kask','bella.pm@pmcms.local','Project Manager','PMO','employee',40),
  ('50000003-0000-4000-8000-000000000003','10000005-0000-4000-8000-000000000005','Milo Sepp','milo.dev@pmcms.local','Senior Backend Developer','Engineering','employee',40),
  ('50000004-0000-4000-8000-000000000004',null,'Katrin Oja','katrin@pmcms.local','Frontend Developer','Engineering','employee',40),
  ('50000005-0000-4000-8000-000000000005',null,'Jaan Kuusk','jaan@pmcms.local','Backend Developer','Engineering','employee',40),
  ('50000006-0000-4000-8000-000000000006',null,'Liis Lepp','liis@pmcms.local','UX Designer','Design','employee',40),
  ('50000007-0000-4000-8000-000000000007',null,'Marko Saar','marko@pmcms.local','DevOps Engineer','Engineering','employee',40),
  ('50000008-0000-4000-8000-000000000008',null,'Eva Kann','eva@pmcms.local','QA Engineer','Engineering','employee',40),
  ('50000009-0000-4000-8000-000000000009',null,'Tomas Vilk','tomas@pmcms.local','Fullstack Developer','Engineering','contractor',40),
  ('50000010-0000-4000-8000-000000000010',null,'Sofia Berg','sofia@pmcms.local','Data Engineer','Engineering','employee',40),
  ('50000011-0000-4000-8000-000000000011',null,'Rein Talts','rein@pmcms.local','Backend Developer','Engineering','employee',32),
  ('50000012-0000-4000-8000-000000000012',null,'Helena Puu','helena@pmcms.local','Frontend Developer','Engineering','freelance',20),
  ('50000013-0000-4000-8000-000000000013',null,'Oskar Lind','oskar@pmcms.local','Mobile Developer','Engineering','employee',40),
  ('50000014-0000-4000-8000-000000000014',null,'Mia Kass','mia@pmcms.local','QA Engineer','Engineering','employee',40),
  ('50000015-0000-4000-8000-000000000015',null,'Peter Nurm','peter@pmcms.local','Solution Architect','Engineering','employee',40),
  ('50000016-0000-4000-8000-000000000016',null,'Laura Meri','laura@pmcms.local','UX Designer','Design','employee',40);

-- ===== 4. skills + person_skills =====
insert into public.skills (id, name, category) values
  ('60000001-0000-4000-8000-000000000001','React','frontend'),
  ('60000002-0000-4000-8000-000000000002','Next.js','frontend'),
  ('60000003-0000-4000-8000-000000000003','Node.js','backend'),
  ('60000004-0000-4000-8000-000000000004','PostgreSQL','backend'),
  ('60000005-0000-4000-8000-000000000005','Python','backend'),
  ('60000006-0000-4000-8000-000000000006','AWS','devops'),
  ('60000007-0000-4000-8000-000000000007','Docker','devops'),
  ('60000008-0000-4000-8000-000000000008','Figma','design'),
  ('60000009-0000-4000-8000-000000000009','Cypress','qa'),
  ('60000010-0000-4000-8000-000000000010','React Native','mobile');
-- spread 2-3 skills per person, levels 2-5 (explicit list; ~35 rows). Example pattern:
insert into public.person_skills (person_id, skill_id, level) values
  ('50000003-0000-4000-8000-000000000003','60000003-0000-4000-8000-000000000003',5),
  ('50000003-0000-4000-8000-000000000003','60000004-0000-4000-8000-000000000004',4),
  ('50000004-0000-4000-8000-000000000004','60000001-0000-4000-8000-000000000001',4),
  ('50000004-0000-4000-8000-000000000004','60000002-0000-4000-8000-000000000002',4),
  ('50000005-0000-4000-8000-000000000005','60000003-0000-4000-8000-000000000003',3),
  ('50000005-0000-4000-8000-000000000005','60000004-0000-4000-8000-000000000004',4),
  ('50000006-0000-4000-8000-000000000006','60000008-0000-4000-8000-000000000008',5),
  ('50000007-0000-4000-8000-000000000007','60000006-0000-4000-8000-000000000006',5),
  ('50000007-0000-4000-8000-000000000007','60000007-0000-4000-8000-000000000007',5),
  ('50000008-0000-4000-8000-000000000008','60000009-0000-4000-8000-000000000009',4),
  ('50000009-0000-4000-8000-000000000009','60000001-0000-4000-8000-000000000001',4),
  ('50000009-0000-4000-8000-000000000009','60000003-0000-4000-8000-000000000003',4),
  ('50000010-0000-4000-8000-000000000010','60000005-0000-4000-8000-000000000005',5),
  ('50000010-0000-4000-8000-000000000010','60000004-0000-4000-8000-000000000004',4),
  ('50000011-0000-4000-8000-000000000011','60000003-0000-4000-8000-000000000003',3),
  ('50000012-0000-4000-8000-000000000012','60000001-0000-4000-8000-000000000001',4),
  ('50000013-0000-4000-8000-000000000013','60000010-0000-4000-8000-000000000010',5),
  ('50000014-0000-4000-8000-000000000014','60000009-0000-4000-8000-000000000009',3),
  ('50000015-0000-4000-8000-000000000015','60000006-0000-4000-8000-000000000006',4),
  ('50000015-0000-4000-8000-000000000015','60000004-0000-4000-8000-000000000004',5),
  ('50000016-0000-4000-8000-000000000016','60000008-0000-4000-8000-000000000008',4);

-- ===== 5. rates (internal cost + billing per person) =====
insert into public.rates (person_id, rate_type, amount, valid_from)
select id, 'internal_cost',
  case department when 'PMO' then 55 when 'Design' then 45 else 50 end
  + case employment_type when 'contractor' then 15 when 'freelance' then 20 else 0 end,
  date '2026-01-01'
from public.people;
insert into public.rates (person_id, rate_type, amount, valid_from)
select id, 'billing',
  case department when 'PMO' then 110 when 'Design' then 95 else 105 end
  + case employment_type when 'contractor' then 10 when 'freelance' then 15 else 0 end,
  date '2026-01-01'
from public.people;

-- ===== 6. time off (incl. Bella on vacation NOW -> powers the active delegation) =====
insert into public.time_off (person_id, starts_on, ends_on, type, note) values
  ('50000002-0000-4000-8000-000000000002', current_date - 3, current_date + 11, 'vacation', 'Summer vacation — delegated to Milo'),
  ('50000005-0000-4000-8000-000000000005', current_date + 20, current_date + 34, 'vacation', null),
  ('50000008-0000-4000-8000-000000000008', current_date - 1, current_date + 2, 'sick', null),
  ('50000012-0000-4000-8000-000000000012', current_date + 45, current_date + 59, 'vacation', null);

-- ===== 7. projects (9: 4 fixed, 3 hourly, 2 mixed; health mix; Anna 5, Bella 4) =====
insert into public.projects (id, name, client_id, pm_id, status, health, priority, start_date, deadline, progress, budget_type, description, tags) values
  ('30000001-0000-4000-8000-000000000001','Retail e-shop replatform','20000001-0000-4000-8000-000000000001','10000002-0000-4000-8000-000000000002','active','healthy','high', current_date-90, current_date+90, 55,'mixed','Migrate legacy shop to Next.js + headless commerce.','{ecommerce,nextjs}'),
  ('30000002-0000-4000-8000-000000000002','Warehouse scanner app','20000002-0000-4000-8000-000000000002','10000002-0000-4000-8000-000000000002','active','warning','high', current_date-60, current_date+30, 70,'fixed','Android scanner app for warehouse intake.','{mobile}'),
  ('30000003-0000-4000-8000-000000000003','FinServ onboarding portal','20000003-0000-4000-8000-000000000003','10000003-0000-4000-8000-000000000003','active','critical','high', current_date-120, current_date+15, 80,'fixed','KYC onboarding portal; regulator deadline fixed.','{fintech,compliance}'),
  ('30000004-0000-4000-8000-000000000004','Data warehouse & BI','20000001-0000-4000-8000-000000000001','10000003-0000-4000-8000-000000000003','active','healthy','medium', current_date-45, current_date+120, 30,'hourly','Snowplow + dbt + dashboards.','{data}'),
  ('30000005-0000-4000-8000-000000000005','Fleet tracking API','20000002-0000-4000-8000-000000000002','10000002-0000-4000-8000-000000000002','active','warning','medium', current_date-30, current_date+75, 25,'hourly','Realtime GPS ingestion + partner API.','{api}'),
  ('30000006-0000-4000-8000-000000000006','Intranet redesign','20000003-0000-4000-8000-000000000003','10000003-0000-4000-8000-000000000003','planning','healthy','low', current_date+14, current_date+150, 0,'mixed','Design-led intranet refresh.','{design}'),
  -- deliberately 12 days overdue while on hold -> derives CRITICAL, so the demo shows all three health states
  ('30000007-0000-4000-8000-000000000007','Loyalty program MVP','20000001-0000-4000-8000-000000000001','10000002-0000-4000-8000-000000000002','on_hold','warning','low', current_date-75, current_date-12, 40,'fixed','Paused pending client budget approval.','{ecommerce}'),
  ('30000008-0000-4000-8000-000000000008','Legacy CRM maintenance','20000002-0000-4000-8000-000000000002','10000003-0000-4000-8000-000000000003','active','healthy','low', current_date-300, null, 0,'hourly','Ongoing support retainer.','{support}'),
  ('30000009-0000-4000-8000-000000000009','Payment gateway integration','20000003-0000-4000-8000-000000000003','10000002-0000-4000-8000-000000000002','completed','healthy','medium', current_date-200, current_date-20, 100,'fixed','Done and invoiced.','{fintech}');

-- Demo project icons (hidden _icon:<key> tag convention -- src/lib/project-icons.ts; every
-- tags READ must filter these, every tags WRITE must re-append). Keys must exist in
-- PROJECT_ICONS. Mirrors the 2026-07-27 prod enrichment (FinServ landmark) and gives the
-- rest a sensible spread so icon tiles differentiate in demos.
update public.projects set tags = array_append(tags, v.icon)
from (values
  ('30000001-0000-4000-8000-000000000001'::uuid, '_icon:shopping'),
  ('30000002-0000-4000-8000-000000000002'::uuid, '_icon:package'),
  ('30000003-0000-4000-8000-000000000003'::uuid, '_icon:landmark'),
  ('30000004-0000-4000-8000-000000000004'::uuid, '_icon:database'),
  ('30000005-0000-4000-8000-000000000005'::uuid, '_icon:truck'),
  ('30000006-0000-4000-8000-000000000006'::uuid, '_icon:globe'),
  ('30000007-0000-4000-8000-000000000007'::uuid, '_icon:star'),
  ('30000008-0000-4000-8000-000000000008'::uuid, '_icon:wrench'),
  ('30000009-0000-4000-8000-000000000009'::uuid, '_icon:landmark')
) as v(id, icon)
where projects.id = v.id
  and not exists (select 1 from unnest(projects.tags) t where t like '_icon:%');

-- ===== 8. project members (access) — the two PM users + Milo on Bella's critical project =====
insert into public.project_members (project_id, user_id, role_on_project) values
  ('30000001-0000-4000-8000-000000000001','10000005-0000-4000-8000-000000000005','backend lead'),
  ('30000003-0000-4000-8000-000000000003','10000005-0000-4000-8000-000000000005','backend'),
  ('30000004-0000-4000-8000-000000000004','10000005-0000-4000-8000-000000000005','support');

-- Milo also had an EARLIER, closed stint on the Retail replatform — one person, several
-- membership periods per project (20260722000001_member_periods.sql dropped the unique
-- constraint precisely for this: "arendaja tuleb ja läheb"). Demo shows two Team-tab rows.
insert into public.project_members (project_id, user_id, role_on_project, starts_on, ends_on) values
  ('30000001-0000-4000-8000-000000000001','10000005-0000-4000-8000-000000000005','discovery support', current_date-90, current_date-70);

-- every project's PM is also a project_members row -- the same "PM isn't a member of their
-- own project" fix createProjectAction now applies to every new project, backfilled here for
-- this seed data too (mirrors 20260716000007_backfill_pm_members.sql, which only backfills
-- pre-existing production data since it runs before this seed file during `db reset`). No
-- synthetic `assignments` row: that previously inflated a PM's workload allocation by 100% per
-- owned project; "log own time" now accepts membership OR assignment, so this alone suffices.
-- WHERE NOT EXISTS (not ON CONFLICT): the unique (project_id, user_id) constraint is gone
-- (member periods), so idempotency has to be spelled out.
insert into public.project_members (project_id, user_id, role_on_project)
select p.id, p.pm_id, 'Project Manager'
from public.projects p
where p.pm_id is not null
  and not exists (
    select 1 from public.project_members m
    where m.project_id = p.id and m.user_id = p.pm_id);

-- viewer Vera: explicit read grant on one project (temporary, 30 days)
insert into public.user_project_permissions (user_id, project_id, permission_key, granted_by, expires_at) values
  ('10000006-0000-4000-8000-000000000006','30000001-0000-4000-8000-000000000001','view_project','10000001-0000-4000-8000-000000000001', now() + interval '30 days'),
  ('10000006-0000-4000-8000-000000000006','30000001-0000-4000-8000-000000000001','view_links','10000001-0000-4000-8000-000000000001', now() + interval '30 days');

-- ===== 9. parts (mixed projects have BOTH billing models) + billing + costs =====
insert into public.project_parts (id, project_id, name, status, responsible_person_id, billing_model, estimated_hours, progress, start_date, end_date) values
  ('40000001-0000-4000-8000-000000000001','30000001-0000-4000-8000-000000000001','Discovery','done','50000001-0000-4000-8000-000000000001','fixed', 80,100, current_date-90, current_date-60),
  ('40000002-0000-4000-8000-000000000002','30000001-0000-4000-8000-000000000001','Backend','in_progress','50000003-0000-4000-8000-000000000003','hourly', 400, 60, current_date-60, current_date+45),
  ('40000003-0000-4000-8000-000000000003','30000001-0000-4000-8000-000000000001','Frontend','in_progress','50000004-0000-4000-8000-000000000004','hourly', 350, 45, current_date-45, current_date+60),
  ('40000004-0000-4000-8000-000000000004','30000001-0000-4000-8000-000000000001','Testing','not_started','50000008-0000-4000-8000-000000000008','fixed', 120, 0, current_date+30, current_date+85),
  ('40000005-0000-4000-8000-000000000005','30000002-0000-4000-8000-000000000002','App build','in_progress','50000013-0000-4000-8000-000000000013','fixed', 300, 75, current_date-60, current_date+20),
  ('40000006-0000-4000-8000-000000000006','30000003-0000-4000-8000-000000000003','KYC flows','in_progress','50000003-0000-4000-8000-000000000003','fixed', 500, 85, current_date-120, current_date+10),
  ('40000007-0000-4000-8000-000000000007','30000003-0000-4000-8000-000000000003','Compliance audit','blocked','50000015-0000-4000-8000-000000000015','fixed', 80, 20, current_date-30, current_date+15),
  ('40000008-0000-4000-8000-000000000008','30000004-0000-4000-8000-000000000004','Pipeline','in_progress','50000010-0000-4000-8000-000000000010','hourly', 240, 40, current_date-45, current_date+60),
  ('40000009-0000-4000-8000-000000000009','30000005-0000-4000-8000-000000000005','Ingestion API','in_progress','50000005-0000-4000-8000-000000000005','hourly', 320, 30, current_date-30, current_date+75),
  ('40000010-0000-4000-8000-000000000010','30000006-0000-4000-8000-000000000006','Design sprint','not_started','50000006-0000-4000-8000-000000000006','fixed', 60, 0, current_date+14, current_date+35),
  ('40000011-0000-4000-8000-000000000011','30000006-0000-4000-8000-000000000006','Implementation','not_started','50000012-0000-4000-8000-000000000012','hourly', 280, 0, current_date+35, current_date+150),
  ('40000012-0000-4000-8000-000000000012','30000008-0000-4000-8000-000000000008','Support retainer','in_progress','50000011-0000-4000-8000-000000000011','hourly', null, 0, current_date-300, null);
insert into public.part_dependencies (part_id, depends_on_part_id) values
  ('40000002-0000-4000-8000-000000000002','40000001-0000-4000-8000-000000000001'),
  ('40000003-0000-4000-8000-000000000003','40000001-0000-4000-8000-000000000001'),
  ('40000004-0000-4000-8000-000000000004','40000002-0000-4000-8000-000000000002'),
  ('40000011-0000-4000-8000-000000000011','40000010-0000-4000-8000-000000000010');
insert into public.part_billing (part_id, fixed_amount, hourly_rate, client_price) values
  ('40000001-0000-4000-8000-000000000001', 8000, null, 8000),
  ('40000002-0000-4000-8000-000000000002', null, 105, 42000),
  ('40000003-0000-4000-8000-000000000003', null, 95, 33250),
  ('40000004-0000-4000-8000-000000000004', 9000, null, 9000),
  ('40000005-0000-4000-8000-000000000005', 36000, null, 36000),
  ('40000006-0000-4000-8000-000000000006', 60000, null, 60000),
  ('40000007-0000-4000-8000-000000000007', 12000, null, 12000),
  ('40000008-0000-4000-8000-000000000008', null, 110, 26400),
  ('40000009-0000-4000-8000-000000000009', null, 100, 32000),
  ('40000010-0000-4000-8000-000000000010', 7000, null, 7000),
  ('40000011-0000-4000-8000-000000000011', null, 95, 26600),
  ('40000012-0000-4000-8000-000000000012', null, 90, null);
insert into public.part_costs (part_id, planned_internal_cost, actual_internal_cost) values
  ('40000001-0000-4000-8000-000000000001', 4800, 4650),
  ('40000002-0000-4000-8000-000000000002', 20000, 13200),
  ('40000003-0000-4000-8000-000000000003', 17500, 8900),
  ('40000004-0000-4000-8000-000000000004', 6000, 0),
  ('40000005-0000-4000-8000-000000000005', 21000, 17800),
  ('40000006-0000-4000-8000-000000000006', 38000, 36500),
  ('40000007-0000-4000-8000-000000000007', 7000, 2100),
  ('40000008-0000-4000-8000-000000000008', 12000, 5300),
  ('40000009-0000-4000-8000-000000000009', 16000, 5100),
  ('40000010-0000-4000-8000-000000000010', 4200, 0),
  ('40000011-0000-4000-8000-000000000011', 14000, 0),
  ('40000012-0000-4000-8000-000000000012', null, 41200);

-- ===== 10. assignments — tuned utilization classes =====
-- Katrin: 30% (available) | Jaan: 60% (partial) | Milo: 50+45=95% (full)
-- Marko: 70+60=130% (overallocated) | Eva: 40% | Sofia: 80% | Oskar: 100% (full)
insert into public.assignments (project_id, project_part_id, person_id, allocation_pct, start_date, end_date, role_on_project) values
  ('30000001-0000-4000-8000-000000000001','40000003-0000-4000-8000-000000000003','50000004-0000-4000-8000-000000000004', 30, current_date-45, current_date+60,'frontend'),
  ('30000005-0000-4000-8000-000000000005','40000009-0000-4000-8000-000000000009','50000005-0000-4000-8000-000000000005', 60, current_date-30, current_date+75,'backend'),
  ('30000001-0000-4000-8000-000000000001','40000002-0000-4000-8000-000000000002','50000003-0000-4000-8000-000000000003', 50, current_date-60, current_date+45,'backend lead'),
  ('30000003-0000-4000-8000-000000000003','40000006-0000-4000-8000-000000000006','50000003-0000-4000-8000-000000000003', 45, current_date-120, current_date+10,'backend'),
  ('30000001-0000-4000-8000-000000000001','40000002-0000-4000-8000-000000000002','50000007-0000-4000-8000-000000000007', 70, current_date-60, current_date+45,'devops'),
  ('30000003-0000-4000-8000-000000000003','40000006-0000-4000-8000-000000000006','50000007-0000-4000-8000-000000000007', 60, current_date-30, current_date+15,'devops'),
  ('30000002-0000-4000-8000-000000000002','40000005-0000-4000-8000-000000000005','50000008-0000-4000-8000-000000000008', 40, current_date-60, current_date+20,'qa'),
  ('30000004-0000-4000-8000-000000000004','40000008-0000-4000-8000-000000000008','50000010-0000-4000-8000-000000000010', 80, current_date-45, current_date+60,'data'),
  ('30000002-0000-4000-8000-000000000002','40000005-0000-4000-8000-000000000005','50000013-0000-4000-8000-000000000013',100, current_date-60, current_date+20,'mobile'),
  ('30000008-0000-4000-8000-000000000008','40000012-0000-4000-8000-000000000012','50000011-0000-4000-8000-000000000011', 25, current_date-300, null,'support'),
  ('30000003-0000-4000-8000-000000000003','40000007-0000-4000-8000-000000000007','50000015-0000-4000-8000-000000000015', 35, current_date-30, current_date+15,'architect'),
  ('30000001-0000-4000-8000-000000000001','40000003-0000-4000-8000-000000000003','50000012-0000-4000-8000-000000000012', 50, current_date-45, current_date+60,'frontend');

-- ===== 11. time entries (last 15 workdays for the 5 busiest people) =====
insert into public.time_entries (person_id, project_id, project_part_id, entry_date, hours, billable, description)
select p.person_id, p.project_id, p.part_id, d::date,
  round((4 + random() * 4)::numeric, 1), true, 'seeded work'
from (values
  ('50000003-0000-4000-8000-000000000003'::uuid,'30000001-0000-4000-8000-000000000001'::uuid,'40000002-0000-4000-8000-000000000002'::uuid),
  ('50000004-0000-4000-8000-000000000004','30000001-0000-4000-8000-000000000001','40000003-0000-4000-8000-000000000003'),
  ('50000007-0000-4000-8000-000000000007','30000003-0000-4000-8000-000000000003','40000006-0000-4000-8000-000000000006'),
  ('50000010-0000-4000-8000-000000000010','30000004-0000-4000-8000-000000000004','40000008-0000-4000-8000-000000000008'),
  ('50000013-0000-4000-8000-000000000013','30000002-0000-4000-8000-000000000002','40000005-0000-4000-8000-000000000005')
) as p(person_id, project_id, part_id)
cross join generate_series(current_date - 21, current_date - 1, interval '1 day') as d
where extract(isodow from d) < 6;

-- Monthly time-entry HISTORY (12 months back). Time logging is monthly in this product (the log
-- form is person/project/month/hours -- see 20260720000006), so one row per person/project/month.
-- Without this the Reports "hours over time" chart shows a single bar and every vs-previous-period
-- delta reads "—" (all seeded entries above land in the current month). Billable + a smaller
-- non-billable row per month so the stacked chart shows both series. Idempotent by description.
insert into public.time_entries (person_id, project_id, project_part_id, entry_date, hours, billable, description)
select p.person_id, p.project_id, p.part_id,
  (date_trunc('month', current_date) - (m || ' months')::interval)::date,
  round((70 + random() * 70)::numeric, 1), true, 'seeded history'
from (values
  ('50000003-0000-4000-8000-000000000003'::uuid,'30000001-0000-4000-8000-000000000001'::uuid,'40000002-0000-4000-8000-000000000002'::uuid),
  ('50000004-0000-4000-8000-000000000004','30000001-0000-4000-8000-000000000001','40000003-0000-4000-8000-000000000003'),
  ('50000007-0000-4000-8000-000000000007','30000003-0000-4000-8000-000000000003','40000006-0000-4000-8000-000000000006'),
  ('50000010-0000-4000-8000-000000000010','30000004-0000-4000-8000-000000000004','40000008-0000-4000-8000-000000000008'),
  ('50000013-0000-4000-8000-000000000013','30000002-0000-4000-8000-000000000002','40000005-0000-4000-8000-000000000005'),
  ('50000005-0000-4000-8000-000000000005','30000005-0000-4000-8000-000000000005','40000009-0000-4000-8000-000000000009')
) as p(person_id, project_id, part_id)
cross join generate_series(1, 11) as m
where not exists (select 1 from public.time_entries where description = 'seeded history');

insert into public.time_entries (person_id, project_id, project_part_id, entry_date, hours, billable, description)
select p.person_id, p.project_id, p.part_id,
  (date_trunc('month', current_date) - (m || ' months')::interval)::date,
  round((8 + random() * 18)::numeric, 1), false, 'seeded history nb'
from (values
  ('50000003-0000-4000-8000-000000000003'::uuid,'30000001-0000-4000-8000-000000000001'::uuid,'40000002-0000-4000-8000-000000000002'::uuid),
  ('50000007-0000-4000-8000-000000000007','30000003-0000-4000-8000-000000000003','40000006-0000-4000-8000-000000000006'),
  ('50000013-0000-4000-8000-000000000013','30000002-0000-4000-8000-000000000002','40000005-0000-4000-8000-000000000005')
) as p(person_id, project_id, part_id)
cross join generate_series(1, 11) as m
where not exists (select 1 from public.time_entries where description = 'seeded history nb');

-- ===== 12. budgets + item history for the three biggest projects =====
insert into public.budgets (id, project_id) values
  ('70000001-0000-4000-8000-000000000001','30000001-0000-4000-8000-000000000001'),
  ('70000002-0000-4000-8000-000000000002','30000002-0000-4000-8000-000000000002'),
  ('70000003-0000-4000-8000-000000000003','30000003-0000-4000-8000-000000000003');
insert into public.budget_items (budget_id, item_type, name, amount, occurred_on) values
  ('70000001-0000-4000-8000-000000000001','planned_cost','Initial plan', 48300, current_date-90),
  ('70000001-0000-4000-8000-000000000001','invoice','Discovery invoice', 8000, current_date-55),
  ('70000001-0000-4000-8000-000000000001','payment','Discovery paid', 8000, current_date-40),
  ('70000001-0000-4000-8000-000000000001','change','Scope: added loyalty hooks', 4500, current_date-20),
  ('70000002-0000-4000-8000-000000000002','planned_cost','Initial plan', 21000, current_date-60),
  ('70000002-0000-4000-8000-000000000002','invoice','Milestone 1', 18000, current_date-25),
  -- pushes Warehouse scanner (client_amount 36000) to ~106% invoiced -- demonstrates the "over
  -- budget" consumption severity on the portfolio dashboard (Phase 5, Task 1).
  ('70000002-0000-4000-8000-000000000002','invoice','Milestone 2 (rush change order)', 20000, current_date-8),
  ('70000003-0000-4000-8000-000000000003','planned_cost','Initial plan', 45000, current_date-120),
  ('70000003-0000-4000-8000-000000000003','invoice','Phase 1', 30000, current_date-60),
  ('70000003-0000-4000-8000-000000000003','payment','Phase 1 paid', 30000, current_date-45),
  ('70000003-0000-4000-8000-000000000003','change','Regulator scope change', 9000, current_date-15),
  -- pushes FinServ onboarding (client_amount 72000) to ~90% invoiced -- demonstrates the "high"
  -- consumption severity tier on the portfolio dashboard (Phase 5, Task 1).
  ('70000003-0000-4000-8000-000000000003','invoice','Phase 2', 35000, current_date-10);

-- Monthly ACTUAL internal-cost ledger rows (item_type 'actual_cost') for the three budgeted
-- projects -- without these the Reports cost KPI/line reads €0 for finance viewers (the seed
-- previously only logged planned_cost at kickoff). Spread over the last 6 months so the
-- vs-previous-window delta math has real data on both sides. Guarded idempotent by name.
insert into public.budget_items (budget_id, item_type, name, amount, occurred_on)
select b.budget_id, 'actual_cost', 'Monthly cost ' || to_char(d, 'YYYY-MM'), b.amount, d::date
from (values
  ('70000001-0000-4000-8000-000000000001'::uuid, 7800),
  ('70000002-0000-4000-8000-000000000002'::uuid, 5200),
  ('70000003-0000-4000-8000-000000000003'::uuid, 9100)
) as b(budget_id, amount)
cross join generate_series(
  date_trunc('month', current_date) - interval '5 months',
  date_trunc('month', current_date),
  interval '1 month'
) as d
where not exists (
  select 1 from public.budget_items x
  where x.budget_id = b.budget_id and x.item_type = 'actual_cost'
    and x.name = 'Monthly cost ' || to_char(d, 'YYYY-MM'));

-- ===== 13. status updates (history: 2 per active project, newest includes handover info) =====
insert into public.project_status_updates (project_id, author_id, completed, in_progress, blockers, decisions_needed, next_milestone, handover_info, created_at) values
  ('30000001-0000-4000-8000-000000000001','10000002-0000-4000-8000-000000000002','Discovery, checkout API','Catalog sync','—','CDN vendor choice','Beta on staging', null, now() - interval '21 days'),
  ('30000001-0000-4000-8000-000000000001','10000002-0000-4000-8000-000000000002','Catalog sync','Frontend theming','Payment sandbox flaky','—','Content freeze','Deploys via GH Actions; client contact Kadri; Friday demos.', now() - interval '3 days'),
  ('30000002-0000-4000-8000-000000000002','10000002-0000-4000-8000-000000000002','Intake flows','Barcode edge cases','Device fleet delayed at customs','Scanner hardware model','UAT with warehouse team', null, now() - interval '10 days'),
  ('30000003-0000-4000-8000-000000000003','10000003-0000-4000-8000-000000000003','KYC happy path','Sanctions-list integration','Compliance audit blocked on client docs','Fallback provider go/no-go','Regulator demo', 'CRITICAL: regulator deadline. Audit contact: Piret. Escalate blockers to admin.', now() - interval '2 days'),
  ('30000004-0000-4000-8000-000000000004','10000003-0000-4000-8000-000000000003','Event schema','dbt models','—','—','First dashboard', null, now() - interval '7 days'),
  ('30000005-0000-4000-8000-000000000005','10000002-0000-4000-8000-000000000002','Ingestion prototype','Partner API contract','—','Rate-limit tiers','Load test', null, now() - interval '5 days');

-- ===== 14. links =====
insert into public.project_links (project_id, name, url, type, environment, visibility) values
  ('30000001-0000-4000-8000-000000000001','GitHub','https://github.com/acme/retail-shop','repo', null,'project'),
  ('30000001-0000-4000-8000-000000000001','Jira','https://acme.atlassian.net/browse/SHOP','issue_tracker', null,'project'),
  ('30000001-0000-4000-8000-000000000001','Figma','https://figma.com/file/shop-redesign','design', null,'project'),
  ('30000001-0000-4000-8000-000000000001','Staging','https://staging.shop.balticretail.ee','env_staging','staging','project'),
  ('30000001-0000-4000-8000-000000000001','Prod monitoring','https://grafana.acme.dev/shop','monitoring','prod','pm_only'),
  ('30000002-0000-4000-8000-000000000002','GitLab','https://gitlab.com/acme/scanner','repo', null,'project'),
  ('30000003-0000-4000-8000-000000000003','Azure DevOps','https://dev.azure.com/finserv/onboarding','issue_tracker', null,'project'),
  ('30000003-0000-4000-8000-000000000003','Prod','https://onboard.finserv.ee','env_prod','prod','project'),
  ('30000003-0000-4000-8000-000000000003','DB dashboard','https://portal.azure.com/#finserv-db','db_dashboard','prod','pm_only'),
  ('30000004-0000-4000-8000-000000000004','dbt docs','https://dbt.acme.dev','api_docs', null,'project');

-- ===== 15. credentials (secrets in Vault) =====
insert into public.credentials (project_id, name, type, username, secret_id, related_url, environment, visibility, expires_at, owner_id)
select v.project_id, v.name, v.type::public.credential_type, v.username,
       vault.create_secret(v.secret, v.vault_name, 'seeded'),
       v.url, v.env::public.credential_environment, v.vis::public.credential_visibility, v.expires, v.owner
from (values
  ('30000001-0000-4000-8000-000000000001'::uuid,'Shop staging DB','db_login','shop_app','St4g1ng-Pw!','shop-staging-db','https://staging.shop.balticretail.ee','staging','project_members', null::timestamptz,'10000002-0000-4000-8000-000000000002'::uuid),
  ('30000001-0000-4000-8000-000000000001','Payment API key','api_key','—','pk_test_9f8a7b6c','shop-payment-key','https://dashboard.stripe.com','prod','pms_only', now() + interval '60 days','10000002-0000-4000-8000-000000000002'),
  ('30000003-0000-4000-8000-000000000003','Onboarding prod DB','db_login','onboard_app','Pr0d-S3cret!','finserv-prod-db','https://portal.azure.com','prod','pms_only', now() + interval '20 days','10000003-0000-4000-8000-000000000003'),
  ('30000003-0000-4000-8000-000000000003','Sanctions API','api_key','—','sk_sanc_11223344','finserv-sanctions-key', null,'prod','pms_only', now() + interval '10 days','10000003-0000-4000-8000-000000000003'),
  ('30000002-0000-4000-8000-000000000002','Play Store account','third_party','release@acme.dev','Rel3ase-Pw!','scanner-playstore','https://play.google.com/console','other','admins_only', null,'10000002-0000-4000-8000-000000000002')
) as v(project_id, name, type, username, secret, vault_name, url, env, vis, expires, owner);

-- ===== 16. THE active delegation: Bella (on vacation) -> Milo, her two active projects =====
insert into public.delegations (id, from_user, to_user, starts_at, ends_at, handover_notes) values
  ('80000001-0000-4000-8000-000000000001','10000003-0000-4000-8000-000000000003','10000005-0000-4000-8000-000000000005',
   now() - interval '3 days', now() + interval '11 days',
   'FinServ: regulator demo prep — status update every Tue/Thu. DW: pipeline reviews only. Do NOT touch budgets. Escalate compliance blockers to admin.');
insert into public.delegation_permissions (delegation_id, project_id, permission_key)
select '80000001-0000-4000-8000-000000000001', p.project_id, perm
from (values ('30000003-0000-4000-8000-000000000003'::uuid), ('30000004-0000-4000-8000-000000000004'::uuid)) as p(project_id)
cross join unnest(array['view_project','edit_status','view_team','view_links','view_credentials']) as perm;

-- ===== 17. audit log history =====
-- audit_logs is append-only for authenticated (grant select only, see phase1_auth.sql) -- but
-- this file runs as the migration/superuser role during `supabase db reset`, which can insert
-- directly, same trick service-role app code (src/lib/audit.ts) relies on at runtime. Without
-- this, a fresh reset leaves /activity empty (real audit rows only ever come from actions taken
-- through the app), which makes an otherwise fully-seeded demo look broken on the one page an
-- admin is most likely to check first. Timestamps span the last ~2 weeks so the trail reads as
-- an ongoing history rather than a single batch import; metadata never carries a secret value,
-- only ids/labels -- same rule src/lib/audit.ts's writeAudit call sites follow everywhere else.
insert into public.audit_logs (actor_id, actor_email, action, resource_type, resource_id, metadata, created_at) values
  ('10000001-0000-4000-8000-000000000001','admin.demo@pmcms.local','auth.login', null, null, '{}'::jsonb, now() - interval '14 days 1 hour'),
  ('10000002-0000-4000-8000-000000000002','anna.pm@pmcms.local','auth.login', null, null, '{}'::jsonb, now() - interval '14 days'),
  ('10000003-0000-4000-8000-000000000003','bella.pm@pmcms.local','auth.login', null, null, '{}'::jsonb, now() - interval '13 days 6 hours'),
  ('10000001-0000-4000-8000-000000000001','admin.demo@pmcms.local','user.approved','user','10000005-0000-4000-8000-000000000005','{"email":"milo.dev@pmcms.local"}'::jsonb, now() - interval '13 days 23 hours'),
  ('10000001-0000-4000-8000-000000000001','admin.demo@pmcms.local','user.approved','user','10000006-0000-4000-8000-000000000006','{"email":"vera.view@pmcms.local"}'::jsonb, now() - interval '13 days 22 hours'),
  ('10000005-0000-4000-8000-000000000005','milo.dev@pmcms.local','auth.login', null, null, '{}'::jsonb, now() - interval '13 days'),
  ('10000006-0000-4000-8000-000000000006','vera.view@pmcms.local','auth.login', null, null, '{}'::jsonb, now() - interval '12 days 4 hours'),
  ('10000004-0000-4000-8000-000000000004','frank.fin@pmcms.local','auth.login', null, null, '{}'::jsonb, now() - interval '12 days'),
  ('10000002-0000-4000-8000-000000000002','anna.pm@pmcms.local','project.created','project','30000001-0000-4000-8000-000000000001','{}'::jsonb, now() - interval '11 days 6 hours'),
  ('10000003-0000-4000-8000-000000000003','bella.pm@pmcms.local','project.created','project','30000003-0000-4000-8000-000000000003','{}'::jsonb, now() - interval '11 days 3 hours'),
  ('10000002-0000-4000-8000-000000000002','anna.pm@pmcms.local','member.added','project_member','30000001-0000-4000-8000-000000000001:10000005-0000-4000-8000-000000000005','{"project_id":"30000001-0000-4000-8000-000000000001","user_id":"10000005-0000-4000-8000-000000000005"}'::jsonb, now() - interval '10 days 5 hours'),
  ('10000002-0000-4000-8000-000000000002','anna.pm@pmcms.local','project.updated','project','30000001-0000-4000-8000-000000000001','{"field":"health"}'::jsonb, now() - interval '10 days'),
  ('10000003-0000-4000-8000-000000000003','bella.pm@pmcms.local','member.added','project_member','30000003-0000-4000-8000-000000000003:10000005-0000-4000-8000-000000000005','{"project_id":"30000003-0000-4000-8000-000000000003","user_id":"10000005-0000-4000-8000-000000000005"}'::jsonb, now() - interval '9 days 4 hours'),
  ('10000001-0000-4000-8000-000000000001','admin.demo@pmcms.local','access.granted','user_project_permission','10000006-0000-4000-8000-000000000006','{"user_id":"10000006-0000-4000-8000-000000000006","project_id":"30000001-0000-4000-8000-000000000001","permission_keys":["view_project","view_links"]}'::jsonb, now() - interval '9 days'),
  ('10000002-0000-4000-8000-000000000002','anna.pm@pmcms.local','credential.added','credential',(select id::text from public.credentials where name = 'Shop staging DB'),'{"project_id":"30000001-0000-4000-8000-000000000001"}'::jsonb, now() - interval '8 days 3 hours'),
  ('10000002-0000-4000-8000-000000000002','anna.pm@pmcms.local','credential.added','credential',(select id::text from public.credentials where name = 'Payment API key'),'{"project_id":"30000001-0000-4000-8000-000000000001"}'::jsonb, now() - interval '8 days 2 hours'),
  ('10000003-0000-4000-8000-000000000003','bella.pm@pmcms.local','credential.added','credential',(select id::text from public.credentials where name = 'Onboarding prod DB'),'{"project_id":"30000003-0000-4000-8000-000000000003"}'::jsonb, now() - interval '8 days'),
  ('10000004-0000-4000-8000-000000000004','frank.fin@pmcms.local','budget_item.added','budget_item',(select id::text from public.budget_items where name = 'Discovery invoice'),'{"project_id":"30000001-0000-4000-8000-000000000001","item_type":"invoice"}'::jsonb, now() - interval '7 days 5 hours'),
  ('10000004-0000-4000-8000-000000000004','frank.fin@pmcms.local','budget_item.added','budget_item',(select id::text from public.budget_items where name = 'Phase 2'),'{"project_id":"30000003-0000-4000-8000-000000000003","item_type":"invoice"}'::jsonb, now() - interval '7 days'),
  ('10000005-0000-4000-8000-000000000005','milo.dev@pmcms.local','credential.revealed','credential',(select id::text from public.credentials where name = 'Shop staging DB'),'{"project_id":"30000001-0000-4000-8000-000000000001"}'::jsonb, now() - interval '6 days 4 hours'),
  ('10000003-0000-4000-8000-000000000003','bella.pm@pmcms.local','credential.revealed','credential',(select id::text from public.credentials where name = 'Sanctions API'),'{"project_id":"30000003-0000-4000-8000-000000000003"}'::jsonb, now() - interval '6 days'),
  ('10000003-0000-4000-8000-000000000003','bella.pm@pmcms.local','delegation.created','delegation','80000001-0000-4000-8000-000000000001','{"to_user":"10000005-0000-4000-8000-000000000005","project_ids":["30000003-0000-4000-8000-000000000003","30000004-0000-4000-8000-000000000004"]}'::jsonb, now() - interval '3 days 1 hour'),
  ('10000002-0000-4000-8000-000000000002','anna.pm@pmcms.local','project.status_posted','project','30000001-0000-4000-8000-000000000001','{}'::jsonb, now() - interval '3 days'),
  ('10000003-0000-4000-8000-000000000003','bella.pm@pmcms.local','project.status_posted','project','30000003-0000-4000-8000-000000000003','{}'::jsonb, now() - interval '2 days 6 hours'),
  ('10000005-0000-4000-8000-000000000005','milo.dev@pmcms.local','time.logged','time_entry', null, '{"project_id":"30000001-0000-4000-8000-000000000001","hours":6.5,"billable":true}'::jsonb, now() - interval '2 days'),
  ('10000005-0000-4000-8000-000000000005','milo.dev@pmcms.local','time.logged','time_entry', null, '{"project_id":"30000003-0000-4000-8000-000000000003","hours":5,"billable":true}'::jsonb, now() - interval '1 day 3 hours'),
  ('10000001-0000-4000-8000-000000000001','admin.demo@pmcms.local','auth.login', null, null, '{}'::jsonb, now() - interval '1 day'),
  ('10000002-0000-4000-8000-000000000002','anna.pm@pmcms.local','auth.login', null, null, '{}'::jsonb, now() - interval '18 hours'),
  ('10000005-0000-4000-8000-000000000005','milo.dev@pmcms.local','auth.login', null, null, '{}'::jsonb, now() - interval '6 hours');

-- ===== 12. demo avatar photos (stable placeholder portraits, one per person) =====
-- i.pravatar.cc serves a fixed portrait per ?img=N -- deterministic, no auth, demo-only.
update public.people set avatar_url = 'https://i.pravatar.cc/150?img=' || v.img
from (values
  ('50000001-0000-4000-8000-000000000001'::uuid, 47),
  ('50000002-0000-4000-8000-000000000002'::uuid, 44),
  ('50000003-0000-4000-8000-000000000003'::uuid, 12),
  ('50000004-0000-4000-8000-000000000004'::uuid, 45),
  ('50000005-0000-4000-8000-000000000005'::uuid, 13),
  ('50000006-0000-4000-8000-000000000006'::uuid, 32),
  ('50000007-0000-4000-8000-000000000007'::uuid, 14),
  ('50000008-0000-4000-8000-000000000008'::uuid, 25),
  ('50000009-0000-4000-8000-000000000009'::uuid, 15),
  ('50000010-0000-4000-8000-000000000010'::uuid, 26),
  ('50000011-0000-4000-8000-000000000011'::uuid, 17),
  ('50000012-0000-4000-8000-000000000012'::uuid, 20),
  ('50000013-0000-4000-8000-000000000013'::uuid, 18),
  ('50000014-0000-4000-8000-000000000014'::uuid, 29),
  ('50000015-0000-4000-8000-000000000015'::uuid, 33),
  ('50000016-0000-4000-8000-000000000016'::uuid, 23)
) as v(id, img)
where people.id = v.id;

-- ===== 13. managed options (role titles + teams) =====
-- Same backfill as migration 20260721000001_managed_options.sql -- that one runs before this
-- file has inserted any people locally, so re-run it here for the demo dataset.
insert into public.managed_options (kind, value)
select distinct 'role_title', role_title from public.people where role_title is not null
union
select distinct 'team', department from public.people where department is not null
on conflict (kind, value) do nothing;

-- ===== 14. client contacts =====
-- Same backfill as migration 20260721000002_client_contacts.sql -- that one runs before this
-- file has inserted any clients locally, so re-run the primary-contact backfill here, plus a
-- couple of secondary contacts per client so the multi-contact UI has something to show.
insert into public.client_contacts (client_id, name, email, phone, is_primary)
select id, contact_name, contact_email, phone, true
from public.clients
where contact_name is not null
  and not exists (select 1 from public.client_contacts cc where cc.client_id = clients.id);

insert into public.client_contacts (id, client_id, name, email, phone, role, is_primary) values
  ('90000001-0000-4000-8000-000000000001','20000001-0000-4000-8000-000000000001','Marko Saar','marko@balticretail.ee','+372 5301 2244','CTO',false),
  ('90000002-0000-4000-8000-000000000002','20000001-0000-4000-8000-000000000001','Liis Oja','liis@balticretail.ee',null,'Accounting',false),
  ('90000003-0000-4000-8000-000000000003','20000002-0000-4000-8000-000000000002','Mette Sørensen','mette@nordlog.dk','+45 2611 7788','Operations lead',false),
  ('90000004-0000-4000-8000-000000000004','20000003-0000-4000-8000-000000000003','Jaan Kuusk','jaan@finserv.ee',null,'Head of IT',false),
  ('90000005-0000-4000-8000-000000000005','20000003-0000-4000-8000-000000000003','Maria Lepp','maria@finserv.ee','+372 5512 3390','Compliance',false)
on conflict (id) do nothing;

-- One demo project carries a client contact (P3: projects.client_contact_id) so the overview
-- Details card has something to show. Must run after the contact inserts above.
update public.projects
set client_contact_id = '90000001-0000-4000-8000-000000000001' -- Marko Saar, Baltic Retail CTO
where id = '30000001-0000-4000-8000-000000000001';

-- ===== 15. project milestones (P4: "verstapostid") =====
-- 3-5 per active project. Every start/end kind matches the project's existing seeded
-- start_date/deadline exactly, so the sync trigger (20260721000004) rewrites the same values
-- (a no-op thanks to its "is distinct from" guard) and the demo timeline stays unchanged.
-- Past milestones are done, one (FinServ compliance audit) is deliberately overdue-NOT-done so
-- the overview shows the red overdue state. Projects 6-9 (planning/on-hold/retainer/completed)
-- get none -- the retainer has no deadline, and an end milestone would invent one via the
-- trigger.
insert into public.project_milestones (id, project_id, name, due_on, kind, done, sort) values
  -- Retail e-shop replatform (cd-90 .. cd+90)
  ('80000001-0000-4000-8000-000000000001','30000001-0000-4000-8000-000000000001','Kickoff', current_date-90,'start', true, 0),
  ('80000002-0000-4000-8000-000000000002','30000001-0000-4000-8000-000000000001','Design sign-off', current_date-55,'milestone', true, 1),
  ('80000003-0000-4000-8000-000000000003','30000001-0000-4000-8000-000000000001','Backend feature-complete', current_date+10,'milestone', false, 2),
  ('80000004-0000-4000-8000-000000000004','30000001-0000-4000-8000-000000000001','UAT complete', current_date+55,'milestone', false, 3),
  ('80000005-0000-4000-8000-000000000005','30000001-0000-4000-8000-000000000001','Go-live', current_date+90,'end', false, 4),
  -- Warehouse scanner app (cd-60 .. cd+30)
  ('80000006-0000-4000-8000-000000000006','30000002-0000-4000-8000-000000000002','Kickoff', current_date-60,'start', true, 0),
  ('80000007-0000-4000-8000-000000000007','30000002-0000-4000-8000-000000000002','Warehouse pilot', current_date-10,'milestone', true, 1),
  ('80000008-0000-4000-8000-000000000008','30000002-0000-4000-8000-000000000002','Full rollout', current_date+30,'end', false, 2),
  -- FinServ onboarding portal (cd-120 .. cd+15)
  ('80000009-0000-4000-8000-000000000009','30000003-0000-4000-8000-000000000003','Kickoff', current_date-120,'start', true, 0),
  ('8000000a-0000-4000-8000-00000000000a','30000003-0000-4000-8000-000000000003','KYC flow on staging', current_date-30,'milestone', true, 1),
  ('8000000b-0000-4000-8000-00000000000b','30000003-0000-4000-8000-000000000003','Compliance audit', current_date-5,'milestone', false, 2), -- overdue, not done
  ('8000000c-0000-4000-8000-00000000000c','30000003-0000-4000-8000-000000000003','Regulator submission', current_date+15,'end', false, 3),
  -- Data warehouse & BI (cd-45 .. cd+120)
  ('8000000d-0000-4000-8000-00000000000d','30000004-0000-4000-8000-000000000004','Kickoff', current_date-45,'start', true, 0),
  ('8000000e-0000-4000-8000-00000000000e','30000004-0000-4000-8000-000000000004','First dashboards live', current_date+20,'milestone', false, 1),
  ('8000000f-0000-4000-8000-00000000000f','30000004-0000-4000-8000-000000000004','Handover & training', current_date+120,'end', false, 2),
  -- Fleet tracking API (cd-30 .. cd+75)
  ('80000010-0000-4000-8000-000000000010','30000005-0000-4000-8000-000000000005','Kickoff', current_date-30,'start', true, 0),
  ('80000011-0000-4000-8000-000000000011','30000005-0000-4000-8000-000000000005','Partner API beta', current_date+14,'milestone', false, 1),
  ('80000012-0000-4000-8000-000000000012','30000005-0000-4000-8000-000000000005','GA release', current_date+75,'end', false, 2);

-- ===== CRM demo (prefixes: c1 clients, c2 contacts, c3 deals, c4 offers) =====
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
values ('10000007-0000-4000-8000-000000000007','00000000-0000-0000-0000-000000000000','authenticated','authenticated',
  'sara.sales@pmcms.local', extensions.crypt('Password123!', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Sara Müük"}'::jsonb, now(), now(), '', '', '', '')
on conflict (id) do nothing;
update public.user_profiles set status='active', approved_at=now() where id='10000007-0000-4000-8000-000000000007';
insert into public.user_roles (user_id, role_key) values
  ('10000007-0000-4000-8000-000000000007','member'),
  ('10000007-0000-4000-8000-000000000007','sales'),
  ('10000002-0000-4000-8000-000000000002','sales')   -- anna.pm also sells
on conflict do nothing;

insert into public.clients (id, name, reg_code, phone, email, website) values
  ('c1000001-0000-4000-8000-000000000001','Nordic Timber AS','10293847','+372 600 1001','info@nordictimber.ee','https://nordictimber.ee'),
  ('c1000002-0000-4000-8000-000000000002','Tallinn Dental Group OÜ','14455667','+372 600 1002','hello@tdg.ee','https://tdg.ee'),
  ('c1000003-0000-4000-8000-000000000003','Kalev Logistics AS','10566778','+372 600 1003','sales@kalevlog.ee','https://kalevlog.ee'),
  ('c1000004-0000-4000-8000-000000000004','Saare Energy OÜ','16677889',null,'contact@saare.energy','https://saare.energy'),
  ('c1000005-0000-4000-8000-000000000005','Peipsi Foods AS','10788990','+372 600 1005',null,null)
on conflict (id) do nothing;

insert into public.client_contacts (id, client_id, name, first_name, last_name, gender, email, phone, role, description) values
  ('c2000001-0000-4000-8000-000000000001','c1000001-0000-4000-8000-000000000001','','Kristjan','Mets','male','kristjan@nordictimber.ee','+372 5100 0001','CEO','Decision maker'),
  ('c2000002-0000-4000-8000-000000000002','c1000001-0000-4000-8000-000000000001','','Liis','Kask','female','liis@nordictimber.ee','+372 5100 0002','Marketing lead',null),
  ('c2000003-0000-4000-8000-000000000003','c1000002-0000-4000-8000-000000000002','','Kadri','Lepp','female','kadri@tdg.ee','+372 5100 0003','COO','Prefers email'),
  ('c2000004-0000-4000-8000-000000000004','c1000003-0000-4000-8000-000000000003','','Andres','Saar','male','andres@kalevlog.ee','+372 5100 0004','IT manager',null),
  ('c2000005-0000-4000-8000-000000000005','c1000004-0000-4000-8000-000000000004','','Eva','Rebane','female','eva@saare.energy','+372 5100 0005','Founder',null),
  ('c2000006-0000-4000-8000-000000000006','c1000005-0000-4000-8000-000000000005','','Toomas','Kuusk','male',null,'+372 5100 0006','Procurement',null)
on conflict (id) do nothing;

insert into public.deals (id, client_id, title, stage, source, owner_id, lost_reason, created_at) values
  ('c3000001-0000-4000-8000-000000000001','c1000001-0000-4000-8000-000000000001','B2B ordering portal','negotiation','inbound','10000007-0000-4000-8000-000000000007', null, now() - interval '70 days'),
  ('c3000002-0000-4000-8000-000000000002','c1000001-0000-4000-8000-000000000001','Website refresh','offer_sent','existing_client','10000007-0000-4000-8000-000000000007', null, now() - interval '30 days'),
  ('c3000003-0000-4000-8000-000000000003','c1000002-0000-4000-8000-000000000002','Patient booking app','contacted','referral','10000002-0000-4000-8000-000000000002', null, now() - interval '20 days'),
  ('c3000004-0000-4000-8000-000000000004','c1000003-0000-4000-8000-000000000003','Fleet tracking dashboard','new','outbound','10000007-0000-4000-8000-000000000007', null, now() - interval '5 days'),
  ('c3000005-0000-4000-8000-000000000005','c1000004-0000-4000-8000-000000000004','Customer portal MVP','offer_sent','event','10000002-0000-4000-8000-000000000002', null, now() - interval '40 days'),
  ('c3000006-0000-4000-8000-000000000006','c1000005-0000-4000-8000-000000000005','ERP integration','lost','inbound','10000007-0000-4000-8000-000000000007', 'Chose a cheaper local vendor', now() - interval '90 days'),
  ('c3000007-0000-4000-8000-000000000007','c1000003-0000-4000-8000-000000000003','Warehouse scanner app','new','inbound','10000007-0000-4000-8000-000000000007', null, now() - interval '2 days'),
  ('c3000008-0000-4000-8000-000000000008','20000001-0000-4000-8000-000000000001','Loyalty app phase 2','won','existing_client','10000002-0000-4000-8000-000000000002', null, now() - interval '60 days'),
  ('c3000009-0000-4000-8000-000000000009','c1000002-0000-4000-8000-000000000002','SEO retainer','negotiation','outbound','10000007-0000-4000-8000-000000000007', null, now() - interval '50 days'),
  ('c3000010-0000-4000-8000-000000000010','c1000004-0000-4000-8000-000000000004','Data warehouse audit','contacted','other','10000007-0000-4000-8000-000000000007', null, now() - interval '10 days')
on conflict (id) do nothing;

insert into public.offers (id, deal_id, title, amount, sent_on, valid_until, status, link_url, note) values
  ('c4000001-0000-4000-8000-000000000001','c3000001-0000-4000-8000-000000000001','v1 – full scope',48000, current_date - 40, current_date - 10,'rejected','https://drive.google.com/demo-v1',null),
  ('c4000002-0000-4000-8000-000000000002','c3000001-0000-4000-8000-000000000001','v2 – phased',36000, current_date - 9, current_date + 21,'sent','https://drive.google.com/demo-v2','Phase 1 only'),
  ('c4000003-0000-4000-8000-000000000003','c3000002-0000-4000-8000-000000000002','Website refresh',14500, current_date - 3, current_date + 27,'sent',null,null),
  ('c4000004-0000-4000-8000-000000000004','c3000005-0000-4000-8000-000000000005','Portal MVP',52000, current_date - 15, current_date + 15,'sent',null,null),
  ('c4000005-0000-4000-8000-000000000005','c3000006-0000-4000-8000-000000000006','ERP integration',30000, current_date - 80, current_date - 50,'rejected',null,null),
  ('c4000006-0000-4000-8000-000000000006','c3000008-0000-4000-8000-000000000008','Phase 2',41000, current_date - 45, current_date - 15,'accepted',null,null),
  ('c4000007-0000-4000-8000-000000000007','c3000009-0000-4000-8000-000000000009','SEO 12-month',18000, null, null,'draft',null,'Waiting on scope')
on conflict (id) do nothing;
update public.deals set won_at = now() - interval '3 days' where id = 'c3000008-0000-4000-8000-000000000008';

insert into public.crm_activities (client_id, deal_id, contact_id, kind, body, occurred_at, actor_id)
select v.client_id::uuid, v.deal_id::uuid, v.contact_id::uuid, v.kind::public.activity_kind, v.body, now() - (v.days_ago || ' days')::interval, v.actor::uuid
from (values
  ('c1000001-0000-4000-8000-000000000001','c3000001-0000-4000-8000-000000000001','c2000001-0000-4000-8000-000000000001','call','Intro call — they want ordering online before spring.', 68,'10000007-0000-4000-8000-000000000007'),
  ('c1000001-0000-4000-8000-000000000001','c3000001-0000-4000-8000-000000000001','c2000001-0000-4000-8000-000000000001','meeting','Workshop at their office, mapped 14 order flows.', 55,'10000007-0000-4000-8000-000000000007'),
  ('c1000001-0000-4000-8000-000000000001','c3000001-0000-4000-8000-000000000001','c2000001-0000-4000-8000-000000000001','email','Kristjan: v1 too expensive, asked for phased option.', 12,'10000007-0000-4000-8000-000000000007'),
  ('c1000001-0000-4000-8000-000000000001','c3000002-0000-4000-8000-000000000002','c2000002-0000-4000-8000-000000000002','email','Liis sent brand guidelines.', 4,'10000007-0000-4000-8000-000000000007'),
  ('c1000002-0000-4000-8000-000000000002','c3000003-0000-4000-8000-000000000003','c2000003-0000-4000-8000-000000000003','call','Referred by Baltic Retail. Booking app for 6 clinics.', 18,'10000002-0000-4000-8000-000000000002'),
  ('c1000002-0000-4000-8000-000000000002','c3000009-0000-4000-8000-000000000009','c2000003-0000-4000-8000-000000000003','note','Budget approval expected end of month.', 7,'10000007-0000-4000-8000-000000000007'),
  ('c1000003-0000-4000-8000-000000000003','c3000004-0000-4000-8000-000000000004','c2000004-0000-4000-8000-000000000004','email','Cold email sent with fleet dashboard case study.', 5,'10000007-0000-4000-8000-000000000007'),
  ('c1000004-0000-4000-8000-000000000004','c3000005-0000-4000-8000-000000000005','c2000005-0000-4000-8000-000000000005','meeting','Met at Latitude59, demoed portal concept.', 38,'10000002-0000-4000-8000-000000000002'),
  ('c1000005-0000-4000-8000-000000000005','c3000006-0000-4000-8000-000000000006','c2000006-0000-4000-8000-000000000006','call','Toomas confirmed they went with another vendor.', 30,'10000007-0000-4000-8000-000000000007')
) as v(client_id, deal_id, contact_id, kind, body, days_ago, actor);
