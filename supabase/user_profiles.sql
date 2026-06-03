-- Run in Supabase SQL Editor (Dashboard → SQL → New query)

create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  skill text not null default 'Intermediate',
  quiver jsonb not null default '[]'::jsonb,
  custom_board text not null default '',
  drive_origin text not null default '',
  drive_origin_lat double precision,
  drive_origin_lon double precision,
  updated_at timestamptz not null default now()
);

alter table public.user_profiles enable row level security;

create policy "Users read own profile"
  on public.user_profiles for select
  using (auth.uid() = user_id);

create policy "Users insert own profile"
  on public.user_profiles for insert
  with check (auth.uid() = user_id);

create policy "Users update own profile"
  on public.user_profiles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
