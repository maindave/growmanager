-- Project identity and collaborative irrigation agenda.
alter table public.workspaces
  add column description text not null default '',
  add column grow_type text not null default 'indoor',
  add column started_on date;
grant update(name,description,grow_type,started_on) on public.workspaces to authenticated;
grant delete on public.workspaces to authenticated;
create policy workspaces_delete_owner on public.workspaces for delete to authenticated using (public.is_workspace_owner(id));

create type public.agenda_status as enum ('planned','completed');

create table public.irrigation_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  cultivation_id uuid references public.cultivations(id) on delete set null,
  lot_id uuid references public.lots(id) on delete set null,
  scheduled_at timestamptz not null,
  completed_at timestamptz,
  status public.agenda_status not null default 'planned',
  water_liters numeric(10,3) check (water_liters is null or water_liters > 0),
  ph numeric(5,2) check (ph is null or ph between 0 and 14),
  ec numeric(8,3) check (ec is null or ec >= 0),
  notes text not null default '',
  supplies jsonb not null default '[]'::jsonb check (jsonb_typeof(supplies)='array'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status='completed' and completed_at is not null) or status='planned')
);

create index irrigation_events_workspace_date_idx on public.irrigation_events(workspace_id,scheduled_at);
create trigger irrigation_events_updated_at before update on public.irrigation_events for each row execute function public.set_updated_at();
create trigger irrigation_events_scope_workspace before insert or update on public.irrigation_events for each row execute function public.scope_workspace_record();

alter table public.irrigation_events enable row level security;
alter table public.irrigation_events force row level security;
revoke all on public.irrigation_events from anon,authenticated;
grant select,insert,update,delete on public.irrigation_events to authenticated;
create policy irrigation_events_select_workspace on public.irrigation_events for select to authenticated using (public.is_workspace_member(workspace_id));
create policy irrigation_events_insert_workspace on public.irrigation_events for insert to authenticated with check (public.can_edit_workspace(workspace_id) and created_by=(select auth.uid()));
create policy irrigation_events_update_workspace on public.irrigation_events for update to authenticated using (public.can_edit_workspace(workspace_id)) with check (public.can_edit_workspace(workspace_id));
create policy irrigation_events_delete_workspace on public.irrigation_events for delete to authenticated using (public.can_edit_workspace(workspace_id));

create or replace function public.delete_workspace(p_workspace_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.is_workspace_owner(p_workspace_id) then raise exception 'workspace_owner_required'; end if;
  if exists(select 1 from public.cultivations where workspace_id=p_workspace_id)
    or exists(select 1 from public.products where workspace_id=p_workspace_id)
    or exists(select 1 from public.recipes where workspace_id=p_workspace_id)
    or exists(select 1 from public.activities where workspace_id=p_workspace_id)
    or exists(select 1 from public.irrigation_events where workspace_id=p_workspace_id)
  then raise exception 'workspace_not_empty'; end if;
  delete from public.workspaces where id=p_workspace_id;
end;
$$;
revoke all on function public.delete_workspace(uuid) from public,anon;
grant execute on function public.delete_workspace(uuid) to authenticated;
