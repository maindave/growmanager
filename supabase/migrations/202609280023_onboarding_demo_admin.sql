-- Guided onboarding, isolated demo access and platform administration.
create table if not exists public.app_admins(
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

insert into public.app_admins(user_id)
select id from auth.users where lower(email)='maindave@gmail.com'
on conflict do nothing;

alter table public.app_admins enable row level security;
alter table public.app_admins force row level security;
revoke all on public.app_admins from public,anon,authenticated;

create or replace function public.is_app_admin()
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.app_admins where user_id=(select auth.uid()));
$$;

create table if not exists public.app_settings(
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;
alter table public.app_settings force row level security;
revoke all on public.app_settings from public,anon,authenticated;

-- New users choose their first experience in the wizard instead of receiving
-- an unexplained empty project automatically.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.profiles(id,display_name)
  values(new.id,coalesce(new.raw_user_meta_data->>'display_name',split_part(new.email,'@',1)))
  on conflict(id) do nothing;
  if lower(coalesce(new.email,''))='maindave@gmail.com' then
    insert into public.app_admins(user_id) values(new.id) on conflict do nothing;
  end if;
  return new;
end;
$$;

create or replace function public.create_onboarding_workspace(p_name text,p_mode text default 'blank')
returns uuid language plpgsql security definer set search_path='' as $$
declare
  user_id uuid=(select auth.uid()); new_workspace uuid; new_cultivation uuid;
begin
  if user_id is null then raise exception 'authentication_required'; end if;
  if length(trim(coalesce(p_name,'')))=0 then raise exception 'workspace_name_required'; end if;
  if p_mode not in ('blank','base') then raise exception 'invalid_onboarding_mode'; end if;
  insert into public.workspaces(owner_id,name,description,grow_type,started_on)
  values(user_id,trim(p_name),case when p_mode='base' then 'Proyecto inicial creado por el asistente de GrowManager.' else '' end,'indoor',current_date)
  returning id into new_workspace;
  insert into public.workspace_members(workspace_id,user_id,role) values(new_workspace,user_id,'owner');
  if p_mode='base' then
    insert into public.cultivations(owner_id,workspace_id,name,start_date,status,notes,cultivation_mode,current_stage,stage_started_on)
    values(user_id,new_workspace,'Cultivo principal',current_date,'active','Estructura inicial editable.','cycle','vegetative',current_date)
    returning id into new_cultivation;
    insert into public.spaces(owner_id,workspace_id,cultivation_id,name,description,operational_stage,active) values
      (user_id,new_workspace,new_cultivation,'Vegetativo','Crecimiento, madres y esquejes.','vegetative',true),
      (user_id,new_workspace,new_cultivation,'Floración','Espacio de floración.','flowering',true);
  end if;
  return new_workspace;
end;
$$;

create or replace function public.get_app_context()
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'isAdmin',public.is_app_admin(),
    'demoWorkspaceId',(select value->>'workspaceId' from public.app_settings where key='demo_workspace')
  );
$$;

create or replace function public.join_demo_workspace()
returns uuid language plpgsql security definer set search_path='' as $$
declare user_id uuid=(select auth.uid()); demo_id uuid;
begin
  if user_id is null then raise exception 'authentication_required'; end if;
  select (value->>'workspaceId')::uuid into demo_id from public.app_settings where key='demo_workspace';
  if demo_id is null or not exists(select 1 from public.workspaces where id=demo_id) then raise exception 'demo_not_configured'; end if;
  insert into public.workspace_members(workspace_id,user_id,role) values(demo_id,user_id,'viewer')
  on conflict(workspace_id,user_id) do update set role=case when workspace_members.role='owner' then 'owner'::public.workspace_role else 'viewer'::public.workspace_role end;
  return demo_id;
end;
$$;

create or replace function public.list_app_users()
returns table(user_id uuid,email text,display_name text,created_at timestamptz,last_sign_in_at timestamptz,project_count bigint)
language plpgsql security definer set search_path='' as $$
begin
  if not public.is_app_admin() then raise exception 'app_admin_required'; end if;
  return query select u.id,u.email::text,p.display_name,u.created_at,u.last_sign_in_at,count(m.workspace_id)
  from auth.users u left join public.profiles p on p.id=u.id left join public.workspace_members m on m.user_id=u.id
  group by u.id,u.email,p.display_name,u.created_at,u.last_sign_in_at order by u.created_at desc;
end;
$$;

create or replace function public.clone_workspace_as_demo(p_source_workspace_id uuid,p_name text default 'GrowManager · Proyecto de muestra')
returns uuid language plpgsql security definer set search_path='' as $$
declare
  admin_id uuid=(select auth.uid()); demo_id uuid; c record; s record; l record;
  new_c uuid; new_s uuid; cult_map jsonb='{}'; space_map jsonb='{}'; lot_map jsonb='{}';
begin
  if not public.is_app_admin() then raise exception 'app_admin_required'; end if;
  if not public.is_workspace_owner(p_source_workspace_id) then raise exception 'workspace_owner_required'; end if;
  insert into public.workspaces(owner_id,name,description,grow_type,started_on)
  select admin_id,trim(p_name),'Copia aislada para recorrer GrowManager sin acceso al proyecto original.',grow_type,started_on
  from public.workspaces where id=p_source_workspace_id returning id into demo_id;
  insert into public.workspace_members(workspace_id,user_id,role) values(demo_id,admin_id,'owner');
  for c in select * from public.cultivations where workspace_id=p_source_workspace_id loop
    insert into public.cultivations(owner_id,workspace_id,name,start_date,end_date,status,notes,cultivation_mode,current_stage,stage_started_on,planned_end_date)
    values(admin_id,demo_id,c.name,c.start_date,c.end_date,c.status,c.notes,c.cultivation_mode,c.current_stage,c.stage_started_on,c.planned_end_date)
    returning id into new_c; cult_map=cult_map||jsonb_build_object(c.id::text,new_c::text);
  end loop;
  for s in select * from public.spaces where workspace_id=p_source_workspace_id loop
    new_c=(cult_map->>s.cultivation_id::text)::uuid;
    insert into public.spaces(owner_id,workspace_id,cultivation_id,name,description,operational_stage,active)
    values(admin_id,demo_id,new_c,s.name,s.description,s.operational_stage,s.active) returning id into new_s;
    space_map=space_map||jsonb_build_object(s.id::text,new_s::text);
  end loop;
  for l in select * from public.lots where workspace_id=p_source_workspace_id loop
    insert into public.lots(owner_id,workspace_id,cultivation_id,space_id,name,description,stage,active,nutrition_profile,show_on_calendar,timeline_started_on,timeline_end_on,vegetative_weeks,flowering_weeks)
    values(admin_id,demo_id,(cult_map->>l.cultivation_id::text)::uuid,(space_map->>l.space_id::text)::uuid,l.name,l.description,l.stage,l.active,l.nutrition_profile,l.show_on_calendar,l.timeline_started_on,l.timeline_end_on,l.vegetative_weeks,l.flowering_weeks);
  end loop;
  insert into public.operation_logs(workspace_id,kind,category,title,description,severity,occurred_at,resolved_at,created_by,metadata,archived_at)
  select demo_id,kind,category,title,description,severity,occurred_at,resolved_at,admin_id,metadata,archived_at from public.operation_logs where workspace_id=p_source_workspace_id;
  insert into public.app_settings(key,value,updated_at) values('demo_workspace',jsonb_build_object('workspaceId',demo_id),now())
  on conflict(key) do update set value=excluded.value,updated_at=excluded.updated_at;
  return demo_id;
end;
$$;

revoke all on function public.is_app_admin(),public.create_onboarding_workspace(text,text),public.get_app_context(),public.join_demo_workspace(),public.list_app_users(),public.clone_workspace_as_demo(uuid,text) from public,anon;
grant execute on function public.is_app_admin(),public.create_onboarding_workspace(text,text),public.get_app_context(),public.join_demo_workspace(),public.list_app_users(),public.clone_workspace_as_demo(uuid,text) to authenticated;
