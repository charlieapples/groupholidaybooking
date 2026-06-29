-- Migration 020: remember a member's trip preferences across holidays.
--
-- When someone repeatedly wants e.g. 5–8 nights, they can save it as their
-- personal default and have it pre-filled on every new holiday (still editable).

alter table public.profiles
  add column if not exists default_min_nights int,
  add column if not exists default_max_nights int,
  add column if not exists default_budget_gbp numeric,
  add column if not exists remember_trip_prefs boolean not null default false;
