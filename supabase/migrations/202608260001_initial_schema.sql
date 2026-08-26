create extension if not exists pgcrypto;

create type public.cultivation_status as enum ('active','finished','archived');
create type public.lot_stage as enum ('mother','clone','rooting','vegetative','flowering','harvest','finished');
create type public.product_type as enum ('fertilizer','biostimulant','amendment','ph_corrector','preventive','substrate','other');
create type public.recipe_type as enum ('irrigation','substrate','foliar');
create type public.measurement_unit as enum ('g','ml','l','percent','g_per_l','ml_per_l','other');
create type public.activity_type as enum ('irrigation','transplant','pruning','application','measurement','stage_change','observation');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.cultivations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null check (length(trim(name)) > 0),
  start_date date not null,
  end_date date,
  status public.cultivation_status not null default 'active',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  check (end_date is null or end_date >= start_date)
);
create unique index cultivations_one_active_per_owner_idx on public.cultivations(owner_id) where status='active';
create index cultivations_owner_status_idx on public.cultivations(owner_id,status);

create table public.spaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  cultivation_id uuid not null,
  name text not null check (length(trim(name)) > 0),
  description text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  unique (id, cultivation_id, owner_id),
  foreign key (cultivation_id,owner_id) references public.cultivations(id,owner_id) on delete restrict
);
create index spaces_owner_cultivation_idx on public.spaces(owner_id,cultivation_id);

create table public.lots (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  cultivation_id uuid not null,
  space_id uuid not null,
  name text not null check (length(trim(name)) > 0),
  description text not null default '',
  stage public.lot_stage not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  foreign key (cultivation_id,owner_id) references public.cultivations(id,owner_id) on delete restrict,
  foreign key (space_id,cultivation_id,owner_id) references public.spaces(id,cultivation_id,owner_id) on delete restrict
);
create index lots_owner_cultivation_idx on public.lots(owner_id,cultivation_id);
create index lots_owner_space_idx on public.lots(owner_id,space_id);

create table public.plants (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  lot_id uuid not null,
  code text not null check (length(trim(code)) > 0),
  variety text not null default '',
  status text not null default 'active',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  foreign key (lot_id,owner_id) references public.lots(id,owner_id) on delete restrict
);
create index plants_owner_lot_idx on public.plants(owner_id,lot_id);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null check (length(trim(name)) > 0),
  brand text not null default '',
  type public.product_type not null,
  base_unit public.measurement_unit not null,
  description text not null default '',
  notes text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id)
);
create index products_owner_name_idx on public.products(owner_id,name);
create index products_owner_type_idx on public.products(owner_id,type);

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null check (length(trim(name)) > 0),
  type public.recipe_type not null,
  description text not null default '',
  notes text not null default '',
  active boolean not null default true,
  current_version_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id)
);
create index recipes_owner_name_idx on public.recipes(owner_id,name);
create index recipes_owner_type_idx on public.recipes(owner_id,type);

create table public.recipe_versions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  recipe_id uuid not null,
  version integer not null check (version > 0),
  target_ph numeric,
  target_ec numeric,
  notes text not null default '',
  created_at timestamptz not null default now(),
  unique (id, owner_id),
  unique (recipe_id,version),
  foreign key (recipe_id,owner_id) references public.recipes(id,owner_id) on delete restrict
);
create index recipe_versions_owner_recipe_idx on public.recipe_versions(owner_id,recipe_id);

alter table public.recipes add constraint recipes_current_version_fk
  foreign key (current_version_id,owner_id) references public.recipe_versions(id,owner_id) deferrable initially deferred;

create table public.recipe_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  recipe_version_id uuid not null,
  product_id uuid not null,
  product_name_snapshot text not null,
  product_brand_snapshot text not null default '',
  amount numeric not null check (amount > 0),
  unit public.measurement_unit not null,
  created_at timestamptz not null default now(),
  unique (recipe_version_id,product_id),
  foreign key (recipe_version_id,owner_id) references public.recipe_versions(id,owner_id) on delete restrict,
  foreign key (product_id,owner_id) references public.products(id,owner_id) on delete restrict
);
create index recipe_items_owner_version_idx on public.recipe_items(owner_id,recipe_version_id);

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  cultivation_id uuid not null,
  space_id uuid,
  lot_id uuid not null,
  plant_id uuid,
  type public.activity_type not null,
  occurred_at timestamptz not null,
  observations text not null default '',
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (cultivation_id,owner_id) references public.cultivations(id,owner_id) on delete restrict,
  foreign key (space_id,owner_id) references public.spaces(id,owner_id) on delete restrict,
  foreign key (lot_id,owner_id) references public.lots(id,owner_id) on delete restrict,
  foreign key (plant_id,owner_id) references public.plants(id,owner_id) on delete restrict
);
create index activities_owner_occurred_idx on public.activities(owner_id,occurred_at desc);
create index activities_owner_cultivation_idx on public.activities(owner_id,cultivation_id);
create index activities_owner_lot_idx on public.activities(owner_id,lot_id);

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path='' as $$
begin
  new.updated_at=now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger cultivations_updated_at before update on public.cultivations for each row execute function public.set_updated_at();
create trigger spaces_updated_at before update on public.spaces for each row execute function public.set_updated_at();
create trigger lots_updated_at before update on public.lots for each row execute function public.set_updated_at();
create trigger plants_updated_at before update on public.plants for each row execute function public.set_updated_at();
create trigger products_updated_at before update on public.products for each row execute function public.set_updated_at();
create trigger recipes_updated_at before update on public.recipes for each row execute function public.set_updated_at();
create trigger activities_updated_at before update on public.activities for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.profiles(id,display_name)
  values(new.id,coalesce(new.raw_user_meta_data->>'display_name',split_part(new.email,'@',1)))
  on conflict(id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();
