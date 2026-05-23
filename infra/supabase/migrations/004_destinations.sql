-- Step 4: destination candidates and voting.
-- Candidates can be algorithm-proposed (proposed_by IS NULL) or user-proposed.

CREATE TABLE destination_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  iata_code TEXT NOT NULL,
  proposed_by UUID REFERENCES profiles(id), -- NULL = suggested by algorithm
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Cost breakdown (cached, refreshed periodically)
  total_cost_gbp NUMERIC,
  -- e.g. {"flights":120,"ground":20,"accommodation":280,"daily_living":210,"per_person_nights":7}
  cost_breakdown JSONB DEFAULT '{}'::jsonb,

  UNIQUE (room_id, iata_code)
);

CREATE INDEX destination_candidates_room_idx ON destination_candidates(room_id);

CREATE TABLE destination_votes (
  candidate_id UUID NOT NULL REFERENCES destination_candidates(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  vote_value INT NOT NULL DEFAULT 1,  -- 1 = upvote, future: ranked voting 1-5
  voted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (candidate_id, user_id)
);
