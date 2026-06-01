-- Migration 009: blind reveal for destination voting.
--
-- Mirrors availability_submissions: tracks which members have "locked in" their
-- destination votes. Vote counts stay hidden (and the candidate list stays in a
-- stable order so buttons don't jump while people vote simultaneously) until
-- every current member has locked in — then the tally is revealed.

create table if not exists public.destination_vote_submissions (
  room_id      uuid not null references public.rooms(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  submitted_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

alter table public.destination_vote_submissions enable row level security;

-- Members can record/clear their own lock-in; visible to themselves.
create policy "own vote submission insert"
  on public.destination_vote_submissions for insert
  to authenticated with check (auth.uid() = user_id);

create policy "own vote submission delete"
  on public.destination_vote_submissions for delete
  to authenticated using (auth.uid() = user_id);

create policy "own vote submission select"
  on public.destination_vote_submissions for select
  to authenticated using (auth.uid() = user_id);
