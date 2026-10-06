-- Preserve historical objectives/equipment alongside readings, without remote command permissions.
create table public.environment_samples (
 room_id uuid not null references public.rooms(id) on delete cascade,
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 sampled_at timestamptz not null,
 payload jsonb not null,
 primary key(room_id,sampled_at)
);
alter table public.environment_samples enable row level security;
alter table public.environment_samples force row level security;
grant select on public.environment_samples to authenticated;
create policy environment_samples_read on public.environment_samples for select to authenticated using(public.is_workspace_member(workspace_id));
alter table public.environment_events add column snapshot jsonb not null default '{}'::jsonb;
create function public.capture_environment_sample() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.environment_samples(room_id,workspace_id,sampled_at,payload)
 values(new.room_id,new.workspace_id,date_bin(interval '5 minutes',new.sampled_at,timestamptz '2000-01-01'),
 jsonb_build_object('temperature',new.payload->'temperature','humidity',new.payload->'humidity','dht',new.payload->'dht',
 'environment',new.payload->'environment'-'events'-'cloud','relays',new.payload->'relays'))
 on conflict(room_id,sampled_at) do nothing;
 return new;
end $$;
create trigger capture_environment_sample after insert or update on public.environment_status for each row execute function public.capture_environment_sample();
create function public.capture_environment_event_context() returns trigger language plpgsql security definer set search_path='' as $$
declare p jsonb; e jsonb;
begin
 select payload into p from public.environment_status where room_id=new.room_id;
 select value into e from jsonb_array_elements(coalesce(p->'environment'->'events','[]'::jsonb)) where (value->>'sequence')::bigint=new.sequence limit 1;
 new.snapshot=jsonb_build_object('event',coalesce(e,'{}'::jsonb),'relays',p->'relays');
 return new;
end $$;
create trigger capture_environment_event_context before insert on public.environment_events for each row execute function public.capture_environment_event_context();
revoke all on function public.capture_environment_sample(),public.capture_environment_event_context() from public,anon,authenticated;
