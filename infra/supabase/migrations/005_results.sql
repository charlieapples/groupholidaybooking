-- Step 5+: cached optimisation outputs (flights + accommodation + totals).
-- Recomputed on demand, cached to avoid burning API quota.

CREATE TABLE flight_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  destination_iata TEXT NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  shared_out_date DATE,
  shared_return_date DATE,
  total_group_cost_gbp NUMERIC,
  per_person_results JSONB,  -- list of PersonResult dicts

  UNIQUE (room_id, destination_iata)
);

CREATE TABLE accommodation_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  destination_iata TEXT NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Top N hotel options from Booking.com (or alternatives)
  hotel_options JSONB,
  cheapest_total_gbp NUMERIC,  -- group-sized accommodation × nights
  cost_of_living_per_day_gbp NUMERIC,

  UNIQUE (room_id, destination_iata)
);
