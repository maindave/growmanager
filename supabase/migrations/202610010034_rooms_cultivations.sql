-- Persistent rooms. Legacy spaces/lots retain operational IDs for historical references.
create table public.rooms(id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,name text not null check(length(trim(name))>0),role text not null check(role in ('vegetative','flowering')),description text not null default '',active boolean not null default true,created_at timestamptz not null default now(),unique(id,workspace_id));
alter table public.rooms enable row level security;
grant select,insert,update,delete on public.rooms to authenticated;
create policy rooms_read on public.rooms for select to authenticated using(public.is_workspace_member(workspace_id));
create policy rooms_insert on public.rooms for insert to authenticated with check(public.can_edit_workspace(workspace_id));
create policy rooms_update on public.rooms for update to authenticated using(public.can_edit_workspace(workspace_id)) with check(public.can_edit_workspace(workspace_id));
create policy rooms_delete on public.rooms for delete to authenticated using(public.is_workspace_owner(workspace_id));
alter table public.cultivations add column room_id uuid;
alter table public.cultivations add constraint crop_room_workspace_fk foreign key(room_id,workspace_id) references public.rooms(id,workspace_id);
-- Confirmed SOG reassignment in user's project and its demonstration copy.
do $$ declare l record; c public.cultivations; s uuid; begin
 for l in select x.* from public.lots x join public.cultivations parent on parent.id=x.cultivation_id where x.workspace_id in ('4d83ef2b-ba7e-4018-ba2b-bdfa8601714c','b403a2f1-7ec8-445f-a364-3eb86109949c') and x.name like 'Tanda Floración SOG%' and parent.name like 'Madres 2026%' loop
 perform set_config('request.jwt.claim.sub',l.owner_id::text,true);
 select * into strict c from public.cultivations where workspace_id=l.workspace_id and name='Floración SOG 25 Esquejes (10 OB / 15 WG)';
 select id into s from public.spaces where cultivation_id=c.id order by created_at limit 1;
 if s is null then insert into public.spaces(owner_id,workspace_id,cultivation_id,name,operational_stage) values(c.owner_id,c.workspace_id,c.id,'Sala Flora','flowering') returning id into s; end if;
 update public.spaces set name='Sala Flora',operational_stage='flowering' where id=s;
 update public.lots set cultivation_id=c.id,space_id=s,name=c.name,stage='flowering' where id=l.id;
 update public.activities set cultivation_id=c.id,space_id=s where lot_id=l.id;
 update public.irrigation_events set cultivation_id=c.id where lot_id=l.id;
 update public.agenda_events set cultivation_id=c.id where lot_id=l.id;
 update public.operation_logs set metadata=jsonb_set(metadata,'{cultivationId}',to_jsonb(c.id::text)) where workspace_id=c.workspace_id and metadata->>'lotId'=l.id::text;
 update public.spaces set active=false where id=l.space_id;
 end loop;
 perform set_config('request.jwt.claim.sub','',true);
end $$;
do $$ declare c record; s uuid; r uuid; n text; role_name text; begin
 for c in select * from public.cultivations order by created_at loop
 perform set_config('request.jwt.claim.sub',c.owner_id::text,true);
 if (select count(*) from public.lots where cultivation_id=c.id)>1 then raise exception 'Revisar múltiples registros operativos en %',c.id; end if;
 select x.id,x.name into s,n from public.spaces x where cultivation_id=c.id order by exists(select 1 from public.lots where space_id=x.id) desc,x.active desc,x.created_at limit 1;
 role_name=case when c.current_stage='flowering' then 'flowering' else 'vegetative' end;
 if c.workspace_id in ('4d83ef2b-ba7e-4018-ba2b-bdfa8601714c','b403a2f1-7ec8-445f-a364-3eb86109949c') then n=case when role_name='flowering' then 'Sala Flora' else 'Sala Vegetativo' end; end if;
 insert into public.rooms(workspace_id,name,role) values(c.workspace_id,coalesce(n,'Sala de '||c.name),role_name) returning id into r;
 update public.cultivations set room_id=r where id=c.id;
 if s is null then insert into public.spaces(owner_id,workspace_id,cultivation_id,name,operational_stage) values(c.owner_id,c.workspace_id,c.id,coalesce(n,'Sala'),role_name::public.lot_stage) returning id into s; end if;
 if not exists(select 1 from public.lots where cultivation_id=c.id) then
 insert into public.lots(owner_id,workspace_id,cultivation_id,space_id,name,stage,active,timeline_started_on,timeline_end_on,show_on_calendar,nutrition_profile) values(c.owner_id,c.workspace_id,c.id,s,c.name,c.current_stage,c.status='active',c.start_date,c.planned_end_date,c.status='active',case when c.cultivation_mode='continuous' then 'mothers' when c.current_stage='flowering' then 'flowering' else 'full_cycle' end);
 end if;
 update public.lots set name=c.name,active=c.status='active' where cultivation_id=c.id;
 end loop;
 perform set_config('request.jwt.claim.sub','',true);
end $$;
create unique index one_active_crop_per_room on public.cultivations(room_id) where status='active';
create unique index one_record_per_crop on public.lots(cultivation_id);
create function public.check_crop_room() returns trigger language plpgsql set search_path='' as $$ begin
 if new.room_id is null then raise exception 'Elegí una sala antes de crear el cultivo'; end if;
 if new.status='active' and not exists(select 1 from public.rooms where id=new.room_id and workspace_id=new.workspace_id and active) then raise exception 'La sala no está disponible'; end if; return new;
end $$;
create trigger check_crop_room before insert or update of room_id,status on public.cultivations for each row execute function public.check_crop_room();
create function public.sync_crop_record() returns trigger language plpgsql set search_path='' as $$ declare s uuid; r public.rooms; begin
 select * into r from public.rooms where id=new.room_id;
 if tg_op='INSERT' then
 insert into public.spaces(owner_id,workspace_id,cultivation_id,name,operational_stage) values(new.owner_id,new.workspace_id,new.id,r.name,r.role::public.lot_stage) returning id into s;
 insert into public.lots(owner_id,workspace_id,cultivation_id,space_id,name,description,stage,active,timeline_started_on,timeline_end_on,show_on_calendar,nutrition_profile) values(new.owner_id,new.workspace_id,new.id,s,new.name,new.notes,new.current_stage,new.status='active',new.start_date,new.planned_end_date,new.status='active',case when new.cultivation_mode='continuous' then 'mothers' when new.current_stage='flowering' then 'flowering' else 'full_cycle' end);
 else
 update public.lots set name=new.name,description=new.notes,stage=new.current_stage,active=new.status='active',timeline_started_on=new.start_date,timeline_end_on=case when new.cultivation_mode='continuous' then null else new.planned_end_date end,nutrition_profile=case when new.cultivation_mode='continuous' then 'mothers' when old.cultivation_mode='continuous' then 'full_cycle' else nutrition_profile end where cultivation_id=new.id;
 end if; return new;
end $$;
create trigger sync_crop_record after insert or update of name,notes,current_stage,status,start_date,planned_end_date,cultivation_mode on public.cultivations for each row execute function public.sync_crop_record();
create function public.check_room_active() returns trigger language plpgsql set search_path='' as $$ begin
 if not new.active and exists(select 1 from public.cultivations where room_id=new.id and status='active') then raise exception 'Finalizá el cultivo antes de desactivar la sala'; end if; return new;
end $$;
create trigger check_room_active before update of active on public.rooms for each row execute function public.check_room_active();
create function public.add_crop_plants(p_lot_id uuid,p_count integer,p_variety text default '') returns integer language plpgsql security invoker set search_path='' as $$ declare l public.lots; n integer; begin
 select * into l from public.lots where id=p_lot_id for update;
 if l.id is null or not public.can_edit_workspace(l.workspace_id) then raise exception 'Cultivo no disponible'; end if;
 if not l.active then raise exception 'El cultivo está finalizado'; end if;
 if p_count is null or p_count<1 or p_count>500 then raise exception 'Ingresá entre 1 y 500 plantas'; end if;
 select count(*) into n from public.plants where lot_id=l.id;
 insert into public.plants(owner_id,workspace_id,lot_id,code,variety,status) select l.owner_id,l.workspace_id,l.id,'Planta '||(n+i),left(coalesce(p_variety,''),100),'active' from generate_series(1,p_count) i; return p_count;
end $$;
revoke all on function public.add_crop_plants(uuid,integer,text) from public,anon;
grant execute on function public.add_crop_plants(uuid,integer,text) to authenticated;

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
    insert into public.rooms(workspace_id,name,role) values(new_workspace,'Sala Vegetativo','vegetative'),(new_workspace,'Sala Flora','flowering');
  end if;
  return new_workspace;
end;
$$;


create or replace function public.clone_workspace_as_demo(p_source_workspace_id uuid,p_name text default 'GrowManager · Proyecto de muestra')
returns uuid language plpgsql security definer set search_path='' as $$
declare
  admin_id uuid=(select auth.uid()); demo_id uuid; c record; s record; l record;
  new_c uuid; new_s uuid; new_r uuid; room_map jsonb='{}'; r record; cult_map jsonb='{}'; space_map jsonb='{}'; lot_map jsonb='{}';
begin
  if not public.is_app_admin() then raise exception 'app_admin_required'; end if;
  if not public.is_workspace_owner(p_source_workspace_id) then raise exception 'workspace_owner_required'; end if;
  insert into public.workspaces(owner_id,name,description,grow_type,started_on)
  select admin_id,trim(p_name),'Copia aislada para recorrer GrowManager sin acceso al proyecto original.',grow_type,started_on
  from public.workspaces where id=p_source_workspace_id returning id into demo_id;
  insert into public.workspace_members(workspace_id,user_id,role) values(demo_id,admin_id,'owner');
  for r in select * from public.rooms where workspace_id=p_source_workspace_id loop
    insert into public.rooms(workspace_id,name,role,description,active) values(demo_id,r.name,r.role,r.description,r.active) returning id into new_r; room_map=room_map||jsonb_build_object(r.id::text,new_r::text);
  end loop;
  for c in select * from public.cultivations where workspace_id=p_source_workspace_id loop
    insert into public.cultivations(room_id,owner_id,workspace_id,name,start_date,end_date,status,notes,cultivation_mode,current_stage,stage_started_on,planned_end_date)
    values((room_map->>c.room_id::text)::uuid,admin_id,demo_id,c.name,c.start_date,c.end_date,c.status,c.notes,c.cultivation_mode,c.current_stage,c.stage_started_on,c.planned_end_date)
    returning id into new_c; cult_map=cult_map||jsonb_build_object(c.id::text,new_c::text);
  end loop;
  for l in select * from public.lots where workspace_id=p_source_workspace_id loop
    update public.lots set nutrition_profile=l.nutrition_profile,vegetative_weeks=l.vegetative_weeks,flowering_weeks=l.flowering_weeks,show_on_calendar=l.show_on_calendar where cultivation_id=(cult_map->>l.cultivation_id::text)::uuid;
  end loop;
  insert into public.operation_logs(workspace_id,kind,category,title,description,severity,occurred_at,resolved_at,created_by,metadata,archived_at)
  select demo_id,kind,category,title,description,severity,occurred_at,resolved_at,admin_id,metadata,archived_at from public.operation_logs where workspace_id=p_source_workspace_id;
  insert into public.app_settings(key,value,updated_at) values('demo_workspace',jsonb_build_object('workspaceId',demo_id),now())
  on conflict(key) do update set value=excluded.value,updated_at=excluded.updated_at;
  return demo_id;
end;
$$;


create or replace function public.create_cultivation_with_space(p_workspace_id uuid,p_name text,p_start_date date,p_planned_end_date date,p_cultivation_mode text,p_current_stage public.lot_stage,p_stage_started_on date,p_notes text,p_space_name text,p_space_description text default '',p_space_stage public.lot_stage default null)
returns jsonb language plpgsql security invoker set search_path='' as $$ declare r uuid; c uuid; s uuid; begin
 if not public.can_edit_workspace(p_workspace_id) then raise exception 'workspace_write_forbidden'; end if;
 insert into public.rooms(workspace_id,name,role,description) values(p_workspace_id,p_space_name,case when p_space_stage='flowering' then 'flowering' else 'vegetative' end,coalesce(p_space_description,'')) returning id into r;
 insert into public.cultivations(workspace_id,room_id,name,start_date,planned_end_date,cultivation_mode,current_stage,stage_started_on,notes) values(p_workspace_id,r,p_name,p_start_date,p_planned_end_date,p_cultivation_mode,p_current_stage,coalesce(p_stage_started_on,p_start_date),coalesce(p_notes,'')) returning id into c;
 select space_id into s from public.lots where cultivation_id=c; return jsonb_build_object('cultivationId',c,'spaceId',s,'roomId',r);
end $$;
