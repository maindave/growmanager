create table if not exists public.user_presence(
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_seen_at timestamptz not null default now(),
  client text not null default 'web'
);
alter table public.user_presence enable row level security;
alter table public.user_presence force row level security;
revoke all on public.user_presence from public,anon,authenticated;

create or replace function public.touch_user_presence(p_client text default 'web')
returns timestamptz language plpgsql security definer set search_path='' as $$
declare user_id uuid=(select auth.uid()); seen timestamptz=now();
begin
  if user_id is null then raise exception 'authentication_required'; end if;
  insert into public.user_presence(user_id,last_seen_at,client) values(user_id,seen,left(coalesce(p_client,'web'),30))
  on conflict(user_id) do update set last_seen_at=excluded.last_seen_at,client=excluded.client;
  return seen;
end;
$$;

drop function if exists public.list_app_users();
create function public.list_app_users()
returns table(user_id uuid,email text,display_name text,created_at timestamptz,last_sign_in_at timestamptz,last_seen_at timestamptz,is_active boolean,project_count bigint)
language plpgsql security definer set search_path='' as $$
begin
  if not public.is_app_admin() then raise exception 'app_admin_required'; end if;
  return query select u.id,u.email::text,p.display_name,u.created_at,u.last_sign_in_at,pr.last_seen_at,
    coalesce(pr.last_seen_at>now()-interval '5 minutes',false),count(m.workspace_id)
  from auth.users u left join public.profiles p on p.id=u.id left join public.user_presence pr on pr.user_id=u.id
  left join public.workspace_members m on m.user_id=u.id
  group by u.id,u.email,p.display_name,u.created_at,u.last_sign_in_at,pr.last_seen_at order by u.created_at desc;
end;
$$;

create or replace function public.list_app_projects()
returns table(workspace_id uuid,name text,owner_id uuid,owner_email text,created_at timestamptz,member_count bigint,is_demo boolean)
language plpgsql security definer set search_path='' as $$
begin
  if not public.is_app_admin() then raise exception 'app_admin_required'; end if;
  return query select w.id,w.name,w.owner_id,u.email::text,w.created_at,count(m.user_id),
    w.id=coalesce((select (value->>'workspaceId')::uuid from public.app_settings where key='demo_workspace'),'00000000-0000-0000-0000-000000000000'::uuid)
  from public.workspaces w join auth.users u on u.id=w.owner_id left join public.workspace_members m on m.workspace_id=w.id
  group by w.id,w.name,w.owner_id,u.email,w.created_at order by w.created_at desc;
end;
$$;

create or replace function public.admin_open_workspace(p_workspace_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare user_id uuid=(select auth.uid());
begin
  if not public.is_app_admin() then raise exception 'app_admin_required'; end if;
  if not exists(select 1 from public.workspaces where id=p_workspace_id) then raise exception 'workspace_not_found'; end if;
  insert into public.workspace_members(workspace_id,user_id,role) values(p_workspace_id,user_id,'viewer')
  on conflict(workspace_id,user_id) do nothing;
  return p_workspace_id;
end;
$$;

revoke all on function public.touch_user_presence(text),public.list_app_projects(),public.admin_open_workspace(uuid) from public,anon;
grant execute on function public.touch_user_presence(text),public.list_app_projects(),public.admin_open_workspace(uuid) to authenticated;
