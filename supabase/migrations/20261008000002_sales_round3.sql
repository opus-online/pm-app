-- Sales round 3: cancelled status, audit columns, update_step/cancel_step/edit_entry RPCs,
-- new prospect rule (prospect = no project and no won deal).
-- Spec: .superpowers/sdd/2026-10-08-sales-round3

-- 'cancelled' is only referenced inside plpgsql function bodies below (resolved at call
-- time), never in plain SQL in this migration, since the new enum value cannot be used
-- in the same transaction it was added in.
alter type public.activity_status add value if not exists 'cancelled';

alter table public.crm_activities
  add column cancelled_at timestamptz,
  add column cancelled_by uuid references public.user_profiles (id),
  add column cancel_reason text,
  add column edited_at timestamptz,
  add column edited_by uuid references public.user_profiles (id);

-- ---------- update_step: edit a planned step's body/kind/due/assignee/contact/deal ----------
create or replace function public.update_step(
  p_id uuid, p_body text, p_kind public.activity_kind, p_due_on date,
  p_assignee uuid, p_contact uuid, p_deal uuid
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v public.crm_activities%rowtype;
  v_name text;
  v_body text := nullif(btrim(coalesce(p_body,'')), '');
begin
  if not public.has_permission(auth.uid(),'manage_sales') then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  select * into v from public.crm_activities where id = p_id for update;
  if not found or v.status <> 'planned' then
    raise exception 'Step not found or already done' using errcode = 'P0002';
  end if;
  if v_body is null then raise exception 'body is required' using errcode = '22004'; end if;
  if p_due_on is null then raise exception 'due_on is required' using errcode = '22004'; end if;
  if p_assignee is null then raise exception 'assignee is required' using errcode = '22004'; end if;
  if p_contact is not null and not exists (
    select 1 from public.client_contacts where id = p_contact and client_id = v.client_id
  ) then
    raise exception 'Contact does not belong to this company' using errcode = '22023';
  end if;
  if p_deal is not null and not exists (
    select 1 from public.deals where id = p_deal and client_id = v.client_id
      and stage in ('new','contacted','offer_sent','negotiation')
  ) then
    raise exception 'Deal does not belong to this company or is closed' using errcode = '22023';
  end if;
  if not public.is_sales_assignable(p_assignee) then
    raise exception 'Assignee must be a Sales user' using errcode = '42501';
  end if;
  if p_due_on <> v.due_on then
    insert into public.crm_activities (client_id, deal_id, kind, body, actor_id, metadata)
    values (v.client_id, v.deal_id, 'system',
            'Next step moved: ' || public.app_date_label(v.due_on) || ' → ' || public.app_date_label(p_due_on),
            auth.uid(), jsonb_build_object('activity_id', p_id, 'from', v.due_on, 'to', p_due_on));
  end if;
  if p_assignee <> v.assignee_id then
    select coalesce(full_name, email) into v_name from public.user_profiles where id = p_assignee;
    insert into public.crm_activities (client_id, deal_id, kind, body, actor_id, metadata)
    values (v.client_id, v.deal_id, 'system', 'Next step reassigned to ' || v_name,
            auth.uid(), jsonb_build_object('activity_id', p_id, 'from', v.assignee_id, 'to', p_assignee));
  end if;
  update public.crm_activities
     set body = v_body, kind = p_kind, due_on = p_due_on, assignee_id = p_assignee,
         contact_id = p_contact, deal_id = p_deal, edited_at = now(), edited_by = auth.uid()
   where id = p_id;
end; $$;

-- ---------- cancel_step: cancel a planned step ----------
create or replace function public.cancel_step(p_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public as $$
declare v public.crm_activities%rowtype;
begin
  if not public.has_permission(auth.uid(),'manage_sales') then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  select * into v from public.crm_activities where id = p_id for update;
  if not found or v.status <> 'planned' then
    raise exception 'Step not found or already done' using errcode = 'P0002';
  end if;
  update public.crm_activities
     set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(),
         cancel_reason = nullif(btrim(coalesce(p_reason,'')), '')
   where id = p_id;
end; $$;

-- ---------- edit_entry: edit any done, non-system log entry ----------
create or replace function public.edit_entry(
  p_id uuid, p_body text, p_kind public.activity_kind, p_occurred_at timestamptz,
  p_contact uuid, p_deal uuid
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v public.crm_activities%rowtype;
  v_body text := nullif(btrim(coalesce(p_body,'')), '');
begin
  if not public.has_permission(auth.uid(),'manage_sales') then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  select * into v from public.crm_activities where id = p_id for update;
  if not found or v.status <> 'done' or v.kind = 'system' then
    raise exception 'Entry not found or not editable' using errcode = 'P0002';
  end if;
  if p_kind = 'system' then
    raise exception 'Cannot change an entry to system' using errcode = '22023';
  end if;
  if v_body is null then raise exception 'body is required' using errcode = '22004'; end if;
  if p_contact is not null and not exists (
    select 1 from public.client_contacts where id = p_contact and client_id = v.client_id
  ) then
    raise exception 'Contact does not belong to this company' using errcode = '22023';
  end if;
  if p_deal is not null and not exists (
    select 1 from public.deals where id = p_deal and client_id = v.client_id
  ) then
    raise exception 'Deal does not belong to this company' using errcode = '22023';
  end if;
  update public.crm_activities
     set body = v_body, kind = p_kind, occurred_at = coalesce(p_occurred_at, occurred_at),
         contact_id = p_contact, deal_id = p_deal, edited_at = now(), edited_by = auth.uid()
   where id = p_id;
end; $$;

revoke all on function public.update_step(uuid, text, public.activity_kind, date, uuid, uuid, uuid) from public, anon;
revoke all on function public.cancel_step(uuid, text) from public, anon;
revoke all on function public.edit_entry(uuid, text, public.activity_kind, timestamptz, uuid, uuid) from public, anon;
grant execute on function public.update_step(uuid, text, public.activity_kind, date, uuid, uuid, uuid) to authenticated;
grant execute on function public.cancel_step(uuid, text) to authenticated;
grant execute on function public.edit_entry(uuid, text, public.activity_kind, timestamptz, uuid, uuid) to authenticated;

-- ---------- company_kind: prospect = no project and no won deal (deal-less companies included) ----------
create or replace function public.company_kind(company uuid) returns text
language sql stable security definer set search_path = public as $$
  select case
    when not exists (select 1 from public.deals d where d.client_id = company and d.stage = 'won')
     and not exists (select 1 from public.projects p where p.client_id = company)
    then 'prospect' else 'client' end
$$;
