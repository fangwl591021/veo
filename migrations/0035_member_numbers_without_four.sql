-- System member numbers are display identifiers only; relationships continue to use platform_user_id.
-- Re-number existing members in creation order and reserve future numbers atomically.
CREATE TABLE IF NOT EXISTS member_number_sequences (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  next_value INTEGER NOT NULL CHECK (next_value >= 1),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

UPDATE member_profiles
SET member_number = 'LEGACY-' || platform_user_id;

WITH ranked AS (
  SELECT platform_user_id, ROW_NUMBER() OVER (ORDER BY rowid) AS sequence
  FROM member_profiles
)
UPDATE member_profiles
SET member_number = (
  SELECT 'MB-' ||
    substr('012356789', ((sequence / 4782969) % 9) + 1, 1) ||
    substr('012356789', ((sequence / 531441) % 9) + 1, 1) ||
    substr('012356789', ((sequence / 59049) % 9) + 1, 1) ||
    substr('012356789', ((sequence / 6561) % 9) + 1, 1) ||
    substr('012356789', ((sequence / 729) % 9) + 1, 1) ||
    substr('012356789', ((sequence / 81) % 9) + 1, 1) ||
    substr('012356789', ((sequence / 9) % 9) + 1, 1) ||
    substr('012356789', (sequence % 9) + 1, 1)
  FROM ranked
  WHERE ranked.platform_user_id = member_profiles.platform_user_id
);

INSERT OR REPLACE INTO member_number_sequences (id, next_value, updated_at)
SELECT 1, COUNT(*) + 1, CURRENT_TIMESTAMP
FROM member_profiles;
