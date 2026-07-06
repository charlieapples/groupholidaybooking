-- Migration 023: by-the-minute availability for local meet-ups.
--
-- Holidays pick whole days; a meet-up happens within a single day, so members
-- mark the time RANGES they're free (minute precision). start_min/end_min are
-- minutes from midnight (e.g. 540 = 09:00, 1020 = 17:00). Everyone's free
-- overlap is computed in the API.

create table if not exists public.meetup_slots (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid not null references public.rooms(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  meet_date  date not null,
  start_min  int  not null check (start_min >= 0 and start_min < 1440),
  end_min    int  not null check (end_min > start_min and end_min <= 1440),
  created_at timestamptz not null default now()
);

create index if not exists meetup_slots_room_idx on public.meetup_slots(room_id);

alter table public.meetup_slots enable row level security;

-- Members manage their own slots; everyone in the room can read them (the API
-- uses the service role, but these keep direct/realtime access member-scoped).
create policy "own meetup slots insert"
  on public.meetup_slots for insert
  to authenticated with check (auth.uid() = user_id);

create policy "own meetup slots delete"
  on public.meetup_slots for delete
  to authenticated using (auth.uid() = user_id);

create policy "own meetup slots select"
  on public.meetup_slots for select
  to authenticated using (auth.uid() = user_id);
