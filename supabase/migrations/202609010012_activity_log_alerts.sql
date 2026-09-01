create type public.operation_log_kind as enum ('activity','incident','system');
create type public.operation_log_severity as enum ('info','warning','critical');

create table public.operation_logs(
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind public.operation_log_kind not null default 'activity',
  category text not null,
  title text not null check(length(trim(title))>0),
  description text not null default '',
  severity public.operation_log_severity not null default 'info',
  occurred_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  metadata jsonb not null default '{}'::jsonb,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index operation_logs_workspace_time_idx on public.operation_logs(workspace_id,occurred_at desc);
create index operation_logs_open_alert_idx on public.operation_logs(workspace_id,severity,resolved_at) where archived_at is null;
create trigger operation_logs_updated_at before update on public.operation_logs for each row execute function public.set_updated_at();
alter table public.operation_logs enable row level security;
alter table public.operation_logs force row level security;
revoke all on public.operation_logs from anon,authenticated;
grant select,insert,update on public.operation_logs to authenticated;
create policy operation_logs_select on public.operation_logs for select to authenticated using(public.is_workspace_member(workspace_id));
create policy operation_logs_insert on public.operation_logs for insert to authenticated with check(public.can_edit_workspace(workspace_id) and created_by=(select auth.uid()));
create policy operation_logs_update on public.operation_logs for update to authenticated using(public.can_edit_workspace(workspace_id)) with check(public.can_edit_workspace(workspace_id));

create table public.operation_alert_reads(
  log_id uuid not null references public.operation_logs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  read_at timestamptz not null default now(),
  primary key(log_id,user_id)
);
alter table public.operation_alert_reads enable row level security;
alter table public.operation_alert_reads force row level security;
revoke all on public.operation_alert_reads from anon,authenticated;
grant select,insert on public.operation_alert_reads to authenticated;
create policy operation_alert_reads_select on public.operation_alert_reads for select to authenticated using(user_id=(select auth.uid()));
create policy operation_alert_reads_insert on public.operation_alert_reads for insert to authenticated with check(user_id=(select auth.uid()));

create or replace function public.record_device_connection_event(p_workspace_id uuid,p_device_key text,p_online boolean)
returns uuid language plpgsql security definer set search_path='' as $$
declare open_id uuid; result_id uuid; device_key text=left(coalesce(nullif(trim(p_device_key),''),'wemos'),120);
begin
  if not public.can_edit_workspace(p_workspace_id) then raise exception 'workspace_write_forbidden'; end if;
  select id into open_id from public.operation_logs where workspace_id=p_workspace_id and category='device_offline' and resolved_at is null and archived_at is null and metadata->>'deviceKey'=device_key order by occurred_at desc limit 1 for update;
  if not p_online and open_id is null then
    insert into public.operation_logs(workspace_id,kind,category,title,description,severity,metadata)
    values(p_workspace_id,'system','device_offline','Posible corte de luz o desconexión','El Wemos dejó de responder. Puede ser un corte eléctrico, una caída de red o el equipo apagado.','critical',jsonb_build_object('deviceKey',device_key)) returning id into result_id;
  elsif p_online and open_id is not null then
    update public.operation_logs set resolved_at=now(),description=description||' Conexión recuperada automáticamente.' where id=open_id returning id into result_id;
  end if;
  return result_id;
end;$$;
revoke all on function public.record_device_connection_event(uuid,text,boolean) from public,anon;
grant execute on function public.record_device_connection_event(uuid,text,boolean) to authenticated;
