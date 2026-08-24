CREATE TABLE IF NOT EXISTS card_image_processing (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT 'collection' CHECK (purpose IN ('collection','personal')),
  side TEXT NOT NULL DEFAULT 'front' CHECK (side IN ('front','back')),
  original_r2_key TEXT NOT NULL,
  original_content_type TEXT NOT NULL DEFAULT 'image/jpeg',
  original_size INTEGER NOT NULL DEFAULT 0,
  processed_r2_key TEXT NOT NULL DEFAULT '',
  processed_content_type TEXT NOT NULL DEFAULT 'image/webp',
  status TEXT NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded','processing','detected','corrected','completed','needs_review','failed')),
  processing_version TEXT NOT NULL DEFAULT 'card-image-v1',
  processing_confidence REAL NOT NULL DEFAULT 0,
  quality_score INTEGER NOT NULL DEFAULT 0,
  blur_score INTEGER NOT NULL DEFAULT 0,
  brightness_score INTEGER NOT NULL DEFAULT 0,
  glare_score INTEGER NOT NULL DEFAULT 0,
  coverage_score INTEGER NOT NULL DEFAULT 0,
  orientation TEXT NOT NULL DEFAULT '',
  rotation INTEGER NOT NULL DEFAULT 0,
  manual_review_required INTEGER NOT NULL DEFAULT 0,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  failure_reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES platform_users(id)
);

CREATE INDEX IF NOT EXISTS idx_card_image_processing_owner_created
  ON card_image_processing(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_card_image_processing_status_updated
  ON card_image_processing(status, updated_at);
