import { rollInvasionFrenzy } from '../../src/meta/data/invasionFrenzy';
import { describe, it, expect } from 'vitest';
// @ts-expect-error Node-only audit; browser project omits Node type declarations.
import { readFileSync } from 'node:fs';
import { INVASION_RANKS, INVASION_RANK_GEMS_TOTAL, invasionRankAt, INVASION_VP_BY_DIFFICULTY } from '../../src/meta/data/invasionRanks';
import { newSave } from '../../src/meta/state/schema';
import { hydrateSave } from '../../src/meta/state/save';
import { MockGateway, memoryStorage, buildDemoSave, weekStartOf } from '../../src/meta/gateway';
import { invasionCandidates, refreshInvasionOpponents, claimInvasionRank, ensureInvasionSeason, settleInvasionBattle, planInvasionBattle, invasionVictoryVp } from '../../src/meta/systems/invasion';
import { WEEK_MS } from '../../src/meta/data/events';
import type { BattleResult, BattleRequest } from '../../src/session/contract';
const WEEK = weekStartOf(1726444800000);
const fresh = () => { const s = buildDemoSave(WEEK); s.hero.level = 100; ensureInvasionSeason(s, WEEK, WEEK); return s; };
const result = (request?: BattleRequest): BattleResult => ({
  schemaVersion: 1, rulesetVersion: request?.rulesetVersion ?? 'test', requestId: request?.requestId ?? 'test', battleId: request?.battleId ?? 'test',
  seed: 123, winner: 'player', turns: 8, combatants: [], defeatedExternalIds: [], summonedCount: 0, actionLogDigest: '', eventSummary: [],
});

describe('weekly VP ranks and claims', () => {
  it('30 ascending thresholds, 30 distinct assets and a bounded weekly gem budget', () => {
    expect(INVASION_RANKS).toHaveLength(30);
    expect(INVASION_RANK_GEMS_TOTAL).toBe(6000);
    expect(new Set(INVASION_RANKS.map(r => readFileSync(`public${r.icon}`, 'utf8'))).size).toBe(30);
    for (const [i, rank] of INVASION_RANKS.entries()) {
      expect(rank.gems).toBeGreaterThanOrEqual(50); expect(rank.gems).toBeLessThanOrEqual(375);
      expect(invasionRankAt(rank.vp)).toEqual(rank);
      if (i > 0) { expect(rank.vp).toBeGreaterThan(INVASION_RANKS[i-1]!.vp); expect(invasionRankAt(rank.vp - 1).index).toBe(i-1); }
    }
  });
  it('all reached rewards can be claimed in any order exactly once, never automatically', () => {
    const s = fresh(); s.invasion.progressionVp = 8000;
    const before = s.currencies.gems;
    for (const rank of [...INVASION_RANKS].reverse()) {
      expect(claimInvasionRank(s, rank.id)).toEqual({ ok: true, gems: rank.gems });
      expect(claimInvasionRank(s, rank.id).ok).toBe(false);
    }
    expect(s.currencies.gems - before).toBe(6000);
    const hydrated = hydrateSave(JSON.parse(JSON.stringify(s)));
    expect(claimInvasionRank(hydrated, 'rank-0').ok).toBe(false);
    ensureInvasionSeason(hydrated, WEEK + WEEK_MS, WEEK + WEEK_MS);
    expect(hydrated.invasion.progressionVp).toBe(0);
    expect(hydrated.invasion.claimedRanks).toHaveLength(0);
    expect(claimInvasionRank(hydrated, 'rank-29').ok).toBe(false);
    expect(claimInvasionRank(hydrated, 'rank-0').ok).toBe(true);
    expect(hydrated.currencies.gems).toBe(s.currencies.gems + 50);
  });
  it('future, unknown, and locked-mode claims give nothing', () => {
    const s = fresh(); const before = s.currencies.gems;
    expect(claimInvasionRank(s, 'rank-1').ok).toBe(false);
    expect(claimInvasionRank(s, 'missing').ok).toBe(false);
    s.hero.level = 1;
    expect(claimInvasionRank(s, 'rank-0').ok).toBe(false);
    expect(s.currencies.gems).toBe(before);
  });
  it('VP thresholds advance immediately, losses preserve progress, new weeks reset it', () => {
    const s = fresh(); s.invasion.progressionVp = 199; s.invasion.vp = 10;
    const m = invasionCandidates(s, WEEK, WEEK)[0]!;
    expect(settleInvasionBattle(s, result(), m.id, WEEK, WEEK, WEEK).ok).toBe(true);
    expect(s.invasion.progressionVp).toBeGreaterThanOrEqual(200);
    expect(s.invasion.league).toBe(1);
    const earned = s.invasion.progressionVp;
    const m2 = invasionCandidates(s, WEEK, WEEK)[0]!;
    expect(settleInvasionBattle(s, { ...result(), winner: 'enemy' }, m2.id, WEEK, WEEK, WEEK).ok).toBe(true);
    expect(s.invasion.progressionVp).toBe(earned);
    ensureInvasionSeason(s, WEEK + WEEK_MS, WEEK + WEEK_MS);
    expect(s.invasion.vp).toBe(0); expect(s.invasion.progressionVp).toBe(0); expect(s.invasion.league).toBe(0);
  });
  it('migrates legacy rank floors once; malformed fields are normalized and repeated loads stay stable', () => {
    const raw = JSON.parse(JSON.stringify(fresh()));
    delete raw.invasion.progressionVp; delete raw.invasion.claimedRanks; delete raw.invasion.refreshCount;
    raw.invasion.league = 4; raw.invasion.bestLeague = 5; raw.invasion.vp = 50;
    const migrated = hydrateSave(raw);
    expect(migrated.invasion.progressionVp).toBe(INVASION_RANKS[15]!.vp);
    expect(migrated.invasion.league).toBe(5);
    expect(migrated.invasion.claimedRanks).toEqual([]);
    expect(hydrateSave(JSON.parse(JSON.stringify(migrated))).invasion).toEqual(migrated.invasion);
    raw.invasion.progressionVp = -20; raw.invasion.refreshCount = Infinity;
    raw.invasion.claimedRanks = ['rank-0', 'rank-0', 'bogus', null];
    const repaired = hydrateSave(raw);
    expect(repaired.invasion.progressionVp).toBe(0); expect(repaired.invasion.refreshCount).toBe(0);
    expect(repaired.invasion.claimedRanks).toEqual(['rank-0']);
    expect(newSave().invasion.progressionVp).toBe(0);
  });
});

describe('free unlimited rerolls and gateway persistence', () => {
  it('100 rerolls cost no resources and change lineups; passive reads do not rotate', () => {
    const s = fresh(); const wallet = structuredClone(s.currencies); const materials = structuredClone(s.materials);
    const lineups = new Set<string>();
    for (let i=0; i<100; i++) {
      const candidates = invasionCandidates(s, WEEK, WEEK);
      expect(candidates.map(m => m.difficulty)).toEqual(['easy','normal','hard']);
      expect(invasionCandidates(s, WEEK + 60000, WEEK).map(m => [m.id,m.defense])).toEqual(candidates.map(m => [m.id,m.defense]));
      lineups.add(JSON.stringify(candidates.map(m => m.defense.map(d => d.troopId))));
      expect(refreshInvasionOpponents(s, WEEK, WEEK).ok).toBe(true);
    }
    expect(lineups.size).toBe(100); expect(s.currencies).toEqual(wallet); expect(s.materials).toEqual(materials);
    expect(s.invasion.battles).toBe(0); expect(s.invasion.progressionVp).toBe(0);
  });
  it('refreshes and claims survive reload; stale opponents and double battle settlement are rejected', async () => {
    const storage = memoryStorage(); const env = { now: () => WEEK };
    const g = new MockGateway(storage, env); await g.load();
    await g.syncInvasionSeason();
    const old = invasionCandidates(g.current(), WEEK, WEEK)[0]!;
    await g.refreshInvasionOpponents();
    expect((await g.planInvasionBattle(old.id)).ok).toBe(false);
    expect((await g.claimInvasionRank('rank-0', WEEK)).result.ok).toBe(true);
    const before = structuredClone(g.current());
    const next = new MockGateway(storage, env); await next.load();
    expect(next.current().invasion.refreshCount).toBe(1);
    expect(next.current().currencies.gems).toBe(before.currencies.gems);
    expect((await next.claimInvasionRank('rank-0', WEEK)).result.ok).toBe(false);
    const mirror = invasionCandidates(next.current(), WEEK, WEEK)[0]!;
    const plan = await next.planInvasionBattle(mirror.id);
    expect(plan.ok).toBe(true); if (!plan.ok) return;
    const r = result(plan.request);
    expect((await next.settleBattle(r)).result.ok).toBe(true);
    const after = structuredClone(next.current());
    expect((await next.settleBattle(r)).result.ok).toBe(false);
    expect(next.current()).toEqual(after);
  });
  it('rejects opponent identities from previous weeks and leagues', () => {
    const s = fresh();
    s.invasion.progressionVp = 199;
    const original = invasionCandidates(s, WEEK, WEEK)[0]!;
    expect(settleInvasionBattle(s, result(), original.id, WEEK, WEEK, WEEK).ok).toBe(true);
    expect(s.invasion.league).toBe(1);
    expect(planInvasionBattle(s, original.id, 123, WEEK, WEEK).ok).toBe(false);
    const promoted = invasionCandidates(s, WEEK, WEEK)[0]!;
    expect(promoted.id).not.toBe(original.id);
    expect(planInvasionBattle(s, promoted.id, 123, WEEK, WEEK).ok).toBe(true);
    expect(planInvasionBattle(s, promoted.id, 123, WEEK + WEEK_MS, WEEK + WEEK_MS).ok).toBe(false);
    const nextWeek = invasionCandidates(s, WEEK + WEEK_MS, WEEK + WEEK_MS)[0]!;
    expect(nextWeek.id).not.toBe(promoted.id);
    expect(planInvasionBattle(s, nextWeek.id, 123, WEEK + WEEK_MS, WEEK + WEEK_MS).ok).toBe(true);
  });
  it('a battle spanning a weekly reset credits the launched encounter once to the new week', async () => {
    let clock = WEEK;
    const g = new MockGateway(memoryStorage(), { now: () => clock }); await g.load(); await g.syncInvasionSeason();
    const mirror = invasionCandidates(g.current(), WEEK, WEEK)[0]!;
    const plan = await g.planInvasionBattle(mirror.id); if (!plan.ok) throw new Error(plan.message);
    clock = WEEK + WEEK_MS;
    const out = await g.settleBattle(result(plan.request));
    expect(out.result.ok).toBe(true); expect(g.current().invasion.weekStart).toBe(WEEK + WEEK_MS);
    expect(g.current().invasion.progressionVp).toBe(invasionVictoryVp(mirror)); expect(g.current().invasion.vp).toBe(invasionVictoryVp(mirror));
  });
});


describe('weekly 6000 gem pace', () => {
  it.each(['easy', 'normal', 'hard'] as const)('%s victories use fixed VP through every rank', difficulty => {
    const s = fresh(); const perWin = INVASION_VP_BY_DIFFICULTY[difficulty];
    const wins = Math.ceil(8000 / perWin);
    expect(wins).toBe({easy:800, normal:400, hard:267}[difficulty]);
    for (let i = 0; i < wins; i++) {
      // This test measures the ordinary baseline; optional frenzy rewards shorten the route.
      while (rollInvasionFrenzy(WEEK, s.invasion.league, s.invasion.refreshCount)) s.invasion.refreshCount++;
      const mirror = invasionCandidates(s, WEEK, WEEK).find(m => m.difficulty === difficulty)!;
      const out = settleInvasionBattle(s, { ...result(), turns: i % 2 ? 2 : 100 }, mirror.id, WEEK, WEEK, WEEK);
      expect(out).toMatchObject({ok:true, vpBase:perWin, vpDelta:perWin, bonuses:{total:0}});
      if (i === wins - 2) expect(invasionRankAt(s.invasion.progressionVp).index).toBeLessThan(29);
    }
    expect(invasionRankAt(s.invasion.progressionVp).index).toBe(29);
    const before = s.currencies.gems;
    for (const rank of INVASION_RANKS) expect(claimInvasionRank(s, rank.id).ok).toBe(true);
    expect(s.currencies.gems - before).toBe(6000);
  });
  it('resets a stale claims page once, persists it, and rejects backdated resets', async () => {
    let clock = WEEK;
    const storage = memoryStorage(); const g = new MockGateway(storage, { now: () => clock }); await g.load();
    await g.syncInvasionSeason();
    expect((await g.claimInvasionRank('rank-0', WEEK)).result.ok).toBe(true);
    const balance = g.current().currencies.gems;
    clock = WEEK + WEEK_MS;
    // 屏上还是上周的官阶页：拒绝领取，且失败命令不改任何状态
    expect((await g.claimInvasionRank('rank-0', WEEK)).result.ok).toBe(false);
    expect(g.current().currencies.gems).toBe(balance);
    expect(g.current().invasion.claimedRanks).toEqual(['rank-0']);
    await g.syncInvasionSeason();
    expect(g.current().invasion.claimedRanks).toEqual([]);
    expect((await g.claimInvasionRank('rank-0', WEEK + WEEK_MS)).result.ok).toBe(true);
    expect((await g.claimInvasionRank('rank-0', WEEK + WEEK_MS)).result.ok).toBe(false);
    // 时钟回拨也不会倒退赛季
    clock = WEEK; await g.syncInvasionSeason();
    clock = WEEK + WEEK_MS; await g.syncInvasionSeason();
    expect(g.current().invasion.claimedRanks).toEqual(['rank-0']);
    const reloaded = new MockGateway(storage, { now: () => clock }); await reloaded.load();
    expect(reloaded.current().invasion.weekStart).toBe(WEEK + WEEK_MS);
    expect(reloaded.current().currencies.gems).toBe(balance + 50);
  });
  it('a weekly sync during a launched battle retains new-week rewards and credits the original encounter once', async () => {
    let clock = WEEK;
    const g = new MockGateway(memoryStorage(), { now: () => clock }); await g.load(); await g.syncInvasionSeason();
    const m = invasionCandidates(g.current(), WEEK, WEEK)[2]!;
    const plan = await g.planInvasionBattle(m.id); if (!plan.ok) throw new Error(plan.message);
    clock = WEEK + WEEK_MS;
    await g.syncInvasionSeason();
    await g.claimInvasionRank('rank-0', WEEK + WEEK_MS);
    const balance = g.current().currencies.gems;
    const out = await g.settleBattle(result(plan.request));
    expect(out.result).toMatchObject({ok:true, kind:'invasion', settled:{vpDelta:invasionVictoryVp(m)}});
    expect(g.current().invasion.progressionVp).toBe(invasionVictoryVp(m));
    expect(g.current().invasion.claimedRanks).toEqual(['rank-0']);
    expect(g.current().currencies.gems).toBe(balance);
    expect((await g.settleBattle(result(plan.request))).result.ok).toBe(false);
  });
});
