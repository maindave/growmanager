alter table public.profiles add column if not exists onboarding_completed_at timestamptz;

create or replace function public.get_onboarding_state()
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'completed',p.onboarding_completed_at is not null,
    'completedAt',p.onboarding_completed_at
  ) from public.profiles p where p.id=(select auth.uid());
$$;

create or replace function public.complete_onboarding()
returns timestamptz language plpgsql security definer set search_path='' as $$
declare completed timestamptz=now();
begin
  update public.profiles set onboarding_completed_at=completed where id=(select auth.uid());
  if not found then raise exception 'profile_not_found'; end if;
  return completed;
end;
$$;

revoke all on function public.get_onboarding_state(),public.complete_onboarding() from public,anon;
grant execute on function public.get_onboarding_state(),public.complete_onboarding() to authenticated;
