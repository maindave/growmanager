drop index public.one_active_crop_per_room;
grant delete on public.cultivations,public.spaces,public.lots,public.activities to authenticated;
create policy crops_delete_owner on public.cultivations for delete to authenticated using(public.is_workspace_owner(workspace_id));
create policy spaces_delete_owner on public.spaces for delete to authenticated using(public.is_workspace_owner(workspace_id));
create policy lots_delete_owner on public.lots for delete to authenticated using(public.is_workspace_owner(workspace_id));
create policy activities_delete_editor on public.activities for delete to authenticated using(public.can_edit_workspace(workspace_id));
alter table public.rooms drop constraint rooms_role_check;
alter table public.rooms add constraint rooms_role_check check(role in ('vegetative','flowering','outdoor'));
create or replace function public.sync_crop_record() returns trigger language plpgsql set search_path='' as $$ declare s uuid; r public.rooms; begin
 select * into r from public.rooms where id=new.room_id;
 if tg_op='INSERT' then
 insert into public.spaces(owner_id,workspace_id,cultivation_id,name,operational_stage) values(new.owner_id,new.workspace_id,new.id,r.name,new.current_stage) returning id into s;
 insert into public.lots(owner_id,workspace_id,cultivation_id,space_id,name,description,stage,active,timeline_started_on,timeline_end_on,show_on_calendar,nutrition_profile) values(new.owner_id,new.workspace_id,new.id,s,new.name,new.notes,new.current_stage,new.status='active',new.start_date,new.planned_end_date,new.status='active',case when new.cultivation_mode='continuous' then 'mothers' when new.current_stage='flowering' then 'flowering' else 'full_cycle' end);
 else
 update public.lots set name=new.name,description=new.notes,stage=new.current_stage,active=new.status='active',timeline_started_on=new.start_date,timeline_end_on=case when new.cultivation_mode='continuous' then null else new.planned_end_date end,nutrition_profile=case when new.cultivation_mode='continuous' then 'mothers' when old.cultivation_mode='continuous' then 'full_cycle' else nutrition_profile end where cultivation_id=new.id;
 update public.spaces set name=r.name where cultivation_id=new.id;
 end if; return new;
end $$;
drop trigger sync_crop_record on public.cultivations;
create trigger sync_crop_record after insert or update of room_id,name,notes,current_stage,status,start_date,planned_end_date,cultivation_mode on public.cultivations for each row execute function public.sync_crop_record();
create function public.move_crop(p_crop uuid,p_room uuid,p_target_crop uuid default null,p_plants uuid[] default null) returns integer language plpgsql security invoker set search_path='' as $$
declare c public.cultivations; t public.cultivations; l public.lots; target_l public.lots; r public.rooms; n integer; moved uuid[]; begin
 select * into c from public.cultivations where id=p_crop for update;
 if c.id is null or c.status<>'active' or not public.can_edit_workspace(c.workspace_id) then raise exception 'Cultivo no disponible'; end if;
 select * into r from public.rooms where id=p_room and workspace_id=c.workspace_id and active;
 if r.id is null then raise exception 'Destino no disponible'; end if;
 select * into l from public.lots where cultivation_id=c.id for update;
 if p_target_crop is null then
 if p_plants is not null then raise exception 'Elegí un cultivo de destino para las plantas'; end if;
 if c.room_id=r.id then raise exception 'El cultivo ya está en esa sala'; end if;
 update public.cultivations set room_id=r.id where id=c.id; n=1;
 else
 select * into t from public.cultivations where id=p_target_crop and workspace_id=c.workspace_id and room_id=r.id and status='active' for update;
 if t.id is null or t.id=c.id then raise exception 'Cultivo de destino no válido'; end if;
 select * into target_l from public.lots where cultivation_id=t.id for update;
 if p_plants is not null and (cardinality(p_plants)=0 or (select count(*) from public.plants where lot_id=l.id and status='active' and id=any(p_plants))<>cardinality(p_plants)) then raise exception 'Selección de plantas inválida'; end if;
 select array_agg(id) into moved from public.plants where lot_id=l.id and status='active' and (p_plants is null or id=any(p_plants));
 update public.plants set lot_id=target_l.id where id=any(moved); get diagnostics n=row_count;
 if n=0 then raise exception 'No hay plantas activas para trasladar'; end if;
 end if;
 insert into public.operation_logs(workspace_id,kind,category,title,description,severity,occurred_at,metadata) values(c.workspace_id,'activity','transplant','Traslado de '||c.name,case when p_target_crop is null then 'Cultivo trasladado a '||r.name else n||' plantas trasladadas a '||t.name||' · '||r.name end,'info',now(),jsonb_build_object('cultivationId',c.id,'lotId',l.id,'sourceRoomId',c.room_id,'destinationRoomId',r.id,'destinationCultivationId',p_target_crop,'plantIds',moved,'count',n)); return n;
end $$;
revoke all on function public.move_crop(uuid,uuid,uuid,uuid[]) from public,anon;
grant execute on function public.move_crop(uuid,uuid,uuid,uuid[]) to authenticated;
-- Deletion is limited to empty records; populated records retain their history.
create function public.delete_empty_crop(p_crop uuid) returns void language plpgsql security invoker set search_path='' as $$ declare c public.cultivations; l uuid; begin
 select * into c from public.cultivations where id=p_crop for update;
 if c.id is null or not public.is_workspace_owner(c.workspace_id) then raise exception 'Solo el administrador puede eliminar cultivos'; end if;
 select id into l from public.lots where cultivation_id=c.id;
 if exists(select 1 from public.plants where lot_id=l) or exists(select 1 from public.activities where cultivation_id=c.id or lot_id=l) or exists(select 1 from public.irrigation_events where cultivation_id=c.id or lot_id=l) or exists(select 1 from public.agenda_events where cultivation_id=c.id or lot_id=l) or exists(select 1 from public.operation_logs where workspace_id=c.workspace_id and (metadata->>'cultivationId'=c.id::text or metadata->>'lotId'=l::text)) then raise exception 'Este cultivo tiene plantas o historial. Podés finalizarlo o archivarlo.'; end if;
 delete from public.lots where cultivation_id=c.id; delete from public.spaces where cultivation_id=c.id; delete from public.cultivations where id=c.id;
end $$;
revoke all on function public.delete_empty_crop(uuid) from public,anon;
grant execute on function public.delete_empty_crop(uuid) to authenticated;
grant delete on public.operation_logs to authenticated;
create policy operation_logs_delete on public.operation_logs for delete to authenticated using(public.can_edit_workspace(workspace_id));
create function public.edit_completed_history(p_event uuid,p_title text,p_notes text,p_at timestamptz,p_water numeric default null,p_ph numeric default null,p_ec numeric default null) returns void language plpgsql security definer set search_path='' as $$ declare e public.agenda_events; x jsonb; begin
 select * into e from public.agenda_events where id=p_event for update;
 if e.id is null or e.status<>'completed' or not public.can_edit_workspace(e.workspace_id) then raise exception 'Registro no disponible';end if;
 if length(trim(coalesce(p_title,'')))=0 or p_at is null then raise exception 'Ingresá título y fecha';end if;
 if p_water<=0 or p_ph<0 or p_ph>14 or p_ec<0 then raise exception 'Valores de riego inválidos';end if;
 x=coalesce(e.metadata->'execution','{}'::jsonb)||jsonb_build_object('completedAt',p_at,'notes',left(coalesce(p_notes,''),1200));
 if e.event_type='irrigation' then x=x||jsonb_build_object('waterLiters',p_water,'ph',p_ph,'ec',p_ec);end if;
 update public.agenda_events set updated_by=auth.uid(),title=left(trim(p_title),120),description=left(coalesce(p_notes,''),1200),metadata=metadata||jsonb_build_object('execution',x) where id=e.id;
 if e.legacy_irrigation_id is not null then update public.irrigation_events set completed_at=p_at,notes=p_notes,water_liters=p_water,ph=p_ph,ec=p_ec where id=e.legacy_irrigation_id;end if;
end $$;
create function public.delete_completed_history(p_event uuid) returns void language plpgsql security definer set search_path='' as $$ declare e public.agenda_events; begin
 select * into e from public.agenda_events where id=p_event for update;
 if e.id is null or e.status<>'completed' or not public.can_edit_workspace(e.workspace_id) then raise exception 'Registro no disponible';end if;
 perform public.delete_agenda_event(e.id);
 if e.legacy_irrigation_id is not null then delete from public.irrigation_events where id=e.legacy_irrigation_id;end if;
end $$;
revoke all on function public.edit_completed_history(uuid,text,text,timestamptz,numeric,numeric,numeric),public.delete_completed_history(uuid) from public,anon;
grant execute on function public.edit_completed_history(uuid,text,text,timestamptz,numeric,numeric,numeric),public.delete_completed_history(uuid) to authenticated;
