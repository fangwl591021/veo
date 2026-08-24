ALTER TABLE member_task_channels
  ADD COLUMN telegram_bot_token_encrypted TEXT NOT NULL DEFAULT '';

ALTER TABLE member_task_channels
  ADD COLUMN telegram_bot_token_last4 TEXT NOT NULL DEFAULT '';
