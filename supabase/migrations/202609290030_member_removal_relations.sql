-- Keep member and platform-user deletion consistent with agenda relations added later.
create or replace function public.remove_workspace_member(p_workspace_id uuid,p_user_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.is_workspace_owner(p_workspace_id) then raise exception 'workspace_owner_required'; end if;
  if exists(select 1 from public.workspace_members where workspace_id=p_workspace_id and user_id=p_user_id and role='owner') then
    raise exception 'workspace_owner_cannot_be_removed';
  end if;
  if not exists(select 1 from public.workspace_members where workspace_id=p_workspace_id and user_id=p_user_id) then
    raise exception 'workspace_member_not_found';
  end if;

  update public.irrigation_events set assigned_to=null
  where workspace_id=p_workspace_id and assigned_to=p_user_id;

  delete from public.agenda_event_assignees a
  using public.agenda_events e
  where a.event_id=e.id and e.workspace_id=p_workspace_id and a.user_id=p_user_id;

  delete from public.agenda_event_participants p
  using public.agenda_events e
  where p.event_id=e.id and e.workspace_id=p_workspace_id and p.user_id=p_user_id;

  delete from public.agenda_notifications
  where workspace_id=p_workspace_id and user_id=p_user_id;

  delete from public.workspace_members
  where workspace_id=p_workspace_id and user_id=p_user_id;
end;
$$;

create or replace function public.delete_app_user(p_user_id uuid,p_delete_owned_projects boolean default false)
returns boolean language plpgsql security definer set search_path='' as $$
declare
  owned_count integer;
  owned record;
  admin_id uuid=(select auth.uid());
begin
  if not public.is_app_admin() then raise exception 'app_admin_required'; end if;
  if p_user_id=admin_id then raise exception 'cannot_delete_self'; end if;
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

  -- Preserve shared-project history while removing auth-user foreign keys.
  update public.irrigation_events set assigned_to=null where assigned_to=p_user_id;
  update public.irrigation_events set created_by=admin_id where created_by=p_user_id;
  update public.agenda_events set created_by=admin_id where created_by=p_user_id;
  update public.agenda_events set updated_by=admin_id where updated_by=p_user_id;
  update public.agenda_event_history set actor_id=admin_id where actor_id=p_user_id;

  delete from auth.users where id=p_user_id;
  if not found then raise exception 'user_not_found'; end if;
  return true;
end;
$$;

revoke all on function public.remove_workspace_member(uuid,uuid),public.delete_app_user(uuid,boolean) from public,anon;
grant execute on function public.remove_workspace_member(uuid,uuid),public.delete_app_user(uuid,boolean) to authenticated;
