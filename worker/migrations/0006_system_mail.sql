CREATE TABLE IF NOT EXISTS system_mail_campaigns (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  sent_at INTEGER NOT NULL,
  currencies_json TEXT NOT NULL DEFAULT '{}',
  materials_json TEXT NOT NULL DEFAULT '{}',
  class_xp INTEGER NOT NULL DEFAULT 0,
  CHECK (json_valid(currencies_json)),
  CHECK (json_valid(materials_json))
);

CREATE TABLE IF NOT EXISTS system_mail_recipients (
  campaign_id TEXT NOT NULL REFERENCES system_mail_campaigns(id),
  player_id TEXT NOT NULL REFERENCES accounts(player_id),
  sent_at INTEGER NOT NULL,
  delivered_at INTEGER,
  PRIMARY KEY (campaign_id, player_id)
);

CREATE INDEX IF NOT EXISTS system_mail_pending
  ON system_mail_recipients (player_id, delivered_at);
