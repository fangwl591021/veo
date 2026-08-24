ALTER TABLE member_profiles ADD COLUMN full_name TEXT NOT NULL DEFAULT '';
ALTER TABLE member_profiles ADD COLUMN social_links_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE member_profiles ADD COLUMN logo_r2_key TEXT NOT NULL DEFAULT '';
