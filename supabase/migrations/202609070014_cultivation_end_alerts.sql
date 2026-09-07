create or replace function public.sync_cultivation_end_alerts(p_workspace_id uuid)
returns integer language plpgsql security definer set search_path='' as $$
declare created_count integer=0;
begin
  if not public.is_workspace_member(p_workspace_id) then raise exception 'workspace_access_denied'; end if;

  update public.operation_logs log
  set resolved_at=now(),description=log.description||' El ciclo ya no se encuentra dentro de la ventana de finalización.'
  where log.workspace_id=p_workspace_id and log.category='cultivation_end' and log.resolved_at is null and log.archived_at is null
    and not exists(
      select 1 from public.cultivations cultivation
      where cultivation.id=(log.metadata->>'cultivationId')::uuid and cultivation.workspace_id=p_workspace_id
        and cultivation.status='active' and cultivation.cultivation_mode='cycle'
        and cultivation.planned_end_date between current_date and current_date+14
    );

  insert into public.operation_logs(workspace_id,kind,category,title,description,severity,metadata,created_by)
  select cultivation.workspace_id,'system','cultivation_end','Ciclo próximo a finalizar',
    cultivation.name||' tiene final estimado para el '||to_char(cultivation.planned_end_date,'DD/MM/YYYY')||'.',
    'warning',jsonb_build_object('cultivationId',cultivation.id,'plannedEndDate',cultivation.planned_end_date),auth.uid()
  from public.cultivations cultivation
  where cultivation.workspace_id=p_workspace_id and cultivation.status='active' and cultivation.cultivation_mode='cycle'
    and cultivation.planned_end_date between current_date and current_date+14
    and not exists(
      select 1 from public.operation_logs log
      where log.workspace_id=p_workspace_id and log.category='cultivation_end' and log.resolved_at is null and log.archived_at is null
        and log.metadata->>'cultivationId'=cultivation.id::text
    );
  get diagnostics created_count=row_count;
  return created_count;
end;$$;

revoke all on function public.sync_cultivation_end_alerts(uuid) from public,anon;
grant execute on function public.sync_cultivation_end_alerts(uuid) to authenticated;
