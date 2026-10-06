-- CRM / Sales module: schema, permissions, RLS. Spec: docs/superpowers/specs/2026-10-06-crm-sales-design.md

create type public.deal_stage as enum ('new','contacted','offer_sent','negotiation','won','lost');
create type public.deal_source as enum ('inbound','outbound','referral','existing_client','event','other');
create type public.offer_status as enum ('draft','sent','accepted','rejected');
create type public.activity_kind as enum ('call','email','meeting','note','system');
create type public.contact_gender as enum ('female','male','other');

-- ---------- companies ----------
create or replace function public.normalize_reg_code(code text) returns text
language sql immutable as $$ select nullif(upper(regexp_replace(coalesce(code,''), '\s', '', 'g')), '') $$;

alter table public.clients
  add column reg_code text,
  add column email text,
  add column website text;
create unique index clients_reg_code_unique on public.clients (public.normalize_reg_code(reg_code))
  where public.normalize_reg_code(reg_code) is not null;

alter table public.client_contacts
  add column first_name text,
  add column last_name text,
  add column gender public.contact_gender,
  add column description text;

-- ---------- deals ----------
create table public.deals (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  title text not null check (length(btrim(title)) > 0),
  stage public.deal_stage not null default 'new',
  source public.deal_source not null default 'other',
  owner_id uuid not null references public.user_profiles (id),
  next_follow_up_on date,
  lost_reason text,
  won_at timestamptz,
  project_id uuid references public.projects (id) on delete set null,
  created_by uuid references public.user_profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint deals_lost_needs_reason check (stage <> 'lost' or length(btrim(coalesce(lost_reason,''))) > 0)
);
create index deals_client_idx on public.deals (client_id);
create index deals_follow_up_idx on public.deals (next_follow_up_on);
create trigger deals_updated_at before update on public.deals
  for each row execute function public.set_updated_at();

-- ---------- offers ----------
create table public.offers (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals (id) on delete cascade,
  title text not null check (length(btrim(title)) > 0),
  amount numeric(12,2) not null default 0 check (amount >= 0),
  sent_on date,
  valid_until date,
  status public.offer_status not null default 'draft',
  link_url text check (link_url is null or link_url ~* '^https?://'),
  note text,
  created_by uuid references public.user_profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index offers_deal_idx on public.offers (deal_id);
create trigger offers_updated_at before update on public.offers
  for each row execute function public.set_updated_at();

-- ---------- activities ----------
create table public.crm_activities (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  deal_id uuid references public.deals (id) on delete set null,
  contact_id uuid references public.client_contacts (id) on delete set null,
  kind public.activity_kind not null,
  body text not null default '',
  occurred_at timestamptz not null default now(),
  actor_id uuid references public.user_profiles (id) default auth.uid(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index crm_activities_client_idx on public.crm_activities (client_id, occurred_at desc);
create index crm_activities_deal_idx on public.crm_activities (deal_id, occurred_at desc);

-- ---------- permissions ----------
insert into public.roles (key, name) values ('sales','Sales');
insert into public.permissions (key, description, delegatable) values
  ('view_sales','See sales pipeline, deals, offers and activities', false),
  ('manage_sales','Create and edit leads, deals, offers and activities', false);
insert into public.role_permissions (role_key, permission_key, scope) values
  ('sales','view_sales','global'),
  ('sales','manage_sales','global'),
  ('sales','view_clients','global');
-- admin passes every has_permission check via is_admin(); no rows needed.

-- ---------- RLS ----------
alter table public.deals enable row level security;
create policy "view deals" on public.deals for select
  using (public.has_permission(auth.uid(),'view_sales'));
create policy "manage deals" on public.deals for all
  using (public.has_permission(auth.uid(),'manage_sales'))
  with check (public.has_permission(auth.uid(),'manage_sales'));

alter table public.offers enable row level security;
create policy "view offers" on public.offers for select
  using (public.has_permission(auth.uid(),'view_sales'));
create policy "manage offers" on public.offers for all
  using (public.has_permission(auth.uid(),'manage_sales'))
  with check (public.has_permission(auth.uid(),'manage_sales'));

alter table public.crm_activities enable row level security;
create policy "view crm_activities" on public.crm_activities for select
  using (public.has_permission(auth.uid(),'view_sales'));
create policy "insert crm_activities" on public.crm_activities for insert
  with check (public.has_permission(auth.uid(),'manage_sales')
              and kind <> 'system' and actor_id = auth.uid());
create policy "edit own crm_activities" on public.crm_activities for update
  using (actor_id = auth.uid() and kind <> 'system' and public.has_permission(auth.uid(),'manage_sales'))
  with check (actor_id = auth.uid() and kind <> 'system');
create policy "delete own crm_activities" on public.crm_activities for delete
  using (actor_id = auth.uid() and kind <> 'system' and public.has_permission(auth.uid(),'manage_sales'));

-- salespeople create/edit companies + contacts (delete stays manage_clients)
create policy "sales insert clients" on public.clients for insert
  with check (public.has_permission(auth.uid(),'manage_sales'));
create policy "sales update clients" on public.clients for update
  using (public.has_permission(auth.uid(),'manage_sales'))
  with check (public.has_permission(auth.uid(),'manage_sales'));
create policy "sales manage client_contacts" on public.client_contacts for all
  using (public.has_permission(auth.uid(),'manage_sales'))
  with check (public.has_permission(auth.uid(),'manage_sales'));

grant select, insert, update, delete on public.deals, public.offers to authenticated, service_role;
grant select, insert, delete on public.crm_activities to authenticated, service_role;
grant update (body, occurred_at, contact_id, deal_id, kind) on public.crm_activities to authenticated;
grant update on public.crm_activities to service_role;

-- ---------- company kind (same answer for every viewer) ----------
create or replace function public.company_kind(company uuid) returns text
language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from public.deals d where d.client_id = company)
     and not exists (select 1 from public.deals d where d.client_id = company and d.stage = 'won')
     and not exists (select 1 from public.projects p where p.client_id = company)
    then 'prospect' else 'client' end
$$;
revoke all on function public.company_kind(uuid) from public, anon;
grant execute on function public.company_kind(uuid) to authenticated, service_role;

-- ---------- roles: sales is an add-on ----------
create or replace function public.set_user_role(target_user uuid, new_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin permission required'; end if;
  if new_role = 'sales' then raise exception 'use set_sales_access for sales'; end if;
  delete from public.user_roles where user_id = target_user and role_key <> 'sales';
  insert into public.user_roles (user_id, role_key, granted_by) values (target_user, new_role, auth.uid());
  insert into public.audit_logs (actor_id, action, resource_type, resource_id, metadata)
  values (auth.uid(), 'user.role_changed', 'user', target_user::text,
          jsonb_build_object('new_role', new_role, 'source', 'db_rpc'));
end; $$;

create or replace function public.set_sales_access(target_user uuid, enabled boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin permission required'; end if;
  if enabled then
    insert into public.user_roles (user_id, role_key, granted_by) values (target_user, 'sales', auth.uid())
    on conflict (user_id, role_key) do nothing;
  else
    delete from public.user_roles where user_id = target_user and role_key = 'sales';
  end if;
  insert into public.audit_logs (actor_id, action, resource_type, resource_id, metadata)
  values (auth.uid(), 'user.sales_access_changed', 'user', target_user::text,
          jsonb_build_object('enabled', enabled, 'source', 'db_rpc'));
end; $$;
revoke all on function public.set_sales_access(uuid, boolean) from public, anon;
grant execute on function public.set_sales_access(uuid, boolean) to authenticated;
