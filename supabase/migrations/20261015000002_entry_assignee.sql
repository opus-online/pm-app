-- Logged entries (status 'done': a call/email/meeting/note that already happened) may name the
-- Sales person who handled it, set when logging and changeable when editing. Previously only
-- planned steps carried an assignee.

drop policy "insert crm_activities" on public.crm_activities;
create policy "insert crm_activities" on public.crm_activities for insert
  with check (public.has_permission(auth.uid(),'manage_sales') and kind <> 'system' and actor_id = auth.uid()
              and (status = 'done' and done_at is null and done_by is null and done_comment is null
                     and (assignee_id is null or public.is_sales_assignable(assignee_id)) and due_on is null
                     and edited_at is null and edited_by is null
                     and cancelled_at is null and cancelled_by is null and cancel_reason is null
                   or status = 'planned' and public.is_sales_assignable(assignee_id) and done_at is null
                     and done_by is null and done_comment is null
                     and edited_at is null and edited_by is null
                     and cancelled_at is null and cancelled_by is null and cancel_reason is null));

drop function public.edit_entry(uuid, text, public.activity_kind, timestamptz, uuid, uuid);
create function public.edit_entry(
  p_id uuid, p_body text, p_kind public.activity_kind, p_occurred_at timestamptz,
  p_contact uuid, p_deal uuid, p_assignee uuid default null
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
  -- An unchanged assignee is always fine (they may have lost Sales access since); a new one must
  -- be a current Sales user.
  if p_assignee is not null and p_assignee is distinct from v.assignee_id
     and not public.is_sales_assignable(p_assignee) then
    raise exception 'Assignee must be a Sales user' using errcode = '42501';
  end if;
  update public.crm_activities
     set body = v_body, kind = p_kind, occurred_at = coalesce(p_occurred_at, occurred_at),
         contact_id = p_contact, deal_id = p_deal, assignee_id = p_assignee,
         edited_at = now(), edited_by = auth.uid()
   where id = p_id;
end; $$;

revoke all on function public.edit_entry(uuid, text, public.activity_kind, timestamptz, uuid, uuid, uuid) from public, anon;
grant execute on function public.edit_entry(uuid, text, public.activity_kind, timestamptz, uuid, uuid, uuid) to authenticated;
