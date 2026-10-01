import { afterEach, describe, expect, it, vi } from 'vitest';
import { BATTLE_MAP_LIMIT, clampBattleMaps, creditBattleMaps } from '../../src/engine/battleMaps';
import { SeededRNG } from '../../src/engine/rng';
import { battleMapDrop, resolveBattleMaps } from '../../src/meta/systems/battleMaps';
import { applySettlement, newSave, planExploreEncounter } from '../../src/meta';
import { MockGateway, memoryStorage } from '../../src/meta/gateway';
import { allKingdoms } from '../../src/meta/data/kingdoms';
import { RULESET_VERSION, type BattleResult } from '../../src/session/contract';

const result = (over: Partial<BattleResult> = {}): BattleResult => ({
  schemaVersion: 1, rulesetVersion: RULESET_VERSION, battleId: 'maps-test', requestId: 'r', seed: 1,
  winner: 'player', turns: 1, combatants: [], defeatedExternalIds: [], summonedCount: 0,
  actionLogDigest: '', eventSummary: [], ...over,
});
const winningId = Array.from({ length: 10000 }, (_, i) => `map-test-${i}`).find(requestId => battleMapDrop(result({ requestId })) === 1)!;
const economy = (maps: number) => ({ gold: 0, souls: 0, gems: 0, maps });
afterEach(() => vi.restoreAllMocks());

describe('battle map reward budget', () => {
  it('uses exactly the first 100 of 10000 outcomes', () => {
    const rng = vi.spyOn(SeededRNG.prototype, 'nextInt');
    for (const [roll, expected] of [[0, 1], [99, 1], [100, 0], [9999, 0]]) {
      rng.mockReturnValue(roll!);
      expect(battleMapDrop(result())).toBe(expected);
      expect(rng).toHaveBeenLastCalledWith(10000);
    }
  });
  it('is ticket-stable, independent of client seed, and roughly 1%', () => {
    expect(winningId).toBeTruthy();
    expect(battleMapDrop(result({ requestId: winningId, seed: 1 }))).toBe(1);
    expect(battleMapDrop(result({ requestId: winningId, seed: 999 }))).toBe(1);
    let hits = 0;
    for (let i = 0; i < 20000; i++) hits += battleMapDrop(result({ requestId: `distribution-${i}` }));
    expect(hits).toBeGreaterThan(150);
    expect(hits).toBeLessThan(250);
  });
  it('does not roll on defeat or surrender; earned skills survive normal defeat', () => {
    expect(resolveBattleMaps(result({ requestId: winningId, winner: 'enemy', economy: economy(1) })).total).toBe(1);
    expect(resolveBattleMaps(result({ requestId: winningId, endReason: 'surrender', economy: economy(2) }), [{ treasureMaps: 1 }]).total).toBe(0);
  });
  it.each([0, 1, 2, 99])('skills %s and victory drop share the cap', maps => {
    const reward = resolveBattleMaps(result({ requestId: winningId, economy: economy(maps) }));
    expect(reward.total).toBe(Math.min(2, maps + 1));
    expect(reward.drop).toBe(maps >= 2 ? 0 : 1);
  });
  it('caps all event sources without changing other rewards or inputs', () => {
    const input = result({ requestId: winningId, economy: economy(1) });
    const mats = [{ treasureMaps: 2, celestial: 1 }, { treasureMaps: 1 }];
    const before = structuredClone({ input, mats });
    const rewards = resolveBattleMaps(input, mats);
    expect(rewards).toEqual({ collected: 1, bonuses: [{ treasureMaps: 1, celestial: 1 }, {}], drop: 0, total: 2 });
    expect({ input, mats }).toEqual(before);
  });
  it.each([undefined, null, -1, NaN, Infinity, '2'])('rejects malformed count %s', value => {
    expect(clampBattleMaps(value)).toBe(0);
  });
  it('floors fractions and limits the engine collection, not the inventory', () => {
    expect(clampBattleMaps(1.9)).toBe(1);
    const state = { economy: economy(0) };
    expect(creditBattleMaps(state, 1)).toBe(1);
    expect(creditBattleMaps(state, 2)).toBe(1);
    expect(creditBattleMaps(state, 1)).toBe(0);
    expect(state.economy.maps).toBe(BATTLE_MAP_LIMIT);
  });
  it.each([0, 1, 2, 8])('standard settlement displays exactly the paid maps with skill count %s', maps => {
    const save = newSave();
    save.materials.treasureMaps = 100;
    const plan = planExploreEncounter(allKingdoms()[0]!, 1, 9);
    const detail = applySettlement(save, result({ requestId: winningId, economy: economy(maps) }), { plan, enemyByExternalId: new Map(), todayStart: 1726500000000 });
    const paid = Math.min(2, maps + 1);
    expect(save.materials.treasureMaps).toBe(100 + paid);
    expect(detail.lines.reduce((sum, line) => sum + (line.mats?.treasureMaps ?? 0), 0)).toBe(paid);
  });
  it('standard event rewards and skills cannot bypass the combined limit', () => {
    const save = newSave(), plan = planExploreEncounter(allKingdoms()[0]!, 1, 9);
    plan.bonus = [1, 2].map(i => ({ id: `bonus-${i}`, label: 'bonus', when: { kind: 'victory' as const }, mats: { treasureMaps: 2 }, deltas: { gems: 10 } }));
    const before = save.materials.treasureMaps;
    const detail = applySettlement(save, result({ requestId: winningId, economy: economy(1) }), { plan, enemyByExternalId: new Map(), todayStart: 1726500000000 });
    expect(save.materials.treasureMaps - before).toBe(2);
    expect(detail.lines.reduce((sum, l) => sum + (l.mats?.treasureMaps ?? 0), 0)).toBe(2);
    expect(detail.lines.filter(l => l.label === 'bonus').map(l => l.deltas.gems)).toEqual([10, 10]);
  });
  it('gateway rejects forged/replayed tickets and persists the capped payout across reload', async () => {
    const storage = memoryStorage(), gw = new MockGateway(storage);
    await gw.load();
    const ticket = await gw.planQuestBattle(allKingdoms()[2]!, 6);
    if (!ticket.ok) throw new Error(ticket.message);
    const before = gw.current().materials.treasureMaps;
    const battle = result({ requestId: ticket.request.requestId, rulesetVersion: ticket.request.rulesetVersion, economy: economy(99) });
    expect((await gw.settleBattle({ ...battle, requestId: 'forged-map-ticket' })).result.ok).toBe(false);
    expect(gw.current().materials.treasureMaps).toBe(before);
    expect((await gw.settleBattle(battle)).result.ok).toBe(true);
    expect(gw.current().materials.treasureMaps).toBe(before + 2);
    expect((await gw.settleBattle(battle)).result.ok).toBe(false);
    const reloaded = new MockGateway(storage);
    expect((await reloaded.load()).save.materials.treasureMaps).toBe(before + 2);
    expect((await reloaded.settleBattle(battle)).result.ok).toBe(false);
    expect(reloaded.current().materials.treasureMaps).toBe(before + 2);
  });
});
