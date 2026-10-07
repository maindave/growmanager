-- Runs on the server even when no app is open. Loss of telemetry is not proof of a power cut.
create extension if not exists pg_cron;
create or replace function public.monitor_environment_safety()
returns void language plpgsql security definer set search_path='' as $$
declare d record; incident record; offline boolean; protection boolean; open_id uuid;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('environment_safety_monitor',0));
 for d in select v.room_id,v.workspace_id,v.device_key,v.updated_at,s.received_at,s.payload,r.name from public.environment_devices v left join public.environment_status s on s.room_id=v.room_id and s.device_key=v.device_key join public.rooms r on r.id=v.room_id loop
  offline=coalesce(d.received_at,d.updated_at)<now()-interval '5 minutes';
  protection=not offline and coalesce((d.payload#>>'{environment,alarms}')::integer,0)&(2|16|32)<>0;
  for incident in select 'telemetry_missing'::text category,offline active,'Sin telemetría del Wemos'::text title,'No se recibieron datos durante cinco minutos. No confirma un corte eléctrico. La protección local debe continuar en el Wemos.'::text description,'warning'::public.operation_log_severity severity union all select 'local_protection',protection,'Protección ambiental activada','El Wemos informó una condición crítica o una salida detenida por protección. Revisá los equipos y el diagnóstico antes de rearmar.','critical'::public.operation_log_severity loop
   select id into open_id from public.operation_logs where workspace_id=d.workspace_id and category=incident.category and metadata->>'roomId'=d.room_id::text and resolved_at is null and archived_at is null order by occurred_at desc limit 1 for update;
   if incident.active and open_id is null then
    insert into public.operation_logs(workspace_id,kind,category,title,description,severity,metadata) values(d.workspace_id,'system',incident.category,incident.title,incident.description,incident.severity,jsonb_build_object('roomId',d.room_id,'roomName',d.name,'deviceKey',d.device_key,'source','server_safety_monitor'));
   elsif not incident.active and open_id is not null and (incident.category='telemetry_missing' or not offline) then
    update public.operation_logs set resolved_at=now(),description=description||' Condición normal informada nuevamente.' where id=open_id;
   end if;
  end loop;
 end loop;
end $$;
revoke all on function public.monitor_environment_safety() from public,anon,authenticated;
select cron.schedule('grow-environment-safety','* * * * *','select public.monitor_environment_safety()');
