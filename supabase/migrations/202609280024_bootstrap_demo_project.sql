-- Create the first isolated demo from the administrator's existing cultivation.
do $$
declare admin_id uuid; source_id uuid;
begin
  if exists(select 1 from public.app_settings where key='demo_workspace') then return; end if;
  select id into admin_id from auth.users where lower(email)='maindave@gmail.com' limit 1;
  if admin_id is null then return; end if;
  select w.id into source_id from public.workspaces w
  join public.workspace_members m on m.workspace_id=w.id and m.user_id=admin_id and m.role='owner'
  where lower(w.name) not like '%muestra%' order by w.created_at limit 1;
  if source_id is null then return; end if;
  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  perform public.clone_workspace_as_demo(source_id,'GrowManager · Proyecto de muestra');
end;
$$;
