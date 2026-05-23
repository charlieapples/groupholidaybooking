-- Step 2-4: trip preferences from each member.
-- Aggregated to produce the group's agreed parameters.

CREATE TABLE trip_preferences (
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Step 2: duration
  pref_min_nights INT,
  pref_max_nights INT,

  -- Step 3: budget
  pref_budget_gbp NUMERIC,

  -- Step 4: destination questionnaire (free-form JSON for flexibility)
  -- Example: {"climate":"warm","setting":"beach","activity":"relaxed",
  --           "must_have":["good food","nightlife"],"avoid":["long flights"]}
  pref_destination_answers JSONB DEFAULT '{}'::jsonb,

  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, user_id)
);
