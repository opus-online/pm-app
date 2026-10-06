-- CRM triggers + create_lead RPC.

-- contact display name from first/last; backfill legacy rows
create or replace function public.client_contact_name() returns trigger
language plpgsql as $$
begin
  if new.first_name is not null or new.last_name is not null then
    new.name := btrim(coalesce(new.first_name,'') || ' ' || coalesce(new.last_name,''));
  end if;
  return new;
end; $$;
create trigger client_contacts_name before insert or update on public.client_contacts
  for each row execute function public.client_contact_name();

update public.client_contacts
   set first_name = split_part(name, ' ', 1),
       last_name  = nullif(btrim(substr(name, length(split_part(name, ' ', 1)) + 1)), '')
 where first_name is null and last_name is null;

-- won_at bookkeeping
create or replace function public.deal_won_at() returns trigger
language plpgsql as $$
begin
  if new.stage = 'won' and (tg_op = 'INSERT' or old.stage is distinct from 'won') then new.won_at := now();
  elsif new.stage <> 'won' then new.won_at := null; end if;
  return new;
end; $$;
create trigger deals_won_at before insert or update of stage on public.deals
  for each row execute function public.deal_won_at();

-- system entries
create or replace function public.stage_label(s public.deal_stage) returns text
language sql immutable as $$
  select case s when 'new' then 'New' when 'contacted' then 'Contacted' when 'offer_sent' then 'Offer sent'
    when 'negotiation' then 'Negotiation' when 'won' then 'Won' else 'Lost' end $$;

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
create trigger deals_log after insert or update on public.deals
  for each row execute function public.log_deal_activity();

create or replace function public.log_offer_activity() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_client uuid;
begin
  select client_id into v_client from public.deals where id = new.deal_id;
  if tg_op = 'INSERT' then
    insert into public.crm_activities (client_id, deal_id, kind, body, actor_id, metadata)
    values (v_client, new.deal_id, 'system', 'Offer added: ' || new.title, auth.uid(),
            jsonb_build_object('offer_id', new.id, 'amount', new.amount));
  elsif new.status is distinct from old.status then
    insert into public.crm_activities (client_id, deal_id, kind, body, actor_id, metadata)
    values (v_client, new.deal_id, 'system', 'Offer ' || new.title || ': ' || old.status || ' → ' || new.status,
            auth.uid(), jsonb_build_object('offer_id', new.id, 'from', old.status, 'to', new.status));
  end if;
  return new;
end; $$;
create trigger offers_log after insert or update on public.offers
  for each row execute function public.log_offer_activity();

-- one-transaction lead creation
create or replace function public.create_lead(p_client_id uuid, p_company jsonb, p_deal jsonb, p_contact jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare v_client uuid := p_client_id; v_deal uuid;
begin
  if not public.has_permission(auth.uid(), 'manage_sales') then raise exception 'Not authorized' using errcode = '42501'; end if;
  if v_client is null then
    insert into public.clients (name, reg_code, phone, email, website)
    values (p_company->>'name', nullif(p_company->>'reg_code',''), nullif(p_company->>'phone',''),
            nullif(p_company->>'email',''), nullif(p_company->>'website',''))
    returning id into v_client;
  end if;
  insert into public.deals (client_id, title, source, owner_id, next_follow_up_on)
  values (v_client, p_deal->>'title', coalesce((p_deal->>'source')::public.deal_source, 'other'),
          (p_deal->>'owner_id')::uuid, nullif(p_deal->>'next_follow_up_on','')::date)
  returning id into v_deal;
  if p_contact is not null and coalesce(p_contact->>'first_name','') <> '' then
    insert into public.client_contacts (client_id, name, first_name, last_name, role, email, phone)
    values (v_client, '', p_contact->>'first_name', nullif(p_contact->>'last_name',''), nullif(p_contact->>'role',''),
            nullif(p_contact->>'email',''), nullif(p_contact->>'phone',''));
  end if;
  return jsonb_build_object('client_id', v_client, 'deal_id', v_deal);
end; $$;
revoke all on function public.create_lead(uuid, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.create_lead(uuid, jsonb, jsonb, jsonb) to authenticated;

-- ids of prospect companies, for hiding them on the Clients page (one call, same answer for every viewer)
create or replace function public.prospect_client_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select c.id from public.clients c where public.company_kind(c.id) = 'prospect' $$;
revoke all on function public.prospect_client_ids() from public, anon;
grant execute on function public.prospect_client_ids() to authenticated;
