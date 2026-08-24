-- 可調整的服務扣贈點規則。
-- 舊的四項規則依產品需求停用；歷史帳本不變。
UPDATE point_rules
SET status='archived', updated_at=CURRENT_TIMESTAMP
WHERE program_id='program_main'
  AND event_type IN (
    'daily_ad_checkin',
    'member_joined',
    'referral_attendance_reward',
    'registration_completed'
  )
  AND status!='archived';

INSERT OR IGNORE INTO point_rules
  (id,program_id,event_type,points,daily_limit,award_frequency,status,rule_version)
VALUES
  ('pointrule_number_science_full','program_main','number_science_full_report',50,NULL,'per_completion','active','v1'),
  ('pointrule_number_science_other','program_main','number_science_other_report',10,NULL,'per_completion','active','v1'),
  ('pointrule_card_collection','program_main','card_collection_reward',10,NULL,'per_completion','active','v1');
