-- One reliable, user-scoped source for the project selector.
create or replace function public.list_my_workspaces()
returns table(
  id uuid,
  name text,
  owner_id uuid,
  description text,
  grow_type text,
  started_on date,
  role public.workspace_role,
  is_demo boolean
) language sql stable security definer set search_path='' as $$
  select w.id,w.name,w.owner_id,w.description,w.grow_type,w.started_on,m.role,
    w.id=coalesce((select (value->>'workspaceId')::uuid from public.app_settings where key='demo_workspace'),'00000000-0000-0000-0000-000000000000'::uuid)
  from public.workspace_members m
  join public.workspaces w on w.id=m.workspace_id
  where m.user_id=(select auth.uid())
  order by case m.role when 'owner' then 0 when 'editor' then 1 else 2 end,lower(w.name);
$$;

revoke all on function public.list_my_workspaces() from public,anon;
grant execute on function public.list_my_workspaces() to authenticated;
