-- Two single-recipient catch-up mails for 奈落七海; fixed IDs prevent duplicate delivery on rerun.
-- Copy original campaign contents, amounts, and class XP; only this exact account is eligible.
INSERT OR IGNORE INTO system_mail_campaigns
  (id, title, body, sent_at, currencies_json, materials_json, class_xp)
SELECT 'national-day-2026-4abad426-topup-2026-10-06',
       title, body, unixepoch('now') * 1000, currencies_json, materials_json, class_xp
FROM system_mail_campaigns
WHERE id = 'national-day-2026';

INSERT OR IGNORE INTO system_mail_campaigns
  (id, title, body, sent_at, currencies_json, materials_json, class_xp)
SELECT 'creation-corridor-9000-likes-4abad426-topup-2026-10-06',
       title, body, unixepoch('now') * 1000, currencies_json, materials_json, class_xp
FROM system_mail_campaigns
WHERE id = 'creation-corridor-9000-likes-2026-10-06';

INSERT OR IGNORE INTO system_mail_recipients
  (campaign_id, player_id, sent_at)
SELECT campaign.id, account.player_id, campaign.sent_at
FROM system_mail_campaigns AS campaign
JOIN accounts AS account
  ON account.player_id = '4abad426-010a-4c5a-93f3-ea5ba5c71d4e'
 AND account.username = '奈落七海'
WHERE campaign.id IN (
  'national-day-2026-4abad426-topup-2026-10-06',
  'creation-corridor-9000-likes-4abad426-topup-2026-10-06'
) AND account.created_at <= campaign.sent_at;