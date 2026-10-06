-- Recalculate once per affected cultivation, not once per plant in a batch.
drop trigger refresh_plant_crop_end on public.plants;
create function public.refresh_crop_group_statement() returns trigger language plpgsql security invoker set search_path='' as $$ begin
 if tg_op<>'INSERT' then update public.cultivations set planned_end_date=planned_end_date where current_stage='flowering' and id in(select l.cultivation_id from public.lots l join old_plant_rows p on p.lot_id=l.id);end if;
 if tg_op<>'DELETE' then update public.cultivations set planned_end_date=planned_end_date where current_stage='flowering' and id in(select l.cultivation_id from public.lots l join new_plant_rows p on p.lot_id=l.id);end if;
 return null;
end $$;
create trigger refresh_groups_insert after insert on public.plants referencing new table as new_plant_rows for each statement execute function public.refresh_crop_group_statement();
create trigger refresh_groups_update after update on public.plants referencing old table as old_plant_rows new table as new_plant_rows for each statement execute function public.refresh_crop_group_statement();
create trigger refresh_groups_delete after delete on public.plants referencing old table as old_plant_rows for each statement execute function public.refresh_crop_group_statement();
create or replace function public.start_planned_crop(p_crop uuid) returns void language plpgsql security invoker set search_path='' as $$ declare c public.cultivations;begin
 select * into c from public.cultivations where id=p_crop for update;
 if c.id is null or c.status<>'planned' or not public.can_edit_workspace(c.workspace_id) then raise exception 'Cultivo no disponible para iniciar';end if;
 update public.cultivations set status='active',start_date=current_date,stage_started_on=current_date,planned_end_date=case when c.planned_end_date is not null then current_date+(c.planned_end_date-c.start_date) else null end where id=c.id;
 insert into public.operation_logs(workspace_id,kind,category,title,description,severity,occurred_at,metadata) values(c.workspace_id,'activity','stage_change','Cultivo iniciado',c.name,'info',now(),jsonb_build_object('cultivationId',c.id,'plannedStartDate',c.start_date));
end $$;
