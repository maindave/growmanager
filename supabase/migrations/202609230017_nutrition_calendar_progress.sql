create table public.nutrition_week_progress(
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lot_id uuid not null references public.lots(id) on delete cascade,
  week_number integer not null check(week_number between 0 and 52),
  flower_week integer check(flower_week between 1 and 52),
  expected_stage text not null check(expected_stage in ('rooting','early_vegetative','advanced_vegetative','stretch','flower_formation','development','ripening','final')),
  actual_stage text check(actual_stage in ('rooting','early_vegetative','advanced_vegetative','stretch','flower_formation','development','ripening','final')),
  stage_status text not null default 'unconfirmed' check(stage_status in ('aligned','ahead','behind','unconfirmed')),
  stage_confirmed_at timestamptz,
  confirmed_by uuid references auth.users(id) on delete set null,
  ph_min numeric(4,2) not null,
  ph_max numeric(4,2) not null,
  ec_min numeric(4,2),
  ec_max numeric(4,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(lot_id,week_number),
  check(ph_max>=ph_min),
  check(ec_max is null or ec_min is null or ec_max>=ec_min)
);
create index nutrition_week_progress_workspace_lot_idx on public.nutrition_week_progress(workspace_id,lot_id,week_number);
alter table public.nutrition_week_progress enable row level security;
alter table public.nutrition_week_progress force row level security;
revoke all on public.nutrition_week_progress from anon,authenticated;
grant select,insert,update on public.nutrition_week_progress to authenticated;
create policy nutrition_progress_select on public.nutrition_week_progress for select to authenticated using(public.is_workspace_member(workspace_id));
create policy nutrition_progress_insert on public.nutrition_week_progress for insert to authenticated with check(public.can_edit_workspace(workspace_id));
create policy nutrition_progress_update on public.nutrition_week_progress for update to authenticated using(public.can_edit_workspace(workspace_id)) with check(public.can_edit_workspace(workspace_id));
