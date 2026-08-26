create or replace function public.create_recipe_with_version(
  p_name text,
  p_type public.recipe_type,
  p_description text,
  p_notes text,
  p_active boolean,
  p_target_ph numeric,
  p_target_ec numeric,
  p_version_notes text,
  p_items jsonb
) returns uuid language plpgsql security invoker set search_path='' as $$
declare
  user_id uuid=(select auth.uid());
  new_recipe_id uuid;
  new_version_id uuid;
  item jsonb;
begin
  if user_id is null then raise exception 'authentication_required'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'recipe_items_required'; end if;
  insert into public.recipes(owner_id,name,type,description,notes,active)
  values(user_id,trim(p_name),p_type,coalesce(p_description,''),coalesce(p_notes,''),coalesce(p_active,true)) returning id into new_recipe_id;
  insert into public.recipe_versions(owner_id,recipe_id,version,target_ph,target_ec,notes)
  values(user_id,new_recipe_id,1,p_target_ph,p_target_ec,coalesce(p_version_notes,'')) returning id into new_version_id;
  for item in select value from jsonb_array_elements(p_items) loop
    insert into public.recipe_items(owner_id,recipe_version_id,product_id,product_name_snapshot,product_brand_snapshot,amount,unit)
    values(user_id,new_version_id,(item->>'product_id')::uuid,item->>'product_name_snapshot',coalesce(item->>'product_brand_snapshot',''),(item->>'amount')::numeric,(item->>'unit')::public.measurement_unit);
  end loop;
  update public.recipes set current_version_id=new_version_id where id=new_recipe_id;
  return new_recipe_id;
end;
$$;

create or replace function public.create_recipe_version(
  p_recipe_id uuid,
  p_target_ph numeric,
  p_target_ec numeric,
  p_notes text,
  p_items jsonb
) returns uuid language plpgsql security invoker set search_path='' as $$
declare
  user_id uuid=(select auth.uid());
  next_version integer;
  new_version_id uuid;
  item jsonb;
begin
  if user_id is null then raise exception 'authentication_required'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'recipe_items_required'; end if;
  perform 1 from public.recipes where id=p_recipe_id and owner_id=user_id for update;
  if not found then raise exception 'recipe_not_found'; end if;
  select coalesce(max(version),0)+1 into next_version from public.recipe_versions where recipe_id=p_recipe_id;
  insert into public.recipe_versions(owner_id,recipe_id,version,target_ph,target_ec,notes)
  values(user_id,p_recipe_id,next_version,p_target_ph,p_target_ec,coalesce(p_notes,'')) returning id into new_version_id;
  for item in select value from jsonb_array_elements(p_items) loop
    insert into public.recipe_items(owner_id,recipe_version_id,product_id,product_name_snapshot,product_brand_snapshot,amount,unit)
    values(user_id,new_version_id,(item->>'product_id')::uuid,item->>'product_name_snapshot',coalesce(item->>'product_brand_snapshot',''),(item->>'amount')::numeric,(item->>'unit')::public.measurement_unit);
  end loop;
  update public.recipes set current_version_id=new_version_id where id=p_recipe_id;
  return new_version_id;
end;
$$;

revoke execute on function public.create_recipe_with_version(text,public.recipe_type,text,text,boolean,numeric,numeric,text,jsonb) from public,anon;
grant execute on function public.create_recipe_with_version(text,public.recipe_type,text,text,boolean,numeric,numeric,text,jsonb) to authenticated;
revoke execute on function public.create_recipe_version(uuid,numeric,numeric,text,jsonb) from public,anon;
grant execute on function public.create_recipe_version(uuid,numeric,numeric,text,jsonb) to authenticated;
