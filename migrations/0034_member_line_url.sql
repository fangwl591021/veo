ALTER TABLE member_profiles ADD COLUMN line_url TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_member_profiles_line_url
ON member_profiles(line_url);
