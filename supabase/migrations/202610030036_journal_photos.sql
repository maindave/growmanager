insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('journal-photos','journal-photos',false,10485760,array['image/jpeg','image/png','image/webp']);
create function public.journal_photo_access(p_path text,p_edit boolean) returns boolean language sql stable security invoker set search_path='' as $$
 select case when (storage.foldername(p_path))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
 case when p_edit then public.can_edit_workspace(((storage.foldername(p_path))[1])::uuid) else public.is_workspace_member(((storage.foldername(p_path))[1])::uuid) end else false end;
$$;
revoke all on function public.journal_photo_access(text,boolean) from public,anon;
grant execute on function public.journal_photo_access(text,boolean) to authenticated;
create policy journal_photos_read on storage.objects for select to authenticated using(bucket_id='journal-photos' and public.journal_photo_access(name,false));
create policy journal_photos_insert on storage.objects for insert to authenticated with check(bucket_id='journal-photos' and public.journal_photo_access(name,true));
create policy journal_photos_delete on storage.objects for delete to authenticated using(bucket_id='journal-photos' and public.journal_photo_access(name,true));
create function public.append_journal_photos(p_log uuid,p_photos jsonb) returns void language plpgsql security invoker set search_path='' as $$ declare l public.operation_logs; p jsonb; prefix text; begin
 select * into l from public.operation_logs where id=p_log for update;
 if l.id is null or not public.can_edit_workspace(l.workspace_id) then raise exception 'Registro no disponible';end if;
 if not exists(select 1 from public.cultivations where id=(l.metadata->>'cultivationId')::uuid and workspace_id=l.workspace_id) then raise exception 'Elegí un cultivo para las fotos';end if;
 if jsonb_typeof(p_photos)<>'array' or jsonb_array_length(p_photos)<1 or jsonb_array_length(p_photos)>8 then raise exception 'Seleccioná entre 1 y 8 fotos';end if;
 prefix=l.workspace_id::text||'/'||(l.metadata->>'cultivationId')||'/'||l.id::text||'/';
 for p in select value from jsonb_array_elements(p_photos) loop
 if left(p->>'path',length(prefix)) is distinct from prefix or not exists(select 1 from storage.objects where bucket_id='journal-photos' and name=p->>'path') then raise exception 'Foto no disponible para este registro';end if;
 end loop;
 update public.operation_logs set metadata=jsonb_set(metadata,'{photos}',coalesce(metadata->'photos','[]'::jsonb)||p_photos) where id=l.id;
end $$;
revoke all on function public.append_journal_photos(uuid,jsonb) from public,anon;
grant execute on function public.append_journal_photos(uuid,jsonb) to authenticated;
