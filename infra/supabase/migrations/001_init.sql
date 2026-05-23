-- Profiles, rooms, members
-- Profiles extend Supabase's built-in auth.users table.

CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  email TEXT,
  avatar_url TEXT,
  default_home_postcode TEXT,   -- so they don't re-type it for every room
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-create profile on auth.users insert (Supabase pattern)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name, avatar_url)
  VALUES (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Rooms: one per group-holiday-planning session
CREATE TABLE rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,           -- short URL-friendly identifier
  name TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Planning state machine
  -- 'availability' | 'duration' | 'budget' | 'destination' | 'flights' | 'booking' | 'done'
  current_step TEXT NOT NULL DEFAULT 'availability',
  -- The order of steps can be reconfigured per room (user spec)
  step_order TEXT[] NOT NULL DEFAULT ARRAY[
    'availability','duration','budget','destination','flights','booking'
  ],

  -- Step 1: availability inputs
  rough_window TEXT,                    -- e.g. "September 2026" — human-readable
  search_start DATE,                    -- the actual start of the search window
  search_end DATE,                      -- the actual end of the search window

  -- Step 1 output / step 2 input
  agreed_start DATE,                    -- locked once group picks window
  agreed_end DATE,

  -- Step 2 outputs
  min_nights INT,
  max_nights INT,

  -- Step 3 output
  budget_gbp NUMERIC,                   -- agreed per-person all-in cap

  -- Step 4 output
  destination_iata TEXT,                -- final chosen destination
  destination_voting_mode TEXT DEFAULT 'questionnaire'
    -- 'questionnaire' | 'propose_and_vote' | 'random'
);

CREATE INDEX rooms_slug_idx ON rooms(slug);
CREATE INDEX rooms_created_by_idx ON rooms(created_by);

-- Room membership
CREATE TABLE room_members (
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  home_postcode TEXT,                   -- can override profile.default_home_postcode
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (room_id, user_id)
);

CREATE INDEX room_members_user_idx ON room_members(user_id);
