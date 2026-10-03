do $$ declare w uuid='4d83ef2b-ba7e-4018-ba2b-bdfa8601714c'; u uuid; c uuid; l uuid; begin
 select owner_id into u from public.workspaces where id=w;
 perform set_config('request.jwt.claim.sub',u::text,true);
 if (select public from storage.buckets where id='journal-photos') then raise exception 'Las fotos no deben ser públicas';end if;
 if not public.journal_photo_access(w::text||'/crop/log/photo.jpg',true) then raise exception 'El editor debe poder subir fotos';end if;
 if public.journal_photo_access('invalid/path',false) then raise exception 'Ruta inválida autorizada';end if;
 select id into c from public.cultivations where workspace_id=w limit 1;
 insert into public.operation_logs(workspace_id,kind,category,title,severity,metadata) values(w,'activity','observation','QA fotos','info',jsonb_build_object('cultivationId',c)) returning id into l;
 begin perform public.append_journal_photos(l,jsonb_build_array(jsonb_build_object('path',w::text||'/'||c::text||'/'||l::text||'/missing.jpg')));raise exception 'Se aceptó una foto inexistente';exception when raise_exception then if sqlerrm='Se aceptó una foto inexistente' then raise;end if;end;
 perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 if public.journal_photo_access(w::text||'/crop/log/photo.jpg',false) then raise exception 'Un extraño pudo leer fotos';end if;
end $$;
