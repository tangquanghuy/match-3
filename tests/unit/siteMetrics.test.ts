import { afterEach, describe, expect, it } from 'vitest';
import type { DatabaseSync as Sqlite } from 'node:sqlite';
import { createRequire } from 'node:module';
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');
import { readFileSync } from 'node:fs';
import type { Env } from '../../worker/src/env';
import { recordPageView, recordPresence, siteMetrics } from '../../worker/src/siteMetrics';
import { handleAdmin } from '../../worker/src/admin';

const dbs: Sqlite[] = [];
afterEach(() => { for (const db of dbs.splice(0)) db.close(); });
function fixture(): Env['DB'] {
  const sqlite = new DatabaseSync(':memory:'); dbs.push(sqlite);
  sqlite.exec(readFileSync('worker/migrations/0008_site_metrics.sql', 'utf8'));
  sqlite.exec('CREATE TABLE accounts (player_id TEXT PRIMARY KEY, username TEXT)');
  sqlite.prepare('INSERT INTO accounts VALUES (?, ?)').run('player-one', 'One');
  return { prepare(sql: string) {
    const stmt = sqlite.prepare(sql);
    return { all: async () => ({ results: stmt.all() }), bind(...args: unknown[]) {
      return {
        run: async () => stmt.run(...args as []),
        first: async () => stmt.get(...args as []) ?? null,
        all: async () => ({ results: stmt.all(...args as []) }),
      };
    } };
  } } as unknown as Env['DB'];
}

describe('page visits and confirmed online time (real SQLite)', () => {
  it('counts only explicitly recorded navigations in fixed hourly buckets', async () => {
    const db = fixture(); const hour = 100 * 3600000;
    await recordPageView(db, '/', hour + 1);
    await recordPageView(db, '/', hour + 2);
    await recordPageView(db, '/game', hour + 3);
    await recordPageView(db, '/', hour - 25 * 3600000);
    const metrics = await siteMetrics(db, hour + 10);
    expect(metrics.pages['/']).toEqual({ total: 3, recent: 2 });
    expect(metrics.pages['/game']).toEqual({ total: 1, recent: 1 });
  });
  it('uses server interval, ignores simultaneous tabs, idle gaps and first heartbeat', async () => {
    const db = fixture(); const t = 100 * 3600000 + 100000;
    expect(await recordPresence(db, 'player-one', true, t)).toBe(0);
    expect(await recordPresence(db, 'player-one', true, t + 30000)).toBe(30000);
    expect(await recordPresence(db, 'player-one', true, t + 30000)).toBe(0);
    expect(await recordPresence(db, 'player-one', false, t + 60000)).toBe(30000);
    expect(await recordPresence(db, 'player-one', true, t + 180000)).toBe(0);
    expect(await recordPresence(db, 'player-one', true, t + 240000)).toBe(0);
    expect(await recordPresence(db, 'player-one', true, t + 270000)).toBe(30000);
    const metrics = await siteMetrics(db, t + 270000);
    expect(metrics.activeMs24h).toBe(90000);
    expect(metrics.currentPlayers).toBe(1);
    expect(metrics.leaderboard[0]).toMatchObject({ player_id: 'player-one', total_ms: 90000 });
    expect((await siteMetrics(db, t + 320000)).currentPlayers).toBe(0);
  });  it('keeps site and individual usage reports behind the admin bearer token', async () => {
    const db = fixture();
    const id = '7b4715d7-5d72-4950-aed5-a88f6834532b';
    const env = { DB: db, ADMIN_READ_TOKEN: 'a'.repeat(64) } as Env;
    const base = 'https://example.test/api/admin/traffic';
    expect((await handleAdmin(new Request(base), new URL(base), env)).status).toBe(401);
    await recordPageView(db, '/', 100 * 3600000);
    await recordPresence(db, id, true, 100 * 3600000);
    await recordPresence(db, id, true, 100 * 3600000 + 30000);
    const request = (url: string) => new Request(url, { headers: { authorization: 'Bearer ' + 'a'.repeat(64) } });
    const response = await handleAdmin(request(base), new URL(base), env);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect((await response.json() as { pages: Record<string, { total: number }> }).pages['/'].total).toBe(1);
    const playerUrl = base + '/player/' + id;
    const player = await handleAdmin(request(playerUrl), new URL(playerUrl), env);
    expect((await player.json() as { presence: { total_ms: number } }).presence.total_ms).toBe(30000);
    expect((await handleAdmin(request(base + '/player/nope'), new URL(base + '/player/nope'), env)).status).toBe(404);
  });

});
