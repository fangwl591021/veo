CREATE TABLE IF NOT EXISTS member_invite_pages (
  platform_user_id TEXT PRIMARY KEY REFERENCES platform_users(id),
  role_title TEXT NOT NULL DEFAULT '',
  headline TEXT NOT NULL DEFAULT '',
  tagline TEXT NOT NULL DEFAULT '',
  cta_text TEXT NOT NULL DEFAULT '',
  theme TEXT NOT NULL DEFAULT 'cosmic' CHECK (theme IN ('cosmic', 'aurora', 'warm')),
  background_r2_key TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

