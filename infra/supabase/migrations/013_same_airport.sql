-- Migration 013: "everyone flies from the same airport?" toggle.
--
--   false (default) = each member flies from THEIR OWN cheapest reachable
--                     airport (more flexibility → usually cheaper overall).
--   true            = the whole group departs the SAME airport (travel together;
--                     the optimiser picks the single airport that works best for
--                     the group, which can cost more but keeps everyone together).

alter table public.rooms
  add column if not exists same_airport boolean not null default false;
