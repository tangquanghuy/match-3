import { describe, expect, it } from 'vitest';
import { newSave } from '../../src/meta/state/schema';
import { hydrateSave, SaveStore } from '../../src/meta/state/save';
import { MockGateway } from '../../src/meta/gateway';
import { KINGDOM_ORDER, EXPLORE_ENEMY_LEVELS, exploreEnemyLevel } from '../../src/meta/data/kingdoms';
import { enemyEncounterStats } from '../../src/meta/data/enemyDifficulty';
import { ARCANE_STONE_KEYS } from '../../src/meta/data/materials';
import { BANNERS } from '../../src/meta/data/banners';
import rawKingdoms from '../../data/raw/gow-2026-09-18/kingdoms.en.json';
import { TROOPS, getTroopById } from '../../src/data/troops';
import { planExploreEncounter } from '../../src/meta/systems/encounter';
import { highestClearedExploreTier, kingdomArcaneKey, maxExploreTier } from '../../src/meta/systems/explore';
import type { BattleResult } from '../../src/session/contract';
import type { BattleTicket } from '../../src/meta/gateway';

const kingdom = KINGDOM_ORDER[0]!;
const other = KINGDOM_ORDER[1]!;
const result = (ticket: BattleTicket, winner: 'player' | 'enemy' = 'player'): BattleResult => ({
  schemaVersion: 1, battleId: ticket.request.battleId, requestId: ticket.request.requestId,
  rulesetVersion: ticket.request.rulesetVersion, seed: ticket.request.seed, winner, turns: 3,
  combatants: [], defeatedExternalIds: [], summonedCount: 0, actionLogDigest: '', eventSummary: [],
});
async function setup(tier = 2) {
  const data = new Map<string, string>();
  const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); } };
  const save = newSave({ now: 0, starterTroopIds: [6000, 6097, 6457] });
  save.hero.level = 42;
  for (const k of [kingdom, other]) save.kingdoms[k] = { level: 1, questsDone: 8, exploreTier: tier, exploreUnlockedTier: tier, lastTributeAt: 0 };
  for (const troop of Object.values(save.collection)) troop.traits = [true, true, true];
  new SaveStore(storage).persist(save);
  let nextSeed = 100;
  const gateway = new MockGateway(storage, { seed: () => nextSeed++ });
  await gateway.load();
  return { gateway, storage };
}
async function ticket(gateway: MockGateway, k = kingdom) {
  const t = await gateway.planExploreBattle(k);
  if (!t.ok) throw new Error(t.message);
  return t;
}
async function fight(gateway: MockGateway, winner: 'player' | 'enemy' = 'player') {
  const t = await ticket(gateway);
  const out = (await gateway.settleBattle(result(t, winner))).result;
  if (!out.ok || out.kind !== 'encounter') throw new Error('settlement failed');
  return out.detail;
}

describe('12-tier six-battle Explore', () => {
  it('12 fixed levels, four normal teams, one mini-boss then one Mythic boss for every kingdom', () => {
    expect(EXPLORE_ENEMY_LEVELS).toHaveLength(12);
    expect(EXPLORE_ENEMY_LEVELS[11]).toBe(150);
    for (const k of KINGDOM_ORDER) for (let stage = 0; stage < 6; stage++) {
      const p = planExploreEncounter(k, 12, 42, stage);
      expect(planExploreEncounter(k, 12, 42, stage)).toEqual(p);
      expect(p.enemies).toHaveLength(4);
      expect(p.enemies.every(e => e.level === 150)).toBe(true);
      const rarity = stage === 4 ? 4 : 5;
      if (stage >= 4 && TROOPS.some(t => t.kingdom === k && t.rarityIdx === rarity)) {
        expect(getTroopById(p.enemies[0]!.troopId)!.rarityIdx).toBe(rarity);
      }
      for (const e of p.enemies.slice(stage >= 4 ? 1 : 0)) expect(getTroopById(e.troopId)!.rarityIdx).toBeLessThanOrEqual(3);
      expect(exploreEnemyLevel(k, 1)).toBe(11);
    }
  });
  it('E12 real combat stats exceed 100, not just a level badge', () => {
    const troop = getTroopById(6004)!;
    const stats = enemyEncounterStats(troop, 150);
    expect(stats.health).toBeGreaterThan(100);
    expect(enemyEncounterStats(getTroopById(6097)!, 150).armor).toBeGreaterThan(100);
    expect(stats.attack).toBeGreaterThanOrEqual(80);
  });
  it('kingdom Arcane keys use canonical inventory order and official kingdom mana colours', () => {
    for (const k of KINGDOM_ORDER) {
      const key = kingdomArcaneKey(k);
      expect(ARCANE_STONE_KEYS).toContain(key);
      const banner = BANNERS[k]!;
      const official = rawKingdoms.kingdoms.find(row => row.name_localized === banner.en);
      if (!official) continue;
      const colors = Object.keys(JSON.parse(official.data).ManaColors).map(c => c.replace('Color', '').toLowerCase());
      expect(new Set(key.split(':').slice(1))).toEqual(new Set(colors));
    }
  });
  it('shows each kingdom highest completed Explore tier, not selected or globally unlocked tiers', () => {
    const save = newSave();
    save.kingdoms[kingdom] = { level: 1, questsDone: 8, exploreTier: 12, exploreUnlockedTier: 12, lastTributeAt: 0 };
    save.kingdoms[other] = { level: 1, questsDone: 8, exploreTier: 1, lastTributeAt: 0 };
    expect(highestClearedExploreTier(save.kingdoms[kingdom])).toBe(0);
    expect(highestClearedExploreTier(save.kingdoms[other])).toBe(0);
    expect(highestClearedExploreTier(undefined)).toBe(0);
    save.kingdoms[kingdom]!.clearedExploreTiers = [1, 6];
    save.kingdoms[other]!.clearedExploreTiers = [12];
    expect(highestClearedExploreTier(save.kingdoms[kingdom])).toBe(6);
    expect(highestClearedExploreTier(save.kingdoms[other])).toBe(12);
    save.kingdoms[kingdom]!.clearedExploreTiers = [1, 6, 13, -1, 3.5];
    expect(highestClearedExploreTier(save.kingdoms[kingdom])).toBe(6);
  });
  it('starts with 1/2, selected tier never fabricates progress, preserves old clears', () => {
    const save = newSave();
    save.kingdoms[kingdom] = { level: 1, questsDone: 8, exploreTier: 0, lastTributeAt: 0 };
    save.kingdoms[kingdom]!.exploreTier = 12;
    expect(maxExploreTier(save)).toBe(2);
    save.kingdoms[kingdom]!.clearedExploreTiers = [1, 6];
    expect(maxExploreTier(hydrateSave(JSON.parse(JSON.stringify(save))))).toBe(7);
  });
  it('advances exactly six times; mini unlocks globally, only final gives first clear; replay rejected', async () => {
    const { gateway } = await setup();
    expect((await gateway.setKingdomExploreTier(kingdom, 3)).result).toMatchObject({ ok: false });
    for (let stage = 0; stage < 6; stage++) {
      const t = await ticket(gateway);
      expect(t.source).toMatchObject({ kind: 'explore', tier: 2, stage });
      expect((await gateway.setKingdomExploreTier(kingdom, 1)).result).toMatchObject({ ok: false });
      const out = (await gateway.settleBattle(result(t))).result;
      if (!out.ok || out.kind !== 'encounter') throw new Error('settlement failed');
      expect(out.detail.lines.some(l => l.key === 'kingdom-first-clear')).toBe(stage === 5);
      expect(maxExploreTier(gateway.current())).toBe(stage >= 4 ? 3 : 2);
      const after = structuredClone(gateway.current());
      expect((await gateway.settleBattle(result(t))).result.ok).toBe(false);
      expect(gateway.current()).toEqual(after);
    }
    expect(gateway.current().kingdoms[kingdom]!.exploreRun).toBeNull();
    expect(gateway.current().kingdoms[kingdom]!.clearedExploreTiers).toEqual([2]);
    expect((await gateway.setKingdomExploreTier(other, 3)).result).toBe(3);
    expect(gateway.current().materials.traitstones[kingdomArcaneKey(kingdom)]).toBe(1);
    for (let stage = 0; stage < 6; stage++) expect((await fight(gateway)).lines.some(l => l.key === 'kingdom-first-clear')).toBe(false);
    expect(gateway.current().materials.traitstones[kingdomArcaneKey(kingdom)]).toBeGreaterThanOrEqual(1);
  });
  it('normal defeat retries identical enemies, fresh ticket identity rejects delayed old result', async () => {
    const { gateway } = await setup();
    const first = await ticket(gateway);
    await gateway.settleBattle(result(first, 'enemy'));
    const retry = await ticket(gateway);
    expect(retry.request.enemyTeam).toEqual(first.request.enemyTeam);
    expect(retry.request.seed).not.toBe(first.request.seed);
    expect(gateway.current().pendingBattle).toMatchObject({ plan: { seed: retry.request.seed } });
    expect(retry.request.requestId).not.toBe(first.request.requestId);
    expect((await gateway.settleBattle(result(first))).result.ok).toBe(false);
    expect(gateway.current().pendingBattle!.requestId).toBe(retry.request.requestId);
    expect((await gateway.settleBattle(result(retry))).result.ok).toBe(true);
  });
  it.each([4, 5])('defeat at boss stage %i keeps progress and retries the same enemy', async stage => {
    const { gateway } = await setup();
    for (let i = 0; i < stage; i++) await fight(gateway);
    const first = await ticket(gateway);
    expect((await gateway.settleBattle(result(first, 'enemy'))).result.ok).toBe(true);
    expect(gateway.current().kingdoms[kingdom]!.exploreRun!.stage).toBe(stage);
    expect(maxExploreTier(gateway.current())).toBe(stage === 5 ? 3 : 2);
    const retry = await ticket(gateway);
    expect(retry.source).toEqual(first.source);
    expect(retry.request.enemyTeam).toEqual(first.request.enemyTeam);
    expect(retry.request.seed).not.toBe(first.request.seed);
    expect(retry.request.requestId).not.toBe(first.request.requestId);
    expect((await gateway.settleBattle(result(first))).result.ok).toBe(false);
    expect(gateway.current().pendingBattle!.requestId).toBe(retry.request.requestId);
    expect((await gateway.settleBattle(result(retry))).result.ok).toBe(true);
    expect(gateway.current().kingdoms[kingdom]!.exploreRun?.stage ?? null).toBe(stage === 4 ? 5 : null);
  });
  it('E12 grants its fixed kingdom Arcane only on first final Boss clear', async () => {
    const { gateway } = await setup(12);
    for (let stage = 0; stage < 6; stage++) {
      const settled = await fight(gateway);
      expect(settled.lines.find(l => l.key === 'kingdom-first-clear')?.deltas.gems).toBe(stage === 5 ? 150 : undefined);
      if (stage === 4) expect(gateway.current().materials.traitstones[kingdomArcaneKey(kingdom)] ?? 0).toBe(0);
    }
    expect(gateway.current().materials.traitstones[kingdomArcaneKey(kingdom)]).toBeGreaterThanOrEqual(1);
    expect(gateway.current().kingdoms[kingdom]!.clearedExploreTiers).toEqual([12]);
  });
  it.each([4, 5])('completed stages survive reload; interrupted boss %i retries without losing progress', async stage => {
    const { gateway, storage } = await setup();
    for (let i = 0; i < stage; i++) await fight(gateway);
    const pending = await ticket(gateway);
    const reloaded = new MockGateway(storage, { seed: () => 0xfedcba98 });
    await reloaded.load();
    expect(reloaded.current().kingdoms[kingdom]!.exploreRun!.stage).toBe(stage);
    const retry = await ticket(reloaded);
    expect(retry.source).toMatchObject({ kind: 'explore', tier: 2, stage });
    expect(retry.request.enemyTeam).toEqual(pending.request.enemyTeam);
    expect(retry.request.seed).not.toBe(pending.request.seed);
    expect(retry.request.requestId).not.toBe(pending.request.requestId);
    expect((await reloaded.settleBattle(result(pending))).result.ok).toBe(false);
    expect((await reloaded.settleBattle(result(retry))).result.ok).toBe(true);
    expect(reloaded.current().kingdoms[kingdom]!.exploreRun?.stage ?? null).toBe(stage === 4 ? 5 : null);
  });
  it('abandon removes only this kingdom run and ticket, keeps earned rewards', async () => {
    const { gateway } = await setup();
    await fight(gateway);
    await ticket(gateway, other);
    const t = await ticket(gateway);
    const before = structuredClone(gateway.current().materials);
    expect((await gateway.abandonKingdomExplore(kingdom)).result).toBe(true);
    expect(gateway.current().kingdoms[kingdom]!.exploreRun).toBeNull();
    expect(gateway.current().kingdoms[other]!.exploreRun).toBeTruthy();
    expect(gateway.current().materials).toEqual(before);
    expect((await gateway.settleBattle(result(t))).result.ok).toBe(false);
  });
  it('save hydration preserves valid runs and drops malformed stages/seeds/tiers', () => {
    const save = newSave();
    save.kingdoms[kingdom] = { level: 1, questsDone: 8, exploreTier: 0, lastTributeAt: 0 };
    const valid = { id: 'run', tier: 12, stage: 5, seed: 0xffffffff };
    save.kingdoms[kingdom]!.exploreRun = valid;
    expect(hydrateSave(JSON.parse(JSON.stringify(save))).kingdoms[kingdom]!.exploreRun).toEqual(valid);
    for (const patch of [{ stage: 6 }, { stage: -1 }, { stage: 2.5 }, { tier: 13 }, { id: '' }, { seed: -1 }, { seed: Infinity }]) {
      save.kingdoms[kingdom]!.exploreRun = { ...valid, ...patch };
      expect(hydrateSave(JSON.parse(JSON.stringify(save))).kingdoms[kingdom]!.exploreRun).toBeNull();
    }
  });
});
