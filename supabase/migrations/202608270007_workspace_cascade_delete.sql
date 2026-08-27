-- Owner-authorized destructive deletion of a complete workspace and its contents.
create or replace function public.delete_workspace(p_workspace_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.is_workspace_owner(p_workspace_id) then raise exception 'workspace_owner_required'; end if;

  delete from public.irrigation_events where workspace_id=p_workspace_id;
  delete from public.activities where workspace_id=p_workspace_id;
  delete from public.plants where workspace_id=p_workspace_id;
  delete from public.lots where workspace_id=p_workspace_id;
  delete from public.spaces where workspace_id=p_workspace_id;
  delete from public.recipe_items where workspace_id=p_workspace_id;
  delete from public.recipe_versions where workspace_id=p_workspace_id;
  delete from public.recipes where workspace_id=p_workspace_id;
  delete from public.products where workspace_id=p_workspace_id;
  delete from public.cultivations where workspace_id=p_workspace_id;
  delete from public.workspaces where id=p_workspace_id;
end;
$$;
revoke all on function public.delete_workspace(uuid) from public,anon;
grant execute on function public.delete_workspace(uuid) to authenticated;
