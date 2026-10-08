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
              and (status = 'done' and done_at is null and done_by is null and done_comment is null
                     and assignee_id is null and due_on is null
                   or status = 'planned' and public.is_sales_assignable(assignee_id) and done_at is null
                     and done_by is null and done_comment is null));

create or replace function public.app_date_label(d date) returns text
language sql immutable as $$ select to_char(d, 'DD.MM.YYYY') $$;
revoke all on function public.app_date_label(date) from public, anon;

create or replace function public.complete_activity(p_id uuid, p_done_on date, p_done_by uuid, p_comment text)
returns void language plpgsql security definer set search_path = public as $$
declare v public.crm_activities%rowtype;
begin
  if not public.has_permission(auth.uid(),'manage_sales') then raise exception 'Not authorized' using errcode = '42501'; end if;
  select * into v from public.crm_activities where id = p_id for update;
  if not found or v.status <> 'planned' then raise exception 'Step not found or already done' using errcode = 'P0002'; end if;
  if p_done_on is null then raise exception 'done_on is required' using errcode = '22004'; end if;
  if p_done_on > (now() at time zone 'Europe/Tallinn')::date then raise exception 'done_on cannot be in the future' using errcode = '22004'; end if;
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
  if not found or v.status <> 'planned' then raise exception 'Step not found or already done' using errcode = 'P0002'; end if;
  if p_due_on is null then raise exception 'due_on is required' using errcode = '22004'; end if;
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
  if not found or v.status <> 'planned' then raise exception 'Step not found or already done' using errcode = 'P0002'; end if;
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
revoke all on function public.migrate_deal_follow_ups() from public, anon, authenticated;
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
