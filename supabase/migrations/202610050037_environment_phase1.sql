-- Phase 1: room-scoped telemetry. No remote actuator commands.
create table public.environment_devices (
 room_id uuid primary key references public.rooms(id) on delete cascade,
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 device_key text not null check(length(device_key) between 1 and 80),
 token_hash text not null,
 updated_at timestamptz not null default now()
);
create table public.environment_status (
 room_id uuid primary key references public.rooms(id) on delete cascade,
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 device_key text not null,
 sampled_at timestamptz not null,
 received_at timestamptz not null default now(),
 payload jsonb not null check(jsonb_typeof(payload)='object')
);
create table public.environment_events (
 id bigint generated always as identity primary key,
 room_id uuid not null references public.rooms(id) on delete cascade,
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 boot_id bigint not null,
 sequence bigint not null,
 occurred_at timestamptz not null,
 alarms integer not null check(alarms between 0 and 31),
 outputs integer not null check(outputs between 0 and 15),
 unique(room_id,boot_id,sequence)
);
create index environment_events_room_time on public.environment_events(room_id,occurred_at desc);
alter table public.environment_devices enable row level security;
alter table public.environment_devices force row level security;
alter table public.environment_status enable row level security;
alter table public.environment_status force row level security;
alter table public.environment_events enable row level security;
alter table public.environment_events force row level security;
revoke all on public.environment_devices,public.environment_status,public.environment_events from anon,authenticated;
grant select on public.environment_status,public.environment_events to authenticated;
create policy environment_status_member on public.environment_status for select to authenticated using(public.is_workspace_member(workspace_id));
create policy environment_events_member on public.environment_events for select to authenticated using(public.is_workspace_member(workspace_id));

create function public.provision_environment_device(p_room_id uuid,p_device_key text)
returns text language plpgsql security definer set search_path=public,extensions as $$
declare w uuid; token text;
begin
 select workspace_id into w from public.rooms where id=p_room_id;
 if w is null or not public.can_edit_workspace(w) then raise exception 'room_access_denied' using errcode='42501'; end if;
 if length(p_device_key) not between 1 and 80 then raise exception 'invalid_device_key'; end if;
 token=encode(gen_random_bytes(32),'hex');
 insert into public.environment_devices(room_id,workspace_id,device_key,token_hash)
 values(p_room_id,w,p_device_key,encode(digest(token,'sha256'),'hex'))
 on conflict(room_id) do update set device_key=excluded.device_key,token_hash=excluded.token_hash,updated_at=now();
 return token;
end $$;
revoke all on function public.provision_environment_device(uuid,text) from public,anon;
grant execute on function public.provision_environment_device(uuid,text) to authenticated;

create function public.ingest_environment(p_room_id uuid,p_token text,p_sampled_at timestamptz,p_payload jsonb)
returns void language plpgsql security definer set search_path=public,extensions as $$
declare d public.environment_devices%rowtype; e jsonb; uptime_ms bigint;
begin
 select * into d from public.environment_devices where room_id=p_room_id;
 if d.room_id is null or p_token is null or length(p_token)<>64 or d.token_hash is distinct from encode(digest(p_token,'sha256'),'hex') then raise exception 'invalid_device_token' using errcode='42501'; end if;
 if p_sampled_at is null or p_sampled_at>now()+interval '2 minutes' or p_sampled_at<now()-interval '7 days' then raise exception 'invalid_sample_time'; end if;
 if p_payload is null or jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>16384 or p_payload->'environment'->>'roomId' is distinct from p_room_id::text or jsonb_typeof(p_payload->'relays') is distinct from 'array' then raise exception 'invalid_telemetry'; end if;
 uptime_ms=coalesce((p_payload->'environment'->>'uptimeMs')::bigint,((p_payload->>'uptime')::bigint+1)*1000);
 if uptime_ms is null or uptime_ms<0 or uptime_ms>4294967295 then raise exception 'invalid_uptime'; end if;
 insert into public.environment_status(room_id,workspace_id,device_key,sampled_at,payload)
 values(p_room_id,d.workspace_id,d.device_key,p_sampled_at,p_payload)
 on conflict(room_id) do update set sampled_at=excluded.sampled_at,received_at=now(),payload=excluded.payload,device_key=excluded.device_key
 where excluded.sampled_at>=environment_status.sampled_at;
 for e in select value from jsonb_array_elements(coalesce(p_payload->'environment'->'events','[]'::jsonb)) loop
  insert into public.environment_events(room_id,workspace_id,boot_id,sequence,occurred_at,alarms,outputs)
  values(p_room_id,d.workspace_id,(p_payload->'environment'->>'bootId')::bigint,(e->>'sequence')::bigint,
    p_sampled_at-make_interval(secs=>((uptime_ms-(e->>'uptimeMs')::bigint+4294967296)%4294967296)/1000.0),
    (e->>'alarms')::integer,(e->>'outputs')::integer)
  on conflict(room_id,boot_id,sequence) do nothing;
 end loop;
 if p_payload->'dht'->>'fresh'='true' and (p_payload->>'temperature')::numeric between -20 and 80 and (p_payload->>'humidity')::numeric>0 and (p_payload->>'humidity')::numeric<=100 then
  insert into public.environment_readings(workspace_id,device_key,sampled_at,temperature,humidity)
  values(d.workspace_id,d.device_key,date_bin(interval '5 minutes',p_sampled_at,timestamptz '2000-01-01'),(p_payload->>'temperature')::numeric,(p_payload->>'humidity')::numeric)
  on conflict(workspace_id,device_key,sampled_at) do nothing;
 end if;
end $$;
revoke all on function public.ingest_environment(uuid,text,timestamptz,jsonb) from public;
grant execute on function public.ingest_environment(uuid,text,timestamptz,jsonb) to anon,authenticated;


-- Autonomous Wemos publisher: bounded epoch readings; token has telemetry-only scope.
create function public.ingest_environment_device(p_room_id uuid,p_token text,p_sampled_at bigint,p_payload jsonb)
returns void language plpgsql security definer set search_path=public,extensions as $$
declare d public.environment_devices%rowtype; r jsonb; sample_at timestamptz;
begin
 if p_sampled_at is null or p_sampled_at<1700000000 or p_sampled_at>4102444800 then raise exception 'invalid_sample_time'; end if;
 -- Auth, room binding and primary snapshot validation happen before any history write.
 perform public.ingest_environment(p_room_id,p_token,to_timestamp(p_sampled_at),p_payload);
 select * into d from public.environment_devices where room_id=p_room_id;
 if jsonb_typeof(coalesce(p_payload->'pendingReadings','[]'::jsonb)) is distinct from 'array' then raise exception 'invalid_backlog'; end if;
 if jsonb_array_length(coalesce(p_payload->'pendingReadings','[]'::jsonb))>32 then raise exception 'invalid_backlog'; end if;
 for r in select value from jsonb_array_elements(coalesce(p_payload->'pendingReadings','[]'::jsonb)) loop
  if jsonb_typeof(r) is distinct from 'object' or r->>'epoch' is null or r->>'temperature' is null or r->>'humidity' is null then raise exception 'invalid_reading'; end if;
  sample_at=to_timestamp((r->>'epoch')::bigint);
  if sample_at>now()+interval '2 minutes' or sample_at<now()-interval '7 days' or
     not ((r->>'temperature')::numeric between -20 and 80) or
     not ((r->>'humidity')::numeric>0 and (r->>'humidity')::numeric<=100) then raise exception 'invalid_reading'; end if;
  insert into public.environment_readings(workspace_id,device_key,sampled_at,temperature,humidity)
  values(d.workspace_id,d.device_key,date_bin(interval '5 minutes',sample_at,timestamptz '2000-01-01'),(r->>'temperature')::numeric,(r->>'humidity')::numeric)
  on conflict(workspace_id,device_key,sampled_at) do nothing;
 end loop;
end $$;
revoke all on function public.ingest_environment_device(uuid,text,bigint,jsonb) from public;
grant execute on function public.ingest_environment_device(uuid,text,bigint,jsonb) to anon,authenticated;
