do $$
declare table_name text;
begin
  foreach table_name in array array['profiles','cultivations','spaces','lots','plants','products','recipes','recipe_versions','recipe_items','activities'] loop
    execute format('alter table public.%I enable row level security',table_name);
    execute format('alter table public.%I force row level security',table_name);
    execute format('revoke all on table public.%I from anon, authenticated',table_name);
  end loop;
end $$;

grant select,update on public.profiles to authenticated;
grant select,insert,update on public.cultivations,public.spaces,public.lots,public.plants,public.products,public.recipes,public.activities to authenticated;
grant select,insert on public.recipe_versions,public.recipe_items to authenticated;

create policy profiles_select_own on public.profiles for select to authenticated using ((select auth.uid())=id);
create policy profiles_update_own on public.profiles for update to authenticated using ((select auth.uid())=id) with check ((select auth.uid())=id);

create policy cultivations_select_own on public.cultivations for select to authenticated using ((select auth.uid())=owner_id);
create policy cultivations_insert_own on public.cultivations for insert to authenticated with check ((select auth.uid())=owner_id);
create policy cultivations_update_own on public.cultivations for update to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);

create policy spaces_select_own on public.spaces for select to authenticated using ((select auth.uid())=owner_id);
create policy spaces_insert_own on public.spaces for insert to authenticated with check ((select auth.uid())=owner_id);
create policy spaces_update_own on public.spaces for update to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);

create policy lots_select_own on public.lots for select to authenticated using ((select auth.uid())=owner_id);
create policy lots_insert_own on public.lots for insert to authenticated with check ((select auth.uid())=owner_id);
create policy lots_update_own on public.lots for update to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);

create policy plants_select_own on public.plants for select to authenticated using ((select auth.uid())=owner_id);
create policy plants_insert_own on public.plants for insert to authenticated with check ((select auth.uid())=owner_id);
create policy plants_update_own on public.plants for update to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);

create policy products_select_own on public.products for select to authenticated using ((select auth.uid())=owner_id);
create policy products_insert_own on public.products for insert to authenticated with check ((select auth.uid())=owner_id);
create policy products_update_own on public.products for update to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);

create policy recipes_select_own on public.recipes for select to authenticated using ((select auth.uid())=owner_id);
create policy recipes_insert_own on public.recipes for insert to authenticated with check ((select auth.uid())=owner_id);
create policy recipes_update_own on public.recipes for update to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);

create policy recipe_versions_select_own on public.recipe_versions for select to authenticated using ((select auth.uid())=owner_id);
create policy recipe_versions_insert_own on public.recipe_versions for insert to authenticated with check ((select auth.uid())=owner_id);

create policy recipe_items_select_own on public.recipe_items for select to authenticated using ((select auth.uid())=owner_id);
create policy recipe_items_insert_own on public.recipe_items for insert to authenticated with check ((select auth.uid())=owner_id);

create policy activities_select_own on public.activities for select to authenticated using ((select auth.uid())=owner_id);
create policy activities_insert_own on public.activities for insert to authenticated with check ((select auth.uid())=owner_id);
create policy activities_update_own on public.activities for update to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);

revoke execute on function public.set_updated_at() from public,anon,authenticated;
revoke execute on function public.handle_new_user() from public,anon,authenticated;
