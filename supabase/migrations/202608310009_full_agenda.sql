-- General collaborative agenda. Legacy irrigation rows are preserved and imported once.
create type public.agenda_event_status as enum ('pending','accepted','in_progress','completed','cancelled');
create type public.agenda_event_priority as enum ('low','normal','high','urgent');
create type public.agenda_event_recurrence as enum ('none','daily','weekly','monthly');
create type public.assignment_status as enum ('pending','accepted','completed');

create table public.agenda_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  cultivation_id uuid references public.cultivations(id) on delete set null,
  lot_id uuid references public.lots(id) on delete set null,
  legacy_irrigation_id uuid unique references public.irrigation_events(id) on delete set null,
  title text not null check (length(trim(title)) between 1 and 100),
  event_type text not null check (event_type in ('irrigation','transplant','cuttings','pruning','fertilization','pests','fungus','lighting','cleaning','harvest','maintenance','other')),
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  description text not null default '',
  priority public.agenda_event_priority not null default 'normal',
  status public.agenda_event_status not null default 'pending',
  recurrence public.agenda_event_recurrence not null default 'none',
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  archived_at timestamptz,
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.agenda_event_assignees (
  event_id uuid not null references public.agenda_events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status public.assignment_status not null default 'pending',
  assigned_at timestamptz not null default now(),
  responded_at timestamptz,
  primary key(event_id,user_id)
);

create table public.agenda_event_participants (
  event_id uuid not null references public.agenda_events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key(event_id,user_id)
);

create table public.agenda_event_history (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.agenda_events(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  action text not null,
  actor_id uuid not null references auth.users(id),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.agenda_notifications (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  event_id uuid references public.agenda_events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null default '',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- Backend-ready storage for a later Web Push/native push sender.
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  subscription jsonb not null check (jsonb_typeof(subscription)='object'),
  platform text not null default 'web',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,endpoint)
);

create index agenda_events_workspace_start_idx on public.agenda_events(workspace_id,starts_at);
create index agenda_assignees_user_idx on public.agenda_event_assignees(user_id,event_id);
create index agenda_history_event_idx on public.agenda_event_history(event_id,created_at desc);
create index agenda_notifications_user_idx on public.agenda_notifications(user_id,read_at,created_at desc);
create trigger agenda_events_updated_at before update on public.agenda_events for each row execute function public.set_updated_at();

alter table public.agenda_events enable row level security;
alter table public.agenda_event_assignees enable row level security;
alter table public.agenda_event_participants enable row level security;
alter table public.agenda_event_history enable row level security;
alter table public.agenda_notifications enable row level security;
alter table public.push_subscriptions enable row level security;
revoke all on public.agenda_events,public.agenda_event_assignees,public.agenda_event_participants,public.agenda_event_history,public.agenda_notifications,public.push_subscriptions from anon,authenticated;
grant select on public.agenda_events,public.agenda_event_assignees,public.agenda_event_participants,public.agenda_event_history to authenticated;
grant select on public.agenda_notifications to authenticated;
grant select,insert,update,delete on public.push_subscriptions to authenticated;

create policy agenda_events_select on public.agenda_events for select to authenticated using (public.is_workspace_member(workspace_id));
create policy agenda_assignees_select on public.agenda_event_assignees for select to authenticated using (exists(select 1 from public.agenda_events e where e.id=event_id and public.is_workspace_member(e.workspace_id)));
create policy agenda_participants_select on public.agenda_event_participants for select to authenticated using (exists(select 1 from public.agenda_events e where e.id=event_id and public.is_workspace_member(e.workspace_id)));
create policy agenda_history_select on public.agenda_event_history for select to authenticated using (public.is_workspace_member(workspace_id));
create policy agenda_notifications_select on public.agenda_notifications for select to authenticated using (user_id=(select auth.uid()) and public.is_workspace_member(workspace_id));
create policy push_subscriptions_own on public.push_subscriptions for all to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));

insert into public.agenda_events(workspace_id,cultivation_id,lot_id,legacy_irrigation_id,title,event_type,starts_at,ends_at,description,priority,status,metadata,archived_at,created_by,updated_by,created_at,updated_at)
select workspace_id,cultivation_id,lot_id,id,'Riego','irrigation',scheduled_at,scheduled_at+interval '1 hour',notes,'normal',case when status='completed' then 'completed'::public.agenda_event_status else 'pending'::public.agenda_event_status end,
  jsonb_build_object('waterLiters',water_liters,'ph',ph,'ec',ec,'supplies',supplies,'legacy',true),null,created_by,created_by,created_at,updated_at
from public.irrigation_events on conflict(legacy_irrigation_id) do nothing;

create or replace function public.save_agenda_event(
  p_workspace_id uuid,p_event_id uuid,p_title text,p_event_type text,p_starts_at timestamptz,p_ends_at timestamptz,
  p_cultivation_id uuid,p_lot_id uuid,p_description text,p_priority public.agenda_event_priority,
  p_status public.agenda_event_status,p_recurrence public.agenda_event_recurrence,p_assignees uuid[],p_participants uuid[]
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_user uuid=(select auth.uid()); v_old_assignees uuid[]; v_new_assignees uuid[]=coalesce(p_assignees,'{}'); v_participants uuid[]=coalesce(p_participants,'{}');
begin
  if not public.can_edit_workspace(p_workspace_id) then raise exception 'workspace_write_forbidden'; end if;
  if p_ends_at<=p_starts_at then raise exception 'agenda_invalid_dates'; end if;
  if p_event_type not in ('irrigation','transplant','cuttings','pruning','fertilization','pests','fungus','lighting','cleaning','harvest','maintenance','other') then raise exception 'agenda_invalid_type'; end if;
  if exists(select 1 from unnest(v_new_assignees||v_participants) u where not exists(select 1 from public.workspace_members m where m.workspace_id=p_workspace_id and m.user_id=u)) then raise exception 'agenda_person_not_member'; end if;
  if p_event_id is null then
    insert into public.agenda_events(workspace_id,cultivation_id,lot_id,title,event_type,starts_at,ends_at,description,priority,status,recurrence,created_by,updated_by)
    values(p_workspace_id,p_cultivation_id,p_lot_id,trim(p_title),p_event_type,p_starts_at,p_ends_at,coalesce(p_description,''),p_priority,p_status,p_recurrence,v_user,v_user) returning id into v_id;
    v_old_assignees='{}';
    insert into public.agenda_event_history(event_id,workspace_id,action,actor_id) values(v_id,p_workspace_id,'created',v_user);
  else
    select id into v_id from public.agenda_events where id=p_event_id and workspace_id=p_workspace_id for update;
    if v_id is null then raise exception 'agenda_event_not_found'; end if;
    select coalesce(array_agg(user_id),'{}') into v_old_assignees from public.agenda_event_assignees where event_id=v_id;
    update public.agenda_events set cultivation_id=p_cultivation_id,lot_id=p_lot_id,title=trim(p_title),event_type=p_event_type,starts_at=p_starts_at,ends_at=p_ends_at,description=coalesce(p_description,''),priority=p_priority,status=p_status,recurrence=p_recurrence,updated_by=v_user where id=v_id;
    insert into public.agenda_event_history(event_id,workspace_id,action,actor_id) values(v_id,p_workspace_id,'updated',v_user);
  end if;
  delete from public.agenda_event_assignees where event_id=v_id and not(user_id=any(v_new_assignees));
  insert into public.agenda_event_assignees(event_id,user_id) select v_id,u from unnest(v_new_assignees) u on conflict(event_id,user_id) do nothing;
  delete from public.agenda_event_participants where event_id=v_id;
  insert into public.agenda_event_participants(event_id,user_id) select v_id,u from unnest(v_participants) u on conflict do nothing;
  insert into public.agenda_notifications(workspace_id,event_id,user_id,kind,title,body)
    select p_workspace_id,v_id,u,'assigned','Nueva tarea asignada',trim(p_title) from unnest(v_new_assignees) u where not(u=any(coalesce(v_old_assignees,'{}'))) and u<>v_user;
  insert into public.agenda_notifications(workspace_id,event_id,user_id,kind,title,body)
    select p_workspace_id,v_id,u,'unassigned','Asignación retirada',trim(p_title) from unnest(coalesce(v_old_assignees,'{}')) u where not(u=any(v_new_assignees)) and u<>v_user;
  insert into public.agenda_notifications(workspace_id,event_id,user_id,kind,title,body)
    select distinct p_workspace_id,v_id,u,case when p_event_id is null then 'participant_added' else 'event_changed' end,case when p_event_id is null then 'Te agregaron a un evento' else 'Evento actualizado' end,trim(p_title)
    from unnest(v_new_assignees||v_participants) u where u<>v_user and (p_event_id is not null or not(u=any(v_new_assignees)));
  if v_old_assignees is distinct from v_new_assignees then insert into public.agenda_event_history(event_id,workspace_id,action,actor_id,details) values(v_id,p_workspace_id,'reassigned',v_user,jsonb_build_object('assignees',v_new_assignees)); end if;
  return v_id;
end;
$$;

create or replace function public.set_agenda_event_status(p_event_id uuid,p_status public.agenda_event_status)
returns void language plpgsql security definer set search_path='' as $$
declare v_event public.agenda_events; v_user uuid=(select auth.uid());
begin
  select * into v_event from public.agenda_events where id=p_event_id for update;
  if v_event.id is null then raise exception 'agenda_event_not_found'; end if;
  if not public.can_edit_workspace(v_event.workspace_id) and not exists(select 1 from public.agenda_event_assignees where event_id=p_event_id and user_id=v_user) then raise exception 'agenda_status_forbidden'; end if;
  update public.agenda_events set status=p_status,updated_by=v_user where id=p_event_id;
  update public.agenda_event_assignees set status=case when p_status='completed' then 'completed'::public.assignment_status when p_status in ('accepted','in_progress') then 'accepted'::public.assignment_status else status end,responded_at=case when p_status in ('accepted','in_progress','completed') then now() else responded_at end where event_id=p_event_id and user_id=v_user;
  insert into public.agenda_event_history(event_id,workspace_id,action,actor_id,details) values(p_event_id,v_event.workspace_id,'status_changed',v_user,jsonb_build_object('status',p_status));
  insert into public.agenda_notifications(workspace_id,event_id,user_id,kind,title,body)
    select distinct v_event.workspace_id,p_event_id,u,'status_changed','Estado del evento actualizado',v_event.title from (select user_id u from public.agenda_event_assignees where event_id=p_event_id union select user_id from public.agenda_event_participants where event_id=p_event_id) people where u<>v_user;
end;
$$;

create or replace function public.archive_agenda_event(p_event_id uuid,p_archived boolean)
returns void language plpgsql security definer set search_path='' as $$
declare v_event public.agenda_events; v_user uuid=(select auth.uid());
begin
  select * into v_event from public.agenda_events where id=p_event_id for update;
  if v_event.id is null or not public.can_edit_workspace(v_event.workspace_id) then raise exception 'workspace_write_forbidden'; end if;
  update public.agenda_events set archived_at=case when p_archived then now() else null end,updated_by=v_user where id=p_event_id;
  insert into public.agenda_event_history(event_id,workspace_id,action,actor_id) values(p_event_id,v_event.workspace_id,case when p_archived then 'archived' else 'restored' end,v_user);
  insert into public.agenda_notifications(workspace_id,event_id,user_id,kind,title,body)
    select distinct v_event.workspace_id,p_event_id,u,case when p_archived then 'archived' else 'restored' end,case when p_archived then 'Evento archivado' else 'Evento restaurado' end,v_event.title from (select user_id u from public.agenda_event_assignees where event_id=p_event_id union select user_id from public.agenda_event_participants where event_id=p_event_id) people where u<>v_user;
end;
$$;

create or replace function public.delete_agenda_event(p_event_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_workspace uuid;
begin
  select workspace_id into v_workspace from public.agenda_events where id=p_event_id;
  if v_workspace is null or not public.can_edit_workspace(v_workspace) then raise exception 'workspace_write_forbidden'; end if;
  delete from public.agenda_events where id=p_event_id;
end;
$$;

create or replace function public.mark_agenda_notifications_read(p_notification_id bigint default null)
returns void language sql security definer set search_path='' as $$
  update public.agenda_notifications set read_at=now() where user_id=(select auth.uid()) and read_at is null and (p_notification_id is null or id=p_notification_id);
$$;

drop function public.list_workspace_members(uuid);
create function public.list_workspace_members(p_workspace_id uuid)
returns table(user_id uuid,display_name text,email text,role public.workspace_role,joined_at timestamptz)
language sql stable security definer set search_path='' as $$
  select m.user_id,p.display_name,u.email,m.role,m.joined_at from public.workspace_members m
  left join public.profiles p on p.id=m.user_id left join auth.users u on u.id=m.user_id
  where m.workspace_id=p_workspace_id and public.is_workspace_member(p_workspace_id)
  order by case m.role when 'owner' then 0 when 'editor' then 1 else 2 end,p.display_name;
$$;

revoke all on function public.save_agenda_event(uuid,uuid,text,text,timestamptz,timestamptz,uuid,uuid,text,public.agenda_event_priority,public.agenda_event_status,public.agenda_event_recurrence,uuid[],uuid[]),public.set_agenda_event_status(uuid,public.agenda_event_status),public.archive_agenda_event(uuid,boolean),public.delete_agenda_event(uuid),public.mark_agenda_notifications_read(bigint),public.list_workspace_members(uuid) from public,anon;
grant execute on function public.save_agenda_event(uuid,uuid,text,text,timestamptz,timestamptz,uuid,uuid,text,public.agenda_event_priority,public.agenda_event_status,public.agenda_event_recurrence,uuid[],uuid[]),public.set_agenda_event_status(uuid,public.agenda_event_status),public.archive_agenda_event(uuid,boolean),public.delete_agenda_event(uuid),public.mark_agenda_notifications_read(bigint),public.list_workspace_members(uuid) to authenticated;
