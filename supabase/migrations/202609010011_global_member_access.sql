-- Owner-wide access matrix across every project administered by the current user.
create or replace function public.list_admin_workspace_access()
returns table(
  workspace_id uuid,
  workspace_name text,
  user_id uuid,
  email text,
  display_name text,
  role public.workspace_role,
  joined_at timestamptz
) language sql security definer set search_path='' stable as $$
  select w.id,w.name,m.user_id,u.email,p.display_name,m.role,m.joined_at
  from public.workspaces w
  join public.workspace_members owner_membership on owner_membership.workspace_id=w.id
    and owner_membership.user_id=(select auth.uid()) and owner_membership.role='owner'
  join public.workspace_members m on m.workspace_id=w.id
  join auth.users u on u.id=m.user_id
  left join public.profiles p on p.id=m.user_id
  order by lower(coalesce(p.display_name,u.email)),lower(w.name);
$$;

revoke all on function public.list_admin_workspace_access() from public,anon;
grant execute on function public.list_admin_workspace_access() to authenticated;
