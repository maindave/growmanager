create or replace function public.create_cultivation_with_space(
  p_workspace_id uuid,
  p_name text,
  p_start_date date,
  p_planned_end_date date,
  p_cultivation_mode text,
  p_current_stage public.lot_stage,
  p_stage_started_on date,
  p_notes text,
  p_space_name text,
  p_space_description text default '',
  p_space_stage public.lot_stage default null
) returns jsonb
language plpgsql security invoker set search_path=''
as $$
declare
  cultivation_id uuid;
  space_id uuid;
begin
  if not public.can_edit_workspace(p_workspace_id) then raise exception 'workspace_write_forbidden'; end if;
  if nullif(trim(p_name),'') is null then raise exception 'cultivation_name_required'; end if;
  if nullif(trim(p_space_name),'') is null then raise exception 'space_name_required'; end if;
  insert into public.cultivations(workspace_id,name,start_date,planned_end_date,cultivation_mode,current_stage,stage_started_on,status,notes)
  values(p_workspace_id,trim(p_name),p_start_date,p_planned_end_date,p_cultivation_mode,p_current_stage,coalesce(p_stage_started_on,p_start_date),'active',coalesce(p_notes,''))
  returning id into cultivation_id;
  insert into public.spaces(workspace_id,cultivation_id,name,description,operational_stage,active)
  values(p_workspace_id,cultivation_id,trim(p_space_name),coalesce(p_space_description,''),coalesce(p_space_stage,p_current_stage),true)
  returning id into space_id;
  return jsonb_build_object('cultivationId',cultivation_id,'spaceId',space_id);
end;
$$;

revoke all on function public.create_cultivation_with_space(uuid,text,date,date,text,public.lot_stage,date,text,text,text,public.lot_stage) from public,anon;
grant execute on function public.create_cultivation_with_space(uuid,text,date,date,text,public.lot_stage,date,text,text,text,public.lot_stage) to authenticated;
