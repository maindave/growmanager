alter table public.lots
  add column if not exists vegetative_weeks integer not null default 2,
  add column if not exists flowering_weeks integer not null default 8;

alter table public.lots
  drop constraint if exists lots_vegetative_weeks_check,
  drop constraint if exists lots_flowering_weeks_check;

alter table public.lots
  add constraint lots_vegetative_weeks_check check (vegetative_weeks between 0 and 104),
  add constraint lots_flowering_weeks_check check (flowering_weeks between 0 and 52);

update public.lots
set vegetative_weeks = case when nutrition_profile = 'mothers' then 0 else 2 end,
    flowering_weeks = case when nutrition_profile = 'mothers' then 0 else 8 end;

create or replace function public.set_lot_planned_end()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  total_weeks integer;
begin
  if new.nutrition_profile = 'mothers' then
    new.timeline_end_on := null;
    return new;
  end if;

  total_weeks := coalesce(new.vegetative_weeks, 0) + coalesce(new.flowering_weeks, 0);
  if new.timeline_started_on is null or total_weeks = 0 then
    new.timeline_end_on := null;
  else
    new.timeline_end_on := new.timeline_started_on + (total_weeks * 7 - 1);
  end if;
  return new;
end;
$$;

drop trigger if exists lots_set_planned_end on public.lots;
create trigger lots_set_planned_end
before insert or update of timeline_started_on, vegetative_weeks, flowering_weeks, nutrition_profile
on public.lots
for each row execute function public.set_lot_planned_end();

update public.lots set vegetative_weeks = vegetative_weeks;
