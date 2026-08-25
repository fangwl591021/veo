ALTER TABLE course_sessions
  ADD COLUMN checkin_points_delta INTEGER NOT NULL DEFAULT 0
  CHECK (checkin_points_delta >= -1000000 AND checkin_points_delta <= 1000000);

UPDATE course_sessions
SET checkin_points_delta = checkin_reward_points;
