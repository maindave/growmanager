alter table public.cultivations alter column status set default 'planned';
alter table public.plants add column group_id uuid, add column origin text not null default 'unknown' check(origin in ('unknown','clone','seed','seedling')), add column flowering_weeks integer check(flowering_weeks between 1 and 52);
create index plants_group_idx on public.plants(workspace_id,group_id);

-- Flowering dates are anchored to the stage, never inferred from plant names.
create function public.calculate_crop_flowering_end() returns trigger language plpgsql security invoker set search_path='' as $$
declare l uuid; weeks integer; missing boolean; begin
 if new.current_stage='flowering' and new.cultivation_mode='cycle' then
 select id into l from public.lots where cultivation_id=new.id;
 select max(flowering_weeks),bool_or(flowering_weeks is null) into weeks,missing from public.plants where lot_id=l and status<>'inactive';
 new.planned_end_date:=case when weeks is not null and not missing then new.stage_started_on+weeks*7 else null end;
 end if;return new;
end $$;
create trigger calculate_crop_flowering_end before insert or update of current_stage,stage_started_on,cultivation_mode,planned_end_date on public.cultivations for each row execute function public.calculate_crop_flowering_end();
create function public.refresh_plant_crop_end() returns trigger language plpgsql security invoker set search_path='' as $$ begin
 if tg_op<>'INSERT' then update public.cultivations set planned_end_date=planned_end_date where id=(select cultivation_id from public.lots where id=old.lot_id) and current_stage='flowering';end if;
 if tg_op<>'DELETE' then update public.cultivations set planned_end_date=planned_end_date where id=(select cultivation_id from public.lots where id=new.lot_id) and current_stage='flowering';end if;
 return null;
end $$;
create trigger refresh_plant_crop_end after insert or delete or update of lot_id,flowering_weeks,status on public.plants for each row execute function public.refresh_plant_crop_end();

create function public.add_crop_plant_groups(p_lot_id uuid,p_groups jsonb) returns integer language plpgsql security invoker set search_path='' as $$
declare l public.lots; c public.cultivations; g jsonb; qty integer; weeks integer; total integer=0; n integer; group_uuid uuid; variety_name text; origin_name text; begin
 select * into l from public.lots where id=p_lot_id for update;
 select * into c from public.cultivations where id=l.cultivation_id;
 if l.id is null or not public.can_edit_workspace(l.workspace_id) or c.status not in ('planned','active') then raise exception 'Cultivo no disponible';end if;
 if jsonb_typeof(p_groups)<>'array' or jsonb_array_length(p_groups)<1 or jsonb_array_length(p_groups)>50 then raise exception 'Agregá al menos un grupo';end if;
 for g in select value from jsonb_array_elements(p_groups) loop
 qty=(g->>'count')::integer;weeks=nullif(g->>'floweringWeeks','')::integer;variety_name=trim(g->>'variety');origin_name=coalesce(g->>'origin','unknown');
 if qty is null or qty<1 or qty>500 or length(coalesce(variety_name,''))<1 or length(variety_name)>100 or origin_name not in ('unknown','clone','seed','seedling') or (weeks is not null and (weeks<1 or weeks>52)) then raise exception 'Revisá cantidad, cepa, origen y semanas';end if;
 total=total+qty;if total>500 then raise exception 'Máximo 500 plantas por carga';end if;
 select count(*) into n from public.plants where workspace_id=l.workspace_id and lower(variety)=lower(variety_name);
 group_uuid=gen_random_uuid();
 insert into public.plants(owner_id,workspace_id,lot_id,code,variety,status,group_id,origin,flowering_weeks)
 select l.owner_id,l.workspace_id,l.id,variety_name||' '||lpad((n+i)::text,2,'0'),variety_name,'active',group_uuid,origin_name,weeks from generate_series(1,qty) i;
 end loop;
 insert into public.operation_logs(workspace_id,kind,category,title,description,severity,occurred_at,metadata) values(l.workspace_id,'activity','general','Plantas agregadas',total||' plantas en '||jsonb_array_length(p_groups)||' grupos','info',now(),jsonb_build_object('cultivationId',c.id,'lotId',l.id,'groups',p_groups));return total;
end $$;
create function public.create_crop_with_groups(p_workspace_id uuid,p_crop jsonb,p_groups jsonb) returns uuid language plpgsql security invoker set search_path='' as $$ declare c uuid;l uuid;begin
 if not public.can_edit_workspace(p_workspace_id) then raise exception 'workspace_write_forbidden';end if;
 insert into public.cultivations(workspace_id,room_id,name,start_date,current_stage,stage_started_on,cultivation_mode,status,notes,planned_end_date)
 values(p_workspace_id,(p_crop->>'roomId')::uuid,p_crop->>'name',(p_crop->>'startDate')::date,(p_crop->>'currentStage')::public.lot_stage,(p_crop->>'stageStartedOn')::date,p_crop->>'cultivationMode',coalesce(p_crop->>'status','planned')::public.cultivation_status,coalesce(p_crop->>'notes',''),nullif(p_crop->>'plannedEndDate','')::date) returning id into c;
 if jsonb_array_length(p_groups)>0 then select id into l from public.lots where cultivation_id=c;perform public.add_crop_plant_groups(l,p_groups);end if;return c;
end $$;
create function public.manage_crop_plants(p_lot_id uuid,p_ids uuid[],p_status text default null,p_notes text default null,p_weeks integer default null) returns integer language plpgsql security invoker set search_path='' as $$ declare l public.lots;n integer;begin
 select * into l from public.lots where id=p_lot_id for update;
 if l.id is null or not public.can_edit_workspace(l.workspace_id) or cardinality(p_ids) is null or cardinality(p_ids)=0 or cardinality(p_ids)>500 or (select count(*) from public.plants where lot_id=l.id and id=any(p_ids))<>cardinality(p_ids) then raise exception 'Selección inválida';end if;
 if p_status is not null and p_status not in ('active','harvested','inactive') or p_weeks is not null and (p_weeks<1 or p_weeks>52) then raise exception 'Valores inválidos';end if;
 update public.plants set status=coalesce(p_status,status),notes=coalesce(p_notes,notes),flowering_weeks=coalesce(p_weeks,flowering_weeks) where lot_id=l.id and id=any(p_ids);get diagnostics n=row_count;
 insert into public.operation_logs(workspace_id,kind,category,title,description,severity,occurred_at,metadata) values(l.workspace_id,'activity','general','Gestión de plantas',n||' plantas actualizadas','info',now(),jsonb_build_object('cultivationId',l.cultivation_id,'lotId',l.id,'plantIds',p_ids,'status',p_status,'floweringWeeks',p_weeks));return n;
end $$;
create function public.start_planned_crop(p_crop uuid) returns void language plpgsql security invoker set search_path='' as $$ declare c public.cultivations;begin
 select * into c from public.cultivations where id=p_crop for update;
 if c.id is null or c.status<>'planned' or not public.can_edit_workspace(c.workspace_id) then raise exception 'Cultivo no disponible para iniciar';end if;
 update public.cultivations set status='active',start_date=current_date,stage_started_on=current_date,planned_end_date=null where id=c.id;
 insert into public.operation_logs(workspace_id,kind,category,title,description,severity,occurred_at,metadata) values(c.workspace_id,'activity','stage_change','Cultivo iniciado',c.name,'info',now(),jsonb_build_object('cultivationId',c.id,'plannedStartDate',c.start_date));
end $$;
revoke all on function public.add_crop_plant_groups(uuid,jsonb),public.create_crop_with_groups(uuid,jsonb,jsonb),public.manage_crop_plants(uuid,uuid[],text,text,integer),public.start_planned_crop(uuid) from public,anon;
grant execute on function public.add_crop_plant_groups(uuid,jsonb),public.create_crop_with_groups(uuid,jsonb,jsonb),public.manage_crop_plants(uuid,uuid[],text,text,integer),public.start_planned_crop(uuid) to authenticated;

create or replace function public.move_crop(p_crop uuid,p_room uuid,p_target_crop uuid default null,p_plants uuid[] default null) returns integer language plpgsql security invoker set search_path='' as $$
declare c public.cultivations; t public.cultivations; l public.lots; target_l public.lots; r public.rooms; n integer; moved uuid[]; begin
 select * into c from public.cultivations where id=p_crop for update;
 if c.id is null or c.status not in ('active','planned') or not public.can_edit_workspace(c.workspace_id) then raise exception 'Cultivo no disponible'; end if;
 select * into r from public.rooms where id=p_room and workspace_id=c.workspace_id and active;
 if r.id is null then raise exception 'Destino no disponible'; end if;
 select * into l from public.lots where cultivation_id=c.id for update;
 if p_target_crop is null then
 if p_plants is not null then raise exception 'Elegí un cultivo de destino para las plantas'; end if;
 if c.room_id=r.id then raise exception 'El cultivo ya está en esa sala'; end if;
 update public.cultivations set room_id=r.id where id=c.id; n=1;
 else
 select * into t from public.cultivations where id=p_target_crop and workspace_id=c.workspace_id and room_id=r.id and status in ('active','planned') for update;
 if t.id is null or t.id=c.id then raise exception 'Cultivo de destino no válido'; end if;
 select * into target_l from public.lots where cultivation_id=t.id for update;
 if p_plants is not null and (cardinality(p_plants)=0 or (select count(*) from public.plants where lot_id=l.id and status='active' and id=any(p_plants))<>cardinality(p_plants)) then raise exception 'Selección de plantas inválida'; end if;
 select array_agg(id) into moved from public.plants where lot_id=l.id and status='active' and (p_plants is null or id=any(p_plants));
 update public.plants set lot_id=target_l.id where id=any(moved); get diagnostics n=row_count;
 if n=0 then raise exception 'No hay plantas activas para trasladar'; end if;
 end if;
 insert into public.operation_logs(workspace_id,kind,category,title,description,severity,occurred_at,metadata) values(c.workspace_id,'activity','transplant','Traslado de '||c.name,case when p_target_crop is null then 'Cultivo trasladado a '||r.name else n||' plantas trasladadas a '||t.name||' · '||r.name end,'info',now(),jsonb_build_object('cultivationId',c.id,'lotId',l.id,'sourceRoomId',c.room_id,'destinationRoomId',r.id,'destinationCultivationId',p_target_crop,'plantIds',moved,'count',n)); return n;
end $$;

create or replace function public.set_lot_planned_end() returns trigger language plpgsql set search_path='' as $$ declare c public.cultivations;begin
 select * into c from public.cultivations where id=new.cultivation_id;
 if c.current_stage='flowering' then new.timeline_end_on=c.planned_end_date;return new;end if;
 if new.nutrition_profile='mothers' or new.timeline_started_on is null or coalesce(new.vegetative_weeks,0)+coalesce(new.flowering_weeks,0)=0 then new.timeline_end_on=null;else new.timeline_end_on=new.timeline_started_on+(coalesce(new.vegetative_weeks,0)+coalesce(new.flowering_weeks,0))*7-1;end if;return new;
end $$;
