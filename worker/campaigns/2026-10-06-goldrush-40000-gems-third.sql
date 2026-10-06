-- A third, single-recipient copy of the October 4 GoldRush 40,000-gem mail.
-- Unique, fixed ID and INSERT OR IGNORE prevent duplicate sends if this file is rerun.
INSERT OR IGNORE INTO system_mail_campaigns
  (id, title, body, sent_at, currencies_json, materials_json, class_xp)
SELECT 'personal-goldrush-gems-40000-third-2026-10-06',
       title, body, unixepoch('now') * 1000, currencies_json, materials_json, class_xp
FROM system_mail_campaigns
WHERE id = 'personal-goldrush-gems-40000-2026-10-04';

INSERT OR IGNORE INTO system_mail_recipients
  (campaign_id, player_id, sent_at)
SELECT campaign.id, account.player_id, campaign.sent_at
FROM system_mail_campaigns AS campaign
JOIN accounts AS account
  ON account.player_id = 'b072954c-914d-4e38-bf87-c4ed70aa7343'
 AND account.username = '灰鸠「GoldRush」'
WHERE campaign.id = 'personal-goldrush-gems-40000-third-2026-10-06'
  AND account.created_at <= campaign.sent_at;