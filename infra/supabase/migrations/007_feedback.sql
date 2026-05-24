-- Migration 007: user feedback table
-- Simple star rating + optional comment, tied to a user and optionally a room.

create table if not exists public.feedback (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade,
  room_slug   text,          -- optional: which Holiday they were in when they gave feedback
  rating      int not null check (rating between 1 and 5),
  comment     text,
  page        text,          -- e.g. 'dashboard', 'availability', 'flights'
  created_at  timestamptz not null default now()
);

-- Users can insert their own feedback; nobody can read others'.
alter table public.feedback enable row level security;

create policy "Users can submit feedback"
  on public.feedback for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can view their own feedback"
  on public.feedback for select
  to authenticated
  using (auth.uid() = user_id);
