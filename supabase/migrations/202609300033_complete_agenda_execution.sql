-- Atomic execution in existing metadata/history; no new tables or policies.
create or replace function public.complete_agenda_execution(p_event_id uuid,p_execution jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare e public.agenda_events; u uuid=(select auth.uid()); l public.lots;
  at_time timestamptz; water numeric; ph_value numeric; ec_value numeric;
  execution jsonb; recipe jsonb; version_id uuid;
begin
  select * into e from public.agenda_events where id=p_event_id for update;
  if e.id is null or u is null then raise exception 'Evento no disponible'; end if;
  if not public.can_edit_workspace(e.workspace_id) and not exists(select 1 from public.agenda_event_assignees where event_id=e.id and user_id=u) then raise exception 'Sin permiso para realizar este evento'; end if;
  -- A retry after a lost response returns the existing execution without another history row.
  if e.status='completed' and e.metadata ? 'execution' then return e.id; end if;
  if e.archived_at is not null or e.status in ('completed','cancelled') or e.recurrence<>'none' then raise exception 'Este evento no admite una nueva ejecución'; end if;
  if jsonb_typeof(p_execution)<>'object' then raise exception 'Datos de ejecución inválidos'; end if;
  select * into l from public.lots where id=(p_execution->>'lotId')::uuid and workspace_id=e.workspace_id;
  if l.id is null or (e.lot_id is not null and e.lot_id<>l.id) or (e.cultivation_id is not null and e.cultivation_id<>l.cultivation_id) then raise exception 'La tanda no corresponde al evento'; end if;
  at_time=(p_execution->>'completedAt')::timestamptz;
  if at_time is null or not isfinite(at_time) or at_time>now()+interval '1 minute' then raise exception 'Fecha de realización inválida'; end if;
  water=(p_execution->>'waterLiters')::numeric; ph_value=(p_execution->>'ph')::numeric; ec_value=(p_execution->>'ec')::numeric;
  if (water is not null and (water<=0 or water>9999999)) or (ph_value is not null and (ph_value<0 or ph_value>14)) or (ec_value is not null and (ec_value<0 or ec_value>99999)) then raise exception 'Cantidades inválidas'; end if;
  version_id=nullif(p_execution->>'recipeVersionId','')::uuid;
  if version_id is not null then
    select jsonb_build_object('id',v.id,'recipeId',r.id,'name',r.name,'version',v.version) into recipe
    from public.recipe_versions v join public.recipes r on r.id=v.recipe_id
    where v.id=version_id and r.workspace_id=e.workspace_id;
    if recipe is null then raise exception 'Receta no disponible en este proyecto'; end if;
  end if;
  execution=jsonb_build_object('completedAt',at_time,'lotId',l.id,'waterLiters',water,'ph',ph_value,'ec',ec_value,'recipe',recipe,'notes',left(coalesce(p_execution->>'notes',''),1200),'actorId',u,'waterBasis','lot_total');
  update public.agenda_events set metadata=metadata||jsonb_build_object('execution',execution),lot_id=l.id,cultivation_id=l.cultivation_id where id=e.id;
  perform public.set_agenda_event_status(e.id,'completed');
  return e.id;
end; $$;
revoke all on function public.complete_agenda_execution(uuid,jsonb) from public,anon;
grant execute on function public.complete_agenda_execution(uuid,jsonb) to authenticated;
