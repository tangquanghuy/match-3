-- Existing-account snapshot for the 9000 likes milestone; fixed ID keeps reruns idempotent.
INSERT OR IGNORE INTO system_mail_campaigns
  (id, title, body, sent_at, currencies_json, materials_json, class_xp)
VALUES
  ('creation-corridor-9000-likes-2026-10-06', '创世回廊点赞达9000！',
   '感谢大家对创世回廊的支持，点赞已达9000！随信赠送900,000黄金和4,500钻石，请查收。',
   unixepoch('now') * 1000, '{"gold":900000,"gems":4500}', '{}', 0);

INSERT OR IGNORE INTO system_mail_recipients
  (campaign_id, player_id, sent_at)
SELECT campaign.id, account.player_id, campaign.sent_at
FROM system_mail_campaigns AS campaign
JOIN accounts AS account ON account.created_at <= campaign.sent_at
WHERE campaign.id = 'creation-corridor-9000-likes-2026-10-06';
