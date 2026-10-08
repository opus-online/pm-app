-- Turn a logged entry (saved as "already happened" by mistake) into a planned next step.

create or replace function public.convert_entry_to_step(p_id uuid, p_due_on date, p_assignee uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v public.crm_activities%rowtype; v_deal_stage public.deal_stage;
begin
  if not public.has_permission(auth.uid(),'manage_sales') then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  select * into v from public.crm_activities where id = p_id for update;
  -- only plain logged entries: not system, not a completed or cancelled step
  if not found or v.status <> 'done' or v.kind = 'system' or v.done_at is not null or v.cancelled_at is not null then
    raise exception 'Entry not found or cannot be moved' using errcode = 'P0002';
  end if;
  if p_due_on is null or p_assignee is null then
    raise exception 'Due date and responsible are required' using errcode = '22004';
  end if;
  if not public.is_sales_assignable(p_assignee) then
    raise exception 'Assignee must be a Sales user' using errcode = '42501';
  end if;
  if v.deal_id is not null then
    select stage into v_deal_stage from public.deals where id = v.deal_id;
    if v_deal_stage in ('won','lost') then
      raise exception 'Deal is closed' using errcode = '22023';
    end if;
  end if;
  update public.crm_activities
     set status = 'planned', due_on = p_due_on, assignee_id = p_assignee,
         edited_at = now(), edited_by = auth.uid()
   where id = p_id;
end; $$;
revoke all on function public.convert_entry_to_step(uuid, date, uuid) from public, anon;
grant execute on function public.convert_entry_to_step(uuid, date, uuid) to authenticated;
