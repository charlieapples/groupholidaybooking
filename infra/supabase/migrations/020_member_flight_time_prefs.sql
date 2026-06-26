-- Migration 020: per-member flight-time + travel-time-value preferences.
--
-- Members can say their preferred earliest/latest departure time (a "vote" the
-- admin aggregates) and how much an hour of travel-to-airport time is worth to
-- them (£/hour). Times are stored as "HH:MM" text; NULL = "don't mind".
-- Not wired into the optimiser yet (needs live flight times) — captured for now.

alter table public.trip_preferences
  add column if not exists pref_flight_earliest text,
  add column if not exists pref_flight_latest text,
  add column if not exists pref_time_value_per_hour numeric;
