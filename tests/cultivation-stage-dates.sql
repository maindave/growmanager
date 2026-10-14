-- Run inside a transaction and roll it back. Creates only a temporary QA crop.
do $$
declare
 w uuid; u uuid; room uuid; crop uuid; n integer; history_id bigint;
begin
 select r.workspace_id,w.owner_id,r.id into w,u,room
 from public.rooms r join public.workspaces w on w.id=r.workspace_id
 order by r.created_at limit 1;
 if room is null then raise exception 'Test requires a workspace with a room';end if;
 perform set_config('request.jwt.claim.sub',u::text,true);
 insert into public.cultivations(workspace_id,owner_id,room_id,name,start_date,current_stage,stage_started_on,status)
 values(w,u,room,'QA corrección de fechas '||gen_random_uuid(),'2026-10-15','clone','2026-11-05','planned') returning id into crop;
 insert into public.cultivation_stage_history(workspace_id,cultivation_id,stage,started_on)
 values(w,crop,'clone','2026-11-05') returning id into history_id;

 update public.cultivations set start_date='2026-10-14',stage_started_on='2026-10-15' where id=crop;
 if (select started_on from public.cultivation_stage_history where id=history_id)<>'2026-10-15'::date then raise exception 'Date correction did not update current entry';end if;
 if (select count(*) from public.cultivation_stage_history where cultivation_id=crop)<>1 then raise exception 'Same-stage edit created a phantom stage';end if;
 update public.cultivations set stage_started_on='2026-10-20' where id=crop;
 update public.cultivations set current_stage='rooting' where id=crop;
 if (select stage from public.cultivation_stage_history where id=history_id)<>'rooting'::public.lot_stage then raise exception 'Same-day correction failed';end if;
 if (select count(*) from public.cultivation_stage_history where cultivation_id=crop)<>1 then raise exception 'Same-day change duplicated history';end if;
 update public.cultivations set current_stage='vegetative',stage_started_on='2026-10-25' where id=crop;
 if (select ended_on from public.cultivation_stage_history where id=history_id)<>'2026-10-24'::date then raise exception 'Stage transition end is wrong';end if;
 update public.cultivations set stage_started_on='2026-10-23' where id=crop;
 if (select ended_on from public.cultivation_stage_history where id=history_id)<>'2026-10-22'::date then raise exception 'Correction did not adjust previous end';end if;
 begin
  update public.cultivations set stage_started_on='2026-10-20' where id=crop;
  raise exception 'Overlapping correction was accepted';
 exception when raise_exception then if sqlerrm<>'stage_date_before_previous_stage' then raise;end if;end;
 begin
  update public.cultivations set current_stage='clone',stage_started_on='2026-10-22' where id=crop;
  raise exception 'Backward transition was accepted';
 exception when raise_exception then if sqlerrm<>'stage_date_before_previous_stage' then raise;end if;end;
 begin
  update public.cultivations set stage_started_on='2026-10-13' where id=crop;
  raise exception 'Stage before cultivation start was accepted';
 exception when raise_exception then if sqlerrm<>'stage_date_before_cultivation_start' then raise;end if;end;
 select count(*) into n from public.cultivation_stage_history where cultivation_id=crop and ended_on is null;
 if n<>1 then raise exception 'Expected exactly one current stage';end if;

 -- Legacy crops without an initial history row still preserve the initial stage.
 delete from public.cultivation_stage_history where cultivation_id=crop;
 update public.cultivations set current_stage='flowering',stage_started_on='2026-10-30' where id=crop;
 if (select count(*) from public.cultivation_stage_history where cultivation_id=crop)<>2 then raise exception 'Legacy initial stage was lost';end if;
end;
$$;
