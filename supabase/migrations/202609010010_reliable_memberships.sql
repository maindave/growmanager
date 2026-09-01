-- Reliable server-side invitation claiming and complete member administration.
create or replace function public.invite_workspace_member_v2(p_workspace_id uuid,p_email text,p_role public.workspace_role default 'editor')
returns jsonb language plpgsql security definer set search_path='' as $$
declare normalized text=lower(trim(p_email)); invite_id uuid; existing_user uuid;
begin
  if not public.is_workspace_owner(p_workspace_id) then raise exception 'workspace_owner_required'; end if;
  if p_role='owner' then raise exception 'invalid_invitation_role'; end if;
  if normalized=lower(coalesce((select auth.jwt()->>'email'),'')) then raise exception 'cannot_invite_self'; end if;
  select id into existing_user from auth.users where lower(email)=normalized limit 1;
  if existing_user is not null then
    insert into public.workspace_members(workspace_id,user_id,role) values(p_workspace_id,existing_user,p_role)
    on conflict(workspace_id,user_id) do update set role=excluded.role;
    update public.workspace_invitations set accepted_at=now() where workspace_id=p_workspace_id and lower(email)=normalized and accepted_at is null;
    return jsonb_build_object('memberLinked',true,'userId',existing_user);
  end if;
  select id into invite_id from public.workspace_invitations where workspace_id=p_workspace_id and lower(email)=normalized and accepted_at is null for update;
  if invite_id is null then
    insert into public.workspace_invitations(workspace_id,email,role,invited_by) values(p_workspace_id,normalized,p_role,(select auth.uid())) returning id into invite_id;
  else
    update public.workspace_invitations set role=p_role,invited_by=(select auth.uid()),created_at=now() where id=invite_id;
  end if;
  return jsonb_build_object('memberLinked',false,'invitationId',invite_id);
end;
$$;

create or replace function public.claim_pending_workspace_invitations()
returns table(claimed_workspace_id uuid) language plpgsql security definer set search_path='' as $$
declare user_id uuid=(select auth.uid()); user_email text=lower(coalesce((select auth.jwt()->>'email'),'')); invitation record;
begin
  if user_id is null or user_email='' then raise exception 'authentication_required'; end if;
  for invitation in select i.id,i.workspace_id,i.role from public.workspace_invitations i where lower(i.email)=user_email and i.accepted_at is null for update loop
    insert into public.workspace_members(workspace_id,user_id,role) values(invitation.workspace_id,user_id,invitation.role)
    on conflict(workspace_id,user_id) do update set role=excluded.role;
    update public.workspace_invitations set accepted_at=now() where id=invitation.id;
    claimed_workspace_id=invitation.workspace_id;return next;
  end loop;
end;
$$;

create or replace function public.update_workspace_invitation_role(p_invitation_id uuid,p_role public.workspace_role)
returns void language plpgsql security definer set search_path='' as $$
declare target_workspace uuid;
begin
  if p_role='owner' then raise exception 'invalid_invitation_role'; end if;
  select workspace_id into target_workspace from public.workspace_invitations where id=p_invitation_id and accepted_at is null;
  if target_workspace is null then raise exception 'workspace_invitation_not_found'; end if;
  if not public.is_workspace_owner(target_workspace) then raise exception 'workspace_owner_required'; end if;
  update public.workspace_invitations set role=p_role where id=p_invitation_id;
end;
$$;

revoke all on function public.invite_workspace_member_v2(uuid,text,public.workspace_role),public.claim_pending_workspace_invitations(),public.update_workspace_invitation_role(uuid,public.workspace_role) from public,anon;
grant execute on function public.invite_workspace_member_v2(uuid,text,public.workspace_role),public.claim_pending_workspace_invitations(),public.update_workspace_invitation_role(uuid,public.workspace_role) to authenticated;
