-- Align the existing operational record and nutrition duration with the flowering stage.
create or replace function public.sync_crop_record() returns trigger language plpgsql set search_path='' as $$ declare s uuid; r public.rooms; begin
 select * into r from public.rooms where id=new.room_id;
 if tg_op='INSERT' then
 insert into public.spaces(owner_id,workspace_id,cultivation_id,name,operational_stage) values(new.owner_id,new.workspace_id,new.id,r.name,new.current_stage) returning id into s;
 insert into public.lots(owner_id,workspace_id,cultivation_id,space_id,name,description,stage,active,timeline_started_on,timeline_end_on,show_on_calendar,nutrition_profile) values(new.owner_id,new.workspace_id,new.id,s,new.name,new.notes,new.current_stage,new.status='active',case when new.current_stage='flowering' then new.stage_started_on else new.start_date end,new.planned_end_date,new.status='active',case when new.cultivation_mode='continuous' then 'mothers' when new.current_stage='flowering' then 'flowering' else 'full_cycle' end);
 else
 update public.lots set name=new.name,description=new.notes,stage=new.current_stage,active=new.status='active',timeline_started_on=case when new.current_stage='flowering' then new.stage_started_on else new.start_date end,timeline_end_on=case when new.cultivation_mode='continuous' then null else new.planned_end_date end,nutrition_profile=case when new.cultivation_mode='continuous' then 'mothers' when old.cultivation_mode='continuous' then 'full_cycle' else nutrition_profile end where cultivation_id=new.id;
 update public.spaces set name=r.name where cultivation_id=new.id;
 end if;
 if new.current_stage='flowering' then update public.lots set vegetative_weeks=0,flowering_weeks=coalesce((select max(p.flowering_weeks) from public.plants p where p.lot_id=public.lots.id and p.status<>'inactive'),flowering_weeks) where cultivation_id=new.id;end if;return new;
end $$;
drop trigger sync_crop_record on public.cultivations;
create trigger sync_crop_record after insert or update of room_id,name,notes,current_stage,status,start_date,stage_started_on,planned_end_date,cultivation_mode on public.cultivations for each row execute function public.sync_crop_record();
