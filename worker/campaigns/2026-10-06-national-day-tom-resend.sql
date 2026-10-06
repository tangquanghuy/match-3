-- Single-recipient National Day resend for tom; safe to rerun without duplicating mail.
-- Copies title, body, and attachment amounts from the original campaign.
INSERT OR IGNORE INTO system_mail_campaigns
  (id, title, body, sent_at, currencies_json, materials_json, class_xp)
SELECT 'national-day-2026-tom-resend-2026-10-06',
       title, body, unixepoch('now') * 1000, currencies_json, materials_json, class_xp
FROM system_mail_campaigns
WHERE id = 'national-day-2026';

INSERT OR IGNORE INTO system_mail_recipients
  (campaign_id, player_id, sent_at)
SELECT campaign.id, account.player_id, campaign.sent_at
FROM system_mail_campaigns AS campaign
JOIN accounts AS account
  ON account.player_id = '1a757956-a0b9-41ac-9de1-5c2245103977'
 AND account.username = 'tom'
WHERE campaign.id = 'national-day-2026-tom-resend-2026-10-06'
  AND account.created_at <= campaign.sent_at;
