-- Step 1: availability tracking + blind submissions

-- One row per (room × user × date) that the user has marked busy or free.
-- We store both directions explicitly to differentiate "they marked themselves
-- as available" from "they haven't said anything yet".
CREATE TABLE availability_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  block_date DATE NOT NULL,
  is_busy BOOLEAN NOT NULL,             -- TRUE = unavailable that day
  source TEXT NOT NULL DEFAULT 'manual',  -- 'manual' | 'google_calendar' | 'outlook'
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (room_id, user_id, block_date)
);

CREATE INDEX availability_room_idx ON availability_blocks(room_id, block_date);
CREATE INDEX availability_user_idx ON availability_blocks(room_id, user_id);

-- Tracks who has finished submitting (for the blind reveal).
-- Until every member of the room has a row here, GET /windows returns 412.
CREATE TABLE availability_submissions (
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, user_id)
);
