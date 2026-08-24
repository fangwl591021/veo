-- 將舊版「其餘報告」拆成流日、配對、職場、愛情四個可獨立調整的扣點規則。
-- 首次建立時沿用舊版其餘報告的點數，避免升級後價格意外改變。
INSERT OR IGNORE INTO point_rules
  (id,program_id,event_type,points,daily_limit,award_frequency,status,rule_version)
SELECT
  'pointrule_number_science_daily','program_main','number_science_daily_report',
  COALESCE((SELECT points FROM point_rules WHERE program_id='program_main' AND event_type='number_science_other_report' ORDER BY updated_at DESC LIMIT 1),10),
  NULL,'per_completion','active','v1';

INSERT OR IGNORE INTO point_rules
  (id,program_id,event_type,points,daily_limit,award_frequency,status,rule_version)
SELECT
  'pointrule_number_science_matching','program_main','number_science_matching_report',
  COALESCE((SELECT points FROM point_rules WHERE program_id='program_main' AND event_type='number_science_other_report' ORDER BY updated_at DESC LIMIT 1),10),
  NULL,'per_completion','active','v1';

INSERT OR IGNORE INTO point_rules
  (id,program_id,event_type,points,daily_limit,award_frequency,status,rule_version)
SELECT
  'pointrule_number_science_workplace','program_main','number_science_workplace_report',
  COALESCE((SELECT points FROM point_rules WHERE program_id='program_main' AND event_type='number_science_other_report' ORDER BY updated_at DESC LIMIT 1),10),
  NULL,'per_completion','active','v1';

INSERT OR IGNORE INTO point_rules
  (id,program_id,event_type,points,daily_limit,award_frequency,status,rule_version)
SELECT
  'pointrule_number_science_love','program_main','number_science_love_report',
  COALESCE((SELECT points FROM point_rules WHERE program_id='program_main' AND event_type='number_science_other_report' ORDER BY updated_at DESC LIMIT 1),10),
  NULL,'per_completion','active','v1';

UPDATE point_rules
SET status='archived', updated_at=CURRENT_TIMESTAMP
WHERE program_id='program_main'
  AND event_type='number_science_other_report'
  AND status!='archived';
