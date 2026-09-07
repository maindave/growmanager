alter table public.lots
  add column show_on_calendar boolean not null default false,
  add column timeline_started_on date not null default current_date,
  add column timeline_end_on date,
  add constraint lots_timeline_dates_check check(timeline_end_on is null or timeline_end_on>=timeline_started_on);

update public.lots lot
set show_on_calendar=lot.active,
    timeline_started_on=coalesce((select cultivation.start_date from public.cultivations cultivation where cultivation.id=lot.cultivation_id),current_date);
