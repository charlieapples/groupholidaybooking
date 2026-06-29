-- Migration 021: support trip types beyond holidays.
--
-- 'holiday' (default) = the existing flow: find dates everyone's free, pick a
--   destination, price flights, book.
-- 'meetup'  = a lighter local get-together (e.g. "everyone meet in Manchester"),
--   often within a single day, picking hours/minutes rather than whole nights,
--   with no flights/booking step.

alter table public.rooms
  add column if not exists trip_type text not null default 'holiday';

alter table public.rooms
  drop constraint if exists rooms_trip_type_check;

alter table public.rooms
  add constraint rooms_trip_type_check check (trip_type in ('holiday', 'meetup'));
