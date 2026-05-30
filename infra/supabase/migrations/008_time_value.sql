-- Migration 008: group travel-time preference for the flight optimiser.
--
-- The optimiser already weighs ground-travel time against money via
-- `time_value_per_hour` (£/hr). This persists the group's chosen value so the
-- /flights/optimise endpoint can pass it through.
--
--   0    = cheapest option regardless of how far people travel to the airport
--   high = minimise travel time (everyone effectively takes their closest airport)

alter table public.rooms
  add column if not exists time_value_per_hour numeric not null default 0;
