-- Migration 022: let a member say "I don't have a destination preference".
--
-- This counts them as "in" for the all-preferences-submitted gate (so the admin's
-- "AI pick for everyone" can never be blocked forever by someone who doesn't care),
-- WITHOUT feeding an empty preference into the AI recommendation.

alter table public.trip_preferences
  add column if not exists dest_no_preference boolean not null default false;
