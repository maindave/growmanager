-- Every account sees the isolated demo in its project selector.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path='' as $$
declare demo_id uuid;
begin
  insert into public.profiles(id,display_name)
  values(new.id,coalesce(new.raw_user_meta_data->>'display_name',split_part(new.email,'@',1)))
  on conflict(id) do nothing;
  if lower(coalesce(new.email,''))='maindave@gmail.com' then
    insert into public.app_admins(user_id) values(new.id) on conflict do nothing;
  end if;
  select (value->>'workspaceId')::uuid into demo_id from public.app_settings where key='demo_workspace';
  if demo_id is not null and exists(select 1 from public.workspaces where id=demo_id) then
    insert into public.workspace_members(workspace_id,user_id,role) values(demo_id,new.id,'viewer')
    on conflict(workspace_id,user_id) do nothing;
  end if;
  return new;
end;
$$;

do $$
declare demo_id uuid;
begin
  select (value->>'workspaceId')::uuid into demo_id from public.app_settings where key='demo_workspace';
  if demo_id is null or not exists(select 1 from public.workspaces where id=demo_id) then return; end if;
  insert into public.workspace_members(workspace_id,user_id,role)
  select demo_id,u.id,'viewer'::public.workspace_role from auth.users u
  on conflict(workspace_id,user_id) do nothing;
end;
$$;
