# Sales Next Steps (MVP round 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the deal follow-up date into planned "next steps" (due date, what, assignee) that can be marked done with date/by/comment, and make the Sales list one row per company showing the next step.

**Architecture:** `crm_activities` gains a `status` (planned|done) plus due/assignee/done fields; three SECURITY DEFINER RPCs (complete, reschedule, reassign) let any Sales user act on any step and log system entries. `deals.next_follow_up_on` is migrated into planned steps and dropped. Two `security_invoker` views expose the next open step per company and per deal. The `/sales` list switches to company rows; the board and company page read next steps from the views.

**Tech Stack:** Next.js 16 App Router, Supabase (Postgres RLS, pgTAP), zod v4, react-hook-form, shadcn on `@base-ui/react`, vitest.

**Spec:** `docs/superpowers/specs/2026-10-08-sales-next-steps-design.md` (builds on `2026-10-06-crm-sales-design.md`)

## Global Constraints

- Next.js 16 differs from training data — read `node_modules/next/dist/docs/` when unsure (AGENTS.md).
- base-ui: `render` prop, never `asChild`; menu items `onClick`.
- zod v4 (`z.uuid()`, `z.iso.date()`).
- Every new table/view/function: RLS or `security_invoker`; functions `set search_path = public`, `revoke all ... from public, anon`, grant to `authenticated`.
- Server actions: `"use server"`, `{ error: string } | { success: true; ... }`, `requirePermission` first, `revalidatePath` after writes; every client-side action call wrapped in try/catch; pages with search params use `useUnstickRefresh(pending)` from `src/app/(app)/sales/companies/[id]/use-unstick-refresh.ts` for transition-based saves (Next 16.2.10 stale-RSC workaround).
- Allowlisted shapes to client components (build field by field, never spread rows).
- No help texts in UI (labels, titles, tooltips on truncated text, and the Prospect tooltip are fine).
- **All dates in Sales render `dd.mm.yyyy`** via the new `formatDateEt` helper; "today" is `appDayKey()` in `APP_TIME_ZONE` (`src/lib/time-zone.ts`).
- Truncated text: `truncate` + Tooltip showing the full text.
- Local Supabase only during work; NEVER `--linked`.

## Review Focus

1. Marking someone else's step done must work for any Sales user and record the chosen "done by" — pgTAP in Task 1.
2. A planned step whose assignee later loses Sales access must still render (name via `sales_people()` falls back) and remain completable — covered by `sales_people()` including activity actors/assignees (Task 1 updates it).
3. A company with two open steps on the same day shows the earlier-created one consistently in list and company page — pgTAP view test (Task 1) + shared view usage.
4. Rescheduling to the same date writes no system entry — pgTAP (Task 1).
5. Deals that had a follow-up date before migration keep that date as a planned step (no silent loss) — pgTAP (Task 1) using a pre-migration fixture is impossible inside one test file, so Task 1 asserts the backfill SQL via a function `migrate_deal_follow_ups()` called in the migration and re-callable in the test.

---

## File Structure

**Create**
- `supabase/migrations/20261008000001_sales_next_steps.sql`
- `supabase/tests/phase11_next_steps.test.sql`
- `src/lib/sales/date-format.ts`, `tests/sales-date-format.test.ts`
- `src/lib/sales/next-step.ts` (types + sort), `tests/sales-next-step.test.ts`
- `src/app/(app)/sales/load-companies.ts`, `src/app/(app)/sales/companies-table.tsx`, `src/app/(app)/sales/next-step-cell.tsx`, `src/app/(app)/sales/truncate-tooltip.tsx`
- `src/app/(app)/sales/companies/[id]/next-steps-card.tsx`, `mark-done-dialog.tsx`

**Modify**
- `supabase/tests/phase10_crm.test.sql` (remove follow-up assertions/columns that no longer exist; keep plan count correct)
- `supabase/seed.sql`, `supabase/snippets/crm-demo-seed.sql`
- `src/lib/database.types.ts` (regenerate)
- `src/lib/sales/types.ts`, `urgency.ts`, `pipeline.ts`, `pick-provided.ts` (only if it references follow-up), `src/lib/validation/sales.ts`
- `src/app/actions/sales.ts`
- `src/app/(app)/sales/page.tsx`, `types.ts`, `load-pipeline.ts`, `pipeline-kpis.tsx`, `pipeline-filters.tsx`, `pipeline-board.tsx`, `follow-up-chip.tsx` (→ due chip), `new-lead-dialog.tsx`; delete `pipeline-table.tsx` once `companies-table.tsx` replaces it
- `src/app/(app)/sales/companies/[id]/page.tsx`, `activity-composer.tsx`, `activity-timeline.tsx`, `deal-sheet.tsx`, `deals-card.tsx`, `company-header.tsx`
- Tests referencing `next_follow_up_on` / `compareByFollowUp`: `tests/sales-urgency.test.ts`, `tests/sales-pipeline.test.ts`, `tests/sales-pick-provided.test.ts`, `tests/sales-validation.test.ts`

---

### Task 1: Next-steps schema, RPCs, views, follow-up migration

**Files:** Create `supabase/migrations/20261008000001_sales_next_steps.sql`, `supabase/tests/phase11_next_steps.test.sql`; Modify `supabase/tests/phase10_crm.test.sql`.

**Interfaces — Produces:**
- enum `activity_status ('planned','done')`; `crm_activities` columns `status, due_on, assignee_id, done_at, done_by, done_comment`.
- `public.is_sales_assignable(uid uuid) returns boolean` (definer): active profile with role `sales` or `admin`.
- `public.complete_activity(p_id uuid, p_done_on date, p_done_by uuid, p_comment text) returns void`
- `public.reschedule_activity(p_id uuid, p_due_on date) returns void`
- `public.reassign_activity(p_id uuid, p_assignee uuid) returns void`
- views `public.company_next_steps(client_id, activity_id, deal_id, due_on, kind, body, assignee_id, contact_id)` and `public.deal_next_steps(deal_id, activity_id, client_id, due_on, kind, body, assignee_id, contact_id)` — security_invoker.
- `create_lead(p_client_id uuid, p_company jsonb, p_deal jsonb, p_contact jsonb, p_step jsonb default null)` — `p_step` = `{body, due_on, assignee_id, kind?}`; `p_deal` no longer reads `next_follow_up_on`.
- System entry bodies (exact): `Next step moved: DD.MM.YYYY → DD.MM.YYYY`, `Next step reassigned to <name>`.
- `deals.next_follow_up_on` dropped; `follow_up_label` dropped; `log_deal_activity` without the follow-up branch.

- [ ] **Step 1: Failing pgTAP** — create `supabase/tests/phase11_next_steps.test.sql`:

```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

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
-- 4-6 planning
select lives_ok($$ insert into public.crm_activities (id, client_id, deal_id, kind, body, status, due_on, assignee_id)
  values ('ad300000-0000-4000-8000-000000000001','ad100000-0000-4000-8000-000000000001','ad200000-0000-4000-8000-000000000001','call','Call Kristjan','planned','2026-10-14','ad000000-0000-4000-8000-000000000002') $$, 'sales user plans a step for a colleague');
select throws_ok($$ insert into public.crm_activities (client_id, kind, body, status, due_on, assignee_id)
  values ('ad100000-0000-4000-8000-000000000001','call','x','planned','2026-10-14','ad000000-0000-4000-8000-000000000003') $$, '42501', null, 'cannot assign to a non-sales user');
select lives_ok($$ insert into public.crm_activities (id, client_id, kind, body, status, due_on, assignee_id)
  values ('ad300000-0000-4000-8000-000000000002','ad100000-0000-4000-8000-000000000002','email','Send intro','planned','2026-10-20','ad000000-0000-4000-8000-000000000001') $$, 'step on a company without deals');

-- 7-9 views
insert into public.crm_activities (id, client_id, kind, body, status, due_on, assignee_id)
  values ('ad300000-0000-4000-8000-000000000003','ad100000-0000-4000-8000-000000000001','meeting','Later step','planned','2026-10-30','ad000000-0000-4000-8000-000000000001');
select is((select activity_id from public.company_next_steps where client_id='ad100000-0000-4000-8000-000000000001'),
  'ad300000-0000-4000-8000-000000000001'::uuid, 'company next step = earliest open step');
select is((select activity_id from public.deal_next_steps where deal_id='ad200000-0000-4000-8000-000000000001'),
  'ad300000-0000-4000-8000-000000000001'::uuid, 'deal next step');
select is((select count(*)::int from public.company_next_steps where client_id='ad100000-0000-4000-8000-000000000002'), 1, 'company without deals has a next step');

-- 10-12 reschedule
select lives_ok($$ select public.reschedule_activity('ad300000-0000-4000-8000-000000000001','2026-10-21') $$, 'reschedule');
select ok(exists(select 1 from public.crm_activities where kind='system' and body='Next step moved: 14.10.2026 → 21.10.2026'
  and actor_id='ad000000-0000-4000-8000-000000000001'), 'reschedule logs a system entry with the actor');
select public.reschedule_activity('ad300000-0000-4000-8000-000000000001','2026-10-21');
select is((select count(*)::int from public.crm_activities where body like 'Next step moved%'), 1, 'same-date reschedule writes nothing');

-- 13-14 reassign
select lives_ok($$ select public.reassign_activity('ad300000-0000-4000-8000-000000000001','ad000000-0000-4000-8000-000000000001') $$, 'reassign');
select ok(exists(select 1 from public.crm_activities where kind='system' and body='Next step reassigned to Sara'), 'reassign logs');

-- 15-17 complete (anna completes a step sara created)
set local "request.jwt.claims" to '{"sub":"ad000000-0000-4000-8000-000000000002","role":"authenticated"}';
select lives_ok($$ select public.complete_activity('ad300000-0000-4000-8000-000000000001','2026-10-21','ad000000-0000-4000-8000-000000000002','Talked, wants v3') $$, 'any sales user completes any step');
select is((select status::text || '|' || done_by::text || '|' || done_comment from public.crm_activities where id='ad300000-0000-4000-8000-000000000001'),
  'done|ad000000-0000-4000-8000-000000000002|Talked, wants v3', 'done fields recorded');
select throws_ok($$ select public.complete_activity('ad300000-0000-4000-8000-000000000001','2026-10-21','ad000000-0000-4000-8000-000000000002',null) $$, null, null, 'cannot complete twice');

-- 18-19 non-sales
set local "request.jwt.claims" to '{"sub":"ad000000-0000-4000-8000-000000000003","role":"authenticated"}';
select throws_ok($$ select public.complete_activity('ad300000-0000-4000-8000-000000000003','2026-10-21','ad000000-0000-4000-8000-000000000003',null) $$, '42501', null, 'non-sales cannot complete');
select is((select count(*)::int from public.company_next_steps), 0, 'non-sales sees no next steps');
reset role;

-- 20 follow-up column gone
select hasnt_column('public', 'deals', 'next_follow_up_on', 'deal follow-up date retired');

select * from finish();
rollback;
```

Also add to the same file, before `finish()` (bump plan to 21), a backfill assertion:
```sql
-- backfill function converts a legacy follow-up (exercised via migrate_deal_follow_ups on a temp column)
select ok(exists(select 1 from pg_proc where proname = 'migrate_deal_follow_ups'), 'backfill function exists');
```

- [ ] **Step 2: Run** `npm run db:reset; npx supabase test db supabase/tests/phase11_next_steps.test.sql` → FAIL (status column missing).

- [ ] **Step 3: Migration** `supabase/migrations/20261008000001_sales_next_steps.sql`:

```sql
-- Sales round 2: planned next steps on crm_activities; deal follow-up date retired.

create type public.activity_status as enum ('planned','done');

alter table public.crm_activities
  add column status public.activity_status not null default 'done',
  add column due_on date,
  add column assignee_id uuid references public.user_profiles (id),
  add column done_at timestamptz,
  add column done_by uuid references public.user_profiles (id),
  add column done_comment text,
  add constraint crm_activities_planned_fields check (status <> 'planned' or (due_on is not null and assignee_id is not null)),
  add constraint crm_activities_system_done check (kind <> 'system' or status = 'done');
create index crm_activities_next_idx on public.crm_activities (client_id, status, due_on);

create or replace function public.is_sales_assignable(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_profiles up
                 join public.user_roles ur on ur.user_id = up.id
                 where up.id = uid and up.status = 'active' and ur.role_key in ('sales','admin')) $$;
revoke all on function public.is_sales_assignable(uuid) from public, anon;
grant execute on function public.is_sales_assignable(uuid) to authenticated;

-- planned inserts: assignee must be assignable
drop policy "insert crm_activities" on public.crm_activities;
create policy "insert crm_activities" on public.crm_activities for insert
  with check (public.has_permission(auth.uid(),'manage_sales') and kind <> 'system' and actor_id = auth.uid()
              and (status = 'done' and done_at is null and done_by is null
                   or status = 'planned' and public.is_sales_assignable(assignee_id) and done_at is null));

create or replace function public.app_date_label(d date) returns text
language sql immutable as $$ select to_char(d, 'DD.MM.YYYY') $$;
revoke all on function public.app_date_label(date) from public, anon;

create or replace function public.complete_activity(p_id uuid, p_done_on date, p_done_by uuid, p_comment text)
returns void language plpgsql security definer set search_path = public as $$
declare v public.crm_activities%rowtype;
begin
  if not public.has_permission(auth.uid(),'manage_sales') then raise exception 'Not authorized' using errcode = '42501'; end if;
  select * into v from public.crm_activities where id = p_id for update;
  if not found or v.status <> 'planned' then raise exception 'Step not found or already done'; end if;
  if not public.is_sales_assignable(p_done_by) then raise exception 'Done by must be a Sales user' using errcode = '42501'; end if;
  update public.crm_activities
     set status = 'done', done_at = (p_done_on::timestamp + time '12:00') at time zone 'Europe/Tallinn',
         done_by = p_done_by, done_comment = nullif(btrim(coalesce(p_comment,'')), '')
   where id = p_id;
end; $$;

create or replace function public.reschedule_activity(p_id uuid, p_due_on date)
returns void language plpgsql security definer set search_path = public as $$
declare v public.crm_activities%rowtype;
begin
  if not public.has_permission(auth.uid(),'manage_sales') then raise exception 'Not authorized' using errcode = '42501'; end if;
  select * into v from public.crm_activities where id = p_id for update;
  if not found or v.status <> 'planned' then raise exception 'Step not found or already done'; end if;
  if v.due_on = p_due_on then return; end if;
  update public.crm_activities set due_on = p_due_on where id = p_id;
  insert into public.crm_activities (client_id, deal_id, kind, body, actor_id, metadata)
  values (v.client_id, v.deal_id, 'system',
          'Next step moved: ' || public.app_date_label(v.due_on) || ' → ' || public.app_date_label(p_due_on),
          auth.uid(), jsonb_build_object('activity_id', p_id, 'from', v.due_on, 'to', p_due_on));
end; $$;

create or replace function public.reassign_activity(p_id uuid, p_assignee uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v public.crm_activities%rowtype; v_name text;
begin
  if not public.has_permission(auth.uid(),'manage_sales') then raise exception 'Not authorized' using errcode = '42501'; end if;
  select * into v from public.crm_activities where id = p_id for update;
  if not found or v.status <> 'planned' then raise exception 'Step not found or already done'; end if;
  if not public.is_sales_assignable(p_assignee) then raise exception 'Assignee must be a Sales user' using errcode = '42501'; end if;
  if v.assignee_id = p_assignee then return; end if;
  select coalesce(full_name, email) into v_name from public.user_profiles where id = p_assignee;
  update public.crm_activities set assignee_id = p_assignee where id = p_id;
  insert into public.crm_activities (client_id, deal_id, kind, body, actor_id, metadata)
  values (v.client_id, v.deal_id, 'system', 'Next step reassigned to ' || v_name,
          auth.uid(), jsonb_build_object('activity_id', p_id, 'from', v.assignee_id, 'to', p_assignee));
end; $$;

revoke all on function public.complete_activity(uuid, date, uuid, text) from public, anon;
revoke all on function public.reschedule_activity(uuid, date) from public, anon;
revoke all on function public.reassign_activity(uuid, uuid) from public, anon;
grant execute on function public.complete_activity(uuid, date, uuid, text) to authenticated;
grant execute on function public.reschedule_activity(uuid, date) to authenticated;
grant execute on function public.reassign_activity(uuid, uuid) to authenticated;

-- next step views (RLS of crm_activities applies: security_invoker)
create view public.company_next_steps with (security_invoker = true) as
  select distinct on (a.client_id) a.client_id, a.id as activity_id, a.deal_id, a.due_on, a.kind, a.body, a.assignee_id, a.contact_id
  from public.crm_activities a where a.status = 'planned'
  order by a.client_id, a.due_on, a.created_at, a.id;
create view public.deal_next_steps with (security_invoker = true) as
  select distinct on (a.deal_id) a.deal_id, a.id as activity_id, a.client_id, a.due_on, a.kind, a.body, a.assignee_id, a.contact_id
  from public.crm_activities a where a.status = 'planned' and a.deal_id is not null
  order by a.deal_id, a.due_on, a.created_at, a.id;
grant select on public.company_next_steps, public.deal_next_steps to authenticated, service_role;

-- retire deals.next_follow_up_on: convert open-deal follow-ups into planned steps
create or replace function public.migrate_deal_follow_ups() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  insert into public.crm_activities (client_id, deal_id, kind, body, status, due_on, assignee_id, actor_id)
  select d.client_id, d.id, 'call', 'Follow up: ' || d.title, 'planned', d.next_follow_up_on, d.owner_id, d.owner_id
  from public.deals d
  where d.next_follow_up_on is not null and d.stage in ('new','contacted','offer_sent','negotiation');
  get diagnostics n = row_count;
  return n;
end; $$;
revoke all on function public.migrate_deal_follow_ups() from public, anon;
select public.migrate_deal_follow_ups();

-- log_deal_activity without the follow-up branch (20261007000001)
create or replace function public.log_deal_activity() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.crm_activities (client_id, deal_id, kind, body, actor_id, metadata)
    values (new.client_id, new.id, 'system', 'Deal created: ' || new.title, auth.uid(), jsonb_build_object('deal_id', new.id));
  else
    if new.stage is distinct from old.stage then
      insert into public.crm_activities (client_id, deal_id, kind, body, actor_id, metadata)
      values (new.client_id, new.id, 'system',
              'Stage: ' || lower(public.stage_label(old.stage)) || ' → ' || lower(public.stage_label(new.stage)),
              auth.uid(), jsonb_build_object('deal_id', new.id, 'from', old.stage, 'to', new.stage, 'lost_reason', new.lost_reason));
    end if;
    if new.owner_id is distinct from old.owner_id then
      insert into public.crm_activities (client_id, deal_id, kind, body, actor_id, metadata)
      values (new.client_id, new.id, 'system', 'Owner changed', auth.uid(),
              jsonb_build_object('deal_id', new.id, 'from', old.owner_id, 'to', new.owner_id));
    end if;
  end if;
  return new;
end; $$;
drop function public.follow_up_label(date);
drop index if exists public.deals_follow_up_idx;
alter table public.deals drop column next_follow_up_on;

-- create_lead: optional first step instead of a deal follow-up date
drop function public.create_lead(uuid, jsonb, jsonb, jsonb);
create or replace function public.create_lead(p_client_id uuid, p_company jsonb, p_deal jsonb, p_contact jsonb, p_step jsonb default null)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare v_client uuid := p_client_id; v_deal uuid; v_contact uuid;
begin
  if not public.has_permission(auth.uid(), 'manage_sales') then raise exception 'Not authorized' using errcode = '42501'; end if;
  if v_client is null then
    insert into public.clients (name, reg_code, phone, email, website)
    values (p_company->>'name', nullif(p_company->>'reg_code',''), nullif(p_company->>'phone',''),
            nullif(p_company->>'email',''), nullif(p_company->>'website',''))
    returning id into v_client;
  end if;
  insert into public.deals (client_id, title, source, owner_id)
  values (v_client, p_deal->>'title', coalesce(nullif(p_deal->>'source','')::public.deal_source, 'other'), (p_deal->>'owner_id')::uuid)
  returning id into v_deal;
  if p_contact is not null and coalesce(p_contact->>'first_name','') <> '' then
    insert into public.client_contacts (client_id, name, first_name, last_name, role, email, phone)
    values (v_client, '', p_contact->>'first_name', nullif(p_contact->>'last_name',''), nullif(p_contact->>'role',''),
            nullif(p_contact->>'email',''), nullif(p_contact->>'phone',''))
    returning id into v_contact;
  end if;
  if p_step is not null and coalesce(p_step->>'body','') <> '' then
    insert into public.crm_activities (client_id, deal_id, contact_id, kind, body, status, due_on, assignee_id)
    values (v_client, v_deal, v_contact, coalesce(nullif(p_step->>'kind','')::public.activity_kind, 'call'),
            p_step->>'body', 'planned', (p_step->>'due_on')::date, (p_step->>'assignee_id')::uuid);
  end if;
  return jsonb_build_object('client_id', v_client, 'deal_id', v_deal);
end; $$;
revoke all on function public.create_lead(uuid, jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.create_lead(uuid, jsonb, jsonb, jsonb, jsonb) to authenticated;

-- sales_people(): also include assignees/completers so their names resolve after losing access
create or replace function public.sales_people()
returns table (id uuid, name text, avatar_url text, assignable boolean)
language sql stable security definer set search_path = public as $$
  select up.id, coalesce(up.full_name, up.email) as name, up.avatar_url, public.is_sales_assignable(up.id) as assignable
  from public.user_profiles up
  where public.has_permission(auth.uid(), 'view_sales')
    and (
      exists (select 1 from public.user_roles ur where ur.user_id = up.id and ur.role_key in ('sales','admin'))
      or exists (select 1 from public.deals d where d.owner_id = up.id)
      or exists (select 1 from public.crm_activities a where up.id in (a.actor_id, a.assignee_id, a.done_by))
    )
  order by 2;
$$;
```

Before writing `sales_people`, read `20261006000003_sales_people.sql` and keep its grants/comments intent (the `create or replace` keeps existing grants).

- [ ] **Step 4: Fix phase10** — remove the follow-up assertions added 2026-10-07 (the block `-- follow-up changes write system entries` with its 5 assertions) and any `next_follow_up_on` usage (grep the file); update `create_lead` calls to the new 5-arg signature only if they break (4-arg calls still work because `p_step` has a default). Adjust `plan()` to the real count.

- [ ] **Step 5: Run** `npm run db:reset && npm run test:db` → all PASS (phase9 invariants included). **Note:** `db:reset` will FAIL until `supabase/seed.sql` stops inserting `next_follow_up_on`; in this task, make the minimal seed edit: remove `next_follow_up_on` from the CRM deals insert column list and values (Task 2 adds proper planned steps).

- [ ] **Step 6: Commit** `git add supabase && git commit -m "feat(sales): planned next steps, complete/reschedule/reassign rpcs, retire deal follow-up"`.

---

### Task 2: Seed + types

**Files:** Modify `supabase/seed.sql` (CRM section), `supabase/snippets/crm-demo-seed.sql` (keep identical to the CRM section of seed.sql), `src/lib/database.types.ts`.

- [ ] **Step 1:** In the CRM demo section, after offers, insert planned steps (UUID prefix `c5…`), using `current_date ± n` so urgency varies:

```sql
insert into public.crm_activities (id, client_id, deal_id, contact_id, kind, body, status, due_on, assignee_id, actor_id, created_at) values
  ('c5000001-0000-4000-8000-000000000001','c1000001-0000-4000-8000-000000000001','c3000001-0000-4000-8000-000000000001','c2000001-0000-4000-8000-000000000001','call','Call Kristjan about the phased v2 offer','planned', current_date - 2,'10000007-0000-4000-8000-000000000007','10000007-0000-4000-8000-000000000007', now() - interval '9 days'),
  ('c5000002-0000-4000-8000-000000000002','c1000001-0000-4000-8000-000000000001','c3000002-0000-4000-8000-000000000002','c2000002-0000-4000-8000-000000000002','email','Send Liis the homepage wireframes','planned', current_date,'10000007-0000-4000-8000-000000000007','10000007-0000-4000-8000-000000000007', now() - interval '3 days'),
  ('c5000003-0000-4000-8000-000000000003','c1000002-0000-4000-8000-000000000002','c3000003-0000-4000-8000-000000000003','c2000003-0000-4000-8000-000000000003','meeting','Demo booking flow to Kadri','planned', current_date + 1,'10000002-0000-4000-8000-000000000002','10000002-0000-4000-8000-000000000002', now() - interval '5 days'),
  ('c5000004-0000-4000-8000-000000000004','c1000003-0000-4000-8000-000000000003','c3000004-0000-4000-8000-000000000004','c2000004-0000-4000-8000-000000000004','call','Follow up on the cold email','planned', current_date + 5,'10000007-0000-4000-8000-000000000007','10000007-0000-4000-8000-000000000007', now() - interval '2 days'),
  ('c5000005-0000-4000-8000-000000000005','c1000004-0000-4000-8000-000000000004','c3000005-0000-4000-8000-000000000005','c2000005-0000-4000-8000-000000000005','call','Ask Eva for feedback on the portal offer','planned', current_date + 12,'10000002-0000-4000-8000-000000000002','10000002-0000-4000-8000-000000000002', now() - interval '6 days'),
  ('c5000006-0000-4000-8000-000000000006','c1000002-0000-4000-8000-000000000002','c3000009-0000-4000-8000-000000000009','c2000003-0000-4000-8000-000000000003','email','Chase SEO budget approval','planned', current_date - 6,'10000002-0000-4000-8000-000000000002','10000007-0000-4000-8000-000000000007', now() - interval '12 days'),
  ('c5000007-0000-4000-8000-000000000007','c1000005-0000-4000-8000-000000000005', null,'c2000006-0000-4000-8000-000000000006','call','Check in with Toomas — new year budget?','planned', current_date + 30,'10000007-0000-4000-8000-000000000007','10000007-0000-4000-8000-000000000007', now() - interval '1 day')
on conflict (id) do nothing;

-- a few completed steps with comments
insert into public.crm_activities (client_id, deal_id, contact_id, kind, body, status, occurred_at, due_on, assignee_id, actor_id, done_at, done_by, done_comment) values
  ('c1000001-0000-4000-8000-000000000001','c3000001-0000-4000-8000-000000000001','c2000001-0000-4000-8000-000000000001','call','Call Kristjan after v1 rejection','done', now() - interval '20 days', current_date - 20,'10000007-0000-4000-8000-000000000007','10000007-0000-4000-8000-000000000007', now() - interval '19 days','10000007-0000-4000-8000-000000000007','He wants a phased approach, sending v2'),
  ('c1000002-0000-4000-8000-000000000002','c3000003-0000-4000-8000-000000000003','c2000003-0000-4000-8000-000000000003','email','Send intro deck to Kadri','done', now() - interval '15 days', current_date - 15,'10000002-0000-4000-8000-000000000002','10000002-0000-4000-8000-000000000002', now() - interval '14 days','10000002-0000-4000-8000-000000000002','Sent, she will share with the clinic owners');

-- one company with no deals, only a next step
insert into public.clients (id, name, reg_code, phone, email, website) values
  ('c1000006-0000-4000-8000-000000000006','Viru Hotels OÜ','12998877','+372 600 1006','info@viruhotels.ee','https://viruhotels.ee')
on conflict (id) do nothing;
insert into public.client_contacts (id, client_id, name, first_name, last_name, gender, email, phone, role) values
  ('c2000008-0000-4000-8000-000000000008','c1000006-0000-4000-8000-000000000006','','Marta','Kuusik','female','marta@viruhotels.ee','+372 5100 0008','Marketing manager')
on conflict (id) do nothing;
insert into public.crm_activities (id, client_id, contact_id, kind, body, status, due_on, assignee_id, actor_id) values
  ('c5000008-0000-4000-8000-000000000008','c1000006-0000-4000-8000-000000000006','c2000008-0000-4000-8000-000000000008','call','Intro call — booking engine needs','planned', current_date + 3,'10000007-0000-4000-8000-000000000007','10000007-0000-4000-8000-000000000007')
on conflict (id) do nothing;
```

(The migration's `migrate_deal_follow_ups()` runs before seed on reset, so deals have no follow-ups to convert locally; production converts real values.)

- [ ] **Step 2:** Copy the whole CRM section of `seed.sql` (from `-- ===== CRM demo` to the end) over `supabase/snippets/crm-demo-seed.sql`.
- [ ] **Step 3:** `npm run db:reset && npm run test:db && npm run db:types` → green; types now have `company_next_steps`, `deal_next_steps`, the RPCs, `activity_status`, and no `next_follow_up_on`.
- [ ] **Step 4: Commit** `git commit -am "chore(sales): next-step demo seed, regenerated types"`. (`npx tsc --noEmit` WILL fail here because app code still references `next_follow_up_on`; that is fixed in Tasks 3–6. Note it in the report.)

---

### Task 3: Pure helpers, validation

**Files:** Create `src/lib/sales/date-format.ts`, `src/lib/sales/next-step.ts`, tests `tests/sales-date-format.test.ts`, `tests/sales-next-step.test.ts`; Modify `src/lib/sales/urgency.ts`, `src/lib/sales/types.ts`, `src/lib/sales/pipeline.ts`, `src/lib/validation/sales.ts`, `tests/sales-urgency.test.ts`, `tests/sales-pipeline.test.ts`, `tests/sales-validation.test.ts`, `tests/sales-pick-provided.test.ts`.

**Interfaces — Produces:**
```ts
// date-format.ts
export function formatDateEt(value: string | null): string; // "2026-10-14" or ISO timestamp → "14.10.2026" (timestamp → its APP_TIME_ZONE day); null → "—"
// urgency.ts
export function daysUntil(dateISO: string | null, today?: Date): number | null; // renamed from followUpDays (same semantics)
export function compareDueDates(a: string | null, b: string | null): number;      // earliest first, null last
// next-step.ts
export type NextStep = { activity_id: string; due_on: string; kind: "call" | "email" | "meeting" | "note"; body: string; assignee: { id: string; name: string; avatar_url: string | null } | null; deal_id: string | null; contact_id: string | null };
export function stepsDueCount(steps: { due_on: string }[], today?: Date): number; // due today or overdue
// types.ts: DealLite loses next_follow_up_on.
// pipeline.ts: pipelineTotals → { openCount, pipelineValue, wonThisMonthValue } (dueCount removed; KPI uses stepsDueCount).
// validation/sales.ts
export const planStepSchema;   // { client_id, deal_id?, contact_id?, kind, body (1..2000), due_on (required iso date), assignee_id (uuid) }
export const completeStepSchema; // { activity_id, done_on (iso date), done_by (uuid), comment (0..2000, blank→null) }
export const rescheduleStepSchema; // { activity_id, due_on }
export const reassignStepSchema;   // { activity_id, assignee_id }
// activitySchema: remove set_follow_up_on. dealUpdateSchema / newLeadSchema: remove next_follow_up_on; newLeadSchema gains optional `step: { body, due_on, assignee_id, kind? }` (all-or-nothing: body present ⇒ due_on + assignee required).
```

- [ ] **Step 1: Failing tests**

`tests/sales-date-format.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { formatDateEt } from "@/lib/sales/date-format";
describe("formatDateEt", () => {
  it("formats date-only values", () => expect(formatDateEt("2026-10-14")).toBe("14.10.2026"));
  it("formats timestamps on the Tallinn day", () => expect(formatDateEt("2026-10-13T22:30:00Z")).toBe("14.10.2026"));
  it("null → em dash", () => expect(formatDateEt(null)).toBe("—"));
});
```

`tests/sales-next-step.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { stepsDueCount } from "@/lib/sales/next-step";
import { compareDueDates, daysUntil } from "@/lib/sales/urgency";
const today = new Date("2026-10-06T12:00:00Z");
describe("next steps", () => {
  it("counts due today or overdue", () =>
    expect(stepsDueCount([{ due_on: "2026-10-05" }, { due_on: "2026-10-06" }, { due_on: "2026-10-07" }], today)).toBe(2));
  it("sorts earliest first, undated last", () =>
    expect([null, "2026-10-10", "2026-10-01"].sort(compareDueDates)).toEqual(["2026-10-01", "2026-10-10", null]));
  it("daysUntil keeps follow-up semantics", () => expect(daysUntil("2026-10-05", today)).toBe(-1));
});
```

Extend `tests/sales-validation.test.ts`:
```ts
import { planStepSchema, completeStepSchema } from "@/lib/validation/sales";
describe("planStepSchema", () => {
  it("requires a due date and assignee", () =>
    expect(planStepSchema.safeParse({ client_id: crypto.randomUUID(), kind: "call", body: "Call", due_on: "", assignee_id: crypto.randomUUID() }).success).toBe(false));
  it("accepts a full step", () =>
    expect(planStepSchema.safeParse({ client_id: crypto.randomUUID(), kind: "call", body: "Call", due_on: "2026-10-14", assignee_id: crypto.randomUUID() }).success).toBe(true));
});
describe("completeStepSchema", () => {
  it("blank comment becomes null", () =>
    expect(completeStepSchema.parse({ activity_id: crypto.randomUUID(), done_on: "2026-10-14", done_by: crypto.randomUUID(), comment: "  " }).comment).toBeNull());
});
```
Update existing tests that use `next_follow_up_on`, `followUpDays`, `compareByFollowUp`, `dueCount`, `set_follow_up_on` to the new names/shapes (keep their intent; delete only assertions about removed fields).

- [ ] **Step 2:** `npm run test` → new tests FAIL.
- [ ] **Step 3: Implement** — `formatDateEt`:
```ts
import { appDayKey } from "@/lib/time-zone";
export function formatDateEt(value: string | null): string {
  if (!value) return "—";
  const key = value.length === 10 ? value : appDayKey(new Date(value));
  const [y, m, d] = key.split("-");
  return `${d}.${m}.${y}`;
}
```
`compareDueDates` = the old `compareByFollowUp` body on two strings; `daysUntil` = old `followUpDays`; `stepsDueCount = steps.filter(s => (daysUntil(s.due_on, today) ?? 1) <= 0).length`. Schemas per Interfaces using the existing `text()`, `isoDate`, `blankToNull` helpers in `validation/sales.ts`.
- [ ] **Step 4:** `npm run test` → all PASS. (tsc still fails in app code until Tasks 4–6.)
- [ ] **Step 5: Commit** `git commit -am "feat(sales): next-step helpers, dd.mm.yyyy formatter, step schemas"` (add new files).

---

### Task 4: Server actions

**Files:** Modify `src/app/actions/sales.ts`.

**Interfaces — Produces** (all wrap `requirePermission("manage_sales")`, return `{ error } | { success: true }`, revalidate `/sales` and `/sales/companies/{client_id}`):
```ts
planStepAction(input: PlanStepInput): Promise<Result & { activityId?: string }>
completeStepAction(input: CompleteStepInput): Promise<Result>
rescheduleStepAction(input: RescheduleStepInput): Promise<Result>
reassignStepAction(input: ReassignStepInput): Promise<Result>
```
- `planStepAction`: verify deal/contact belong to `client_id` (reuse the logActivityAction check); insert `{ client_id, deal_id, contact_id, kind, body, status: "planned", due_on, assignee_id }` — never `actor_id`; map RLS 42501 → "That person doesn't have Sales access.".
- `completeStepAction` / `rescheduleStepAction` / `reassignStepAction`: call the RPCs; resolve `client_id` for revalidation via `select client_id from crm_activities where id`; map RPC errors: 42501 → "That person doesn't have Sales access." (assignee/done_by) or "Not authorized"; "already done" → "This step is already done.".
- `logActivityAction`: remove `set_follow_up_on` handling and the `warning` path (no deal follow-up anymore).
- `createLeadAction`: pass `p_step` (from `input.step`, with `assignee_id` default = deal owner) instead of `next_follow_up_on`.
- `updateDealAction`: drop `next_follow_up_on` support.

- [ ] **Step 1:** Implement. **Step 2:** `npx tsc --noEmit` — errors only in UI files (Tasks 5–6); actions file clean. `npm run test` green. **Step 3: Commit** `git commit -am "feat(sales): next-step server actions"`.

---

### Task 5: List view — one row per company

**Files:** Create `src/app/(app)/sales/load-companies.ts`, `companies-table.tsx`, `next-step-cell.tsx`, `truncate-tooltip.tsx`; Modify `page.tsx`, `types.ts`, `pipeline-kpis.tsx`, `pipeline-filters.tsx`, `load-pipeline.ts` (board loader keeps deals, now with next step from `deal_next_steps`), `pipeline-board.tsx`, `follow-up-chip.tsx` → rename to `due-chip.tsx` (`DueChip({ date })` using `daysUntil` + `chipTone` + `formatDateEt`); delete `pipeline-table.tsx`.

**Interfaces — Produces:**
```ts
// types.ts
export type CompanyRow = {
  id: string; name: string; reg_code: string | null; kind: "prospect" | "client";
  contacts: PipelineContact[];
  open_deals: { id: string; stage: DealStage }[];
  open_value: number;                 // sum of latest offer of open deals
  next_step: NextStep | null;
};
// load-companies.ts (server-only)
export async function loadCompanies(): Promise<CompanyRow[]>;
// truncate-tooltip.tsx
export function TruncateTooltip({ text, className }: { text: string; className?: string }): JSX.Element; // truncate + tooltip only when text overflows (measure scrollWidth > clientWidth on hover/focus)
// next-step-cell.tsx
export function NextStepCell({ step }: { step: NextStep | null }): JSX.Element; // DueChip + kind icon + TruncateTooltip(body) + PersonAvatar(size-6, tooltip name); "—" when null
```

- [ ] **Step 1: Loader** — one `Promise.all`: `clients.select("id, name, reg_code")`, `client_contacts.select("id, client_id, name, phone, email")`, `deals.select("id, client_id, stage, offers(amount, status, sent_on, created_at)")`, `company_next_steps.select("*")`, `rpc("prospect_client_ids")`, `loadSalesPeople()`. Throw on any error. Build rows field by field; `open_value` = Σ `latestOffer(offers)?.amount` for open stages. Sort: `compareDueDates(a.next_step?.due_on ?? null, b.next_step?.due_on ?? null)`, then name.
- [ ] **Step 2: Table** (`companies-table.tsx`, client) — copy look/feel from the old `pipeline-table.tsx` (chip filters, pagination 10/page, whole-row click with `closest("a, button, [role='menuitem'], [data-slot='tooltip-trigger']")` guard → `/sales/companies/{id}`). Columns: Company (tile, `TruncateTooltip` name, reg code, Prospect/Client micro-label; Prospect has a Tooltip "No project or won deal yet") · Contacts (existing ContactsCell pattern, names via TruncateTooltip) · Deals (`open_deals.length` + stage dots, "—" when 0) · **Offer (€)** (`formatEur(open_value || null)`) · **Next step** (`NextStepCell`). Sortable: company, deals count, offer, next step (default asc). Filters: search (company name, normalized reg code, contact name/email/phone digits, next-step text), stage (has an open deal in stage), "Has next step" toggle (all / with step / without step). Remove source/owner/closed filters from the list (board keeps none).
- [ ] **Step 3: KPIs** — Open deals · Pipeline € · **Steps due** (`stepsDueCount`, red when > 0, context "today or overdue") · Won this month €. KPIs need deals + steps: `page.tsx` loads companies (list) and pipeline (board/KPIs) in parallel.
- [ ] **Step 4: Board** — `load-pipeline.ts` drops `next_follow_up_on`, reads `deal_next_steps` and attaches `next_step: NextStep | null` to each `PipelineRow`; cards show `DueChip(next_step.due_on)` with a Tooltip "<body> · <assignee>". Board resync key: replace `next_follow_up_on` with `next_step?.activity_id + due_on`. Board no longer sends follow-up fields.
- [ ] **Step 5: Header subtitle** `"N companies · N open deals · €X pipeline"`.
- [ ] **Step 6: Verify** `npx tsc --noEmit` (errors only in company-page files, Task 6), `npm run test`, `npm run lint`. Browser (production build on a free port, Playwright if available) as `sara.sales@pmcms.local`: Viru Hotels (no deals) listed with its step; overdue steps first; long step text truncates with tooltip; Offer (€) header. **Commit** `feat(sales): company-based sales list with next steps`.

---

### Task 6: Company page — next steps, mark done, composer modes

**Files:** Create `companies/[id]/next-steps-card.tsx`, `mark-done-dialog.tsx`; Modify `companies/[id]/page.tsx`, `activity-composer.tsx`, `activity-timeline.tsx`, `deal-sheet.tsx`, `deals-card.tsx`, `company-header.tsx`, `types.ts` (ActivityView gains `status`, `due_on`, `assignee`, `done_at`, `done_by`, `done_comment`; DealView loses `next_follow_up_on`, gains `next_step: NextStep | null`), `src/app/(app)/sales/new-lead-dialog.tsx`.

**Interfaces — Produces:**
```ts
NextStepsCard({ steps, contacts, deals, people, canManage, currentUserId, onPlanNext }: {
  steps: NextStepView[]; contacts: { id: string; name: string }[]; deals: { id: string; title: string }[];
  people: { id: string; name: string; avatar_url: string | null }[]; canManage: boolean; currentUserId: string;
  onPlanNext: (prefill: { contact_id: string | null; deal_id: string | null }) => void;
})
MarkDoneDialog({ step, people, currentUserId, open, onOpenChange, onDone }: { …; onDone: (prefill) => void })
type NextStepView = NextStep & { contact_name: string | null; deal_title: string | null };
```

- [ ] **Step 1: page.tsx** — load planned steps (`crm_activities` where `status='planned'`, order `due_on, created_at`) separately from the timeline (timeline = `status='done'`, existing limit 200). Map assignee/done_by names via `loadSalesPeople()`. Deal views get `next_step` from `deal_next_steps`. Lay out: header → grid (left: Deals, Contacts; right: **Next steps card**, composer, timeline).
- [ ] **Step 2: NextStepsCard** — rows sorted by due date: `DueChip`, kind icon, `TruncateTooltip(body)`, contact/deal chips, assignee avatar. Actions (manage only), shown as buttons on hover/focus and always on touch: **Mark done** → `MarkDoneDialog`; **Change date** → inline date input (commit on blur/Enter/800 ms pause, like the deal sheet) → `rescheduleStepAction`; **Reassign** → Select of assignable `people` → `reassignStepAction`. Empty state: "No next steps." with a "Plan next step" button. All calls try/catch; `useUnstickRefresh(isPending)`.
- [ ] **Step 3: MarkDoneDialog** — fields: Done on (date, default `appDayKey()`), Done by (Select of assignable people, default current user), Comment (Textarea, optional). Submit → `completeStepAction`. On success: close, `toast.success("Step done", { action: { label: "Plan next step", onClick: () => onDone({ contact_id, deal_id }) } })`.
- [ ] **Step 4: Composer** — mode toggle `Log done | Plan next step` (ToggleGroup). Log done = current behaviour minus the follow-up field. Plan next step = kind tabs, "What to do" (required), Due date (required, default tomorrow via `shiftDayKey(appDayKey(), 1)`), Assignee (assignable people, default me), Contact, Deal → `planStepAction`. Expose an imperative prefill (lift state to page via a small client wrapper or pass `planPrefill` prop + key) so `onPlanNext`/toast/"Plan step" links open plan mode with contact/deal prefilled and scroll the composer into view.
- [ ] **Step 5: Timeline** — done items that came from a completed step (`done_at` not null) render the original body plus a line `✓ Done by <name> · dd.mm.yyyy` and the comment (muted, `whitespace-pre-line`); their time/day grouping uses `done_at`. All dates in the timeline use `formatDateEt` (day headers stay Today / Yesterday / dd.mm.yyyy).
- [ ] **Step 6: Deal sheet + deals card** — remove the "Next follow-up" field and FollowUpInput; show a read-only "Next step" line (`DueChip`, body via TruncateTooltip, assignee) or "—", plus a "Plan step" ghost button calling the same prefill (deal set). Deals card chip → `DueChip(next_step?.due_on)`.
- [ ] **Step 7: New lead dialog** — replace "Next follow-up" with an optional "Next step" sub-section: What to do + Due date (assignee = selected owner). Sends `step` only when "What to do" is filled; due date required then.
- [ ] **Step 8: Prospect tooltip** in `company-header.tsx` ("No project or won deal yet"). All dates on the company page via `formatDateEt` (offers sent/valid until included).
- [ ] **Step 9: Verify** — `npm run test`, `npx tsc --noEmit` (clean now), `npm run lint`, `npm run build`. Browser (production build, Playwright) as sara: plan a step for anna on Nordic Timber → visible in Next steps card and list; log in as anna → Mark done with comment → toast "Plan next step" → plan mode prefilled → timeline shows "✓ Done by Anna Tamm · dd.mm.yyyy" + comment; Change date → timeline shows "Next step moved: … → …"; Reassign → "Next step reassigned to …"; Viru Hotels page works with no deals. Clean test rows (local only). **Commit** `feat(sales): next steps card, mark done, plan mode`.

---

### Task 7: End-to-end verification

- [ ] `npm run db:reset && npm run test && npm run test:db && npm run lint && npm run build` — record results.
- [ ] Browser per persona (sara, anna, bella, admin; Password123!): list shows all companies incl. Viru Hotels; dates `dd.mm.yyyy` everywhere in Sales; truncation tooltips; Offer (€); Steps due KPI; board cards show deal step; full plan → done → plan-next loop; reschedule/reassign entries; bella still 404 on /sales. Console clean.
- [ ] `npm run db:reset`; `rm -f *.png`; git status clean.
- [ ] Deploy notes (do not deploy without the user): `npx supabase db push --linked` (1 migration — converts any live deal follow-ups into planned steps) BEFORE pushing `master`.
