-- Log follow-up date changes on deals as system activity ("Follow-up set / moved / cleared").

create or replace function public.follow_up_label(d date) returns text
language sql immutable as $$ select to_char(d, 'FMDD Mon') $$;
revoke all on function public.follow_up_label(date) from public, anon;

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
    if new.next_follow_up_on is distinct from old.next_follow_up_on then
      insert into public.crm_activities (client_id, deal_id, kind, body, actor_id, metadata)
      values (new.client_id, new.id, 'system',
              case
                when new.next_follow_up_on is null then 'Follow-up cleared'
                when old.next_follow_up_on is null then 'Follow-up set: ' || public.follow_up_label(new.next_follow_up_on)
                else 'Follow-up moved: ' || public.follow_up_label(old.next_follow_up_on)
                     || ' → ' || public.follow_up_label(new.next_follow_up_on)
              end,
              auth.uid(), jsonb_build_object('deal_id', new.id, 'follow_up_from', old.next_follow_up_on, 'follow_up_to', new.next_follow_up_on));
    end if;
  end if;
  return new;
end; $$;
