-- Copy the original National Day mail for exactly the verified nnnn1 account.
-- Fixed campaign ID plus INSERT OR IGNORE make retries idempotent.
INSERT OR IGNORE INTO system_mail_campaigns
  (id, title, body, sent_at, currencies_json, materials_json, class_xp)
SELECT 'national-day-2026-nnnn1-resend-2026-10-06',
       title, body, unixepoch('now') * 1000, currencies_json, materials_json, class_xp
FROM system_mail_campaigns
WHERE id = 'national-day-2026';

INSERT OR IGNORE INTO system_mail_recipients
  (campaign_id, player_id, sent_at)
SELECT campaign.id, account.player_id, campaign.sent_at
FROM system_mail_campaigns AS campaign
JOIN accounts AS account
  ON account.player_id = '431a1b11-1745-46df-bedf-575e83ec31f7'
 AND account.username = 'nnnn1'
WHERE campaign.id = 'national-day-2026-nnnn1-resend-2026-10-06'
  AND account.created_at <= campaign.sent_at;