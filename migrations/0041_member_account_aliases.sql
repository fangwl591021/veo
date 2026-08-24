CREATE TABLE IF NOT EXISTS member_account_aliases (
  alias_user_id TEXT PRIMARY KEY REFERENCES platform_users(id),
  canonical_user_id TEXT NOT NULL REFERENCES platform_users(id),
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (alias_user_id <> canonical_user_id)
);

CREATE INDEX IF NOT EXISTS idx_member_account_aliases_canonical
  ON member_account_aliases(canonical_user_id);

INSERT INTO member_account_aliases (alias_user_id, canonical_user_id, reason)
SELECT
  'usr_55aec43ee8ba4903aa1bf1841a94fe56',
  'usr_18f40768b9f74e22ad01625d802e96af',
  'duplicate phone birthday identity recovery'
WHERE EXISTS (
  SELECT 1 FROM platform_users
  WHERE id = 'usr_55aec43ee8ba4903aa1bf1841a94fe56'
)
AND EXISTS (
  SELECT 1 FROM platform_users
  WHERE id = 'usr_18f40768b9f74e22ad01625d802e96af'
)
ON CONFLICT(alias_user_id) DO UPDATE SET
  canonical_user_id = excluded.canonical_user_id,
  reason = excluded.reason;
