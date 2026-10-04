-- Second personal gift: exactly one account, distinct campaign ID; reruns are idempotent.
INSERT OR IGNORE INTO system_mail_campaigns
  (id, title, body, sent_at, currencies_json, materials_json, class_xp)
VALUES
  ('personal-goldrush-gems-40000-second', '专属钻石奖励',
   '灰鸠「GoldRush」，随信附上 40,000 钻石，请查收。',
   unixepoch('now') * 1000, '{"gems":40000}', '{}', 0);

INSERT OR IGNORE INTO system_mail_recipients
  (campaign_id, player_id, sent_at)
SELECT campaign.id, account.player_id, campaign.sent_at
FROM system_mail_campaigns AS campaign
JOIN accounts AS account ON account.player_id = 'b072954c-914d-4e38-bf87-c4ed70aa7343'
  AND account.username = '灰鸠「GoldRush」'
  AND account.created_at <= campaign.sent_at
WHERE campaign.id = 'personal-goldrush-gems-40000-second';