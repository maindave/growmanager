alter table public.lots
  add column if not exists nutrition_profile text;

update public.lots
set nutrition_profile = case
  when stage = 'mother' then 'mothers'
  when stage = 'flowering' then 'flowering'
  when stage in ('rooting', 'clone') then 'rooting'
  else 'full_cycle'
end
where nutrition_profile is null;

alter table public.lots
  alter column nutrition_profile set default 'full_cycle',
  alter column nutrition_profile set not null;

alter table public.lots
  drop constraint if exists lots_nutrition_profile_check;

alter table public.lots
  add constraint lots_nutrition_profile_check
  check (nutrition_profile in ('full_cycle', 'mothers', 'flowering', 'rooting', 'none'));
