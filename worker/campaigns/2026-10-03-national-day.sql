-- Re-running this file does not duplicate recipients or move the original cutoff.
INSERT OR IGNORE INTO system_mail_campaigns
  (id, title, body, sent_at, currencies_json, materials_json)
VALUES
  ('national-day-2026', '国庆快乐', '国庆快乐', unixepoch('now') * 1000,
   '{"gold":1000000,"gems":5000}', '{}');

INSERT OR IGNORE INTO system_mail_recipients
  (campaign_id, player_id, sent_at)
SELECT campaign.id, account.player_id, campaign.sent_at
FROM system_mail_campaigns AS campaign
JOIN accounts AS account ON account.created_at <= campaign.sent_at
WHERE campaign.id = 'national-day-2026';
