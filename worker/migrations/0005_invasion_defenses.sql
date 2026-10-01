-- Only server-settled player-vs-player battles. One event per authoritative attacker ticket.
-- Store public owner keys, so delivery still works after an old mirror expires.
CREATE TABLE IF NOT EXISTS invasion_defenses (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  attacker_snapshot TEXT,
  revenge INTEGER NOT NULL DEFAULT 0 CHECK (revenge IN (0, 1)),
  attacker_id TEXT NOT NULL,
  battle_id TEXT NOT NULL,
  defender_key TEXT NOT NULL,
  attacker_key TEXT NOT NULL,
  at INTEGER NOT NULL,
  defender_won INTEGER NOT NULL CHECK (defender_won IN (0, 1)),
  surrendered INTEGER NOT NULL CHECK (surrendered IN (0, 1)),
  frenzy INTEGER NOT NULL CHECK (frenzy IN (0, 1)),
  UNIQUE (attacker_id, battle_id)
);
CREATE INDEX IF NOT EXISTS invasion_defenses_history
  ON invasion_defenses (defender_key, at DESC, battle_id DESC, defender_won);

CREATE INDEX IF NOT EXISTS invasion_defenses_inbox ON invasion_defenses (defender_key, sequence);
