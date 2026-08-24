CREATE TABLE IF NOT EXISTS ai_usage_events (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  platform_user_id TEXT NOT NULL DEFAULT '',
  feature TEXT NOT NULL DEFAULT 'general',
  provider TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT '',
  attempt INTEGER NOT NULL DEFAULT 1,
  is_fallback INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'failed',
  http_status INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  cached_tokens INTEGER NOT NULL DEFAULT 0,
  reasoning_tokens INTEGER NOT NULL DEFAULT 0,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  error_code TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_ai_usage_events_created ON ai_usage_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_events_provider_created ON ai_usage_events(provider,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_events_feature_created ON ai_usage_events(feature,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_events_request ON ai_usage_events(request_id,attempt);
