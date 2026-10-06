-- Re-send the original National Day mail to exactly these three current accounts.
-- A distinct fixed campaign ID permits a second copy for past recipients and keeps retries idempotent.
INSERT OR IGNORE INTO system_mail_campaigns
  (id, title, body, sent_at, currencies_json, materials_json, class_xp)
SELECT 'national-day-2026-three-resend-2026-10-06',
       title, body, unixepoch('now') * 1000, currencies_json, materials_json, class_xp
FROM system_mail_campaigns
WHERE id = 'national-day-2026';

INSERT OR IGNORE INTO system_mail_recipients
  (campaign_id, player_id, sent_at)
SELECT campaign.id, account.player_id, campaign.sent_at
FROM system_mail_campaigns AS campaign
JOIN (
  SELECT 'e1161ae3-cbe7-472c-8855-e2e7e67f2351' AS player_id, 'noname' AS username
  UNION ALL SELECT '99a5c3ee-9345-4ba2-8508-1162b682a47e', 'Lianka'
  UNION ALL SELECT 'a66dc44a-6d6b-4908-ab2d-c2425ff97eb9', '欲罢不忍'
) AS target
JOIN accounts AS account
  ON account.player_id = target.player_id AND account.username = target.username
WHERE campaign.id = 'national-day-2026-three-resend-2026-10-06'
  AND account.created_at <= campaign.sent_at;
