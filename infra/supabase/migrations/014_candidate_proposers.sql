-- Migration 014: track ALL members who proposed each destination.
--
-- In ranked mode each member puts forward one destination; if several pick the
-- SAME place we want to show "Proposed by 2 members" rather than crediting only
-- the last one. proposers holds the list of user_ids who put it forward.

alter table public.destination_candidates
  add column if not exists proposers jsonb not null default '[]'::jsonb;
