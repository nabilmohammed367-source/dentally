-- One verified account belongs to one DentalOS practice in this MVP.
-- Assign memberships only after confirming the practice owner's identity.
create table if not exists public.practice_memberships (
  user_id uuid primary key references auth.users (id) on delete cascade,
  practice_id text not null check (practice_id in ('prac_oakwood', 'prac_riverside', 'prac_harbor')),
  role text not null default 'staff' check (role in ('owner', 'admin', 'staff')),
  created_at timestamptz not null default now()
);

alter table public.practice_memberships enable row level security;
revoke all on table public.practice_memberships from anon, authenticated;
grant select on table public.practice_memberships to authenticated;

drop policy if exists "Users can read their own practice membership" on public.practice_memberships;
create policy "Users can read their own practice membership"
  on public.practice_memberships
  for select
  to authenticated
  using ((select auth.uid()) = user_id);
