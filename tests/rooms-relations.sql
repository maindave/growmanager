-- Run inside a rollback transaction after the rooms migration.
do $$ declare w uuid='4d83ef2b-ba7e-4018-ba2b-bdfa8601714c'; u uuid; r uuid; c uuid; l uuid; created integer; blocked boolean; begin
 select owner_id into u from public.workspaces where id=w;
 perform set_config('request.jwt.claim.sub',u::text,true);
 if (select count(*) from public.rooms where workspace_id=w)<>2 then raise exception 'Expected two rooms'; end if;
 if not exists(select 1 from public.cultivations c join public.rooms r on r.id=c.room_id where c.id='7b746720-e243-4594-9ce0-adc439d85dbe' and r.role='vegetative') then raise exception 'Mothers relation incorrect'; end if;
 if not exists(select 1 from public.lots where id='bfd9d95c-d71b-4bb3-900e-dcb4021c8a04' and cultivation_id='a1fd48f8-9d53-44c4-8cc5-999b45a79575') then raise exception 'SOG history link incorrect'; end if;
 insert into public.rooms(workspace_id,name,role) values(w,'QA transaccional','vegetative') returning id into r;
 insert into public.cultivations(workspace_id,room_id,name,start_date,cultivation_mode,current_stage,stage_started_on) values(w,r,'QA cultivo',current_date,'continuous','mother',current_date) returning id into c;
 select id into strict l from public.lots where cultivation_id=c;
 created=public.add_crop_plants(l,3,'QA variedad');
 if created<>3 or (select count(*) from public.plants where lot_id=l)<>3 then raise exception 'Plant creation failed'; end if;
 blocked=false;
 begin insert into public.cultivations(workspace_id,room_id,name,start_date,current_stage,stage_started_on) values(w,r,'QA duplicate',current_date,'vegetative',current_date); exception when unique_violation then blocked=true; end;
 if not blocked then raise exception 'Duplicate active crop was allowed'; end if;
 blocked=false;
 begin update public.rooms set active=false where id=r; exception when raise_exception then blocked=true; end;
 if not blocked then raise exception 'Occupied room deactivation was allowed'; end if;
 update public.cultivations set status='finished',end_date=current_date where id=c;
 if (select active from public.lots where id=l) then raise exception 'Operational record not finalized'; end if;
 insert into public.cultivations(workspace_id,room_id,name,start_date,current_stage,stage_started_on) values(w,r,'QA next cycle',current_date,'vegetative',current_date);
 if (select count(*) from public.cultivations where room_id=r)<>2 then raise exception 'Room history not preserved'; end if;
 perform set_config('request.jwt.claim.sub','',true);
end $$;
