-- One-recipient traitstone mail for the verified Lianka account.
-- Fixed campaign ID and INSERT OR IGNORE make retries idempotent.
INSERT OR IGNORE INTO system_mail_campaigns
  (id, title, body, sent_at, currencies_json, materials_json, class_xp)
VALUES
  ('lianka-traitstones-plains6-celestial2-2026-10-07',
   '特质材料补发',
   '补发秘法平原属性石 ×6、圣辉石 ×2，请在邮件中领取附件。',
   unixepoch('now') * 1000,
   '{}',
   '{"traitstones":{"arcane:yellow:purple":6,"celestial":2}}',
   0);

INSERT OR IGNORE INTO system_mail_recipients
  (campaign_id, player_id, sent_at)
SELECT campaign.id, account.player_id, campaign.sent_at
FROM system_mail_campaigns AS campaign
JOIN accounts AS account
  ON account.player_id = '99a5c3ee-9345-4ba2-8508-1162b682a47e'
 AND account.username = 'Lianka'
WHERE campaign.id = 'lianka-traitstones-plains6-celestial2-2026-10-07'
  AND account.created_at <= campaign.sent_at;