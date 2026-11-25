-- Recover a cloud transfer whose local controller update did not complete.
-- Never replace a different device, cross workspaces, or move historical readings.
create or replace function public.transfer_environment_device(p_from_room uuid,p_to_room uuid,p_device_key text)
returns text language plpgsql security definer set search_path=public,extensions as $$
declare source_workspace uuid; target_workspace uuid; source_key text; target_key text; token text;
begin
 select workspace_id into source_workspace from public.rooms where id=p_from_room;
 select workspace_id into target_workspace from public.rooms where id=p_to_room;
 if source_workspace is null or target_workspace is null or source_workspace<>target_workspace
 or not public.can_edit_workspace(source_workspace) then
 raise exception 'room_access_denied' using errcode='42501'; end if;
 if p_from_room=p_to_room then raise exception 'same_room'; end if;
 if p_device_key is null or length(p_device_key) not between 1 and 80 then raise exception 'invalid_device_key'; end if;
 -- Serialize transfers between these rooms, including recovery without a source row.
 perform id from public.rooms where id in(p_from_room,p_to_room) order by id for update;
 select device_key into source_key from public.environment_devices where room_id=p_from_room for update;
 select device_key into target_key from public.environment_devices where room_id=p_to_room for update;
 if source_key is not null and source_key<>p_device_key then raise exception 'source_device_mismatch'; end if;
 if source_key is null and target_key is distinct from p_device_key then raise exception 'source_device_mismatch'; end if;
 if target_key is not null and target_key<>p_device_key then raise exception 'destination_has_device'; end if;
 -- Same device already at destination: issue a fresh token to finish/retry local pairing.
 token=public.provision_environment_device(p_to_room,p_device_key);
 if source_key is not null then
  delete from public.environment_devices where room_id=p_from_room and device_key=p_device_key;
  delete from public.environment_status where room_id=p_from_room;
 end if;
 return token;
end $$;
revoke all on function public.transfer_environment_device(uuid,uuid,text) from public,anon;
grant execute on function public.transfer_environment_device(uuid,uuid,text) to authenticated;
