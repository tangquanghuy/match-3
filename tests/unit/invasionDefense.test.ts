import { describe, it, expect, vi } from 'vitest';
import { buildDemoSave } from '../../src/meta/server/demo';
import { runCommand } from '../../src/meta/server/core';
import { defaultEnv } from '../../src/meta/server/env';
import { MetaHost, type SaveRepository, type RecordBatch } from '../../src/meta/server/host';
import { MemoryMirrorStore, mirrorOwnerKey, type InvasionMirrorPool } from '../../src/meta/server/mirrorPool';
import { defenseRecord, hydrateDefenseLog, hydrateDefenseReports, defenseEntryKey, DEFENSE_REWARD, DEFENSE_VP, type DefenseReport } from '../../src/meta/systems/invasionDefense';
import { invasionPlayerPower } from '../../src/meta/systems/invasion';
import { INVASION_MATCHMAKING } from '../../src/meta/data/invasionMatchmaking';
import { INVASION_RANKS } from '../../src/meta/data/invasionRanks';
import { mirrorFromEntry } from '../../src/meta/systems/invasionMirrors';
import { saveToRecords, recordsToSave, type SaveRecords } from '../../src/meta/state/records';
import { weekStartOf } from '../../src/meta/gateway/clock';
import { RULESET_VERSION, type BattleResult } from '../../src/session/contract';
import type { MetaSave } from '../../src/meta/state/schema';

const NOW = Date.UTC(2026, 8, 30, 12);
const WEEK = weekStartOf(NOW);
const env = defaultEnv({ now: () => NOW, seed: () => 1234, allowDev: true });
function configured(): MetaSave {
  const save = buildDemoSave(NOW);
  return runCommand(save, { type: 'setInvasionDefense', args: { index: 0 } }, env).save;
}
function staged(): MetaSave {
  const save = configured();
  const record = defenseRecord(save, NOW)!;
  const mirror = mirrorFromEntry({ ...record, ownerKey: mirrorOwnerKey('defender'), name: '防守方' }, 'normal', `-w${WEEK}-l${save.invasion.league}-r0`);
  save.invasion.roster = { weekStart: WEEK, league: save.invasion.league, refresh: 0, builtAt: NOW,
    playerPower: invasionPlayerPower(save), mirrors: [mirror] };
  const outcome = runCommand(save, { type: 'planInvasionBattle', args: { mirrorId: mirror.id } }, env);
  expect(outcome.result.ok).toBe(true);
  return outcome.save;
}
function result(save: MetaSave, winner: 'player' | 'enemy' = 'player'): BattleResult {
  return { schemaVersion: 1, rulesetVersion: RULESET_VERSION, requestId: save.pendingBattle!.requestId,
    battleId: 'fixture', seed: 1234, winner, turns: 4, combatants: [], defeatedExternalIds: [],
    summonedCount: 0, actionLogDigest: 'fixture', eventSummary: [] };
}
class Repo implements SaveRepository {
  records: SaveRecords;
  failNext = false;
  constructor(save: MetaSave) { this.records = saveToRecords(save); }
  async load() { return { records: new Map(this.records), warning: null }; }
  async write(batch: RecordBatch) {
    if (this.failNext) { this.failNext = false; throw new Error('disk offline'); }
    for (const key of batch.del) this.records.delete(key);
    for (const [k, v] of batch.set) this.records.set(k, v);
  }
}
function host(repo: Repo, pool: InvasionMirrorPool, schedule = vi.fn()) {
  return new MetaHost(repo, env, { fresh: 'demo', mirrorPool: pool, schedule });
}

describe('independent defense roster', () => {
  it('copies a validated preset, without changing the active offense or currencies', () => {
    const save = buildDemoSave(NOW);
    save.teams.push({ ...structuredClone(save.teams[0]!), name: '驻军', members: [...save.teams[0]!.members].reverse() });
    const outcome = runCommand(save, { type: 'setInvasionDefense', args: { index: 1 } }, env);
    expect(outcome.result).toEqual({ ok: true });
    expect(outcome.save.activeTeamIndex).toBe(0);
    expect(outcome.save.currencies).toEqual(save.currencies);
    expect(outcome.save.invasion.defenseTeam).toEqual(save.teams[1]);
    expect(outcome.save.invasion.defensePublishPending).toBe(true);
    expect(defenseRecord(outcome.save, NOW)?.team[0]?.templateId).toBe(save.teams[1]!.members[0]?.kind === 'troop' ? String(save.teams[1]!.members[0].troopId) : undefined);
    save.teams[1]!.members.reverse();
    expect(outcome.save.invasion.defenseTeam?.members).not.toEqual(save.teams[1]!.members);
  });
  it.each([-1, 99, 0.5, Number.NaN])('rejects invalid preset %s atomically', index => {
    const s = configured();
    const out = runCommand(s, { type: 'setInvasionDefense', args: { index } }, env);
    expect(out.result.ok).toBe(false); expect(out.commit).toBe(false); expect(out.save).toBe(s);
  });
  it('rejects locked mode and incomplete/duplicate/unowned rosters', () => {
    for (const kind of ['locked', 'short', 'duplicate', 'unowned']) {
      const s = configured();
      if (kind === 'locked') s.hero.level = 1;
      if (kind === 'short') s.teams[0]!.members.pop();
      if (kind === 'duplicate') s.teams[0]!.members = Array.from({ length: 4 }, () => ({ kind: 'hero' }));
      if (kind === 'unowned') s.collection = {};
      const out = runCommand(s, { type: 'setInvasionDefense', args: { index: 0 } }, env);
      expect(out.result.ok).toBe(false); expect(out.commit).toBe(false);
    }
  });
  it('preset edits, activation and deletion never replace the saved defense', () => {
    let save = configured();
    const defense = structuredClone(save.invasion.defenseTeam);
    save.teams.push({ ...structuredClone(save.teams[0]!), name: '进攻二队' });
    save = runCommand(save, { type: 'activateTeam', args: { index: 1 } }, env).save;
    save = runCommand(save, { type: 'saveTeam', args: { index: 0, team: { ...save.teams[0]!, members: [...save.teams[0]!.members].reverse() } } }, env).save;
    save = runCommand(save, { type: 'deleteTeam', args: { index: 0 } }, env).save;
    expect(save.invasion.defenseTeam).toEqual(defense);
  });
  it('initializes legacy players on invasion sync and round-trips independent defense', () => {
    const save = buildDemoSave(NOW);
    expect(save.invasion.defenseTeam).toBeNull();
    const out = runCommand(save, { type: 'syncInvasionSeason', args: {} }, env);
    expect(out.save.invasion.defenseTeam).toEqual(save.teams[0]);
    expect(out.save.invasion.defensePublishPending).toBe(true);
    const loaded = recordsToSave(saveToRecords(out.save), NOW);
    expect(loaded.invasion.defenseTeam).toEqual(save.teams[0]);
    expect(loaded.invasion.defenseOutbox).toEqual([]);
  });
  it('publishes current defense, not the attacking team, at battle settlement', () => {
    const s = staged();
    s.invasion.defenseTeam!.members.reverse();
    const expected = defenseRecord(s, NOW)!;
    const out = runCommand(s, { type: 'settleBattle', args: { result: result(s) } }, env);
    expect(out.save.invasion.defensePublishPending).toBe(true);
    expect(defenseRecord(out.save, NOW)?.team).toEqual(expected.team);
  });
  it('replaces historical league mirrors when explicitly deploying a defense', async () => {
    const store = new MemoryMirrorStore();
    const pool = store.forOwner('defender');
    const record = defenseRecord(configured(), NOW)!;
    await pool.publish({ ...record, league: 0, explicitDefense: false });
    await pool.publish({ ...record, league: 2, explicitDefense: false });
    expect(store.size).toBe(2);
    await pool.publish({ ...record, league: 3 });
    expect(store.size).toBe(1);
  });
});

describe('incoming defense records', () => {
  it.each(['player', 'enemy'] as const)('settles from the defender perspective (%s wins), once per ticket', winner => {
    const s = staged();
    const out = runCommand(s, { type: 'settleBattle', args: { result: result(s, winner) } }, env);
    expect(out.result.ok).toBe(true);
    expect(out.save.invasion.defenseOutbox).toHaveLength(1);
    expect(out.save.invasion.defenseOutbox[0]).toMatchObject({ defender: mirrorOwnerKey('defender'), defenderWon: winner === 'enemy', at: NOW });
    const again = runCommand(out.save, { type: 'settleBattle', args: { result: result(s, winner) } }, env);
    expect(again.commit).toBe(false);
    expect(again.save.invasion.defenseOutbox).toHaveLength(1);
  });
  it('forfeit records a defense victory, NPCs never create incoming reports', () => {
    const s = staged();
    const out = runCommand(s, { type: 'forfeitPendingBattle', args: {} }, env);
    expect(out.save.invasion.defenseOutbox[0]).toMatchObject({ defenderWon: true, surrendered: true });
    const npc = staged();
    if (npc.pendingBattle?.mode === 'invasion') delete npc.pendingBattle.mirror.player;
    const done = runCommand(npc, { type: 'settleBattle', args: { result: result(npc) } }, env);
    expect(done.save.invasion.defenseOutbox).toEqual([]);
  });
  it('ignores invalid request ids and rulesets without creating reports', () => {
    for (const bad of [{ requestId: 'forged' }, { rulesetVersion: 'wrong' }]) {
      const s = staged();
      const out = runCommand(s, { type: 'settleBattle', args: { result: { ...result(s), ...bad } } }, env);
      expect(out.commit).toBe(false); expect(out.save.invasion.defenseOutbox).toEqual([]);
    }
  });
  it('records attacker identity through bound pool, deduplicates retries and ignores self attacks', async () => {
    const store = new MemoryMirrorStore();
    const attacker = store.forOwner('attacker', '<b>名字</b>');
    const defender = store.forOwner('defender');
    const r = { id: 'ticket', defender: mirrorOwnerKey('defender'), at: NOW, defenderWon: false, surrendered: false, frenzy: true };
    await attacker.recordDefense(r); await attacker.recordDefense(r);
    await defender.recordDefense({ ...r, id: 'self' });
    const log = await defender.defenseLog(NOW, WEEK);
    expect(log).toMatchObject({ total: 1, wins: 0, weeklyTotal: 1, weeklyWins: 0 });
    expect(log.entries[0]).toMatchObject({ attacker: mirrorOwnerKey('attacker'), name: '<b>名字</b>', frenzy: true });
    expect((await attacker.defenseLog(NOW, WEEK)).total).toBe(0);
  });
  it('caps history at 50, retains lifetime totals and rolls weekly counts without losing configuration', async () => {
    const store = new MemoryMirrorStore();
    const attack = store.forOwner('a'); const defense = store.forOwner('d');
    for (let i = 0; i < 60; i++) await attack.recordDefense({ id: `${i}`, defender: mirrorOwnerKey('d'), at: i < 10 ? WEEK - 1 : NOW + i, defenderWon: i % 2 === 0, surrendered: false, frenzy: false });
    const log = await defense.defenseLog(NOW + 100, WEEK);
    expect(log).toMatchObject({ total: 60, wins: 30, weeklyTotal: 50, weeklyWins: 25 });
    expect(log.entries).toHaveLength(50);
    expect(log.entries[0]!.id).toBe('59');
    const next = await defense.defenseLog(NOW + 7 * 86400000, WEEK + 7 * 86400000);
    expect(next.weeklyTotal).toBe(0); expect(next.total).toBe(60);
    const s = configured();
    const nextSave = runCommand(s, { type: 'syncInvasionSeason', args: {} }, { ...env, now: () => NOW + 7 * 86400000 }).save;
    expect(nextSave.invasion.defenseTeam).toEqual(s.invasion.defenseTeam);
  });
  it('rejects malformed hydrated logs/reports and retains valid delivery across save hydration', () => {
    const s = staged();
    const out = runCommand(s, { type: 'settleBattle', args: { result: result(s) } }, env);
    expect(recordsToSave(saveToRecords(out.save), NOW).invasion.defenseOutbox).toEqual(out.save.invasion.defenseOutbox);
    expect(hydrateDefenseReports([null, {}, { at: NaN }])).toEqual([]);
    expect(hydrateDefenseLog({ total: -1 })).toBeNull();
  });
});

describe('durable cross-account delivery', () => {
  it('publishes leveled defense units from PvE without opening the PvP page', async () => {
    const store = new MemoryMirrorStore();
    const pool = store.forOwner('defender');
    const publish = vi.spyOn(pool, 'publish');
    const defender = host(new Repo(buildDemoSave(NOW)), pool);
    expect((await defender.execute({ type: 'setInvasionDefense', args: { index: 0 } })).result.ok).toBe(true);
    expect(publish).toHaveBeenCalledTimes(1);
    const troop = (await defender.load()).save.teams[0]!.members.find(m => m.kind === 'troop')!;
    const before = (await defender.load()).save.collection[String(troop.troopId)]!.level;
    expect((await defender.execute({ type: 'levelUpTroop', args: { troopId: troop.troopId } })).result.ok).toBe(true);
    expect(publish).toHaveBeenCalledTimes(2);
    const sampled = await store.forOwner('attacker').sample({ leagueMin: 0, leagueMax: 9,
      powerMin: 0, powerMax: 1_000_000, since: 0, ruleset: RULESET_VERSION, limit: 10 });
    expect(sampled).toHaveLength(1);
    expect(sampled[0]!.defense.find(d => d.troopId === troop.troopId)?.level).toBe(before + 1);
  });
  it('looks beyond adjacent leagues when a strong remote-rank defense is the only compatible mirror', async () => {
    const store = new MemoryMirrorStore();
    const defender = host(new Repo(buildDemoSave(NOW)), store.forOwner('far-defender'));
    expect((await defender.execute({ type: 'setInvasionDefense', args: { index: 0 } })).result.ok).toBe(true);
    const attackerSave = buildDemoSave(NOW);
    attackerSave.invasion.league = 9;
    attackerSave.invasion.bestLeague = 9;
    attackerSave.invasion.progressionVp = INVASION_RANKS.find(rank => rank.league === 9)!.vp;
    const pool = store.forOwner('attacker');
    const sample = vi.spyOn(pool, 'sample');
    const attacker = host(new Repo(attackerSave), pool);
    expect((await attacker.execute({ type: 'syncInvasionSeason', args: {} })).result.ok).toBe(true);
    expect(sample).toHaveBeenCalledTimes(2);
    expect(sample.mock.calls[0]![0]).toMatchObject({ leagueMin: 7, leagueMax: 9 });
    expect(sample.mock.calls[1]![0]).toMatchObject({ leagueMin: 0, leagueMax: 9 });
    const rivals = (await attacker.load()).save.invasion.roster!.mirrors;
    expect(rivals.some(m => m.player?.ownerKey === mirrorOwnerKey('far-defender'))).toBe(true);
    expect(rivals.filter(m => m.player).every(m => m.rating / invasionPlayerPower(attackerSave) >= 0.7
      && m.rating / invasionPlayerPower(attackerSave) <= 1.4)).toBe(true);
  });
  it('replaces an opponent snapshot after defense deployment and the next roster refresh', async () => {
    const store = new MemoryMirrorStore();
    let now = NOW;
    const clock = defaultEnv({ now: () => now, seed: () => 1234, allowDev: true });
    const league = 9; // normal slot always tries an eligible real opponent at this league
    const initial = () => {
      const save = buildDemoSave(NOW);
      save.hero.level = 83;
      save.invasion.weekStart = WEEK;
      save.invasion.progressionVp = INVASION_RANKS.find(rank => rank.league === league)!.vp;
      save.invasion.league = league;
      save.invasion.bestLeague = league;
      return save;
    };
    const defenderSave = initial();
    const members = defenderSave.teams[0]!.members;
    defenderSave.teams.push({ ...structuredClone(defenderSave.teams[0]!), name: 'Second defense',
      members: [members[0]!, members[2]!, members[1]!, members[3]!] });
    const defender = new MetaHost(new Repo(defenderSave), clock,
      { fresh: 'demo', mirrorPool: store.forOwner('defender'), schedule: vi.fn() });
    const attacker = new MetaHost(new Repo(initial()), clock,
      { fresh: 'demo', mirrorPool: store.forOwner('attacker'), schedule: vi.fn() });
    expect((await defender.execute({ type: 'setInvasionDefense', args: { index: 0 } })).result.ok).toBe(true);
    await attacker.execute({ type: 'syncInvasionSeason', args: {} });
    const first = (await attacker.load()).save.invasion.roster!.mirrors.find(m => m.player?.heroLevel === 83);
    expect(first?.player?.team.map(c => c.templateId ?? 'hero')).toEqual(
      defenderSave.teams[0]!.members.map(m => m.kind === 'hero' ? 'hero' : String(m.troopId)));

    now += 1000;
    expect((await defender.execute({ type: 'setInvasionDefense', args: { index: 1 } })).result.ok).toBe(true);
    // Previously served rosters remain a stable battle selection within their lifetime.
    expect((await attacker.load()).save.invasion.roster!.mirrors.find(m => m.player)?.player?.team)
      .toEqual(first?.player?.team);
    now += INVASION_MATCHMAKING.republishMs;
    await attacker.execute({ type: 'syncInvasionSeason', args: {} });
    const updated = (await attacker.load()).save.invasion.roster!.mirrors.find(m => m.player?.heroLevel === 83);
    expect(updated?.player?.team.map(c => c.templateId ?? 'hero')).toEqual(
      defenderSave.teams[1]!.members.map(m => m.kind === 'hero' ? 'hero' : String(m.troopId)));
    expect(updated?.player?.recordedAt).toBe(NOW + 1000);
  });
  it('settles A, updates B on refresh, leaves currencies unclaimed and never reduces rank progress', async () => {
    const store = new MemoryMirrorStore();
    const s = staged(); const a = host(new Repo(s), store.forOwner('attacker', '进攻方'));
    const bSave = configured(); const b = host(new Repo(bSave), store.forOwner('defender'));
    const reply = await a.execute({ type: 'settleBattle', args: { result: result(s) } });
    expect(reply.result.ok).toBe(true);
    expect((await a.load({ preservePendingBattle: true })).save.invasion.defenseOutbox).toEqual([]);
    await b.execute({ type: 'syncInvasionDefense', args: {} });
    const loaded = (await b.load({ preservePendingBattle: true })).save;
    expect(loaded.invasion.defenseLog?.total).toBe(1);
    expect(loaded.currencies).toEqual(bSave.currencies);
    expect(loaded.invasion.vp).toBe(bSave.invasion.vp);
    expect(loaded.invasion.progressionVp).toBe(bSave.invasion.progressionVp);
  });
  it('persists a failed delivery, retries after restart, and deduplicates lost acknowledgements', async () => {
    const store = new MemoryMirrorStore();
    const bound = store.forOwner('attacker');
    const schedule = vi.fn();
    const flaky = { ...bound, recordDefense: vi.fn(async (r: Parameters<typeof bound.recordDefense>[0]) => {
      await bound.recordDefense(r); throw new Error('ack lost');
    }) };
    const s = staged(); const repo = new Repo(s);
    await host(repo, flaky, schedule).execute({ type: 'settleBattle', args: { result: result(s) } });
    expect(recordsToSave(repo.records, NOW).invasion.defenseOutbox).toHaveLength(1);
    expect(schedule).toHaveBeenCalledWith(30000, expect.any(Function));
    const restarted = host(repo, bound);
    expect((await restarted.load({ preservePendingBattle: true })).save.invasion.defenseOutbox).toEqual([]);
    expect((await store.forOwner('defender').defenseLog(NOW, WEEK)).total).toBe(1);
  });
  it('never writes shared history before the player settlement is durable', async () => {
    const store = new MemoryMirrorStore(); const pool = store.forOwner('attacker');
    const s = staged(); const repo = new Repo(s); const actor = host(repo, pool);
    await actor.load({ preservePendingBattle: true });
    repo.failNext = true;
    await expect(actor.execute({ type: 'settleBattle', args: { result: result(s) } })).rejects.toThrow('disk offline');
    expect((await store.forOwner('defender').defenseLog(NOW, WEEK)).total).toBe(0);
    await actor.flush();
    expect((await store.forOwner('defender').defenseLog(NOW, WEEK)).total).toBe(1);
  });
  it('history refresh and internal load preserve active tickets; ordinary load forfeits exactly once', async () => {
    const store = new MemoryMirrorStore(); const s = staged();
    const actor = host(new Repo(s), store.forOwner('attacker'));
    await actor.execute({ type: 'syncInvasionDefense', args: {} });
    expect((await actor.load({ preservePendingBattle: true })).save.pendingBattle?.requestId).toBe(s.pendingBattle!.requestId);
    await actor.load(); await actor.load();
    const log = await store.forOwner('defender').defenseLog(NOW, WEEK);
    expect(log.total).toBe(1); expect(log.wins).toBe(1);
  });
  it('retries defense publication after a storage failure and actor restart', async () => {
    const store = new MemoryMirrorStore(); const bound = store.forOwner('defender');
    const repo = new Repo(buildDemoSave(NOW));
    const offline = { ...bound, publish: vi.fn().mockRejectedValue(new Error('offline')) };
    await host(repo, offline).execute({ type: 'setInvasionDefense', args: { index: 0 } });
    expect(recordsToSave(repo.records, NOW).invasion.defensePublishPending).toBe(true);
    expect(store.size).toBe(0);
    const restarted = host(repo, bound);
    const loaded = await restarted.load({ preservePendingBattle: true });
    expect(loaded.save.invasion.defensePublishPending).toBe(false);
    expect(store.size).toBe(1);
  });
  it('failed history refresh retains the last successful cache, not a false zero', async () => {
    const store = new MemoryMirrorStore(); const bound = store.forOwner('defender');
    const pool = { ...bound, defenseLog: vi.fn().mockRejectedValue(new Error('offline')) };
    const save = configured(); save.invasion.defenseLog = { fetchedAt: NOW - 1, weekStart: WEEK, total: 5, wins: 3, weeklyTotal: 5, weeklyWins: 3, entries: [] };
    const actor = host(new Repo(save), pool);
    const reply = await actor.execute({ type: 'syncInvasionDefense', args: {} });
    expect(reply.result.ok).toBe(false);
    expect((await actor.load({ preservePendingBattle: true })).save.invasion.defenseLog?.total).toBe(5);
  });
});


describe('defense treasury, ordered VP ledger and revenge', () => {
  function setup(initialVp = 0) {
    const store = new MemoryMirrorStore();
    const save = configured(); save.invasion.vp = initialVp;
    const repo = new Repo(save);
    const a = store.forOwner('attacker', '来袭者'); const pool = store.forOwner('defender');
    const actor = host(repo, pool);
    const snapshot = defenseRecord(save, NOW)!;
    const report = (id: string, defenderWon = true, extra: Partial<DefenseReport> = {}): DefenseReport => ({
      id, defender: mirrorOwnerKey('defender'), at: NOW, defenderWon, surrendered: false, frenzy: false,
      attackerSnapshot: snapshot, ...extra,
    });
    const load = async () => (await actor.load({ preservePendingBattle: true })).save;
    const sync = () => actor.execute({ type: 'syncInvasionDefense', args: {} });
    const claim = () => actor.execute({ type: 'claimInvasionDefense', args: {} });
    return { store, save, repo, a, pool, actor, report, load, sync, claim };
  }
  it('accrues three currencies without auto-credit, applies exact floored VP per event, and claims once', async () => {
    const f = setup(1);
    await f.a.recordDefense(f.report('loss', false));
    await f.a.recordDefense(f.report('win'));
    await f.sync();
    let s = await f.load();
    expect(s.invasion.vp).toBe(DEFENSE_VP);
    expect(s.invasion.progressionVp).toBe(f.save.invasion.progressionVp);
    expect(s.currencies).toEqual(f.save.currencies);
    expect(s.invasion.defenseProgress.rewards).toEqual(DEFENSE_REWARD);
    expect(s.invasion.defenseProgress.results.map(r => r.vpDelta)).toEqual([-1, 2]);
    expect(s.invasion.defenseLog?.pending).toBeUndefined();
    await f.sync(); expect((await f.load()).invasion.vp).toBe(2);
    const claimed = await f.claim(); expect(claimed.result).toEqual({ ok: true, ...DEFENSE_REWARD });
    const duplicate = await f.claim(); expect(duplicate.result).toEqual({ ok: true, gold: 0, souls: 0, glory: 0 });
    s = await f.load();
    for (const key of ['gold', 'souls', 'glory'] as const) expect(s.currencies[key]).toBe(f.save.currencies[key] + DEFENSE_REWARD[key]);
    expect(s.invasion.defenseProgress.rewards.gold).toBe(0);
    const standings = await f.store.forOwner('observer').standings({ weekStart: WEEK, league: s.invasion.league, limit: 10 });
    expect(standings.find(r => r.ownerKey === mirrorOwnerKey('defender'))?.vp).toBe(2);
  });
  it('accounts more than the display window in ordered pages, including delayed old-week wins', async () => {
    const f = setup(); f.save.createdAt = WEEK - 10 * 86400000; f.repo.records = saveToRecords(f.save);
    for (let i = 0; i < 205; i++) await f.a.recordDefense(f.report(`ticket-${i}`));
    await f.sync(); let s = await f.load();
    expect(s.invasion.defenseLog?.total).toBe(205); expect(s.invasion.defenseLog?.entries).toHaveLength(50);
    expect(s.invasion.defenseProgress.rewards.gold).toBe(200 * DEFENSE_REWARD.gold);
    expect(s.invasion.defenseLog?.hasMore).toBe(true);
    await f.sync(); s = await f.load();
    expect(s.invasion.defenseProgress.rewards.gold).toBe(205 * DEFENSE_REWARD.gold);
    expect(s.invasion.vp).toBe(410);
    await f.a.recordDefense(f.report('late', true, { at: WEEK - 1 }));
    await f.sync(); s = await f.load();
    expect(s.invasion.vp).toBe(410); expect(s.invasion.defenseProgress.rewards.gold).toBe(20600);
    const nextEnv = defaultEnv({ now: () => NOW + 7 * 86400000, seed: () => 1234, allowDev: true });
    const restarted = new MetaHost(f.repo, nextEnv, { fresh: 'demo', mirrorPool: f.pool, schedule: vi.fn() });
    await restarted.execute({ type: 'syncInvasionDefense', args: {} });
    s = (await restarted.load({ preservePendingBattle: true })).save;
    expect(s.invasion.defenseProgress.rewards.gold).toBe(20600); expect(s.invasion.vp).toBe(0);
  });
  it('serializes simultaneous claim requests and survives restart without paying twice', async () => {
    const f = setup(); await f.a.recordDefense(f.report('win'));
    const replies = await Promise.all([f.claim(), f.claim(), f.claim()]);
    expect(replies.map(r => r.result.ok ? r.result.gold : -1)).toEqual([100, 0, 0]);
    const restarted = host(f.repo, f.pool);
    expect((await restarted.execute({ type: 'claimInvasionDefense', args: {} })).result).toMatchObject({ gold: 0 });
    expect((await restarted.load()).save.currencies.gold).toBe(f.save.currencies.gold + 100);
  });
  it('keeps pending rewards across storage outages and retries a failed durable claim exactly once', async () => {
    const f = setup(); await f.a.recordDefense(f.report('win')); await f.sync();
    const broken = host(f.repo, { ...f.pool, defenseLog: vi.fn().mockRejectedValue(new Error('offline')) });
    expect((await broken.execute({ type: 'claimInvasionDefense', args: {} })).result.ok).toBe(false);
    expect((await broken.load()).save.invasion.defenseProgress.rewards.gold).toBe(100);
    f.repo.failNext = true;
    await expect(f.claim()).rejects.toThrow('disk offline');
    const restarted = host(f.repo, f.pool);
    expect((await restarted.execute({ type: 'claimInvasionDefense', args: {} })).result).toMatchObject({ gold: 100 });
    expect((await restarted.load()).save.currencies.gold).toBe(f.save.currencies.gold + 100);
  });
  it('does not regrant pre-reset rewards or revenge opportunities', async () => {
    const f = setup(); await f.a.recordDefense(f.report('old', true, { at: NOW - 1 }));
    await f.a.recordDefense(f.report('old-loss', false, { at: NOW - 1 }));
    await f.sync();
    expect((await f.load()).invasion.defenseProgress.rewards.gold).toBe(0);
    const entry = (await f.pool.defenseLog(NOW, WEEK)).entries.find(e => !e.defenderWon)!;
    expect((await f.actor.execute({ type: 'planInvasionRevenge', args: { key: defenseEntryKey(entry) } })).result.ok).toBe(false);
  });
  it.each(['player', 'enemy'] as const)('launches a bound revenge ticket and records %s result once', async winner => {
    const f = setup(10); await f.a.recordDefense(f.report('loss', false)); await f.sync();
    const entry = (await f.pool.defenseLog(NOW, WEEK)).entries[0]!; const key = defenseEntryKey(entry);
    const beforeRoster = (await f.load()).invasion.roster;
    const planned = await f.actor.execute({ type: 'planInvasionRevenge', args: { key } });
    expect(planned.result.ok).toBe(true);
    const battleSave = await f.load();
    expect(battleSave.pendingBattle).toMatchObject({ mode: 'invasion', revengeKey: key });
    expect(battleSave.invasion.roster).toEqual(beforeRoster);
    const ticket = battleSave.pendingBattle!;
    const restored = recordsToSave(saveToRecords(battleSave), NOW);
    expect(restored.pendingBattle).toEqual(ticket);
    const settled = await f.actor.execute({ type: 'settleBattle', args: { result: result(battleSave, winner) } });
    expect(settled.result.ok).toBe(true);
    expect((await f.load()).invasion.defenseProgress.results.find(r => r.key === key)?.revenge).toBe(winner === 'player' ? 'won' : 'lost');
    const incoming = await f.a.defenseLog(NOW, WEEK);
    expect(incoming.total).toBe(1); expect(incoming.entries[0]?.revenge).toBe(true);
    expect((await f.actor.execute({ type: 'planInvasionRevenge', args: { key } })).result.ok).toBe(false);
    expect((await f.actor.execute({ type: 'settleBattle', args: { result: result(battleSave, winner) } })).result.ok).toBe(false);
    expect((await f.a.defenseLog(NOW, WEEK)).total).toBe(1);
  });
  it('preserves a revenge in internal sync but consumes it on ordinary page reload / forfeit', async () => {
    const f = setup(); await f.a.recordDefense(f.report('loss', false)); await f.sync();
    const key = defenseEntryKey((await f.pool.defenseLog(NOW, WEEK)).entries[0]!);
    await f.actor.execute({ type: 'planInvasionRevenge', args: { key } });
    const restarted = host(f.repo, f.pool);
    expect((await restarted.load({ preservePendingBattle: true })).save.pendingBattle).toMatchObject({ revengeKey: key });
    const after = (await restarted.load()).save;
    expect(after.pendingBattle).toBeNull();
    expect(after.invasion.defenseProgress.results.find(r => r.key === key)?.revenge).toBe('lost');
    expect((await f.a.defenseLog(NOW, WEEK)).entries[0]).toMatchObject({ revenge: true, surrendered: true, defenderWon: true });
  });
  it.each(['win', 'revenge', 'expired', 'missing-snapshot', 'foreign', 'ruleset'])('rejects %s as a revenge target atomically', async kind => {
    const f = setup(); const report = f.report('target', kind === 'win');
    if (kind === 'revenge') report.revenge = true;
    if (kind === 'expired') report.attackerSnapshot!.recordedAt = NOW - 20 * 86400000;
    if (kind === 'missing-snapshot') delete report.attackerSnapshot;
    if (kind === 'foreign') report.defender = mirrorOwnerKey('someone-else');
    if (kind === 'ruleset') report.attackerSnapshot!.ruleset = 'obsolete';
    await f.a.recordDefense(report);
    const before = await f.load();
    const reply = await f.actor.execute({ type: 'planInvasionRevenge', args: { key: `${mirrorOwnerKey('attacker')}:target` } });
    expect(reply.result.ok).toBe(false); expect(reply.patch).toBeNull();
    expect((await f.load()).invasion.defenseProgress).toEqual(before.invasion.defenseProgress);
  });
});
