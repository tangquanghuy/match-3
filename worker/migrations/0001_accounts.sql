-- 账号表：Discord 用户 → 玩家 id（玩家 id 同时是 Durable Object 的名字）
CREATE TABLE IF NOT EXISTS accounts (
  player_id     TEXT PRIMARY KEY,
  discord_id    TEXT NOT NULL UNIQUE,
  username      TEXT NOT NULL,
  created_at    INTEGER NOT NULL,
  last_login_at INTEGER NOT NULL
);
