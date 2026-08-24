ALTER TABLE admin_member_permissions ADD COLUMN line_uid TEXT;

UPDATE admin_member_permissions
SET line_uid = (
  SELECT ei.provider_subject
  FROM external_identities ei
  WHERE ei.platform_user_id = admin_member_permissions.platform_user_id
    AND ei.provider = 'line_login'
    AND ei.verification_status = 'verified'
  ORDER BY ei.last_verified_at DESC
  LIMIT 1
)
WHERE line_uid IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_member_permissions_line_uid
  ON admin_member_permissions(line_uid)
  WHERE line_uid IS NOT NULL AND line_uid != '';
