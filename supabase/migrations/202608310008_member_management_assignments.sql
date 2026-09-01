-- Member administration and optional agenda assignment.
alter table public.irrigation_events
  add column assigned_to uuid references auth.users(id) on delete set null;

create index irrigation_events_assigned_to_idx
  on public.irrigation_events(workspace_id,assigned_to)
  where assigned_to is not null;

create or replace function public.update_workspace_member_role(
  p_workspace_id uuid,
  p_user_id uuid,
  p_role public.workspace_role
) returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.is_workspace_owner(p_workspace_id) then raise exception 'workspace_owner_required'; end if;
  if p_role='owner' then raise exception 'owner_role_immutable'; end if;
  if exists(select 1 from public.workspace_members where workspace_id=p_workspace_id and user_id=p_user_id and role='owner') then
    raise exception 'owner_role_immutable';
  end if;
  update public.workspace_members set role=p_role where workspace_id=p_workspace_id and user_id=p_user_id;
  if not found then raise exception 'workspace_member_not_found'; end if;
end;
$$;

create or replace function public.remove_workspace_member(p_workspace_id uuid,p_user_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.is_workspace_owner(p_workspace_id) then raise exception 'workspace_owner_required'; end if;
  if exists(select 1 from public.workspace_members where workspace_id=p_workspace_id and user_id=p_user_id and role='owner') then
    raise exception 'workspace_owner_cannot_be_removed';
  end if;
  update public.irrigation_events set assigned_to=null where workspace_id=p_workspace_id and assigned_to=p_user_id;
  delete from public.workspace_members where workspace_id=p_workspace_id and user_id=p_user_id;
  if not found then raise exception 'workspace_member_not_found'; end if;
end;
$$;

create or replace function public.cancel_workspace_invitation(p_invitation_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare target_workspace uuid;
begin
  select workspace_id into target_workspace from public.workspace_invitations where id=p_invitation_id and accepted_at is null;
  if target_workspace is null then raise exception 'workspace_invitation_not_found'; end if;
  if not public.is_workspace_owner(target_workspace) then raise exception 'workspace_owner_required'; end if;
  delete from public.workspace_invitations where id=p_invitation_id and accepted_at is null;
end;
$$;

create or replace function public.assign_irrigation_event(p_event_id uuid,p_assigned_to uuid)
returns void language plpgsql security definer set search_path='' as $$
declare target_workspace uuid;
begin
  select workspace_id into target_workspace from public.irrigation_events where id=p_event_id;
  if target_workspace is null then raise exception 'irrigation_event_not_found'; end if;
  if not public.can_edit_workspace(target_workspace) then raise exception 'workspace_write_forbidden'; end if;
  if p_assigned_to is not null and not exists(
    select 1 from public.workspace_members where workspace_id=target_workspace and user_id=p_assigned_to
  ) then raise exception 'assignee_not_workspace_member'; end if;
  update public.irrigation_events set assigned_to=p_assigned_to where id=p_event_id;
end;
$$;

revoke all on function public.update_workspace_member_role(uuid,uuid,public.workspace_role),public.remove_workspace_member(uuid,uuid),public.cancel_workspace_invitation(uuid),public.assign_irrigation_event(uuid,uuid) from public,anon;
grant execute on function public.update_workspace_member_role(uuid,uuid,public.workspace_role),public.remove_workspace_member(uuid,uuid),public.cancel_workspace_invitation(uuid),public.assign_irrigation_event(uuid,uuid) to authenticated;
