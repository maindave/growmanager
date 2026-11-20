-- Preserve both sensors in the same bounded, room-scoped historical snapshot.
-- Existing samples and access policies remain unchanged.
create or replace function public.capture_environment_sample() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into public.environment_samples(room_id,workspace_id,sampled_at,payload)
 values(new.room_id,new.workspace_id,date_bin(interval '5 minutes',new.sampled_at,timestamptz '2000-01-01'),
 jsonb_build_object('temperature',new.payload->'temperature','humidity',new.payload->'humidity','dht',new.payload->'dht',
 'sensors',new.payload->'sensors','acSensor',new.payload->'acSensor',
 'environment',(new.payload->'environment')-'events'-'cloud','relays',new.payload->'relays'))
 on conflict(room_id,sampled_at) do nothing;
 return new;
end $$;
revoke all on function public.capture_environment_sample() from public,anon,authenticated;

-- Recover only the current five-minute bucket from the controller's actual latest
-- telemetry. No older second-sensor measurements are reconstructed or invented.
update public.environment_samples as history
set payload=history.payload||jsonb_build_object('sensors',status.payload->'sensors','acSensor',status.payload->'acSensor')
from public.environment_status as status
where history.room_id=status.room_id
and history.sampled_at=date_bin(interval '5 minutes',status.sampled_at,timestamptz '2000-01-01')
and not(history.payload?'sensors')
and jsonb_typeof(status.payload->'sensors')='array';
