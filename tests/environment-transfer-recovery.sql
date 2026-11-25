-- Run inside BEGIN/ROLLBACK after installing the migration in that transaction.
do $$
declare w uuid; owner_user uuid; a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); other_w uuid:=gen_random_uuid(); x uuid:=gen_random_uuid(); first_token text; next_token text;
begin
 select id,owner_id into w,owner_user from public.workspaces order by created_at limit 1;
 if w is null then raise exception 'Test requires an existing workspace'; end if;
 perform set_config('request.jwt.claim.sub',owner_user::text,true);
 insert into public.rooms(id,workspace_id,name,role) values(a,w,'Transfer test source','vegetative'),(b,w,'Transfer test destination','flowering'),(c,w,'Transfer test empty','vegetative');
 perform public.provision_environment_device(a,'test-controller');
 first_token=public.transfer_environment_device(a,b,'test-controller');
 assert length(first_token)=64;
 assert not exists(select 1 from public.environment_devices where room_id=a);
 assert exists(select 1 from public.environment_devices where room_id=b and device_key='test-controller');
 next_token=public.transfer_environment_device(a,b,'test-controller');
 assert length(next_token)=64 and next_token<>first_token;
 assert exists(select 1 from public.environment_devices where room_id=b and token_hash=encode(extensions.digest(next_token,'sha256'),'hex'));
 begin perform public.transfer_environment_device(a,c,'test-controller');raise exception 'Expected missing source rejection';exception when others then if sqlerrm<>'source_device_mismatch' then raise;end if;end;
 begin perform public.transfer_environment_device(a,b,'another-controller');raise exception 'Expected wrong identity rejection';exception when others then if sqlerrm<>'source_device_mismatch' then raise;end if;end;
 perform public.provision_environment_device(a,'test-controller');
 perform public.provision_environment_device(c,'different-controller');
 begin perform public.transfer_environment_device(a,c,'test-controller');raise exception 'Expected occupied destination rejection';exception when others then if sqlerrm<>'destination_has_device' then raise;end if;end;
 begin perform public.transfer_environment_device(a,a,'test-controller');raise exception 'Expected same room rejection';exception when others then if sqlerrm<>'same_room' then raise;end if;end;
 insert into public.workspaces(id,owner_id,name) values(other_w,owner_user,'Transfer test other workspace');
 insert into public.rooms(id,workspace_id,name,role) values(x,other_w,'Transfer test other room','flowering');
 begin perform public.transfer_environment_device(a,x,'test-controller');raise exception 'Expected cross workspace rejection';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 begin perform public.transfer_environment_device(a,b,'test-controller');raise exception 'Expected unauthorized rejection';exception when insufficient_privilege then null;end;
end $$;
