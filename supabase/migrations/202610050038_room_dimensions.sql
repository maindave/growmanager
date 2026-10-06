-- Physical dimensions are room metadata; VPD remains derived from temperature and humidity.
alter table public.rooms
 add column length_m numeric,
 add column width_m numeric,
 add column height_m numeric,
 add constraint room_dimensions_valid check (
 (length_m is null and width_m is null and height_m is null) or
 (length_m is not null and width_m is not null and height_m is not null
 and length_m > 0 and length_m <= 1000 and width_m > 0 and width_m <= 1000 and height_m > 0 and height_m <= 1000));
