-- Migration 019: per-trip departure postcode override.
--
-- A member may be travelling from somewhere other than home for a given trip.
-- This optional column overrides their home postcode FOR THIS ROOM ONLY when the
-- flight optimiser picks their nearest airport / ground travel. NULL = use home.

alter table public.room_members
  add column if not exists trip_origin_postcode text;
