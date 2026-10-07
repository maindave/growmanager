alter table public.environment_events drop constraint environment_events_alarms_check;
alter table public.environment_events add constraint environment_events_alarms_check check(alarms between 0 and 63);
