-- Row Level Security: members can only see data for rooms they're in.
-- The service_role bypass RLS (used by FastAPI backend).

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE destination_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE destination_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE flight_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE accommodation_results ENABLE ROW LEVEL SECURITY;

-- Profile: visible to oneself + room co-members
CREATE POLICY "Own profile readable" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Co-members readable" ON profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM room_members rm1
      JOIN room_members rm2 ON rm1.room_id = rm2.room_id
      WHERE rm1.user_id = auth.uid() AND rm2.user_id = profiles.id
    )
  );

CREATE POLICY "Own profile editable" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- Rooms: visible to members only
CREATE POLICY "Members can see room" ON rooms
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM room_members WHERE room_id = rooms.id AND user_id = auth.uid())
  );

CREATE POLICY "Admins can edit room" ON rooms
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM room_members
      WHERE room_id = rooms.id AND user_id = auth.uid() AND is_admin = TRUE
    )
  );

-- Members: visible to other members of same room
CREATE POLICY "Members see co-members" ON room_members
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM room_members rm
      WHERE rm.room_id = room_members.room_id AND rm.user_id = auth.uid()
    )
  );

-- Availability blocks: own rows only. Aggregated reads (the "ranked windows")
-- go through the FastAPI backend with the service_role key so they can see
-- everyone in the room after blind reveal.
CREATE POLICY "Own availability rw" ON availability_blocks
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "Own submission rw" ON availability_submissions
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "Own preferences rw" ON trip_preferences
  FOR ALL USING (user_id = auth.uid());

-- Destination candidates: visible to all room members
CREATE POLICY "Members see candidates" ON destination_candidates
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM room_members
      WHERE room_id = destination_candidates.room_id AND user_id = auth.uid()
    )
  );

-- Votes: own votes editable, all visible to room members
CREATE POLICY "Members see votes" ON destination_votes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM destination_candidates dc
      JOIN room_members rm ON dc.room_id = rm.room_id
      WHERE dc.id = destination_votes.candidate_id AND rm.user_id = auth.uid()
    )
  );

CREATE POLICY "Own vote rw" ON destination_votes
  FOR ALL USING (user_id = auth.uid());

-- Cached results: visible to room members (read-only — backend writes via service_role)
CREATE POLICY "Members see flight results" ON flight_results
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM room_members
      WHERE room_id = flight_results.room_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Members see accommodation results" ON accommodation_results
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM room_members
      WHERE room_id = accommodation_results.room_id AND user_id = auth.uid()
    )
  );
