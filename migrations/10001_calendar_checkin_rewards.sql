ALTER TABLE course_sessions
  ADD COLUMN checkin_reward_points INTEGER NOT NULL DEFAULT 0
  CHECK (checkin_reward_points >= 0 AND checkin_reward_points <= 1000000);
