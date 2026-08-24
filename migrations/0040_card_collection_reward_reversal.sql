CREATE TABLE IF NOT EXISTS card_collection_rewards (
  user_id TEXT NOT NULL,
  contact_card_id TEXT NOT NULL,
  points INTEGER NOT NULL DEFAULT 10,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id, contact_card_id)
);

INSERT OR IGNORE INTO point_rules
  (id,program_id,event_type,points,daily_limit,award_frequency,status,rule_version)
VALUES
  ('pointrule_card_collection','program_main','card_collection_reward',10,NULL,'per_completion','active','v1');

UPDATE point_rules
SET points=10,award_frequency='per_completion',status='active',updated_at=CURRENT_TIMESTAMP
WHERE id='pointrule_card_collection';

UPDATE point_programs
SET name='有點開心',updated_at=CURRENT_TIMESTAMP
WHERE id='program_main';
