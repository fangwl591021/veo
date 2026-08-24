CREATE TABLE IF NOT EXISTS member_personality_assessments (
  id TEXT PRIMARY KEY,
  platform_user_id TEXT NOT NULL REFERENCES platform_users(id),
  assessment_type TEXT NOT NULL CHECK (assessment_type IN ('mbti', 'disc', 'enneagram', 'big_five')),
  result_code TEXT NOT NULL,
  result_json TEXT NOT NULL DEFAULT '{}',
  answers_json TEXT NOT NULL DEFAULT '{}',
  assessment_version TEXT NOT NULL DEFAULT 'v1',
  completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_member_personality_assessments_latest
  ON member_personality_assessments(platform_user_id, assessment_type, completed_at DESC);
