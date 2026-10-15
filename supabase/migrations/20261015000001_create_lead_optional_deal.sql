-- A new Sales company no longer needs a deal: a null p_deal (or a blank title) creates only the
-- company, plus the optional contact and first step (a step without a deal hangs off the company).
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
  if coalesce(trim(p_deal->>'title'), '') <> '' then
    insert into public.deals (client_id, title, source, owner_id)
    values (v_client, p_deal->>'title', coalesce(nullif(p_deal->>'source','')::public.deal_source, 'other'), (p_deal->>'owner_id')::uuid)
    returning id into v_deal;
  end if;
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
