-- A correction to the current stage date edits its existing history entry.
-- Only an actual stage change starts a new entry. Keep closed stages ordered.
create or replace function public.track_cultivation_stage()
returns trigger language plpgsql security definer set search_path='' as $$
declare
 current_history_id bigint;
 previous_history_id bigint;
 previous_started_on date;
begin
 if new.stage_started_on < new.start_date then
  raise exception 'stage_date_before_cultivation_start';
 end if;
 if new.current_stage is not distinct from old.current_stage
    and new.stage_started_on is not distinct from old.stage_started_on then
  return new;
 end if;

 select h.id into current_history_id
 from public.cultivation_stage_history h
 where h.cultivation_id=new.id and h.ended_on is null
 order by h.started_on desc,h.id desc limit 1 for update;

 if new.current_stage is not distinct from old.current_stage then
  select h.id,h.started_on into previous_history_id,previous_started_on
  from public.cultivation_stage_history h
  where h.cultivation_id=new.id and h.ended_on is not null
  order by h.started_on desc,h.id desc limit 1 for update;
  if previous_history_id is not null and new.stage_started_on<=previous_started_on then
   raise exception 'stage_date_before_previous_stage';
  end if;
  if previous_history_id is not null then
   update public.cultivation_stage_history set ended_on=new.stage_started_on-1
   where id=previous_history_id;
  end if;
  if current_history_id is null then
   insert into public.cultivation_stage_history(workspace_id,cultivation_id,stage,started_on,changed_by)
   values(new.workspace_id,new.id,new.current_stage,new.stage_started_on,(select auth.uid()));
  else
   update public.cultivation_stage_history
   set started_on=new.stage_started_on,changed_by=(select auth.uid())
   where id=current_history_id;
  end if;
 elsif new.stage_started_on<old.stage_started_on then
  raise exception 'stage_date_before_previous_stage';
 elsif new.stage_started_on=old.stage_started_on then
  -- Same-day stage correction: avoid an impossible negative-duration entry.
  if current_history_id is null then
   insert into public.cultivation_stage_history(workspace_id,cultivation_id,stage,started_on,changed_by)
   values(new.workspace_id,new.id,new.current_stage,new.stage_started_on,(select auth.uid()));
  else
   update public.cultivation_stage_history
   set stage=new.current_stage,changed_by=(select auth.uid()) where id=current_history_id;
  end if;
 else
  if current_history_id is null then
   -- Older creations may have no initial history row; preserve their known stage.
   insert into public.cultivation_stage_history(workspace_id,cultivation_id,stage,started_on,ended_on,changed_by)
   values(old.workspace_id,old.id,old.current_stage,old.stage_started_on,new.stage_started_on-1,(select auth.uid()));
  else
   update public.cultivation_stage_history set ended_on=new.stage_started_on-1
   where id=current_history_id;
  end if;
  insert into public.cultivation_stage_history(workspace_id,cultivation_id,stage,started_on,changed_by)
  values(new.workspace_id,new.id,new.current_stage,new.stage_started_on,(select auth.uid()));
 end if;
 return new;
end;
$$;

drop trigger cultivations_track_stage on public.cultivations;
create trigger cultivations_track_stage
 after update of current_stage,stage_started_on,start_date on public.cultivations
 for each row execute function public.track_cultivation_stage();
revoke execute on function public.track_cultivation_stage() from public,anon,authenticated;
