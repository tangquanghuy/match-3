-- 记录玩家同意的用户协议版本（src/legal/terms.ts 的 TERMS_VERSION）
ALTER TABLE accounts ADD COLUMN terms_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE accounts ADD COLUMN terms_agreed_at INTEGER;
