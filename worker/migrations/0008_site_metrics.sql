-- Page navigations (not asset requests), UTC-hour buckets. No visitor identifiers are stored.
CREATE TABLE site_page_hourly (
  hour_start INTEGER NOT NULL,
  path TEXT NOT NULL CHECK (path IN ('/', '/game')),
  views INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (hour_start, path)
);

-- Server-timed active foreground game presence; one row per authenticated account.
CREATE TABLE player_presence (
  player_id TEXT PRIMARY KEY,
  last_seen INTEGER NOT NULL,
  active INTEGER NOT NULL CHECK (active IN (0, 1)),
  total_ms INTEGER NOT NULL DEFAULT 0,
  credited_ms INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE player_active_hourly (
  player_id TEXT NOT NULL,
  hour_start INTEGER NOT NULL,
  active_ms INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (player_id, hour_start)
);
CREATE INDEX player_active_hourly_hour ON player_active_hourly(hour_start);
