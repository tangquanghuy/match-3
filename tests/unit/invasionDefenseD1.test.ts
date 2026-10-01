import { afterEach, describe, expect, it } from 'vitest';
import { D1MirrorPool } from '../../worker/src/mirrorPool';
import { mirrorOwnerKey } from '../../src/meta/server/mirrorPool';
import { defenseRecord } from '../../src/meta/systems/invasionDefense';
import { buildDemoSave } from '../../src/meta/server/demo';

// Vitest 2's embedded Vite predates node:sqlite. Ask the runtime for the builtin
// directly instead of letting that older resolver rewrite it to a package name.
interface SqliteDatabase {
  exec(sql: string): void;
  close(): void;
  prepare(sql: string): {
    run(...args: (string | number | null)[]): unknown;
    all(...args: (string | number | null)[]): Record<string, unknown>[];
    get(...args: (string | number | null)[]): Record<string, unknown> | undefined;
  };
}
const runtime = globalThis as unknown as { process: { getBuiltinModule(name: string): unknown } };
const { DatabaseSync } = runtime.process.getBuiltinModule('node:sqlite') as { DatabaseSync: new (path: string) => SqliteDatabase };
const { readFileSync } = runtime.process.getBuiltinModule('node:fs') as { readFileSync(path: URL, encoding: string): string };
const databases: SqliteDatabase[] = [];
afterEach(() => { for (const db of databases.splice(0)) db.close(); });
/** Real SQLite statements + transactional batch, no production services involved. */
function database() {
  const db = new DatabaseSync(':memory:'); databases.push(db);
  for (const file of ['0001_accounts.sql', '0003_invasion_mirrors.sql', '0005_invasion_defenses.sql']) {
    db.exec(readFileSync(new URL(`../../worker/migrations/${file}`, import.meta.url), 'utf8'));
  }
  for (const [id, name] of [['attacker', '甲'], ['defender', '乙'], ['other', '丙']]) {
    db.prepare('INSERT INTO accounts VALUES (?, ?, ?, 1, 1)').run(id!, id!, name!);
  }
  function prepare(sql: string) {
    let args: (string | number | null)[] = [];
    return {
      bind(...values: (string | number | null)[]) { args = values; return this; },
      async run() { db.prepare(sql).run(...args); return { success: true, results: [] }; },
      async all() { return { success: true, results: db.prepare(sql).all(...args) }; },
      query() { return /^\s*SELECT/i.test(sql) ? this.all() : this.run(); },
    };
  }
  const adapter = {
    prepare,
    async batch(statements: ReturnType<typeof prepare>[]) {
      db.exec('BEGIN');
      try { const out = []; for (const s of statements) out.push(await s.query()); db.exec('COMMIT'); return out; }
      catch (error) { db.exec('ROLLBACK'); throw error; }
    },
  };
  return { db, adapter: adapter as unknown as ConstructorParameters<typeof D1MirrorPool>[0] };
}
const report = (id = 'ticket') => ({ id, defender: mirrorOwnerKey('defender'), at: 1000, defenderWon: false, surrendered: false, frenzy: false });

describe('D1 invasion defense storage (real SQLite)', () => {
  it('is idempotent per attacker ticket and isolates recipient reads', async () => {
    const { adapter } = database();
    const a = new D1MirrorPool(adapter, () => 'attacker'); const b = new D1MirrorPool(adapter, () => 'defender');
    await a.recordDefense(report()); await a.recordDefense({ ...report(), defenderWon: true });
    const log = await b.defenseLog(2000, 500);
    expect(log).toMatchObject({ fetchedAt: 2000, weekStart: 500, total: 1, wins: 0, weeklyTotal: 1, weeklyWins: 0 });
    expect(log.entries[0]).toMatchObject({ name: '甲', attacker: mirrorOwnerKey('attacker'), defenderWon: false });
    expect(JSON.stringify(log)).not.toContain('attacker_id');
    expect((await a.defenseLog(2000, 500)).total).toBe(0);
    // A second account can have an identically named ticket without colliding.
    await new D1MirrorPool(adapter, () => 'other').recordDefense(report());
    expect((await b.defenseLog(2000, 500)).total).toBe(2);
  });
  it('survives mirror expiration, caps recent history and preserves lifetime/week counters', async () => {
    const { adapter, db } = database();
    const a = new D1MirrorPool(adapter, () => 'attacker'); const b = new D1MirrorPool(adapter, () => 'defender');
    for (let i = 0; i < 55; i++) await a.recordDefense({ ...report(String(i)), at: i, defenderWon: i % 2 === 0 });
    db.exec('DELETE FROM invasion_mirrors');
    const log = await b.defenseLog(100, 10);
    expect(log).toMatchObject({ total: 55, wins: 28, weeklyTotal: 45, weeklyWins: 23 });
    expect(log.entries).toHaveLength(50); expect(log.entries[0]?.id).toBe('54');
    expect((await b.defenseLog(200, 101)).weeklyTotal).toBe(0);
  });
  it('returns an empty log with zero counters and ignores self attacks', async () => {
    const { adapter } = database(); const b = new D1MirrorPool(adapter, () => 'defender');
    await b.recordDefense(report());
    expect(await b.defenseLog(2000, 500)).toEqual({ fetchedAt: 2000, weekStart: 500, total: 0, wins: 0, weeklyTotal: 0, weeklyWins: 0, entries: [], pending: [], hasMore: false });
  });
  it('rejects missing actor identity so pending reports are retained', async () => {
    const { adapter } = database();
    await expect(new D1MirrorPool(adapter, () => null).recordDefense(report())).rejects.toThrow('identity');
  });
  it('publishes the independent roster and atomically removes superseded historical league snapshots', async () => {
    const { adapter, db } = database();
    const b = new D1MirrorPool(adapter, () => 'defender'); const a = new D1MirrorPool(adapter, () => 'attacker');
    const save = buildDemoSave(1000); save.invasion.defenseTeam = structuredClone(save.teams[0]!);
    const record = defenseRecord(save, 1000)!;
    await b.publish({ ...record, league: 0, explicitDefense: false });
    await b.publish({ ...record, league: 1, explicitDefense: false });
    await a.publish({ ...record, league: 2, explicitDefense: false });
    await b.publish({ ...record, league: 3 });
    expect(db.prepare('SELECT league FROM invasion_mirrors WHERE player_id = ?').all('defender')).toEqual([{ league: 3 }]);
    expect(db.prepare('SELECT COUNT(*) AS n FROM invasion_mirrors').get()).toEqual({ n: 2 });
    const found = await a.sample({ leagueMin: 0, leagueMax: 9, powerMin: 0, powerMax: 1000000, since: 0, ruleset: record.ruleset, limit: 30 });
    expect(found).toHaveLength(1); expect(found[0]?.team).toEqual(record.team);
  });
  it('pages the durable inbox by sequence, not the last 50 or mutable timestamps', async () => {
    const { adapter } = database();
    const a = new D1MirrorPool(adapter, () => 'attacker'); const b = new D1MirrorPool(adapter, () => 'defender');
    for (let i = 0; i < 205; i++) await a.recordDefense({ ...report(`ticket-${i}`), at: 1000 - i });
    const first = await b.defenseLog(2000, 500, 0);
    expect(first.pending).toHaveLength(200); expect(first.hasMore).toBe(true);
    expect(first.pending?.[0]?.id).toBe('ticket-0'); expect(first.entries).toHaveLength(50);
    const cursor = first.pending!.at(-1)!.sequence!;
    const last = await b.defenseLog(2000, 500, cursor);
    expect(last.pending).toHaveLength(5); expect(last.hasMore).toBe(false);
    expect(last.pending?.[0]?.id).toBe('ticket-200');
    await a.recordDefense(report('ticket-0')); // duplicate retry must not reenter an acknowledged inbox
    expect((await b.defenseLog(2000, 500, last.pending!.at(-1)!.sequence!)).pending).toEqual([]);
  });
  it('round-trips revenge snapshots and tolerates corrupt snapshot JSON without losing the event', async () => {
    const { adapter, db } = database();
    const save = buildDemoSave(1000); save.invasion.defenseTeam = structuredClone(save.teams[0]!);
    const snapshot = defenseRecord(save, 1000)!;
    const a = new D1MirrorPool(adapter, () => 'attacker'); const b = new D1MirrorPool(adapter, () => 'defender');
    await a.recordDefense({ ...report(), revenge: true, attackerSnapshot: snapshot });
    const entry = (await b.defenseLog(2000, 500)).entries[0]!;
    expect(entry.attackerSnapshot).toEqual(snapshot); expect(entry.revenge).toBe(true);
    db.prepare('UPDATE invasion_defenses SET attacker_snapshot = ?').run('{broken');
    const log = await b.defenseLog(2000, 500);
    expect(log.total).toBe(1); expect(log.entries[0]?.attackerSnapshot).toBeUndefined();
    expect(log.pending?.[0]?.sequence).toBe(entry.sequence);
  });

});
