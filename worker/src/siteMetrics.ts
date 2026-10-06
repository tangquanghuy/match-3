import type { Env } from './env';

const HOUR = 3600000;
const MAX_CREDIT_MS = 45000;

export async function recordPageView(db: Env['DB'], path: '/' | '/game', now = Date.now()): Promise<void> {
  await db.prepare(`INSERT INTO site_page_hourly (hour_start, path, views) VALUES (?, ?, 1)
    ON CONFLICT(hour_start, path) DO UPDATE SET views = views + 1`)
    .bind(Math.floor(now / HOUR) * HOUR, path).run();
}

/** One serialized SQLite UPDATE per player ensures parallel tabs cannot credit the same interval twice. */
export async function recordPresence(db: Env['DB'], playerId: string, active: boolean, now = Date.now()): Promise<number> {
  await db.prepare(`INSERT OR IGNORE INTO player_presence (player_id, last_seen, active) VALUES (?, ?, ?)`)
    .bind(playerId, now, Number(active)).run();
  const row = await db.prepare(`UPDATE player_presence SET
      credited_ms = CASE WHEN active = 1 AND ? - last_seen BETWEEN 1 AND ?
        THEN ? - last_seen ELSE 0 END,
      total_ms = total_ms + CASE WHEN active = 1 AND ? - last_seen BETWEEN 1 AND ?
        THEN ? - last_seen ELSE 0 END,
      last_seen = ?, active = ?
    WHERE player_id = ? AND last_seen < ? RETURNING credited_ms`)
    .bind(now, MAX_CREDIT_MS, now,
      now, MAX_CREDIT_MS, now, now, Number(active), playerId, now)
    .first<{ credited_ms: number }>();
  const credited = row?.credited_ms ?? 0;
  if (credited > 0) {
    await db.prepare(`INSERT INTO player_active_hourly (player_id, hour_start, active_ms) VALUES (?, ?, ?)
      ON CONFLICT(player_id, hour_start) DO UPDATE SET active_ms = active_ms + excluded.active_ms`)
      .bind(playerId, Math.floor(now / HOUR) * HOUR, credited).run();
  }
  return credited;
}

export async function siteMetrics(db: Env['DB'], now = Date.now()) {
  const hourStart = Math.floor(now / HOUR) * HOUR;
  const page = await db.prepare(`SELECT path, SUM(views) AS total,
    SUM(CASE WHEN hour_start >= ? THEN views ELSE 0 END) AS recent
    FROM site_page_hourly GROUP BY path`).bind(hourStart - 23 * HOUR).all<{ path: string; total: number; recent: number }>();
  const online = await db.prepare(`SELECT COUNT(DISTINCT player_id) AS players,
    COALESCE(SUM(active_ms), 0) AS active_ms FROM player_active_hourly WHERE hour_start >= ?`)
    .bind(hourStart - 23 * HOUR).first<{ players: number; active_ms: number }>();
  const current = await db.prepare(`SELECT COUNT(*) AS players FROM player_presence
    WHERE active = 1 AND last_seen >= ?`).bind(now - MAX_CREDIT_MS).first<{ players: number }>();
  const leaderboard = await db.prepare(`SELECT p.player_id, a.username, p.total_ms, p.last_seen,
    p.active FROM player_presence p JOIN accounts a ON a.player_id = p.player_id
    ORDER BY p.total_ms DESC LIMIT 30`).all();
  return { pages: Object.fromEntries(['/', '/game'].map(path => [path, {
    total: page.results.find(p => p.path === path)?.total ?? 0,
    recent: page.results.find(p => p.path === path)?.recent ?? 0,
  }])), activeMs24h: online?.active_ms ?? 0,
    currentPlayers: current?.players ?? 0, activePlayers24h: online?.players ?? 0, leaderboard: leaderboard.results };
}
