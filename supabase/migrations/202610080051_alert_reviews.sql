create table public.alert_reviews (
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 alert_key text not null check(length(alert_key) between 1 and 200),
 reviewed_at timestamptz not null default now(),
 reviewed_by uuid not null default auth.uid() references auth.users(id),
 primary key(workspace_id,alert_key)
);
alter table public.alert_reviews enable row level security;
grant select,insert on public.alert_reviews to authenticated;
create policy alert_reviews_select on public.alert_reviews for select to authenticated using(public.is_workspace_member(workspace_id));
create policy alert_reviews_insert on public.alert_reviews for insert to authenticated with check(public.can_edit_workspace(workspace_id) and reviewed_by=auth.uid());
