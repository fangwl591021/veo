PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS ai_tasks (
  id TEXT PRIMARY KEY,
  platform_user_id TEXT NOT NULL REFERENCES platform_users(id),
  contact_card_id TEXT REFERENCES contact_cards(id),
  parent_task_id TEXT REFERENCES ai_tasks(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  due_at TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','postponed','cancelled')),
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','ai','card_crm')),
  ai_status TEXT NOT NULL DEFAULT 'idle' CHECK (ai_status IN ('idle','queued','completed','failed')),
  ai_reason TEXT NOT NULL DEFAULT '',
  completed_at TEXT,
  cancelled_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_tasks_user_status_due
  ON ai_tasks(platform_user_id, status, due_at);
CREATE INDEX IF NOT EXISTS idx_ai_tasks_contact
  ON ai_tasks(platform_user_id, contact_card_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_tasks_parent
  ON ai_tasks(parent_task_id);

CREATE TABLE IF NOT EXISTS ai_task_events (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES ai_tasks(id),
  platform_user_id TEXT NOT NULL REFERENCES platform_users(id),
  event_type TEXT NOT NULL CHECK (event_type IN (
    'created','completed','postponed','cancelled','note_added',
    'push_sent','push_failed','push_skipped','ai_next_created','ai_next_skipped','ai_failed'
  )),
  note TEXT NOT NULL DEFAULT '',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_task_events_task
  ON ai_task_events(task_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_task_events_user
  ON ai_task_events(platform_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ai_task_deliveries (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES ai_tasks(id),
  platform_user_id TEXT NOT NULL REFERENCES platform_users(id),
  channel TEXT NOT NULL CHECK (channel IN ('line','telegram')),
  status TEXT NOT NULL CHECK (status IN ('sent','failed','skipped')),
  external_message_id TEXT NOT NULL DEFAULT '',
  error_message TEXT NOT NULL DEFAULT '',
  idempotency_key TEXT NOT NULL UNIQUE,
  attempted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_task_deliveries_task
  ON ai_task_deliveries(task_id, attempted_at DESC);

CREATE TABLE IF NOT EXISTS member_task_channels (
  platform_user_id TEXT PRIMARY KEY REFERENCES platform_users(id),
  telegram_chat_id TEXT NOT NULL DEFAULT '',
  line_enabled INTEGER NOT NULL DEFAULT 1,
  telegram_enabled INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO ai_tasks
  (id,platform_user_id,contact_card_id,title,description,due_at,priority,status,source,ai_status,created_at,updated_at)
SELECT
  'task_backfill_' || e.id,
  e.platform_user_id,
  e.contact_card_id,
  e.title,
  e.description,
  e.starts_at,
  'normal',
  'pending',
  'card_crm',
  'idle',
  e.created_at,
  e.updated_at
FROM personal_calendar_events e
WHERE e.contact_card_id IS NOT NULL AND e.contact_card_id <> '' AND e.status = 'active';

INSERT OR IGNORE INTO ai_task_events
  (id,task_id,platform_user_id,event_type,note,metadata_json,created_at)
SELECT
  'task_event_backfill_' || e.id,
  'task_backfill_' || e.id,
  e.platform_user_id,
  'created',
  e.description,
  '{"source":"card_crm_backfill"}',
  e.created_at
FROM personal_calendar_events e
WHERE e.contact_card_id IS NOT NULL AND e.contact_card_id <> '' AND e.status = 'active';