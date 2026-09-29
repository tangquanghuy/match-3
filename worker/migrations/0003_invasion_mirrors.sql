-- 入侵真人镜像池：每名玩家每个联赛一份最新出击队快照（覆盖写），14 天过期（见 worker/src/mirrorPool.ts）
CREATE TABLE IF NOT EXISTS invasion_mirrors (
  player_id   TEXT    NOT NULL,
  -- 对外句柄（不可逆），客户端只见到它
  owner_key   TEXT    NOT NULL,
  league      INTEGER NOT NULL,
  week_start  INTEGER NOT NULL,
  ruleset     TEXT    NOT NULL,
  power       INTEGER NOT NULL,
  vp          INTEGER NOT NULL,
  -- JSON：team / defense / heroLevel / bannerKingdom / teamHash
  snapshot    TEXT    NOT NULL,
  recorded_at INTEGER NOT NULL,
  PRIMARY KEY (player_id, league)
);

CREATE INDEX IF NOT EXISTS invasion_mirrors_match
  ON invasion_mirrors (ruleset, league, recorded_at DESC);
