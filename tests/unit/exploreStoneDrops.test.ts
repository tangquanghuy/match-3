import { describe, expect, it } from 'vitest';
import { TROOP_PROGRESSION } from '../../src/data/leveling';
import { TROOPS } from '../../src/data/troops';
import { newSave } from '../../src/meta/state/schema';
import { SaveStore } from '../../src/meta/state/save';
import { MockGateway } from '../../src/meta/gateway';
import { applySettlement } from '../../src/meta/systems/settlement';
import { planExploreEncounter } from '../../src/meta/systems/encounter';
import { KINGDOM_ORDER } from '../../src/meta/data/kingdoms';
import { STONE_COLORS } from '../../src/meta/data/materials';
import { questRewardsHtml, questModeLootHtml } from '../../src/meta/screens/questRewards';
import type { BattleResult } from '../../src/session/contract';

const kingdom = KINGDOM_ORDER[0]!;
const result = (seed: number): BattleResult => ({ schemaVersion: 1, battleId: `explore-${seed}`, requestId: 'r', rulesetVersion: '1',
  seed, winner: 'player', turns: 1, combatants: [], defeatedExternalIds: [], summonedCount: 0, actionLogDigest: '', eventSummary: [] });
function stoneDrop(seed: number, enemyId?: number) {
  const save = newSave({ now: 0, starterTroopIds: [6000] });
  // Isolate the base 25% drop from the independent missing-recipe bonus.
  for (const rec of Object.values(save.collection)) rec.traits = [true, true, true];
  const plan = planExploreEncounter(kingdom, 1, seed);
  if (enemyId !== undefined) plan.enemies[0]!.troopId = enemyId;
  const detail = applySettlement(save, result(seed), { plan, todayStart: 0, enemyByExternalId: new Map() });
  return detail.lines.find(line => line.key === 'explore-drop')?.mats?.traitstones ?? {};
}

describe('探索初级石随机颜色与可重复奖励', () => {
  it('同一结算种子不受敌方队首主色影响，所有六色都可掉落', () => {
    const leads = STONE_COLORS.map(color => TROOPS.find(t => t.manaColors[0] === color.base)!.id);
    const seen = new Set<string>();
    for (let seed = 1; seed <= 150; seed++) {
      const expected = stoneDrop(seed, leads[0]);
      Object.keys(expected).forEach(key => seen.add(key));
      for (const lead of leads.slice(1)) expect(stoneDrop(seed, lead)).toEqual(expected);
    }
    expect([...seen].sort()).toEqual(STONE_COLORS.map(c => `minor:${c.key}`).sort());
  });
  it('维持约25%掉落率，掉落后六色均匀而非按阵容筛选', () => {
    const counts: Record<string, number> = {};
    for (let seed = 1; seed <= 6000; seed++) {
      for (const [key, n] of Object.entries(stoneDrop(seed))) counts[key] = (counts[key] ?? 0) + n;
    }
    const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
    expect(total).toBeGreaterThan(1350);
    expect(total).toBeLessThan(1650);
    for (const color of STONE_COLORS) {
      expect(counts[`minor:${color.key}`]).toBeGreaterThan(190);
      expect(counts[`minor:${color.key}`]).toBeLessThan(310);
    }
  });
  it.each(['hard', 'veryHard'] as const)('%s 奖励预览显示六色随机，与王国和关卡无关', mode => {
    for (const k of KINGDOM_ORDER) for (const node of [1, 2, 3]) {
      const html = questRewardsHtml(k, mode, node);
      for (const color of STONE_COLORS) expect(html).toContain(`data-reward="stone:minor:${color.key}"`);
      expect(html).toContain('六色等概率随机');
      expect(html).not.toContain('队首');
      expect(questModeLootHtml(k, mode)).toContain('六色等概率随机');
    }
  });
  it.each([1, 2, 3, 4, 5, 6])('档位%i已通关仍可重新签票，材料和胜利奖励再次入账，首通只领一次', async tier => {
    const data = new Map<string, string>();
    const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); } };
    const save = newSave({ now: 0, starterTroopIds: [6000, 6097, 6457] });
    save.kingdoms[kingdom] = { level: 1, questsDone: 8, exploreTier: tier, exploreUnlockedTier: 12, lastTributeAt: 0 };
    new SaveStore(storage).persist(save);
    const gateway = new MockGateway(storage);
    await gateway.load();
    for (let attempt = 0; attempt < 2; attempt++) for (let stage = 0; stage < 6; stage++) {
      const ticket = await gateway.planExploreBattle(kingdom);
      if (!ticket.ok) throw new Error(ticket.message);
      const { request } = ticket;
      const settled = (await gateway.settleBattle({ ...result(request.seed), requestId: request.requestId, battleId: request.battleId, rulesetVersion: request.rulesetVersion })).result;
      if (!settled.ok || settled.kind !== 'encounter') throw new Error('expected encounter settlement');
      expect(settled.detail.lines.some(l => l.key === 'victory')).toBe(true);
      expect(settled.detail.lines.some(l => l.key === 'explore-drop')).toBe(true);
      expect(settled.detail.lines.some(l => l.key === 'kingdom-first-clear')).toBe(attempt === 0 && stage === 5);
    }
  });
  it.each(['runic:', 'celestial'])('缺口补给真实入账：%s，无缺口时停止补给', prefix => {
    const entry = Object.entries(TROOP_PROGRESSION).find(([, row]) => row.traits.some(recipe => Object.keys(recipe).some(key => key.startsWith(prefix))))!;
    const [id, row] = entry;
    const slot = row.traits.findIndex(recipe => Object.keys(recipe).some(key => key.startsWith(prefix)));
    const recipe = row.traits[slot]!;
    const key = Object.keys(recipe).find(k => k.startsWith(prefix))!;
    const save = newSave({ now: 0, starterTroopIds: [Number(id)] });
    for (const rec of Object.values(save.collection)) rec.traits = [true, true, true];
    save.collection[id]!.traits = [slot > 0, slot > 1, false];
    save.materials.traitstones = { ...recipe, [key]: recipe[key]! - 1 };
    const ctx = { plan: planExploreEncounter(kingdom, 1, 7), todayStart: 0, enemyByExternalId: new Map() };
    applySettlement(save, result(7), ctx);
    expect(save.materials.traitstones[key]).toBe(recipe[key]);
    applySettlement(save, result(8), ctx);
    expect(save.materials.traitstones[key]).toBe(recipe[key]);
  });
});
