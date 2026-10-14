-- Execute only after approval, inside a transaction that is rolled back.
do $$ declare w uuid;u uuid;r uuid;c uuid;l uuid;c2 uuid;begin
 select room.workspace_id,workspace.owner_id,room.id into w,u,r from public.rooms room join public.workspaces workspace on workspace.id=room.workspace_id order by room.created_at limit 1;
 perform set_config('request.jwt.claim.sub',u::text,true);
 c=public.create_crop_with_groups(w,jsonb_build_object('roomId',r,'name','QA etapas '||gen_random_uuid(),'startDate','2026-10-14','currentStage','clone','stageStartedOn','2026-10-15','cultivationMode','cycle','status','active','stagePlannedEndOn','2026-10-24'),'[]'::jsonb);
 select id into l from public.lots where cultivation_id=c;
 if not exists(select 1 from public.cultivations where id=c and stage_planned_end_on='2026-10-24' and planned_end_date is null and vegetative_weeks is null and flowering_weeks is null) then raise exception 'Clone plan leaked future phases';end if;
 if not exists(select 1 from public.lots where id=l and nutrition_profile='rooting' and vegetative_weeks=0 and flowering_weeks=0 and timeline_end_on='2026-10-24') then raise exception 'Clone projection incorrect';end if;
 update public.lots set vegetative_weeks=10,flowering_weeks=20,timeline_end_on='2028-01-01' where id=l;
 if not exists(select 1 from public.lots where id=l and vegetative_weeks=0 and flowering_weeks=0 and timeline_end_on='2026-10-24') then raise exception 'Agenda could override crop plan';end if;
 update public.cultivations set stage_started_on='2026-10-14' where id=c;
 if (select stage_planned_end_on from public.cultivations where id=c)<>'2026-10-24'::date then raise exception 'Correction shifted explicit end';end if;
 update public.cultivations set current_stage='rooting',stage_started_on='2026-10-25',stage_planned_end_on='2026-10-30' where id=c;
 update public.cultivations set current_stage='vegetative',stage_started_on='2026-10-31',vegetative_weeks=3 where id=c;
 if not exists(select 1 from public.cultivations where id=c and stage_planned_end_on='2026-11-21' and planned_end_date is null) then raise exception 'Vegetative calculation incorrect';end if;
 if not exists(select 1 from public.lots where id=l and vegetative_weeks=3 and flowering_weeks=0) then raise exception 'Vegetative includes future flora';end if;
 update public.cultivations set current_stage='flowering',stage_started_on='2026-11-22',flowering_weeks=8 where id=c;
 if not exists(select 1 from public.cultivations where id=c and stage_planned_end_on='2027-01-17' and planned_end_date='2027-01-17') then raise exception 'Flowering calculation incorrect';end if;
 if not exists(select 1 from public.lots where id=l and vegetative_weeks=0 and flowering_weeks=8) then raise exception 'Flowering includes vegetative';end if;
 if (select start_date from public.cultivations where id=c)<>'2026-10-14'::date then raise exception 'Stage change moved crop start';end if;
 begin
  update public.cultivations set stage_planned_end_on='2026-01-01',current_stage='rooting',stage_started_on='2027-01-18' where id=c;
  raise exception 'Invalid end accepted';
 exception when raise_exception then if sqlerrm<>'stage_end_before_stage_start' then raise;end if;end;
 c2=public.create_crop_with_groups(w,jsonb_build_object('roomId',r,'name','QA independiente '||gen_random_uuid(),'startDate','2026-10-14','currentStage','clone','stageStartedOn','2026-10-14','cultivationMode','cycle','status','planned','stagePlannedEndOn','2026-10-24'),'[]'::jsonb);
 perform public.start_planned_crop(c2);
 if not exists(select 1 from public.cultivations where id=c2 and status='active' and current_stage='clone' and stage_planned_end_on=current_date+10) then raise exception 'Planned start lost stage deadline';end if;
 update public.cultivations set current_stage='mother',cultivation_mode='continuous' where id=c2;
 if not exists(select 1 from public.cultivations where id=c2 and stage_planned_end_on is null and planned_end_date is null) then raise exception 'Continuous stage has end';end if;
 if not exists(select 1 from public.cultivations where id=c and current_stage='flowering' and flowering_weeks=8 and stage_planned_end_on='2027-01-17') then raise exception 'One crop changed another';end if;
end $$;
