update public.lots
set nutrition_profile = 'mothers'
where lower(name) similar to '%(madre|madres)%'
  and nutrition_profile = 'full_cycle';
