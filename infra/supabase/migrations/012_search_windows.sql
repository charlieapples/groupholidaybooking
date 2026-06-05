-- Migration 012: multiple search windows for the flight optimiser.
--
-- Instead of locking ONE agreed window, the group can select SEVERAL free
-- windows (e.g. 17–28 Jul AND 13–24 Aug). The optimiser then prices flights
-- across all of them and picks the cheapest per destination — more candidate
-- days = better chance of a cheap fare, which is the whole point of the app.
--
--   search_windows       : list of {"start_date": "...", "end_date": "..."}.
--                          Empty = fall back to the single agreed_start/agreed_end.
--   multi_window_search   : true  = search every window in search_windows.
--                           false = "logistics mode" — lock one window only
--                                   (agreed_start/agreed_end), e.g. when people
--                                   need certainty to book time off early.
--
-- agreed_start/agreed_end remain the "primary" window (used for the calendar
-- invite and dashboard display); in multi mode they hold the earliest window.

alter table public.rooms
  add column if not exists search_windows jsonb not null default '[]'::jsonb,
  add column if not exists multi_window_search boolean not null default true;
