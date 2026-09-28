-- Platform-level user lifecycle management. Only app admins can execute it.
drop function if exists public.list_app_users();
create function public.list_app_users()
returns table(user_id uuid,email text,display_name text,created_at timestamptz,last_sign_in_at timestamptz,last_seen_at timestamptz,is_active boolean,is_disabled boolean,project_count bigint)
language plpgsql security definer set search_path='' as $$
begin
  if not public.is_app_admin() then raise exception 'app_admin_required'; end if;
  return query select u.id,u.email::text,p.display_name,u.created_at,u.last_sign_in_at,pr.last_seen_at,
    coalesce(pr.last_seen_at>now()-interval '5 minutes',false) and (u.banned_until is null or u.banned_until<=now()),
    coalesce(u.banned_until>now(),false),count(m.workspace_id) filter(where m.role='owner')
  from auth.users u left join public.profiles p on p.id=u.id left join public.user_presence pr on pr.user_id=u.id
  left join public.workspace_members m on m.user_id=u.id
  group by u.id,u.email,p.display_name,u.created_at,u.last_sign_in_at,pr.last_seen_at,u.banned_until order by u.created_at desc;
end;
$$;

create or replace function public.set_app_user_disabled(p_user_id uuid,p_disabled boolean)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if not public.is_app_admin() then raise exception 'app_admin_required'; end if;
  if p_user_id=(select auth.uid()) then raise exception 'cannot_disable_self'; end if;
  if exists(select 1 from public.app_admins where user_id=p_user_id) then raise exception 'cannot_disable_app_admin'; end if;
  update auth.users set banned_until=case when p_disabled then now()+interval '100 years' else null end,updated_at=now() where id=p_user_id;
  if not found then raise exception 'user_not_found'; end if;
  return p_disabled;
end;
$$;

create or replace function public.delete_app_user(p_user_id uuid,p_delete_owned_projects boolean default false)
returns boolean language plpgsql security definer set search_path='' as $$
declare owned_count integer; owned record;
begin
  if not public.is_app_admin() then raise exception 'app_admin_required'; end if;
  if p_user_id=(select auth.uid()) then raise exception 'cannot_delete_self'; end if;
  if exists(select 1 from public.app_admins where user_id=p_user_id) then raise exception 'cannot_delete_app_admin'; end if;
  select count(*) into owned_count from public.workspaces w where w.owner_id=p_user_id
    and w.id<>coalesce((select (value->>'workspaceId')::uuid from public.app_settings where key='demo_workspace'),'00000000-0000-0000-0000-000000000000'::uuid);
  if owned_count>0 and not p_delete_owned_projects then raise exception 'user_owns_projects:%',owned_count; end if;
  if p_delete_owned_projects then
    for owned in select w.id from public.workspaces w where w.owner_id=p_user_id loop
      delete from public.irrigation_events where workspace_id=owned.id;
      delete from public.activities where workspace_id=owned.id;
      delete from public.plants where workspace_id=owned.id;
      delete from public.lots where workspace_id=owned.id;
      delete from public.spaces where workspace_id=owned.id;
      delete from public.recipe_items where workspace_id=owned.id;
      delete from public.recipe_versions where workspace_id=owned.id;
      delete from public.recipes where workspace_id=owned.id;
      delete from public.products where workspace_id=owned.id;
      delete from public.cultivations where workspace_id=owned.id;
      delete from public.workspaces where id=owned.id;
    end loop;
  end if;
  delete from auth.users where id=p_user_id;
  if not found then raise exception 'user_not_found'; end if;
  return true;
end;
$$;

revoke all on function public.set_app_user_disabled(uuid,boolean),public.delete_app_user(uuid,boolean) from public,anon;
grant execute on function public.set_app_user_disabled(uuid,boolean),public.delete_app_user(uuid,boolean) to authenticated;
