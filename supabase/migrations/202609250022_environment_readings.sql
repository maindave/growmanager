create table public.environment_readings(
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  device_key text not null default 'primary-wemos',
  sampled_at timestamptz not null,
  temperature numeric(5,2) not null,
  humidity numeric(5,2) not null,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique(workspace_id,device_key,sampled_at),
  check(temperature between -20 and 80),
  check(humidity between 0 and 100),
  check(not(temperature=0 and humidity=0))
);

create index environment_readings_workspace_time_idx
on public.environment_readings(workspace_id,sampled_at desc);

alter table public.environment_readings enable row level security;
alter table public.environment_readings force row level security;
revoke all on public.environment_readings from anon,authenticated;
grant select,insert,update on public.environment_readings to authenticated;
grant usage,select on sequence public.environment_readings_id_seq to authenticated;

create policy environment_readings_select on public.environment_readings
for select to authenticated using(public.is_workspace_member(workspace_id));

create policy environment_readings_insert on public.environment_readings
for insert to authenticated with check(public.is_workspace_member(workspace_id));

create policy environment_readings_update on public.environment_readings
for update to authenticated using(public.is_workspace_member(workspace_id))
with check(public.is_workspace_member(workspace_id));
