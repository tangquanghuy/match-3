# Database mail campaigns

The Worker reads pending D1 recipients when a player loads their save. Delivery is
written to that player's Durable Object before `delivered_at` is set in D1. A retry
with the same campaign ID does not add another mail item.

After migration `0006_system_mail.sql` and the Worker version containing
`deliverPendingSystemMail` are deployed, later campaigns need only D1 SQL:

```sql
INSERT INTO system_mail_campaigns
  (id, title, body, sent_at, currencies_json, materials_json, class_xp)
VALUES
  ('unique-campaign-id', '标题', '正文', unixepoch('now') * 1000,
   '{"gold":1000000,"gems":5000}', '{}', 0);

INSERT OR IGNORE INTO system_mail_recipients
  (campaign_id, player_id, sent_at)
SELECT campaign.id, account.player_id, campaign.sent_at
FROM system_mail_campaigns AS campaign
JOIN accounts AS account ON account.created_at <= campaign.sent_at
WHERE campaign.id = 'unique-campaign-id';
```

Use a new ID for each campaign. The recipient snapshot excludes accounts created
after the campaign timestamp. Run a campaign file with:

```text
cd worker
npx wrangler d1 execute gems-meta --remote --file campaigns/<file>.sql
```

Check who was targeted and who has loaded the mail into their save:

```sql
SELECT recipient.player_id, account.username, recipient.sent_at,
       recipient.delivered_at
FROM system_mail_recipients AS recipient
JOIN accounts AS account ON account.player_id = recipient.player_id
WHERE recipient.campaign_id = 'unique-campaign-id'
ORDER BY recipient.sent_at, recipient.player_id;
```

`delivered_at IS NULL` means the player has not loaded the mail yet. Attachment
claim state remains in the player's Durable Object save.
