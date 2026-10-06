create or replace function public.record_device_connection_event(p_workspace_id uuid,p_device_key text,p_online boolean)
returns uuid language plpgsql security definer set search_path='' as $$
declare open_id uuid; result_id uuid; v_device_key text=left(coalesce(nullif(trim(p_device_key),''),'wemos'),120); communicating boolean;
begin
 if not public.can_edit_workspace(p_workspace_id) then raise exception 'workspace_write_forbidden'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_workspace_id::text||v_device_key,0));
 communicating=p_online or exists(select 1 from public.environment_status s where s.workspace_id=p_workspace_id and s.device_key=v_device_key and s.received_at>now()-interval '2 minutes');
 select id into open_id from public.operation_logs where workspace_id=p_workspace_id and category='device_offline' and resolved_at is null and archived_at is null and metadata->>'deviceKey'=v_device_key order by occurred_at desc limit 1 for update;
 if not communicating and open_id is null then
 insert into public.operation_logs(workspace_id,kind,category,title,description,severity,metadata)
 values(p_workspace_id,'system','device_offline','Pérdida de comunicación con el Wemos','La app no recibió respuesta local durante al menos un minuto. No confirma un corte eléctrico.','warning',jsonb_build_object('deviceKey',v_device_key,'source','connection_monitor','minimumObservedSeconds',60)) returning id into result_id;
 elsif communicating and open_id is not null then
 update public.operation_logs set resolved_at=now(),description=description||' Comunicación recuperada.' where id=open_id returning id into result_id;
 end if;
 return result_id;
end $$;
