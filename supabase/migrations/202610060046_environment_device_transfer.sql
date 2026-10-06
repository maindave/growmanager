-- Reassign a physically moved controller without moving historical measurements.
create function public.transfer_environment_device(p_from_room uuid,p_to_room uuid,p_device_key text)
returns text language plpgsql security definer set search_path=public,extensions as $$
declare source_workspace uuid; target_workspace uuid; token text;
begin
 select workspace_id into source_workspace from public.rooms where id=p_from_room;
 select workspace_id into target_workspace from public.rooms where id=p_to_room;
 if source_workspace is null or target_workspace is null or source_workspace<>target_workspace
 or not public.can_edit_workspace(source_workspace) then
 raise exception 'room_access_denied' using errcode='42501'; end if;
 if p_from_room=p_to_room then raise exception 'same_room'; end if;
 perform 1 from public.environment_devices where room_id=p_from_room and device_key=p_device_key for update;
 if not found then raise exception 'source_device_mismatch'; end if;
 if exists(select 1 from public.environment_devices where room_id=p_to_room) then
 raise exception 'destination_has_device'; end if;
 token=public.provision_environment_device(p_to_room,p_device_key);
 delete from public.environment_devices where room_id=p_from_room and device_key=p_device_key;
 delete from public.environment_status where room_id=p_from_room;
 return token;
end $$;
revoke all on function public.transfer_environment_device(uuid,uuid,text) from public,anon;
grant execute on function public.transfer_environment_device(uuid,uuid,text) to authenticated;
