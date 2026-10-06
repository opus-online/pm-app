-- CRM / Sales: people directory for the sales UI.
-- user_profiles/user_roles RLS only lets a non-admin read their OWN row, so a sales user could not
-- resolve the names/avatars of other deal owners (or list who a deal can be assigned to). Same
-- precedent as pm_options(): a narrow SECURITY DEFINER read, gated on view_sales, exposing only
-- id / display name / avatar.
--   assignable = active user holding the sales add-on or admin (owner picker candidates)
--   everyone else returned is referenced by a deal (owner) or a CRM activity (actor), so their
--   name still renders after they lose sales access or are deactivated.
create or replace function public.sales_people()
returns table (id uuid, name text, avatar_url text, assignable boolean)
language sql stable security definer
set search_path = public
as $$
  select up.id,
         coalesce(up.full_name, up.email) as name,
         up.avatar_url,
         (up.status = 'active' and exists (
            select 1 from public.user_roles ur
            where ur.user_id = up.id and ur.role_key in ('sales', 'admin')
         )) as assignable
  from public.user_profiles up
  where public.has_permission(auth.uid(), 'view_sales')
    and (
      exists (select 1 from public.user_roles ur where ur.user_id = up.id and ur.role_key in ('sales', 'admin'))
      or exists (select 1 from public.deals d where d.owner_id = up.id)
      or exists (select 1 from public.crm_activities a where a.actor_id = up.id)
    )
  order by 2;
$$;
revoke all on function public.sales_people() from public, anon;
grant execute on function public.sales_people() to authenticated, service_role;
