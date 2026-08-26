create type public.workspace_role as enum ('owner','editor','viewer');

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.workspace_role not null default 'viewer',
  joined_at timestamptz not null default now(),
  primary key (workspace_id,user_id)
);

create table public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null check (length(trim(email)) > 3),
  role public.workspace_role not null check (role <> 'owner'),
  invited_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  check (email = lower(trim(email)))
);
create unique index workspace_invitations_pending_idx on public.workspace_invitations(workspace_id,lower(email)) where accepted_at is null;
create index workspace_members_user_idx on public.workspace_members(user_id,workspace_id);
create index workspace_invitations_email_idx on public.workspace_invitations(lower(email)) where accepted_at is null;

insert into public.workspaces(owner_id,name)
select u.id,coalesce(nullif(trim(p.display_name),''),'Mi proyecto')
from auth.users u left join public.profiles p on p.id=u.id;

insert into public.workspace_members(workspace_id,user_id,role)
select w.id,w.owner_id,'owner'::public.workspace_role from public.workspaces w;

do $$
declare table_name text;
begin
  foreach table_name in array array['cultivations','spaces','lots','plants','products','recipes','recipe_versions','recipe_items','activities'] loop
    execute format('alter table public.%I add column workspace_id uuid',table_name);
    execute format('update public.%I d set workspace_id=w.id from public.workspaces w where w.owner_id=d.owner_id',table_name);
    execute format('alter table public.%I alter column workspace_id set not null',table_name);
    execute format('alter table public.%I add constraint %I foreign key (workspace_id) references public.workspaces(id) on delete restrict',table_name,table_name||'_workspace_fk');
    execute format('create index %I on public.%I(workspace_id)',table_name||'_workspace_idx',table_name);
  end loop;
end $$;

drop index public.cultivations_one_active_per_owner_idx;
create unique index cultivations_one_active_per_workspace_idx on public.cultivations(workspace_id) where status='active';

create or replace function public.is_workspace_member(p_workspace_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.workspace_members m where m.workspace_id=p_workspace_id and m.user_id=(select auth.uid()));
$$;

create or replace function public.can_edit_workspace(p_workspace_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.workspace_members m where m.workspace_id=p_workspace_id and m.user_id=(select auth.uid()) and m.role in ('owner','editor'));
$$;

create or replace function public.is_workspace_owner(p_workspace_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.workspace_members m where m.workspace_id=p_workspace_id and m.user_id=(select auth.uid()) and m.role='owner');
$$;

revoke all on function public.is_workspace_member(uuid),public.can_edit_workspace(uuid),public.is_workspace_owner(uuid) from public,anon;
grant execute on function public.is_workspace_member(uuid),public.can_edit_workspace(uuid),public.is_workspace_owner(uuid) to authenticated;

create or replace function public.scope_workspace_record()
returns trigger language plpgsql security definer set search_path='' as $$
declare workspace_owner uuid;
begin
  if tg_op='UPDATE' then
    if new.workspace_id<>old.workspace_id or new.owner_id<>old.owner_id then raise exception 'record_scope_immutable'; end if;
    return new;
  end if;
  if not public.can_edit_workspace(new.workspace_id) then raise exception 'workspace_write_forbidden'; end if;
  select owner_id into workspace_owner from public.workspaces where id=new.workspace_id;
  if workspace_owner is null then raise exception 'workspace_not_found'; end if;
  new.owner_id=workspace_owner;
  return new;
end;
$$;
revoke execute on function public.scope_workspace_record() from public,anon,authenticated;

do $$
declare table_name text;
begin
  foreach table_name in array array['cultivations','spaces','lots','plants','products','recipes','recipe_versions','recipe_items','activities'] loop
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.scope_workspace_record()',table_name||'_scope_workspace',table_name);
  end loop;
end $$;

create trigger workspaces_updated_at before update on public.workspaces for each row execute function public.set_updated_at();

do $$
declare table_name text; policy_name text;
begin
  foreach table_name in array array['cultivations','spaces','lots','plants','products','recipes','recipe_versions','recipe_items','activities'] loop
    for policy_name in select policyname from pg_policies where schemaname='public' and tablename=table_name loop
      execute format('drop policy %I on public.%I',policy_name,table_name);
    end loop;
    execute format('create policy %I on public.%I for select to authenticated using (public.is_workspace_member(workspace_id))',table_name||'_select_workspace',table_name);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.can_edit_workspace(workspace_id))',table_name||'_insert_workspace',table_name);
    if table_name not in ('recipe_versions','recipe_items') then
      execute format('create policy %I on public.%I for update to authenticated using (public.can_edit_workspace(workspace_id)) with check (public.can_edit_workspace(workspace_id))',table_name||'_update_workspace',table_name);
    end if;
  end loop;
end $$;

alter table public.workspaces enable row level security;
alter table public.workspaces force row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_members force row level security;
alter table public.workspace_invitations enable row level security;
alter table public.workspace_invitations force row level security;
revoke all on public.workspaces,public.workspace_members,public.workspace_invitations from anon,authenticated;
grant select on public.workspaces,public.workspace_members,public.workspace_invitations to authenticated;

create policy workspaces_select_member on public.workspaces for select to authenticated using (public.is_workspace_member(id));
create policy workspaces_update_owner on public.workspaces for update to authenticated using (public.is_workspace_owner(id)) with check (public.is_workspace_owner(id));
create policy members_select_member on public.workspace_members for select to authenticated using (public.is_workspace_member(workspace_id));
create policy invitations_select_recipient_or_owner on public.workspace_invitations for select to authenticated
using (lower(email)=lower(coalesce((select auth.jwt()->>'email'),'')) or public.is_workspace_owner(workspace_id));

drop policy profiles_select_own on public.profiles;
create policy profiles_select_shared on public.profiles for select to authenticated using (
  id=(select auth.uid()) or exists(
    select 1 from public.workspace_members mine join public.workspace_members theirs on theirs.workspace_id=mine.workspace_id
    where mine.user_id=(select auth.uid()) and theirs.user_id=profiles.id
  )
);

create or replace function public.create_workspace(p_name text)
returns uuid language plpgsql security definer set search_path='' as $$
declare user_id uuid=(select auth.uid()); new_id uuid;
begin
  if user_id is null then raise exception 'authentication_required'; end if;
  if length(trim(p_name))=0 then raise exception 'workspace_name_required'; end if;
  insert into public.workspaces(owner_id,name) values(user_id,trim(p_name)) returning id into new_id;
  insert into public.workspace_members(workspace_id,user_id,role) values(new_id,user_id,'owner');
  return new_id;
end;
$$;

create or replace function public.invite_workspace_member(p_workspace_id uuid,p_email text,p_role public.workspace_role default 'editor')
returns uuid language plpgsql security definer set search_path='' as $$
declare invite_id uuid; normalized text=lower(trim(p_email));
begin
  if not public.is_workspace_owner(p_workspace_id) then raise exception 'workspace_owner_required'; end if;
  if p_role='owner' then raise exception 'invalid_invitation_role'; end if;
  if normalized=lower(coalesce((select auth.jwt()->>'email'),'')) then raise exception 'cannot_invite_self'; end if;
  insert into public.workspace_invitations(workspace_id,email,role,invited_by)
  values(p_workspace_id,normalized,p_role,(select auth.uid()))
  returning id into invite_id;
  return invite_id;
end;
$$;

create or replace function public.accept_workspace_invitation(p_invitation_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare invitation public.workspace_invitations; user_id uuid=(select auth.uid()); user_email text=lower(coalesce((select auth.jwt()->>'email'),''));
begin
  if user_id is null then raise exception 'authentication_required'; end if;
  select * into invitation from public.workspace_invitations where id=p_invitation_id and accepted_at is null for update;
  if invitation.id is null or lower(invitation.email)<>user_email then raise exception 'invitation_not_found'; end if;
  insert into public.workspace_members(workspace_id,user_id,role) values(invitation.workspace_id,user_id,invitation.role)
  on conflict(workspace_id,user_id) do update set role=excluded.role;
  update public.workspace_invitations set accepted_at=now() where id=invitation.id;
  return invitation.workspace_id;
end;
$$;

create or replace function public.list_workspace_members(p_workspace_id uuid)
returns table(user_id uuid,display_name text,role public.workspace_role,joined_at timestamptz)
language sql stable security definer set search_path='' as $$
  select m.user_id,p.display_name,m.role,m.joined_at from public.workspace_members m
  left join public.profiles p on p.id=m.user_id
  where m.workspace_id=p_workspace_id and public.is_workspace_member(p_workspace_id)
  order by case m.role when 'owner' then 0 when 'editor' then 1 else 2 end,p.display_name;
$$;

revoke all on function public.create_workspace(text),public.invite_workspace_member(uuid,text,public.workspace_role),public.accept_workspace_invitation(uuid),public.list_workspace_members(uuid) from public,anon;
grant execute on function public.create_workspace(text),public.invite_workspace_member(uuid,text,public.workspace_role),public.accept_workspace_invitation(uuid),public.list_workspace_members(uuid) to authenticated;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path='' as $$
declare new_workspace_id uuid;
begin
  insert into public.profiles(id,display_name)
  values(new.id,coalesce(new.raw_user_meta_data->>'display_name',split_part(new.email,'@',1))) on conflict(id) do nothing;
  insert into public.workspaces(owner_id,name) values(new.id,coalesce(new.raw_user_meta_data->>'display_name',split_part(new.email,'@',1))||' · Proyecto') returning id into new_workspace_id;
  insert into public.workspace_members(workspace_id,user_id,role) values(new_workspace_id,new.id,'owner');
  return new;
end;
$$;

drop function public.create_recipe_with_version(text,public.recipe_type,text,text,boolean,numeric,numeric,text,jsonb);
create function public.create_recipe_with_version(
  p_workspace_id uuid,p_name text,p_type public.recipe_type,p_description text,p_notes text,p_active boolean,
  p_target_ph numeric,p_target_ec numeric,p_version_notes text,p_items jsonb
) returns uuid language plpgsql security invoker set search_path='' as $$
declare new_recipe_id uuid; new_version_id uuid; item jsonb;
begin
  if not public.can_edit_workspace(p_workspace_id) then raise exception 'workspace_write_forbidden'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'recipe_items_required'; end if;
  insert into public.recipes(workspace_id,name,type,description,notes,active) values(p_workspace_id,trim(p_name),p_type,coalesce(p_description,''),coalesce(p_notes,''),coalesce(p_active,true)) returning id into new_recipe_id;
  insert into public.recipe_versions(workspace_id,recipe_id,version,target_ph,target_ec,notes) values(p_workspace_id,new_recipe_id,1,p_target_ph,p_target_ec,coalesce(p_version_notes,'')) returning id into new_version_id;
  for item in select value from jsonb_array_elements(p_items) loop
    insert into public.recipe_items(workspace_id,recipe_version_id,product_id,product_name_snapshot,product_brand_snapshot,amount,unit)
    values(p_workspace_id,new_version_id,(item->>'product_id')::uuid,item->>'product_name_snapshot',coalesce(item->>'product_brand_snapshot',''),(item->>'amount')::numeric,(item->>'unit')::public.measurement_unit);
  end loop;
  update public.recipes set current_version_id=new_version_id where id=new_recipe_id;
  return new_recipe_id;
end;
$$;

drop function public.create_recipe_version(uuid,numeric,numeric,text,jsonb);
create function public.create_recipe_version(p_workspace_id uuid,p_recipe_id uuid,p_target_ph numeric,p_target_ec numeric,p_notes text,p_items jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare next_version integer; new_version_id uuid; item jsonb;
begin
  if not public.can_edit_workspace(p_workspace_id) then raise exception 'workspace_write_forbidden'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'recipe_items_required'; end if;
  perform 1 from public.recipes where id=p_recipe_id and workspace_id=p_workspace_id for update;
  if not found then raise exception 'recipe_not_found'; end if;
  select coalesce(max(version),0)+1 into next_version from public.recipe_versions where recipe_id=p_recipe_id;
  insert into public.recipe_versions(workspace_id,recipe_id,version,target_ph,target_ec,notes) values(p_workspace_id,p_recipe_id,next_version,p_target_ph,p_target_ec,coalesce(p_notes,'')) returning id into new_version_id;
  for item in select value from jsonb_array_elements(p_items) loop
    insert into public.recipe_items(workspace_id,recipe_version_id,product_id,product_name_snapshot,product_brand_snapshot,amount,unit)
    values(p_workspace_id,new_version_id,(item->>'product_id')::uuid,item->>'product_name_snapshot',coalesce(item->>'product_brand_snapshot',''),(item->>'amount')::numeric,(item->>'unit')::public.measurement_unit);
  end loop;
  update public.recipes set current_version_id=new_version_id where id=p_recipe_id;
  return new_version_id;
end;
$$;

drop function public.activate_cultivation(uuid);
create function public.activate_cultivation(p_workspace_id uuid,p_cultivation_id uuid)
returns void language plpgsql security invoker set search_path='' as $$
begin
  if not public.can_edit_workspace(p_workspace_id) then raise exception 'workspace_write_forbidden'; end if;
  if not exists(select 1 from public.cultivations where id=p_cultivation_id and workspace_id=p_workspace_id) then raise exception 'cultivation_not_found'; end if;
  update public.cultivations set status='finished' where workspace_id=p_workspace_id and status='active' and id<>p_cultivation_id;
  update public.cultivations set status='active',end_date=null where id=p_cultivation_id and workspace_id=p_workspace_id;
end;
$$;

revoke all on function public.create_recipe_with_version(uuid,text,public.recipe_type,text,text,boolean,numeric,numeric,text,jsonb),public.create_recipe_version(uuid,uuid,numeric,numeric,text,jsonb),public.activate_cultivation(uuid,uuid) from public,anon;
grant execute on function public.create_recipe_with_version(uuid,text,public.recipe_type,text,text,boolean,numeric,numeric,text,jsonb),public.create_recipe_version(uuid,uuid,numeric,numeric,text,jsonb),public.activate_cultivation(uuid,uuid) to authenticated;
