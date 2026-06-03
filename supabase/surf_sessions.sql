-- Run in Supabase SQL Editor (Dashboard → SQL → New query)

create table if not exists public.surf_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  spot_id text not null,
  spot_name text not null default '',
  session_date date not null,
  start_time text not null,
  end_time text not null,
  board_id text not null,
  stars integer not null check (stars >= 1 and stars <= 5),
  forecast_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists surf_sessions_user_date_idx
  on public.surf_sessions (user_id, session_date desc);

alter table public.surf_sessions enable row level security;

create policy "Users read own surf sessions"
  on public.surf_sessions for select
  using (auth.uid() = user_id);

create policy "Users insert own surf sessions"
  on public.surf_sessions for insert
  with check (auth.uid() = user_id);

create policy "Users update own surf sessions"
  on public.surf_sessions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users delete own surf sessions"
  on public.surf_sessions for delete
  using (auth.uid() = user_id);
