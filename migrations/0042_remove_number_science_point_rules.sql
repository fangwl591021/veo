DELETE FROM point_rules
WHERE program_id = 'program_main'
  AND event_type LIKE 'number_science_%';
