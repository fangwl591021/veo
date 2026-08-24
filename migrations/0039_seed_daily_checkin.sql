INSERT OR IGNORE INTO ad_campaigns
  (id, name, status, starts_at, ends_at, required_creative_count, rotation_mode)
VALUES
  ('campaign_daily_template', 'A-KAFFIT 每日簽到', 'active',
   '2026-01-01T00:00:00.000Z', '2100-12-31T23:59:59.000Z', 1, 'sequential');

INSERT OR IGNORE INTO ad_creatives
  (id, campaign_id, creative_type, title, media_url, preview_url, target_url,
   required_watch_seconds, required_completion_ratio, display_order, status,
   image_link, buttons_json, bubble_size, image_aspect_ratio, image_aspect_mode)
VALUES
  ('creative_daily_welcome', 'campaign_daily_template', 'image',
   'A-KAFFIT 每日簽到', '/assets/akaffit-daily-checkin.svg', '', '',
   3, 0, 1, 'active', '', '[]', 'kilo', '800:1200', 'cover');

INSERT OR IGNORE INTO app_meta (key, value)
VALUES (
  'checkin_reward_templates',
  '[{"id":"template_akaffit_daily","campaignId":"campaign_daily_template","active":true,"altText":"A-KAFFIT 每日簽到","rotationMode":"sequential","pages":[{"id":"page_akaffit_welcome","mediaType":"image","mediaAssetId":"","mediaName":"","imageUrl":"/assets/akaffit-daily-checkin.svg","videoUrl":"","posterUrl":"","imageLink":"","bubbleSize":"kilo","imageAspectRatio":"800:1200","imageAspectMode":"cover","requiredWatchSeconds":3,"requiredCompletionRatio":0,"buttons":[]}]}]'
);

INSERT OR IGNORE INTO app_meta (key, value)
SELECT 'checkin_reward_template', value
FROM app_meta
WHERE key = 'checkin_reward_templates';
