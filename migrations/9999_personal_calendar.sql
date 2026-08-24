CREATE TABLE IF NOT EXISTS personal_calendar_labels (
  id TEXT PRIMARY KEY,
  platform_user_id TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'custom',
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#64748b',
  is_visible INTEGER NOT NULL DEFAULT 1,
  is_system INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(platform_user_id, source_type, name)
);

CREATE INDEX IF NOT EXISTS idx_personal_calendar_labels_user
  ON personal_calendar_labels(platform_user_id, sort_order);

CREATE TABLE IF NOT EXISTS personal_calendar_events (
  id TEXT PRIMARY KEY,
  platform_user_id TEXT NOT NULL,
  label_id TEXT NOT NULL,
  contact_card_id TEXT,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  all_day INTEGER NOT NULL DEFAULT 0,
  reminder_minutes INTEGER NOT NULL DEFAULT 0,
  recurrence TEXT NOT NULL DEFAULT 'none',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_personal_calendar_events_user_time
  ON personal_calendar_events(platform_user_id, starts_at, ends_at);
