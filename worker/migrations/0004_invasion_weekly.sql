-- 入侵周榜：每名玩家每周一行（本周 VP + 当前联赛），每场入侵结算后覆盖写（见 worker/src/mirrorPool.ts）
CREATE TABLE IF NOT EXISTS invasion_weekly (
  player_id  TEXT    NOT NULL,
  owner_key  TEXT    NOT NULL,
  week_start INTEGER NOT NULL,
  league     INTEGER NOT NULL,
  vp         INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (player_id, week_start)
);

CREATE INDEX IF NOT EXISTS invasion_weekly_board
  ON invasion_weekly (week_start, league, vp DESC);
