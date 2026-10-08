-- Any Sales user may delete any logged (non-system, done) entry; every delete is audited.

drop policy "delete own crm_activities" on public.crm_activities;
create policy "delete crm_activities" on public.crm_activities for delete
  using (kind <> 'system' and status = 'done' and public.has_permission(auth.uid(),'manage_sales'));

create or replace function public.audit_crm_activity_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_logs (actor_id, action, resource_type, resource_id, metadata)
  values (auth.uid(), 'crm_activity.deleted', 'crm_activity', old.id::text,
          jsonb_build_object('client_id', old.client_id, 'deal_id', old.deal_id, 'kind', old.kind,
                             'body', old.body, 'author_id', old.actor_id, 'occurred_at', old.occurred_at,
                             'done_comment', old.done_comment));
  return old;
end; $$;
revoke all on function public.audit_crm_activity_delete() from public, anon, authenticated;

create trigger crm_activities_audit_delete after delete on public.crm_activities
  for each row when (old.kind <> 'system') execute function public.audit_crm_activity_delete();
