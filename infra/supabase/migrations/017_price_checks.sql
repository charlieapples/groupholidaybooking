-- Migration 017: log predicted-vs-actual flight prices.
--
-- Every time someone runs "Check latest price" we record what we PREDICTED vs
-- the LIVE fare. This lets the app show how accurate it is and, later, calibrate
-- the estimate if it's consistently off.

create table if not exists public.price_checks (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references public.rooms(id) on delete cascade,
  destination_iata text,
  origin text,
  predicted_gbp numeric,
  actual_gbp numeric,
  checked_at timestamptz not null default now()
);

create index if not exists price_checks_checked_at_idx on public.price_checks (checked_at desc);
