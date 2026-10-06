create or replace function public.create_crop_with_groups(p_workspace_id uuid,p_crop jsonb,p_groups jsonb) returns uuid language plpgsql security invoker set search_path='' as $$ declare c uuid;l uuid;begin
 if not public.can_edit_workspace(p_workspace_id) then raise exception 'workspace_write_forbidden';end if;
 insert into public.cultivations(workspace_id,room_id,name,start_date,current_stage,stage_started_on,cultivation_mode,status,notes,planned_end_date,end_date)
 values(p_workspace_id,(p_crop->>'roomId')::uuid,p_crop->>'name',(p_crop->>'startDate')::date,(p_crop->>'currentStage')::public.lot_stage,(p_crop->>'stageStartedOn')::date,p_crop->>'cultivationMode',coalesce(p_crop->>'status','planned')::public.cultivation_status,coalesce(p_crop->>'notes',''),nullif(p_crop->>'plannedEndDate','')::date,nullif(p_crop->>'endDate','')::date) returning id into c;
 if jsonb_array_length(p_groups)>0 then select id into l from public.lots where cultivation_id=c;perform public.add_crop_plant_groups(l,p_groups);end if;return c;
end $$;
