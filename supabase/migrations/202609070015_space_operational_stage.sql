alter table public.spaces add column operational_stage public.lot_stage;

update public.spaces space
set operational_stage=coalesce(
  (select lot.stage from public.lots lot where lot.space_id=space.id and lot.active order by lot.created_at limit 1),
  case
    when lower(space.name) similar to '%(flora|floración|floracion)%' then 'flowering'::public.lot_stage
    when lower(space.name) similar to '%(madre|vegetativo|vege)%' then 'vegetative'::public.lot_stage
    else null
  end
);
