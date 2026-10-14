-- Stage planning belongs to the cultivation. Agenda and lots are projections.
alter table public.cultivations
 add column stage_planned_end_on date,
 add column vegetative_weeks integer check(vegetative_weeks between 1 and 104),
 add column flowering_weeks integer check(flowering_weeks between 1 and 52);

-- Preserve existing intentional stage deadlines and active-stage durations.
update public.cultivations c set
 vegetative_weeks=case when c.current_stage='vegetative' and c.cultivation_mode='cycle' then coalesce(nullif((select l.vegetative_weeks from public.lots l where l.cultivation_id=c.id limit 1),0),2) end,
 flowering_weeks=case when c.current_stage='flowering' then coalesce(nullif((select l.flowering_weeks from public.lots l where l.cultivation_id=c.id limit 1),0),8) end,
 stage_planned_end_on=case when c.current_stage in('clone','rooting','germination') and c.planned_end_date>=c.stage_started_on then c.planned_end_date when c.current_stage='flowering' then c.planned_end_date end
where c.status in('active','planned');

create or replace function public.calculate_crop_flowering_end() returns trigger
language plpgsql set search_path='' as $$ begin
 if new.status in('finished','archived') then return new;end if;
 if tg_op='UPDATE' and new.current_stage is distinct from old.current_stage
    and new.stage_planned_end_on is not distinct from old.stage_planned_end_on then
  new.stage_planned_end_on:=null;
 end if;
 if new.current_stage='mother' or (new.current_stage='vegetative' and new.cultivation_mode='continuous') then
  new.stage_planned_end_on:=null;new.planned_end_date:=null;
 elsif new.current_stage='vegetative' then
  new.stage_planned_end_on:=case when new.vegetative_weeks is not null then new.stage_started_on+new.vegetative_weeks*7 end;
  new.planned_end_date:=null;
 elsif new.current_stage='flowering' then
  new.stage_planned_end_on:=case when new.flowering_weeks is not null then new.stage_started_on+new.flowering_weeks*7 end;
  new.planned_end_date:=new.stage_planned_end_on;
 elsif new.current_stage in('clone','rooting','germination') then
  if new.stage_planned_end_on is null and new.planned_end_date is not null then new.stage_planned_end_on:=new.planned_end_date;end if;
  new.planned_end_date:=null;
 end if;
 if new.stage_planned_end_on<new.stage_started_on then raise exception 'stage_end_before_stage_start';end if;
 return new;
end $$;
drop trigger calculate_crop_flowering_end on public.cultivations;
create trigger calculate_crop_flowering_end before insert or update of current_stage,stage_started_on,cultivation_mode,planned_end_date,stage_planned_end_on,vegetative_weeks,flowering_weeks
 on public.cultivations for each row execute function public.calculate_crop_flowering_end();

-- A lot cannot invent a full-cycle end or override the cultivation's plan.
create or replace function public.set_lot_planned_end() returns trigger language plpgsql set search_path='' as $$
declare c public.cultivations; begin
 select * into c from public.cultivations where id=new.cultivation_id;
 new.stage:=c.current_stage;
 new.timeline_started_on:=c.stage_started_on;new.timeline_end_on:=c.stage_planned_end_on;
 new.vegetative_weeks:=case when c.current_stage='vegetative' and c.cultivation_mode='cycle' then coalesce(c.vegetative_weeks,0) else 0 end;
 new.flowering_weeks:=case when c.current_stage='flowering' then coalesce(c.flowering_weeks,0) else 0 end;
 new.nutrition_profile:=case when c.current_stage='mother' or (c.current_stage='vegetative' and c.cultivation_mode='continuous') then 'mothers' when c.current_stage in('clone','rooting') then 'rooting' when c.current_stage='flowering' then 'flowering' when c.current_stage='vegetative' then 'full_cycle' else 'none' end;
 return new;end $$;

drop trigger lots_set_planned_end on public.lots;
create trigger lots_set_planned_end before insert or update of cultivation_id,stage,timeline_started_on,timeline_end_on,vegetative_weeks,flowering_weeks,nutrition_profile
 on public.lots for each row execute function public.set_lot_planned_end();

create or replace function public.sync_crop_record() returns trigger language plpgsql set search_path='' as $$
declare s uuid; r public.rooms;begin
 select * into r from public.rooms where id=new.room_id;
 if tg_op='INSERT' then
  insert into public.spaces(owner_id,workspace_id,cultivation_id,name,operational_stage) values(new.owner_id,new.workspace_id,new.id,r.name,new.current_stage) returning id into s;
  insert into public.lots(owner_id,workspace_id,cultivation_id,space_id,name,description,stage,active,timeline_started_on,timeline_end_on,show_on_calendar,nutrition_profile)
  values(new.owner_id,new.workspace_id,new.id,s,new.name,new.notes,new.current_stage,new.status='active',new.stage_started_on,new.stage_planned_end_on,new.status='active','none');
 else
  update public.lots set name=new.name,description=new.notes,stage=new.current_stage,active=new.status='active',timeline_started_on=new.stage_started_on,timeline_end_on=new.stage_planned_end_on where cultivation_id=new.id;
  update public.spaces set name=r.name,operational_stage=new.current_stage where cultivation_id=new.id;
 end if;return new;end $$;
drop trigger sync_crop_record on public.cultivations;
create trigger sync_crop_record after insert or update of room_id,name,notes,current_stage,status,start_date,stage_started_on,planned_end_date,cultivation_mode,stage_planned_end_on,vegetative_weeks,flowering_weeks
 on public.cultivations for each row execute function public.sync_crop_record();

create or replace function public.create_crop_with_groups(p_workspace_id uuid,p_crop jsonb,p_groups jsonb) returns uuid language plpgsql security invoker set search_path='' as $$
declare c uuid;l uuid;begin
 if not public.can_edit_workspace(p_workspace_id) then raise exception 'workspace_write_forbidden';end if;
 insert into public.cultivations(workspace_id,room_id,name,start_date,current_stage,stage_started_on,cultivation_mode,status,notes,planned_end_date,end_date,stage_planned_end_on,vegetative_weeks,flowering_weeks)
 values(p_workspace_id,(p_crop->>'roomId')::uuid,p_crop->>'name',(p_crop->>'startDate')::date,(p_crop->>'currentStage')::public.lot_stage,(p_crop->>'stageStartedOn')::date,p_crop->>'cultivationMode',coalesce(p_crop->>'status','planned')::public.cultivation_status,coalesce(p_crop->>'notes',''),nullif(p_crop->>'plannedEndDate','')::date,nullif(p_crop->>'endDate','')::date,nullif(p_crop->>'stagePlannedEndOn','')::date,nullif(p_crop->>'vegetativeWeeks','')::integer,nullif(p_crop->>'floweringWeeks','')::integer) returning id into c;
 if jsonb_array_length(p_groups)>0 then select id into l from public.lots where cultivation_id=c;perform public.add_crop_plant_groups(l,p_groups);end if;return c;end $$;

-- Re-anchor planned starts without losing an explicit rooting deadline.
create or replace function public.start_planned_crop(p_crop uuid) returns void language plpgsql security invoker set search_path='' as $$ declare c public.cultivations;begin
 select * into c from public.cultivations where id=p_crop for update;
 if c.id is null or c.status<>'planned' or not public.can_edit_workspace(c.workspace_id) then raise exception 'Cultivo no disponible para iniciar';end if;
 update public.cultivations set status='active',start_date=current_date,stage_started_on=current_date,
 stage_planned_end_on=case when c.stage_planned_end_on is not null then current_date+(c.stage_planned_end_on-c.stage_started_on) end where id=c.id;
 insert into public.operation_logs(workspace_id,kind,category,title,description,severity,occurred_at,metadata)
 values(c.workspace_id,'activity','stage_change','Cultivo iniciado',c.name,'info',now(),jsonb_build_object('cultivationId',c.id,'plannedStartDate',c.start_date));end $$;

-- Rebuild only projections. Stage history, plant references and notes remain intact.
update public.cultivations set stage_planned_end_on=stage_planned_end_on where status in('active','planned');
alter table public.cultivations add constraint cultivation_stage_plan_dates check(stage_planned_end_on is null or stage_planned_end_on>=stage_started_on);

-- A vegetative stage may be configured for up to 104 weeks.
alter table public.nutrition_week_progress drop constraint nutrition_week_progress_week_number_check;
alter table public.nutrition_week_progress add constraint nutrition_week_progress_week_number_check check(week_number between 0 and 104);
