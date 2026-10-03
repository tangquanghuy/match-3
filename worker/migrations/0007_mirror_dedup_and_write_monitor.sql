-- Immutable combat snapshots. Existing rows are moved into this table before
-- their inline payloads are cleared; old Worker writes remain readable during rollout.
CREATE TABLE IF NOT EXISTS mirror_snapshots (
  snapshot_key TEXT PRIMARY KEY,
  snapshot TEXT NOT NULL,
  first_player_id TEXT,
  created_at INTEGER NOT NULL
);

ALTER TABLE invasion_mirrors ADD COLUMN snapshot_ref TEXT;
ALTER TABLE invasion_defenses ADD COLUMN attacker_snapshot_ref TEXT;

INSERT INTO mirror_snapshots (snapshot_key, snapshot, first_player_id, created_at)
SELECT 'legacy-' || row_number() OVER (ORDER BY snapshot), snapshot, NULL, unixepoch('now') * 1000
FROM (
  SELECT snapshot FROM invasion_mirrors WHERE snapshot <> '{}'
  UNION
  SELECT attacker_snapshot AS snapshot FROM invasion_defenses WHERE attacker_snapshot IS NOT NULL
);

UPDATE invasion_mirrors
SET snapshot_ref = (SELECT snapshot_key FROM mirror_snapshots WHERE snapshot = invasion_mirrors.snapshot LIMIT 1),
    snapshot = '{}'
WHERE snapshot <> '{}';

UPDATE invasion_defenses
SET attacker_snapshot_ref = (SELECT snapshot_key FROM mirror_snapshots WHERE snapshot = invasion_defenses.attacker_snapshot LIMIT 1),
    attacker_snapshot = NULL
WHERE attacker_snapshot IS NOT NULL;

CREATE INDEX IF NOT EXISTS invasion_mirrors_snapshot_ref ON invasion_mirrors (snapshot_ref);
CREATE INDEX IF NOT EXISTS invasion_defenses_snapshot_ref ON invasion_defenses (attacker_snapshot_ref);
CREATE INDEX IF NOT EXISTS invasion_defenses_at ON invasion_defenses (at);

-- Each bucket is a UTC hour. The view covers the current hour and previous 23.
-- Counts are logical business rows changed, not the monitor table's own writes.
CREATE TABLE IF NOT EXISTS player_write_hourly (
  player_id TEXT NOT NULL,
  hour_start INTEGER NOT NULL,
  source TEXT NOT NULL,
  write_count INTEGER NOT NULL DEFAULT 0,
  payload_bytes INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (player_id, hour_start, source)
);
CREATE INDEX IF NOT EXISTS player_write_hourly_time ON player_write_hourly (hour_start);

CREATE VIEW IF NOT EXISTS player_writes_24h AS
SELECT p.player_id, a.username,
       SUM(p.write_count) AS writes_24h,
       SUM(p.payload_bytes) AS payload_bytes_24h,
       SUM(CASE WHEN p.source = 'mirror' THEN p.write_count ELSE 0 END) AS mirror_writes_24h,
       SUM(CASE WHEN p.source = 'defense' THEN p.write_count ELSE 0 END) AS defense_writes_24h,
       SUM(CASE WHEN p.source = 'weekly' THEN p.write_count ELSE 0 END) AS weekly_writes_24h,
       SUM(CASE WHEN p.source = 'snapshot' THEN p.write_count ELSE 0 END) AS snapshot_writes_24h
FROM player_write_hourly p LEFT JOIN accounts a ON a.player_id = p.player_id
WHERE p.hour_start >= (CAST(unixepoch('now') / 3600 AS INTEGER) - 23) * 3600000
GROUP BY p.player_id, a.username;

CREATE TRIGGER mirror_write_insert AFTER INSERT ON invasion_mirrors BEGIN
  INSERT INTO player_write_hourly VALUES (NEW.player_id, CAST(unixepoch('now') / 3600 AS INTEGER) * 3600000,
    'mirror', 1, length(NEW.snapshot) + 128)
  ON CONFLICT(player_id, hour_start, source) DO UPDATE SET
    write_count = write_count + 1, payload_bytes = payload_bytes + excluded.payload_bytes;
END;
CREATE TRIGGER mirror_write_update AFTER UPDATE ON invasion_mirrors BEGIN
  INSERT INTO player_write_hourly VALUES (NEW.player_id, CAST(unixepoch('now') / 3600 AS INTEGER) * 3600000,
    'mirror', 1, length(NEW.snapshot) + 128)
  ON CONFLICT(player_id, hour_start, source) DO UPDATE SET
    write_count = write_count + 1, payload_bytes = payload_bytes + excluded.payload_bytes;
END;
CREATE TRIGGER defense_write_insert AFTER INSERT ON invasion_defenses BEGIN
  INSERT INTO player_write_hourly VALUES (NEW.attacker_id, CAST(unixepoch('now') / 3600 AS INTEGER) * 3600000,
    'defense', 1, length(COALESCE(NEW.attacker_snapshot, '')) + 192)
  ON CONFLICT(player_id, hour_start, source) DO UPDATE SET
    write_count = write_count + 1, payload_bytes = payload_bytes + excluded.payload_bytes;
END;
CREATE TRIGGER weekly_write_insert AFTER INSERT ON invasion_weekly BEGIN
  INSERT INTO player_write_hourly VALUES (NEW.player_id, CAST(unixepoch('now') / 3600 AS INTEGER) * 3600000,
    'weekly', 1, 96)
  ON CONFLICT(player_id, hour_start, source) DO UPDATE SET write_count = write_count + 1, payload_bytes = payload_bytes + 96;
END;
CREATE TRIGGER weekly_write_update AFTER UPDATE ON invasion_weekly BEGIN
  INSERT INTO player_write_hourly VALUES (NEW.player_id, CAST(unixepoch('now') / 3600 AS INTEGER) * 3600000,
    'weekly', 1, 96)
  ON CONFLICT(player_id, hour_start, source) DO UPDATE SET write_count = write_count + 1, payload_bytes = payload_bytes + 96;
END;
CREATE TRIGGER snapshot_write_insert AFTER INSERT ON mirror_snapshots WHEN NEW.first_player_id IS NOT NULL BEGIN
  INSERT INTO player_write_hourly VALUES (NEW.first_player_id, CAST(unixepoch('now') / 3600 AS INTEGER) * 3600000,
    'snapshot', 1, length(NEW.snapshot))
  ON CONFLICT(player_id, hour_start, source) DO UPDATE SET
    write_count = write_count + 1, payload_bytes = payload_bytes + excluded.payload_bytes;
END;
