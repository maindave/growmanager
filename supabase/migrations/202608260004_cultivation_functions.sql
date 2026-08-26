create or replace function public.activate_cultivation(p_cultivation_id uuid)
returns void language plpgsql security invoker set search_path='' as $$
declare user_id uuid=(select auth.uid());
begin
  if user_id is null then raise exception 'authentication_required'; end if;
  if not exists(select 1 from public.cultivations where id=p_cultivation_id and owner_id=user_id) then raise exception 'cultivation_not_found'; end if;
  update public.cultivations set status='finished' where owner_id=user_id and status='active' and id<>p_cultivation_id;
  update public.cultivations set status='active',end_date=null where id=p_cultivation_id and owner_id=user_id;
end;
$$;

revoke execute on function public.activate_cultivation(uuid) from public,anon;
grant execute on function public.activate_cultivation(uuid) to authenticated;
