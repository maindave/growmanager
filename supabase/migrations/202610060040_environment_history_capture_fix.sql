-- Parenthesize JSON extraction before subtraction so PostgreSQL resolves JSONB operators.
create or replace function public.capture_environment_sample() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.environment_samples(room_id,workspace_id,sampled_at,payload)
 values(new.room_id,new.workspace_id,date_bin(interval '5 minutes',new.sampled_at,timestamptz '2000-01-01'),
 jsonb_build_object('temperature',new.payload->'temperature','humidity',new.payload->'humidity','dht',new.payload->'dht',
 'environment',(new.payload->'environment')-'events'-'cloud','relays',new.payload->'relays'))
 on conflict(room_id,sampled_at) do nothing;
 return new;
end $$;
